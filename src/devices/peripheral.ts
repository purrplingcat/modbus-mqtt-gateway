import consola from "consola"
import Device from "./device"
import { ModbusMaster } from "../exchange/modbus"
import { RegistryConfig } from "../types/config"

export default class Peripheral {
    device: Device
    modbus: ModbusMaster
    name: string
    slave: number
    address: number
    readable: string | boolean
    writable: string | boolean
    count: number
    _value: number

    constructor(name: string, device: Device, modbus: ModbusMaster, config: RegistryConfig) {
        const access = config.access || "RW";

        this.device = device
        this.modbus = modbus
        this.name = name
        this.slave = config.slave
        this.address = config.address
        this.readable = access.includes("R")
        this.writable = access.includes("W")
        this.count = config.count ?? 1
        this._value = config.default ?? 0;
    }

    /**
     * Get current value readed from modbus in last time
     * @returns {number}
     */
    getCurrentValue(): number {
        return this._value;
    }

    async read(queuePriority = 0): Promise<number> {
        try {
            consola.withScope(this.device.name).trace(`modbus read: '${this.name}' ${this.slave}:${this.address}`)
            this._value = await this.modbus.readRegister(this.slave, this.address, queuePriority)
            consola.withScope(this.device.name).debug(`SUCCESS modbus read: '${this.name}' ${this.slave}:${this.address}`)

            return this.getCurrentValue();
        } catch (err) {
            throw new Error(`Modbus read error in '${this.name}': ${err.name} - ${err.message}`)
        }
    }

    async write(value: number, queuePriority = 0): Promise<number> {
        try {
            const truncValue = Math.trunc(value);

            consola.withScope(this.device.name)
                .trace(`modbus write: '${this.name}' ${this.slave}:${this.address} = ${truncValue}`)
            await this.modbus.writeRegister(this.slave, this.address, truncValue, queuePriority)
            consola.withScope(this.device.name)
                .debug(`SUCCESS | modbus writen: '${this.name}' ${this.slave}:${this.address} = ${truncValue}`)

            return this._value = truncValue;
        } catch (err) {
            throw new Error(`Modbus write error in '${this.name}': ${err.name} - ${err.message}`)
        }
    } 
}
