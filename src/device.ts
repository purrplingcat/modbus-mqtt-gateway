import { MqttClient } from "mqtt";
import Peripheral from "./peripheral";
import { equal } from "fast-shallow-equal";
import consola from "consola";
import { DeviceConfig } from "./types/config";
import ModbusRTU from "modbus-serial";
import setQueuedInterval, { sleep } from "./utils/interval";
import { ModbusMaster } from "./modbus";

export default class Device {
    name: string;
    domain: string;
    mqtt: MqttClient;
    modbus: ModbusMaster;
    peripherals: Peripheral[];
    state: {};
    _available: boolean;
    _error: Error | null;

    /**
     * 
     * @param {string} name 
     * @param {string} domain 
     * @param {object} config 
     * @param {MqttClient} mqtt 
     */
    constructor(name: string, domain: string, config: DeviceConfig, mqtt: MqttClient, modbus: ModbusMaster) {
        this.name = name;
        this.domain = domain
        this.mqtt = mqtt
        this.modbus = modbus
        this.peripherals = []
        this.state = {}
        this._available = false
        this._error = null

        this._init(config)
        this.mqtt.on("connect", this.onConnect.bind(this))
        this.mqtt.on("message", this.onMessage.bind(this))
    }

    _topic(...args: string[]) {
        return `${this.domain}.${this.name}/${args.join("/")}`
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
            const { slave, address, access, count } = config.registers[<string>register];
            const peripheral = new Peripheral(this, this.modbus, <string>register, slave, address, access, count)

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

        consola.info(`Device '${this.name}' initialized (${this.peripherals.length} peripherals, ${checkInterval} ms)`)
    }

    get available() {
        return this.modbus.connected && this._available && !this._error;
    }

    onConnect() {
        this.mqtt.subscribe(this._topic("command"), (e, g) => consola.debug(g))
        this.mqtt.subscribe(this._topic("set"), (e, g) => consola.debug(g))
    }

    onMessage(topic: string, message: string) {
        if (topic === this._topic("command")) {
            const command = JSON.parse(message) || {};

            this.handleCommand(command.name || "", command.payload || {})
        }

        if (topic === this._topic("set")) {
            // shortcut to command "update" via dedicated topic "set"
            // (this is for better compatibility with some home assistants)
            const stateChanges = JSON.parse(message) || {};

            this.handleCommand("update", stateChanges)
        }
    }

    async handleCommand(command: string, payload: any) {
        consola.withScope(this.name).debug(`Received command: ${command}`, payload)
        switch (command) {
            case "update":
                this._handleUpdate(payload)
                break
            case "refresh":
                this._handleRefresh(0)
                break
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

        if (equal(prevState, newState)) {
            return false;
        }

        newState._updatedAt = new Date()
        this.state = newState;
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

            this.resetError()

            return this.update(newState)
        } catch (err) {
            this.error(err)
            this.sendAvailability()
            consola.withScope(this.name).error(err)

            return false
        }
    }

    sendState() {
        if (this.mqtt.connected && !this.mqtt.disconnecting) {
            this.mqtt.publish(this._topic("state"), JSON.stringify(this.state))
        }
    }

    sendAvailability() {
        if (this.mqtt.connected && !this.mqtt.disconnecting) {
            this.mqtt.publish(this._topic("presence"), this.available ? "online" : "offline")
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
