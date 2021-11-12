import consolaGlobalInstance from "consola";
import { EventEmitter } from "stream";
import { ModbusMaster } from "../exchange/modbus";
import { QueuedInterval } from "../utils/interval";

export interface PoolOptions {
    name: string;
    id: number;
    offset?: number;
    length: number;
    interval: number;
    readTimeout?: number;
    writeTimeout?: number;
}

export class Pool extends EventEmitter implements PoolOptions {
    name: string;
    id: number;
    offset: number;
    length: number;
    interval: number;
    readTimeout?: number;
    writeTimeout?: number;
    data: number[];
    private _modbus: ModbusMaster;
    private _cycle?: QueuedInterval;
    private _refreshTask: Promise<void> | null;
    private _available: boolean;

    constructor(modbus: ModbusMaster, options: PoolOptions) {
        super();
        this.name = options.name;
        this.id = options.id;
        this.offset = options.offset ?? 0;
        this.length = options.length;
        this.interval = options.interval ?? 1000;
        this.readTimeout = options.readTimeout;
        this.writeTimeout = options.writeTimeout;
        this.data = [];
        this._modbus = modbus;
        this._refreshTask = null;
        this._available = true;

        if (this.interval > 0) {
            this._cycle = new QueuedInterval(this.refresh.bind(this, 10), this.interval);
            this._cycle.start();
        }
    }

    get available() {
        return this._modbus.connected && this._available;
    }

    async _refresh(priority: number) {
        if (!this._modbus.connected) { return; }

        try {
            this.data = await this._modbus.readRegisters(this.id, this.offset, this.length, priority, this.readTimeout);
            this._available = true;
            this.emit("update", this.data);
        } catch (err) {
            this._available = false;
            this.emit("error", err);
            consolaGlobalInstance.warn(`Pool ${this.name}:`, err);
        } finally {
            this._refreshTask = null;
        }
    }

    async set(field: number, value: number, priority = 0) {
        await this._modbus.writeRegister(this.id, this.offset + field, value, priority, this.writeTimeout);
        this.data[field] = value;
        this.emit("update", this.data);
    }

    refresh(priority = 0): Promise<void> {
        if (!this._refreshTask) {
            this._refreshTask = this._refresh(priority);
        }

        return this._refreshTask;
    }
}
