import consola, { Consola } from "consola"
import ModbusRTU from "modbus-serial"
import { ReadRegisterResult, SerialPortOptions } from "modbus-serial/ModbusRTU";
import Semaphore from "../mutex/Semaphore";

type Dict<V> = { [key: string]: V };

export class ModbusMaster {
    name: string;
    modbus: ModbusRTU;
    private _semaphore: Semaphore
    private _logger: Consola

    constructor(name: string, modbus: ModbusRTU) {
        this.name = name;
        this.modbus = modbus;
        this._semaphore = new Semaphore(1)
        this._logger = consola.withScope(`modbus:${name}`);
    }

    get connected(): boolean {
        return this.modbus.isOpen
    }

    async readRegister(slave: number, address: number, priority = 0) {
        return await this._semaphore.runExclusive(async () => {
            this._logger.trace(`Start reading registry ${address} from slave ${slave}`)
            this.modbus.setID(slave)
            const result = await this.modbus.readHoldingRegisters(address, 1)
            this._logger.trace(`Registry ${address} from slave ${slave} read`, result)

            return result.data[0] // TODO: change key to 0 when Ashley fixes reading in device
        }, priority);
    }

    async writeRegister(slave: number, address: number, value: number, priority = 0) {
        return await this._semaphore.runExclusive(async () => {
            this._logger.trace(`Start writing registry ${address} to slave ${slave}, value: ${value}`)
            this.modbus.setID(slave)
            await this.modbus.writeRegister(address, value)
            this._logger.trace(`Value ${value} written in registry ${address} in slave ${slave}`)
        }, priority)
    }
}

export async function createSerialModbusConnection(name: string, device: string, baudRate: number, timeout: number, options?: SerialPortOptions) {
    const modbusClient = new ModbusRTU()

    try {
        consola.info(`Opening modbus connection '${name}' on serial port ${device} (${baudRate} bauds) ...`)
        await modbusClient.connectRTUBuffered(device, { baudRate, parity: "none", ...(options || {}) })
        modbusClient.setTimeout(timeout)
    } catch (err) {
        consola.error(`Can't open modbus connection '${name}':  ${err.message} (${err.name})`)
        modbusClient.close(function() {})
    }

    return new ModbusMaster(name, modbusClient);
}