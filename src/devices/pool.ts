import consola from "consola";
import { EventEmitter } from "events";
import { ModbusMaster, RegisterOperationOptions } from "../exchange/modbus";
import { QueuedInterval } from "../utils/interval";

export interface PoolOptions {
    name: string;
    unit: number;
    offset?: number;
    length: number;
    interval: number;
    intervalDilation?: number;
    readTimeout?: number;
    writeTimeout?: number;
    ttl?: number;
}

export class Pool extends EventEmitter implements PoolOptions {
    name: string;
    unit: number;
    offset: number;
    length: number;
    interval: number;
    intervalDilation: number;
    readTimeout: number;
    writeTimeout: number;
    data: number[];
    ttl: number;
    private _modbus: ModbusMaster;
    private _cycle?: QueuedInterval;
    private _refreshTask: Promise<void> | null;
    private _available: boolean;

    constructor(modbus: ModbusMaster, options: PoolOptions) {
        super();
        this.name = options.name;
        this.unit = options.unit;
        this.offset = options.offset ?? 0;
        this.length = options.length;
        this.interval = options.interval ?? 1000;
        this.intervalDilation = options.intervalDilation ?? 3;
        this.readTimeout = options.readTimeout ?? modbus.timeout;
        this.writeTimeout = options.writeTimeout ?? modbus.timeout;
        this.data = [];
        this._modbus = modbus;
        this._refreshTask = null;
        this._available = true;
        this.ttl = options.ttl ?? 3;

        if (this.interval > 0) {
            this._cycle = new QueuedInterval(this.refresh.bind(this, 10), this.interval);
            this._cycle.start();
        }

        this.on("error", (err) => consola.warn(`Pool ${this.name}:`, err));
    }

    get available() {
        return this._modbus.connected && this._available;
    }

    async _refresh(priority: number) {
        if (!this._modbus.connected) { return; }

        const opts: RegisterOperationOptions = { priority, timeout: this.readTimeout, ttl: this.ttl };

        try {
            this.data = await this._modbus.readRegisters(this.unit, this.offset, this.length, opts);
            consola.trace(`Pool ${this.name}: Read data`, this.data);
            this._available = true;
            this.emit("update", this.data);
        } catch (err) {
            this._available = false;
            this.emit("error", err);
        } finally {
            if (this._cycle) {
                this._cycle.interval = this.interval * (!this.available ? this.intervalDilation : 1);
            }
            this._refreshTask = null;
        }
    }

    async set(field: number, value: number, priority = 0) {
        const opts: RegisterOperationOptions = { priority, timeout: this.writeTimeout, ttl: this.ttl };

        await this._modbus.writeRegister(this.unit, this.offset + field, value, opts);
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
