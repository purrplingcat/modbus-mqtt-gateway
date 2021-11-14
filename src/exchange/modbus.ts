import autobind from "autobind-decorator";
import consola, { Consola } from "consola"
import ModbusRTU from "modbus-serial"
import { SerialPortOptions, TcpRTUPortOptions } from "modbus-serial/ModbusRTU";
import { EventEmitter } from "stream";
import Semaphore from "../mutex/Semaphore";
import { QueuedInterval } from "../utils/interval";

export type RegisterOperationOptions = {
    priority?: number;
    timeout?: number;
    ttl?: number;
}

export class ModbusMaster {
    name: string;
    modbus: ModbusRTU;
    timeout: number;
    private _semaphore: Semaphore
    private _logger: Consola

    constructor(name: string, modbus: ModbusRTU) {
        this.name = name;
        this.modbus = modbus;
        this.timeout = modbus.getTimeout();
        this._semaphore = new Semaphore(1)
        this._logger = consola.withScope(`modbus:${name}`);

        if (modbus instanceof EventEmitter) {
            modbus.on("close", this._reconnect);
        }

        modbus.isOpen ? this._onConnect() : this.modbus.open(this._onConnect);
    }

    get connected(): boolean {
        return this.modbus.isOpen
    }

    @autobind
    private _reconnect(err?: Error) {
        if (!this.modbus.isOpen) {
            this._logger.warn(`Modbus '${this.name}' connection failed:`, err?.message ?? "Connection closed");
            setTimeout(() => this.modbus.open(this._onConnect), Number(process.env.RECCONECT_TIMEOUT ?? 500));
        }
    }

    @autobind
    private _onConnect(err?: Error) {
        if (err && !this.connected) { 
            return this._reconnect(err);
        }

        this._logger.success(`Modbus '${this.name}' connected!`);
    }

    async readRegisters(slave: number, address: number, length: number, options?: RegisterOperationOptions): Promise<number[]> {
        if (slave == null) throw new Error("Parameter 'slave' is not defined");
        if (address == null) throw new Error("Parameter 'address' is not defined");
        if (length == null) throw new Error("Parameter 'length' is not defined");

        return await this._semaphore.runExclusive(async () => {
            this._logger.trace(`Start reading registry ${address} from slave ${slave}`)
            this.modbus.setID(slave)
            this.modbus.setTimeout(options?.timeout ?? this.timeout);
            const result = await this.modbus.readHoldingRegisters(address, length)
            this._logger.trace(`Registry ${address} from slave ${slave} read`, result)
            
            return result.data;
        }, options?.priority ?? 0, options?.ttl ?? 0);
    }

    async writeRegister(slave: number, address: number, value: number, options?: RegisterOperationOptions) {
        if (slave == null) throw new Error("Parameter 'slave' is not defined");
        if (address == null) throw new Error("Parameter 'address' is not defined");
        if (value == null) throw new Error("Parameter 'value' is not defined");

        return await this._semaphore.runExclusive(async () => {
            this._logger.trace(`Start writing registry ${address} to slave ${slave}, value: ${value}`)
            this.modbus.setID(slave);
            this.modbus.setTimeout(options?.timeout ?? this.timeout)
            await this.modbus.writeRegister(address, value)
            this._logger.trace(`Value ${value} written in registry ${address} in slave ${slave}`)
        }, options?.priority ?? 0, options?.ttl ?? 0)
    }
}

export async function createSerialModbusConnection(name: string, device: string, baudRate: number, timeout: number, options?: SerialPortOptions) {
    const modbusClient = new ModbusRTU()

    try {
        consola.info(`Opening modbus connection '${name}' on serial port ${device} (${baudRate} bauds) ...`)
        await modbusClient.connectRTUBuffered(device, { baudRate, parity: "none", ...(options || {}) })
        modbusClient.setTimeout(timeout)
    } catch (err: any) {
        consola.error(`Can't open modbus connection '${name}':  ${err.message} (${err.name})`)
        modbusClient.close(function() {})
    }

    return new ModbusMaster(name, modbusClient);
}

export async function createTcpModbusConnection(name: string, ip: string, port: number, timeout: number, options?: TcpRTUPortOptions) {
    const modbusClient = new ModbusRTU()

    try {
        consola.info(`Opening modbus TCP connection '${name}' ${ip}:${port} ...`)
        await modbusClient.connectTcpRTUBuffered(ip, {port, ...(options || {})})
        modbusClient.setTimeout(timeout)
    } catch (err: any) {
        consola.error(`Can't open modbus connection '${name}':  ${err.message} (${err.name})`)
        modbusClient.close(function() {})
    }

    return new ModbusMaster(name, modbusClient);
}