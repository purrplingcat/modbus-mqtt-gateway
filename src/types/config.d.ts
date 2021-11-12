import { SerialPortOptions } from "modbus-serial/ModbusRTU";
import { IClientOptions, MqttClient } from "mqtt";
import { PoolOptions } from "../devices/pool";

export type ConfigDict<T> = {[key: string]: T} 

export interface GatewayConfig {
    domain: string,
    uid?: string,
    mqtt: MqttConfig,
    modbus: ConfigDict<ModbusConfig>,
    devices: ConfigDict<DeviceConfig>,
    heartbeat: { interval: number, timeout: number },
    pools: PoolConfig[],
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
    type?: string;
    bus: string;
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
    pool: string;
    field: number;
    default?: number;
}

export interface PoolConfig extends PoolOptions {
    bus: string;
}
