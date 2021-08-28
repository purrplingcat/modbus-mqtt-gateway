import { MqttClient } from "mqtt";
import Peripheral from "./peripheral";
import { equal } from "fast-shallow-equal";
import consola from "consola";
import { DeviceConfig, DeviceMeta } from "../types/config";
import setQueuedInterval, { sleep } from "../utils/interval";
import { ModbusMaster } from "../exchange/modbus";
import Discovery from "../discovery";
import Handshake from "../discovery/handshake";
import { getConfig } from "../gateway";

export default class Device {
    name: string;
    domain: string;
    mqtt: MqttClient;
    modbus: ModbusMaster;
    peripherals: Peripheral[];
    state: {};
    _discovery?: Discovery;
    _available: boolean;
    _error: Error | null;
    type: string;
    keepalive: number;
    meta: DeviceMeta;
    gwUid: string;
    alias?: string;
    forceUpdate: boolean;
    retain: boolean;

    /**
     * 
     * @param {string} name 
     * @param {string} domain 
     * @param {object} config 
     * @param {MqttClient} mqtt 
     */
    constructor(name: string, domain: string, gwUid: string, config: DeviceConfig, mqtt: MqttClient, modbus: ModbusMaster) {
        this.name = name;
        this.domain = domain
        this.gwUid = gwUid;
        this.mqtt = mqtt
        this.modbus = modbus
        this.alias = config.alias
        this.meta = config.meta || {};
        this.peripherals = []
        this.state = {}
        this.type = config.type ?? "device/generic";
        this.keepalive = 0;
        this._available = false
        this._error = null
        this.forceUpdate = config.forceUpdate ?? false;
        this.retain = config.retain ?? false;

        if (config.checkInterval) {
            this.keepalive = config.timeout ?? 10 * config.checkInterval;
        }

        if (!config.secret) {
            this._discovery = new Discovery(this.mqtt, this._getHandshakePacket.bind(this), false, name)
            this._discovery.logPinging = !!process.env.LOG_DISCOVERY_PINGS;
        }

        this._init(config)
        this.mqtt.on("connect", this.onConnect.bind(this))
        this.mqtt.on("message", this.onMessage.bind(this))
    }

    _topic(...args: string[]) {
        const config = getConfig();

        if (config.mqtt.topicFormat === "fancy") {
            const name = this.alias || this.name;
            const id = this.meta.room ? `${this.meta.room}/${name}` : name;

            return `${this.domain}/${id}/${args.join("/")}`;
        }

        if (config.mqtt.topicFormat === "gw-device-uid") {
            return `${this.domain}/${this.gwUid}-${this.name}/${args.join("/")}`
        }

        return `${this.domain}/${this.name}/${args.join("/")}`
    }

    /**
     * 
     * @param {DeviceConfig} config 
     */
    _init(config: DeviceConfig) {
        const initState: any = {}
        const checkInterval = config.checkInterval != null
            ? config.checkInterval
            : 1000

        for (let register of Reflect.ownKeys(config.registers)) {
            const registerConfig = config.registers[<string>register];
            const peripheral = new Peripheral(<string>register, this, this.modbus, registerConfig)

            if (peripheral.readable) {
                initState[peripheral.name] = peripheral.getCurrentValue()
            }

            this.peripherals.push(peripheral)
        }

        this.update(initState);
        this._available = true

        if (checkInterval > 0) {
            setQueuedInterval(
                this._handleRefresh.bind(this, 10),
                checkInterval
            )
        }

        consola.info(`Device '${this.name}' initialized (${this.peripherals.length} peripherals, ${checkInterval} ms, force update: ${this.forceUpdate})`)
    }

    get available() {
        //return true; // simulate
        return this.modbus.connected && this._available && !this._error;
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
                bus: this.modbus.name,
                connected: this.modbus.connected,
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

    onMessage(topic: string, message: Buffer) {
        if (topic === this._topic("command")) {
            const command = JSON.parse(message.toString()) || {};

            this.handleCommand(command.name || "", command.payload || {})
            return;
        }

        if (topic.startsWith(`${this.domain}/${this.name}/`)) {
            const command = topic.replace(`${this.domain}/${this.name}/`, "");
            
            this.handleCommand(command, message.toString());
        }
    }

    commands: Record<string, (msg: string) => void> = {
        get: () => this.sendState(),
        set: (msg) => this._handleUpdate(JSON.parse(msg)),
        refresh: () => this._handleRefresh(0),
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

    async _handleUpdate(payload: any) {
        const promises: Promise<void>[] = []
        const newState: any = {}

        if (!this.available) {
            consola.withScope(this.name).log("Can't update state: Device is unavailable")
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
            this.error(err)
            this.sendAvailability()
            consola.withScope(this.name).error(err)
        }
    }

    async _handleRefresh(queuePriority: number) {
        const updated = await this.refresh(queuePriority)

        if (updated) {
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
    async refresh(queuePriority = 0): Promise<boolean> {
        const newState: any = {}

        if (!this.modbus.connected) {
            return false
        }

        async function readFromPeripheral(peripheral: Peripheral) {
            newState[peripheral.name] = await peripheral.read(queuePriority)
        }

        try {
            for (let peripheral of this.peripherals) {
                if (!peripheral.readable) {
                    continue;
                }

                consola.withScope(this.name).debug(`refresh ${peripheral.name} on device ${this.name}`)
                await readFromPeripheral(peripheral)
            }

            this._discovery?.ping();
            this.resetError()

            return this.update(newState)
        } catch (err) {
            this.error(err)
            this.sendAvailability()
            this._discovery?.dead();
            consola.withScope(this.name).error(err)

            return false
        }
    }

    sendState() {
        if (this.mqtt.connected && !this.mqtt.disconnecting) {
            this.mqtt.publish(this._topic("state"), JSON.stringify(this.state), {retain: this.retain})
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
