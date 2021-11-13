import consola from "consola"
import Device from "./device"
import { ModbusMaster } from "../exchange/modbus"
import { RegistryConfig } from "../types/config"
import { Pool } from "./pool"
import { pools } from "../gateway"

export default class Peripheral {
    device: Device
    name: string
    pool: string
    field: number
    readable: string | boolean
    writable: string | boolean
    _value: number;

    constructor(name: string, device: Device, config: RegistryConfig) {
        const access = config.access || "RW";

        this.device = device
        this.name = name
        this.pool = config.pool
        this.field = config.field
        this.readable = access.includes("R")
        this.writable = access.includes("W")
        this._value = config.default ?? 0;
        this.corespondingPool.on("update", this._onPoolUpdate.bind(this));
    }

    get available(): boolean {
        return this.corespondingPool.available;
    }

    get corespondingPool(): Pool {
        if (!pools.has(this.pool)) {
            throw new Error(`Peripheral ${this.device.name}.${this.name}: Coresponding pool ${this.pool} doesn't exists`);
        }

        return <Pool>pools.get(this.pool);
    }

    private _onPoolUpdate(data: number[]) {
        if (data[this.field] == null) {
            consola.warn(`Peripheral ${this.device.name}.${this.name}: field ${this.field} in pool ${this.pool} is undefined!`);
            return;
        }

        this._value = data[this.field];
    }

    async read() {
        this.corespondingPool.refresh();
    }

    /**
     * Get current value readed from modbus in last time
     * @returns {number}
     */
    getCurrentValue(): number {
        return this._value;
    }

    async write(value: number, queuePriority = 0): Promise<number> {
        try {
            const truncValue = Math.trunc(value);

            consola.withScope(this.device.name)
                .trace(`modbus write: '${this.name}' ${this.pool}:${this.field} = ${truncValue}`)
            await this.corespondingPool.set(this.field, truncValue, queuePriority)
            consola.withScope(this.device.name)
                .debug(`SUCCESS | modbus writen: '${this.name}' ${this.pool}:${this.field} = ${truncValue}`)

            return truncValue;
        } catch (err: any) {
            throw new Error(`Modbus write error in '${this.name}': ${err.name} - ${err.message}`)
        }
    } 
}
