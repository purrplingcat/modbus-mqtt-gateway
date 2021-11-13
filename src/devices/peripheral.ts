import consola from "consola"
import Device from "./device"
import { RegistryConfig } from "../types/config"
import { Pool } from "./pool"
import { pools } from "../gateway"

export type NumberFormat = "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "boolean" | "dbcd1";
const toUint16Array = (n: number) => [n & 0xFFFF, (n >> 16) & 0xFFFF]
function decode(format: NumberFormat, view: DataView, offset: number, littleEndian: boolean) {
    switch (format) {
        case "int8":
            return view.getInt8(offset);
        case "uint8":
            return view.getUint8(offset);
        case "int16":
            return view.getInt16(offset, littleEndian);
        case "uint16":
            return view.getUint16(offset, littleEndian);
        case "int32":
            return view.getInt32(offset, littleEndian);
        case "uint32":
            return view.getInt32(offset);
        case "boolean":
            return view.getUint8(offset) > 0;
        case "dbcd1":
            return view.getUint16(offset, littleEndian) / 10;
        default:
            throw new Error(`Invalid format: ${format}`);
    }
}

function encode(format: NumberFormat, value: number | boolean): number[] {
    switch(format) {
        case "int8":
        case "uint8":
        case "boolean":
            return [ Math.trunc(<number>value) & 0xFF ];
        case "int16":
        case "uint16":
            return [ Math.trunc(<number>value) & 0xFFFF ];
        case "int32":
        case "uint32":
            return toUint16Array(Math.trunc(<number>value));
        case "dbcd1":
            return [ Math.trunc(<number>value * 10) & 0xFFFF ];
        default:
            throw new Error(`Invalid format: ${format}`);
    }
}

export default class Peripheral {
    device: Device
    name: string
    pool: string
    field: number
    readable: string | boolean
    writable: string | boolean
    format: NumberFormat;
    endian: "little" | "big";
    _value: number | boolean;

    constructor(name: string, device: Device, config: RegistryConfig) {
        const access = config.access || "RW";

        this.device = device
        this.name = name
        this.pool = config.pool
        this.field = config.field
        this.readable = access.includes("R")
        this.writable = access.includes("W")
        this.format = config.format ?? "uint16";
        this.endian = config.endian ?? "little";
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
        console.log("in update", data);
        if (this.field > data.length) {
            return consola.warn(
                `Peripheral ${this.device.name}.${this.name}: Field ${this.field} is out of range (pool '${this.pool}' length ${data.length})`
            );
        }
        const wordArray = new Uint16Array(data);
        const view = new DataView(wordArray.buffer, 0);

        this._value = decode(this.format, view, this.field * 2, this.endian === "little");
        console.log("new value", this._value);
    }

    async read() {
        this.corespondingPool.refresh();
    }

    /**
     * Get current value readed from modbus in last time
     * @returns {number}
     */
    getCurrentValue<T extends typeof this._value>(): T {
        return this._value as T;
    }

    async write(value: typeof this._value, queuePriority = 0): Promise<typeof this._value> {
        try {
            consola.withScope(this.device.name)
                .trace(`modbus write: '${this.name}' ${this.pool}:${this.field} = ${value}`)

            await this.corespondingPool.set(this.field, encode(this.format, value), queuePriority)

            consola.withScope(this.device.name)
                .debug(`SUCCESS | modbus writen: '${this.name}' ${this.pool}:${this.field} = ${value}`)

            return value;
        } catch (err: any) {
            throw new Error(`Modbus write error in '${this.name}': ${err.name} - ${err.message}`)
        }
    } 
}
