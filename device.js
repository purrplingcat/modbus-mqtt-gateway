const { MqttClient } = require("mqtt");
const Peripheral = require("./peripheral");
const { equal } = require("fast-shallow-equal");
const consola = require("consola");

class Device {
    /**
     * 
     * @param {string} name 
     * @param {string} domain 
     * @param {object} config 
     * @param {MqttClient} mqtt 
     */
    constructor(name, domain, config, mqtt) {
        this.name = name;
        this.domain = domain
        this.mqtt = mqtt
        this.modbus = null
        this.peripherals = []
        this.state = {}
        this._available = false

        this._init(config)
        this.mqtt.on("connect", this.onConnect.bind(this))
        this.mqtt.on("message", this.onMessage.bind(this))
    }

    _topic(...args) {
        return `${this.domain}.${this.name}/${args.join("/")}`
    }

    /**
     * 
     * @param {object} config 
     */
    _init(config) {
        const initState = {}
        const checkInterval = config.check_interval != null 
            ? config.check_interval 
            : 1000

        for (let register of Reflect.ownKeys(config.registers)) {
            const { slave, address, access } = config.registers[register];
            const peripheral = new Peripheral(this.modbus, register, slave, address, access)

            if (peripheral.readable) {
                initState[peripheral.name] = peripheral.getCurrentValue()
            }

            this.peripherals.push(peripheral)
        }

        this.update(initState);
        this._available = true

        if (checkInterval > 0) {
            setInterval(
                this._handleRefresh.bind(this),
                checkInterval
            )
        }

        consola.info(`Device '${this.name}' initialized (${this.peripherals.length} peripherals, ${checkInterval} ms)`)
    }

    get available() {
        return this.modbus != null && this._available;
    }

    onConnect() {
        this.mqtt.subscribe(this._topic("command"), (e, g) => consola.debug(g))
    }

    onMessage(topic, message) {
        if (topic === this._topic("command")) {
            const command = JSON.parse(message) || {};

            this.handleCommand(command.name || "", command.payload || {})
        }
    }

    async handleCommand(command, payload) {
        consola.withScope(this.name).debug(`Received command: ${command}`, payload)
        switch (command) {
            case "update":
                this._handleUpdate(payload)
                break
            case "refresh":
                this._handleRefresh()
                break
        }
    }

    async _handleUpdate(payload) {
        const promises = []
        const newState = {}

        async function writeToPeripheral(peripheral, value) {
            newState[peripheral.name] = await peripheral.write(value)
        }

        for (let key of Reflect.ownKeys(payload)) {
            const peripheral = this.peripherals.find(p => p.name === key)

            if (peripheral && peripheral.writable) {
                promises.push(writeToPeripheral(peripheral, payload[key]))
            }
        }

        await Promise.all(promises)
        if (this.update(newState)) {
            this.sendState()
        }
    }

    async _handleRefresh() {
        const updated = await this.refresh()

        if (updated) {
            this.sendState()
        }
    }

    /**
     * 
     * @param {object} newState 
     * @returns {boolean}
     */
    update(partialState) {
        const prevState = this.state;
        const newState = { ...prevState, ...partialState }

        if (equal(prevState, newState)) {
            return false;
        }

        newState._updatedAt = new Date()
        this.state = newState;

        return true
    }

    /**
     * 
     * @returns {Promise<boolean>}
     */
    async refresh() {
        const newState = {}
        const promises = []

        async function readFromPeripheral(peripheral) {
            newState[peripheral.name] = await peripheral.read()
        }

        for (let peripheral of this.peripherals) {
            if (!peripheral.readable) {
                continue;
            }

            consola.withScope(this.name).trace(`refresh ${peripheral.name}`)
            promises.push(readFromPeripheral(peripheral))
        }

        await Promise.all(promises)
        return this.update(newState)
    }

    sendState() {
        if (this.mqtt.connected && !this.mqtt.disconnecting) {
            this.mqtt.publish(this._topic("state"), JSON.stringify(this.state))
        }
    }

    sendAvailability() {
        if (this.mqtt.connected && !this.mqtt.disconnecting) {
            this.mqtt.publish(this._topic("available"), this.available ? "online" : "offline")
        }
    }
}

module.exports = Device;
