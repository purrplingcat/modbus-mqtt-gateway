import { SerialPortOptions } from "modbus-serial/ModbusRTU";
import { IClientOptions, MqttClient } from "mqtt";

export type ConfigDict<T> = {[key: string]: T} 

export interface GatewayConfig {
    domain: string,
    uid?: string,
    mqtt: MqttConfig,
    modbus: ConfigDict<ModbusConfig>,
    devices: ConfigDict<DeviceConfig>,
    heartbeat: { interval: number, timeout: number },
}

export interface MqttConfig {
    brokerUrl: string,
    options?: IClientOptions,
    topicFormat: "device-uid" | "gw-device-uid" | "fancy";
}

export interface ModbusConfig {
    type: "serial"
    connectionString: string
    baudRate?: number
    timeout?: number
    options?: SerialPortOptions
}

export interface DeviceConfig {
    alias?: string;
    meta?: DeviceMeta;
    timeout?: number;
    type?: string;
    bus: string;
    checkInterval?: number;
    secret?: boolean;
    retain?: boolean;
    registers: ConfigDict<RegistryConfig>
    forceUpdate: boolean;
}

export interface DeviceMeta {
    uid?: string;
    type?: string;
    room?: string;
    product?: string;
    vendor?: string;
    model?: string;
    name?: string;
    features?: string[];
    tags?: string[];
    stateRegister?: string;
    description?: string;
    groups?: string[];
    additional?: Record<string, unknown>
}

export interface RegistryConfig {
    access: "R" | "W" | "RW",
    slave: number,
    address: number,
    type?: "coil" | "holding" | "input"
    count?: number,
    default?: number;
}
