import consola, { Consola } from "consola"
import ModbusRTU from "modbus-serial"
import { ReadRegisterResult } from "modbus-serial/ModbusRTU";
import Semaphore from "./mutex/semaphore";

type Dict<V> = {[key: string]: V};

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

    async readRegister(slave: number, address: number) {
        return await this._semaphore.runExclusive(async () => {
            this._logger.trace(`Start reading registry ${address} from slave ${slave}`)
            this.modbus.setID(slave)
            const result = await this.modbus.readHoldingRegisters(address, 2) // TODO: change to 1 when Ashley fix reading in device
            this._logger.trace(`Registry ${address} from slave ${slave} read`, result)

            return result.data[0]
        }, 10);
    }

    async writeRegister(slave: number, address: number, value: number) {
        return await this._semaphore.runExclusive(async () => {
            this._logger.trace(`Start writing registry ${address} to slave ${slave}, value: ${value}`)
            this.modbus.setID(slave)
            await this.modbus.writeRegister(address, value)
            this._logger.trace(`Value ${value} written in registry ${address} in slave ${slave}`)
        }, 0)
    }
}

export async function createModbusConnection(name: string, device: string, baudRate: number) {
    const modbusClient = new ModbusRTU()

    consola.info(`Opening modbus connection '${name}' on serial port ${device} (${baudRate} bauds) ...`)
    await modbusClient.connectRTUBuffered(device, {baudRate, parity: "none"})
    modbusClient.setTimeout(10000)

    return new ModbusMaster(name, modbusClient);
}