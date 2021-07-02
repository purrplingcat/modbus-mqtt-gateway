import { MqttClient } from "mqtt";
import consola from "consola";
import Device from "./devices/device";
import { createMqttClient } from "./exchange/mqtt";
import { ConfigDict, DeviceConfig, GatewayConfig, ModbusConfig, MqttConfig } from "./types/config";
import { createSerialModbusConnection, ModbusMaster } from "./exchange/modbus";

export const devices: Device[] = [];
let gwConfig: GatewayConfig;
let availableDevices: string[] = [];

function LoadDevices(gwUid: string, domain: string, client: MqttClient, modbusConnetions: ModbusMaster[], deviceConf: ConfigDict<DeviceConfig>, devices: Device[]) {
    Reflect.ownKeys(deviceConf).forEach(deviceName => {
        const conf = deviceConf[<string>deviceName] || {};
        const modbusMaster = modbusConnetions.find(m => m.name === conf.bus)

        if (modbusMaster == null) {
            consola.error(`Unknown modbus connection with name '${conf.bus}' for device '${<string>deviceName}'`);
            return;
        }

        devices.push(new Device(<string>deviceName, domain, gwUid, conf, client, modbusMaster))
    });
}

function heartbeat() {
    for (let device of devices) {
        if (device.available) {
            if (!availableDevices.includes(device.name)) {
                availableDevices.push(device.name)
                consola.withScope(device.name).info(`Presence: Device '${device.name}' is now ONLINE`)
            }

            return device.sendAvailability();
        } 
        
        if (!device.available && availableDevices.includes(device.name)) {
            availableDevices = availableDevices.filter(dn => dn != device.name)
            device.sendAvailability();
            consola.withScope(device.name).info(`Presence: Device '${device.name}' is now OFFLINE`)
        }
    }
}

function introduceDevice(device: Device) {
    if (device.available) {
        availableDevices.push(device.name)
    }

    consola.withScope(device.name)
        .info(`Presence: Device '${device.name}' is ${device.available ? "ONLINE" : "OFFLINE"}`)
    device.handshake();
    device.sendState()
}

async function createModbusConnections(config: ConfigDict<ModbusConfig>) {
    const promises: Promise<ModbusMaster>[] = []
    for (let busName of Reflect.ownKeys(config)) {
        const { type, connectionString, baudRate, options } = config[<string>busName];
        
        switch (type) {
            case "serial":
                promises.push(
                    createSerialModbusConnection(
                        <string>busName,
                        connectionString,
                        baudRate || 9600,
                        options
                    )
                )
                break;
            default:
                consola.error(`${<string>busName}: Unknown modbus type '${type}'`)
        }
    }

    return await Promise.all(promises);
}

export function createDefaultConfig(): GatewayConfig {
    return {
        domain: "modbus-gw",
        devices: {},
        modbus: {},
        mqtt: { brokerUrl: "" },
        heartbeat: {
            interval: 500,
            timeout: 5000,
        }
    }
}

export const getConfig = () => Object.freeze(gwConfig);

export default async function startGateway(config: GatewayConfig): Promise<void> {
    const _topic = (...args: string[]) => `${config.domain}/${args.join("/")}`;
    const domain = config.domain || "modbus-gw"
    const gwUid = config.uid || config.domain;
    
    gwConfig = config;
    consola.info(`Domain: ${domain}`)

    const modbusConnections = await createModbusConnections(config.modbus)
    const client = createMqttClient(
        gwUid,
        config.mqtt.brokerUrl,
        config.mqtt.options || {}
    )
    
    client.on("connect", function () {
        const serverUrl = (client.options as any).href
        consola.success(`Connected to MQTT broker: ${serverUrl} (clientId: ${client.options.clientId})`);

        client.subscribe(_topic("command"))
        client.publish(_topic("presence"), "online")
        devices.forEach(introduceDevice)
        consola.success("Introduction sent")
    });

    client.on("offline", function () {
        consola.warn("MQTT is offline");
    })

    client.on("error", function (err) {
        consola.error(`MQTT error: ${err.message}`, err);
    })

    client.on('message', function (topic, message) {
        if (!client.connected || client.disconnecting) {
            return;
        }

        if (topic === _topic("command")) {
            const command = JSON.parse(message.toString()) || {}

            if (command.name === "fetchDeviceStates") {
                devices.forEach(d => d.sendState())
            }
        }
    });

    LoadDevices(gwUid, domain, client, modbusConnections, config.devices, devices);
    consola.success(`Initialized ${devices.length} devices`);

    // Devices availability heartbeat
    setInterval(heartbeat, config.heartbeat.interval || 500)
}
