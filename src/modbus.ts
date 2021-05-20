import consola, { Consola } from "consola"
import ModbusRTU from "modbus-serial"
import { Semaphore } from "async-mutex"
import { ReadRegisterResult } from "modbus-serial/ModbusRTU";

type Dict<V> = {[key: string]: V};

export class ModbusMaster {
    name: string;
    modbus: ModbusRTU;
    private _semaphore: Semaphore
    private _logger: Consola
    private _preloaded: Dict<number[]>

    constructor(name: string, modbus: ModbusRTU) {
        this.name = name;
        this.modbus = modbus;
        this._semaphore = new Semaphore(1)
        this._logger = consola.withScope(`modbus:${name}`);
        this._preloaded = {}
    }

    async _readRegisterBuffer(slave: number, start: number, length: number) {
        const cacheKey = `${slave}.${start}.${length}`;

        console.log(cacheKey)

        if (Reflect.has(this._preloaded, cacheKey)) {
            this._logger.log("Using preloaded cache for slave " + slave)
            return this._preloaded[cacheKey];
        }

        const result = await this.modbus.readHoldingRegisters(start, length)
        this._preloaded[cacheKey] = result.data;
        this._logger.log(`Fetched fresh data from ${slave} and stored in preloaded cache`)

        return result.data;
    }

    async readRegister(slave: number, address: number, count: number, processor?: (v: ReadRegisterResult) => number) {
        return await this._semaphore.runExclusive(async () => {
            if (processor == null) {
                processor = (v) => v.data.reduce((acc, curr) => acc + curr, 0)
            }

            this.modbus.setID(slave)
            this._logger.log(`Start reading registry ${address} from slave ${slave}`)
            const result = await this.modbus.readHoldingRegisters(address, count)
            this._logger.log(`Registry ${address} from slave ${slave} read`)
            this._logger.log(result)

            console.log(processor(result))

            return processor(result)
        });
    }

    free() {
        this._preloaded = {}
        this._logger.log("Preloaded cache clear")
    }
}

export async function createModbusConnection(name: string, device: string, baudRate: number) {
    const modbusClient = new ModbusRTU()

    consola.info(`Opening modbus connection '${name}' on serial port ${device} (${baudRate} bauds) ...`)
    await modbusClient.connectRTUBuffered(device, {baudRate, parity: "none"})
    modbusClient.setTimeout(10000)

    return new ModbusMaster(name, modbusClient);
}