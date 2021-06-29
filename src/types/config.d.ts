import { SerialPortOptions } from "modbus-serial/ModbusRTU";
import { IClientOptions, MqttClient } from "mqtt";

export type ConfigDict<T> = {[key: string]: T} 

export interface GatewayConfig {
    domain: string,
    uid?: string,
    mqtt: MqttConfig,
    modbus: ConfigDict<ModbusConfig>,
    devices: ConfigDict<DeviceConfig>,
    heartbeat: number,
}

export interface MqttConfig {
    brokerUrl: string,
    options?: IClientOptions,
}

export interface ModbusConfig {
    type: "serial"
    connectionString: string
    baudRate?: number
    options?: SerialPortOptions
}

export interface DeviceConfig {
    meta?: DeviceMeta;
    timeout?: number;
    type?: string;
    bus: string;
    checkInterval?: number;
    private?: boolean;
    registers: ConfigDict<RegistryConfig>
}

export interface DeviceMeta {
    uid?: string;
    type?: string;
    location?: string;
    alias?: string;
    product?: string;
    vendor?: string;
    model?: string;
    name?: string;
    features?: string[];
    tags?: string[];
    stateRegister?: string;
}

export interface RegistryConfig {
    access: "R" | "W" | "RW",
    slave: number,
    address: number,
    type?: "coil" | "holding" | "input"
    count?: number
}
