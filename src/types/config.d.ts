import { IClientOptions, MqttClient } from "mqtt";

export type ConfigDict<T> = {[key: string]: T} 

export interface GatewayConfig {
    domain: string,
    mqtt: MqttConfig,
    modbus: ConfigDict<string>,
    devices: ConfigDict<DeviceConfig>,
    deviceAvailabilityHeartbeat?: number,
}

export interface MqttConfig {
    brokerUrl: string,
    options?: IClientOptions,
}

export interface DeviceConfig {
    bus: string;
    checkInterval?: number;
    registers: ConfigDict<RegistryConfig>
}

export interface RegistryConfig {
    access: "R" | "W" | "RW",
    slave: number,
    address: number,
    type?: "coil" | "holding" | "input"
    count?: number
}
