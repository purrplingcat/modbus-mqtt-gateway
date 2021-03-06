import { SerialPortOptions, TcpRTUPortOptions } from "modbus-serial/ModbusRTU";
import { IClientOptions, MqttClient, QoS } from "mqtt";
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
    connectionString: string
    baudRate?: number
    timeout?: number
    options?: SerialPortOptions | TcpRTUPortOptions
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
    qos: QoS;
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
    format?: "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32";
    endian?: "little" | "big";
}

export interface PoolConfig extends PoolOptions {
    bus: string;
}
