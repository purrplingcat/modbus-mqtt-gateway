import consola from "consola"
import Device from "./device"
import { ModbusMaster } from "../exchange/modbus"

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

    constructor(device: Device, modbus: ModbusMaster, name: string, slave: number, address: number, access = "RW", count?: number) {
        this.device = device
        this.modbus = modbus
        this.name = name
        this.slave = slave
        this.address = address
        this.readable = access.includes("R")
        this.writable = access.includes("W")
        this.count = count ?? 1
        this._value = 0;
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

            return this._value;
        } catch (err) {
            throw new Error(`Modbus read error in '${this.name}': ${err.name} - ${err.message}`)
        }
    }

    async write(value: number, queuePriority = 0): Promise<number> {
        try {
            consola.withScope(this.device.name).trace(`modbus write: '${this.name}' ${this.slave}:${this.address}`)
            await this.modbus.writeRegister(this.slave, this.address, Number(value), queuePriority)
            consola.withScope(this.device.name).debug(`SUCCESS modbus writen: '${this.name}' ${this.slave}:${this.address}`)

            return this._value = Number(value);
        } catch (err) {
            throw new Error(`Modbus write error in '${this.name}': ${err.name} - ${err.message}`)
        }
    }
}
