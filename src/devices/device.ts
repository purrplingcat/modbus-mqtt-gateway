import { MqttClient, QoS } from "mqtt";
import path from "path";
import Peripheral from "./peripheral";
import { equal } from "fast-shallow-equal";
import consola from "consola";
import { DeviceConfig, DeviceMeta } from "../types/config";
import setQueuedInterval, { QueuedInterval, sleep } from "../utils/interval";
import { ModbusMaster } from "../exchange/modbus";
import Discovery from "../discovery";
import Handshake from "../discovery/handshake";
import { getConfig, pools } from "../gateway";

export default class Device {
    name: string;
    domain: string;
    mqtt: MqttClient;
    peripherals: Peripheral[];
    state: Record<string, number | string | null>;
    _discovery?: Discovery;
    _available: boolean;
    _error: Error | null;
    type: string;
    meta: DeviceMeta;
    gwUid: string;
    alias?: string;
    forceUpdate: boolean;
    retain: boolean;
    qos: QoS;
    private _needsPublishState: boolean;

    /**
     * 
     * @param {string} name 
     * @param {string} domain 
     * @param {object} config 
     * @param {MqttClient} mqtt 
     */
    constructor(name: string, domain: string, gwUid: string, config: DeviceConfig, mqtt: MqttClient) {
        this.name = name;
        this.domain = domain
        this.gwUid = gwUid;
        this.mqtt = mqtt;
        this.alias = config.alias
        this.meta = config.meta || {};
        this.peripherals = []
        this.state = {error: null}
        this.type = config.type ?? "device/generic";
        this._available = false
        this._error = null
        this._needsPublishState = false;
        this.forceUpdate = config.forceUpdate ?? false;
        this.retain = config.retain ?? false;
        this.qos = config.qos ?? 0;

        if (!config.secret) {
            this._discovery = new Discovery(this.mqtt, this._getHandshakePacket.bind(this), false, name)
            this._discovery.logPinging = !!process.env.LOG_DISCOVERY_PINGS;
        }

        this._init(config);
        this.mqtt.on("connect", this.onConnect.bind(this))
        this.mqtt.on("message", this.onMessage.bind(this))
    }

    _topic(...args: string[]) {
        const config = getConfig();

        if (config.mqtt.topicFormat === "fancy") {
            const name = this.alias || this.name || "";
            const id = path.join(this.meta.room ?? "", name);

            return path.join(this.domain, id, ...args);
        }

        if (config.mqtt.topicFormat === "gw-device-uid") {
            return path.join(this.domain, `${this.gwUid}-${this.name}`, ...args);
        }

        return path.join(this.domain, this.name, ...args);
    }

    /**
     * 
     * @param {DeviceConfig} config 
     */
    _init(config: DeviceConfig) {
        const initState: any = {}
        const done = (updated: boolean) => updated && this.refresh() && this.sendState();

        for (let register of Reflect.ownKeys(config.registers)) {
            const registerConfig = config.registers[<string>register];
            const peripheral = new Peripheral(<string>register, this, registerConfig)

            if (peripheral.readable) {
                initState[peripheral.name] = peripheral.getCurrentValue()
            }

            peripheral.corespondingPool.on("done", done)
            this.peripherals.push(peripheral)
        }

        this.update(initState);
        this._available = true

        consola.info(`Device '${this.name}' initialized (${this.peripherals.length} peripherals, force update: ${this.forceUpdate})`)
    }

    get available() {
        //return true; // simulate
        return this.peripherals.some(p => p.available) && this._available && !this._error;
    }

    private _getHandshakePacket(): Handshake {
        const metaFeats = Array.isArray(this.meta.features) ? this.meta.features : [];
        const metaTags = Array.isArray(this.meta.tags) ? this.meta.tags : [];
        const gwConfig = getConfig();
        const heartbeat = gwConfig.heartbeat?.interval ?? 0;
        const timeout = gwConfig.heartbeat?.timeout ?? heartbeat * 3;

        return {
            _version: "1.0",
            uid: this.meta.uid ?? this.name,
            type: this.meta.type ?? "device/general",
            product: this.meta.product ?? "Modbus generic device",
            vendor: this.meta.vendor ?? "Unknown",
            model: this.meta.model,
            name: this.meta.name ?? "Modbus device",
            alias: this.alias,
            description: this.meta.description,
            location: this.meta.room,
            platform: "modbus",
            stateFormat: "json",
            tags: [...metaTags, "modbus.device", "modbus.gw.device"],
            features: [...metaFeats],
            firmware: application.manifest.name,
            firmwareVersion: application.manifest.version,
            via: this.gwUid || this.domain,
            keepalive: heartbeat > 0,
            keepaliveTimeout: heartbeat ? timeout : 0,
            available: this.available,
            groups: this.meta.groups,
            comm: [
                {topic: this._topic("state"), type: "state"},
                {topic: this._topic("set"), type: "set"},
                {topic: this._topic("get"), type: "fetch"}
            ],
            additional: {
                ...this.meta.additional,
                registers: this.peripherals.length,
                stateRegister: this.meta.stateRegister || "switch",
                gateway: `${application.manifest.name} ${application.manifest.version} by ${application.manifest.author}`
            }
        }   
    }

