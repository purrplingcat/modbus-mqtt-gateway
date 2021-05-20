export default class Peripheral {
    modbus: unknown
    name: string
    slave: number
    address: number
    readable: string | boolean
    writable: string | boolean
    _value: number

    constructor(modbus: unknown, name: string, slave: number, address: number, access = "RW") {
        this.modbus = modbus
        this.name = name
        this.slave = slave
        this.address = address
        this.readable = access.includes("R")
        this.writable = access.includes("W")
        this._value = 0;
    }

    /**
     * Get current value readed from modbus in last time
     * @returns {number}
     */
    getCurrentValue(): number {
        return this._value;
    }

    async read(): Promise<number> {
        return this._value;
    }

    async write(value: number): Promise<number> {
        return this._value = Number(value);
    }
}
