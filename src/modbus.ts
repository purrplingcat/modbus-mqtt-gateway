import ModbusRTU from "modbus-serial"

export function createModbusConnection(name: string, device: string) {
    const modbusClient = new ModbusRTU()
    //modbusClient.connectRTUBuffered()
}