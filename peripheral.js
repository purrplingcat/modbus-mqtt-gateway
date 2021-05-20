class Peripheral {
    constructor(modbus, name, slave, address, access = "RW") {
        this.modbus = modbus
        this.name = name
        this.slave = slave
        this.address = address
        this.readable = access && access.includes("R")
        this.writable = access && access.includes("W")
        this._value = 0;
    }

    /**
     * Get current value readed from modbus in last time
     * @returns {number}
     */
    getCurrentValue() {
        return this._value;
    }

    async read() {
        return this._value;
    }

    async write(value) {
        return this._value = Number(value);
    }
}

module.exports = Peripheral