    handshake() {
        this._discovery?.handshake(false);
    }

    onConnect() {
        this.mqtt.subscribe(this._topic("+"), (e, g) => consola.debug(g))
    }

    onTick() {
        const errors: string[] = [];
        errors.push(...this.peripherals.filter((p) => !p.available).map((p) => `Peripheral ${p.name} is unavailable`));

        if (this._error) {
            errors.push(this._error.message);
        }

        const errMsg = errors.length ? errors.join("\n") : null;

        if (this.state.error !== errMsg && this.update({error: errMsg})) {
            this.sendState();
        }
    }

    onMessage(topic: string, message: Buffer) {
        if (topic === this._topic("command")) {
            const command = JSON.parse(message.toString()) || {};

            this.handleCommand(command.name || "", command.payload || {})
            return;
        }

        if (topic.startsWith(this._topic("/"))) {
            const command = topic.replace(this._topic("/"), "");
            
            this.handleCommand(command, message.toString());
        }
    }

    commands: Record<string, (msg: string) => void> = {
        get: () => this.sendState(),
        set: (msg) => this._handleUpdate(JSON.parse(msg)),
        refresh: () => this.peripherals.forEach(p => p.read()),
    }

    async handleCommand(command: string, message: string) {
        const logger = consola.withScope(this.name);
        
        if (this.commands[command]) {
            logger.trace(command, message);

            try {
                this.commands[command].call(this, message);
                logger.debug(`Called command: ${command}`);
            } catch (err) {
                logger.error(`Error while executing command '${command}':`, err);
            }
        }
    }

    private async _handleUpdate(payload: any) {
        const promises: Promise<void>[] = []
        const newState: any = {}

        if (!this.available) {
            consola.withScope(this.name).info("Can't update state: Device is unavailable")
            this.sendAvailability()
            return
        }

        async function writeToPeripheral(peripheral: Peripheral, value: number) {
            newState[peripheral.name] = await peripheral.write(value)
        }

        try {
            for (let key of Reflect.ownKeys(payload)) {
                const peripheral = this.peripherals.find(p => p.name === key)

                if (peripheral && peripheral.writable) {
                    promises.push(writeToPeripheral(peripheral, payload[key]))
                }
            }

            await Promise.all(promises)
            this.resetError()

            if (this.update(newState)) {
                this.sendState()
            }
        } catch (err) {
            this.error(<Error>err)
            this.sendAvailability()
            consola.withScope(this.name).error(err)
        }
    }

    async _handleRefresh() {
        if (this.refresh()) {
            this.sendState()
        }
    }

    /**
     * 
     * @param {object} newState 
     * @returns {boolean}
     */
    update(partialState: any): boolean {
        const prevState = this.state;
        const newState = { ...prevState, ...partialState }

        if (!this.forceUpdate && equal(prevState, newState)) {
            return false;
        }

        newState._updatedAt = new Date()
        this.state = Object.freeze(newState);
        consola.withScope(this.name).debug(`State updated: ${this.name} at ${newState._updatedAt}`),
        consola.withScope(this.name).trace(`Changes payload: `, partialState)

        return true
    }

    /**
     * 
     * @returns {Promise<boolean>}
     */
    refresh(): boolean {
        console.log("in refresh");
        const newState: any = {}
        for (let peripheral of this.peripherals) {
            if (!peripheral.readable) {
                continue;
            }

            consola.withScope(this.name).debug(`refresh ${peripheral.name} on device ${this.name}`)
            newState[peripheral.name] = peripheral.getCurrentValue();
        }

        this._discovery?.ping();
        this.resetError()

        return this._needsPublishState = this.update(newState) && this.available;
    }

    sendState() {
        console.log("in send state");
        if (this.mqtt.connected && !this.mqtt.disconnecting) {
            this._needsPublishState = false;
            this.mqtt.publish(this._topic(), JSON.stringify(this.state), {retain: this.retain, qos: this.qos})
        }
    }

    sendAvailability() {
        if (this.mqtt.connected && !this.mqtt.disconnecting) {
            if (this.available) {
                this._discovery?.ping();
            } else {
                this._discovery?.dead();
            }
        }
    }

    error(err: Error) {
        this._error = err;

        if (this.mqtt.connected && !this.mqtt.disconnecting) {
            this.mqtt.publish(this._topic("err"), this._error.message)
        }
    }

    resetError() {
        if (this._error == null) {
            return;
        }

        this._error = null

        if (this.mqtt.connected && !this.mqtt.disconnecting) {
            this.mqtt.publish(this._topic("err"), "")
        }
    }
}
