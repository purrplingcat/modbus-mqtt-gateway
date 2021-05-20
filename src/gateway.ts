import mqtt, { MqttClient } from "mqtt";
import consola from "consola";
import Device from "./device";
import { createMqttClient } from "./mqtt";
import { ConfigDict, DeviceConfig, GatewayConfig, MqttConfig } from "./types/config";
import { createModbusConnection, ModbusMaster } from "./modbus";

const devices: Device[] = [];
let availableDevices: string[] = [];

function LoadDevices(domain: string, client: MqttClient, modbusConnetions: ModbusMaster[], deviceConf: ConfigDict<DeviceConfig>, devices: Device[]) {
    Reflect.ownKeys(deviceConf).forEach(deviceName => {
        const conf = deviceConf[<string>deviceName] || {};
        const modbusMaster = modbusConnetions.find(m => m.name === conf.bus)

        if (modbusMaster == null) {
            consola.error(`Unknown modbus connection with name '${conf.bus}' for device '${<string>deviceName}'`);
            return;
        }
        
        devices.push(new Device(<string>deviceName, domain, conf, client, modbusMaster))
    });
}

function checkDevicesAvailability() {
    for (let device of devices) {
        if (device.available && !availableDevices.includes(device.name)) {
            availableDevices.push(device.name)
            device.sendAvailability()
            consola.withScope(device.name).info(`Presence: Device '${device.name}' is now ONLINE`)
        } else if (!device.available && availableDevices.includes(device.name)) {
            availableDevices = availableDevices.filter(dn => dn != device.name)
            consola.withScope(device.name).info(`Presence: Device '${device.name}' is now OFFLINE`)
            device.sendAvailability()
        }
    }
}

function introduceDevice(device: Device) {
    if (device.available) {
        availableDevices.push(device.name)
    }

    consola.withScope(device.name)
        .info(`Presence: Device '${device.name}' is ${device.available ? "ONLINE" : "OFFLINE"}`)
    device.sendAvailability()
    device.sendState()
}

async function createModbusConnections(config: ConfigDict<string>) {
    const promises: Promise<ModbusMaster>[] = []
    for (let port of Reflect.ownKeys(config)) {
        promises.push(createModbusConnection(<string>port, config[<string>port], 9600))
    }

    return await Promise.all(promises);
}

export function createDefaultConfig(): GatewayConfig {
    return {
        domain: "modbus-gw",
        devices: {},
        modbus: {},
        mqtt: { brokerUrl: "" },
        deviceAvailabilityHeartbeat: 500
    }
}

export default async function startGateway(config: GatewayConfig): Promise<void> {
    const _topic = (...args: string[]) => `${config.domain}/${args.join("/")}`;
    const domain = config.domain || "modbus-gw"

    const modbusConnections = await createModbusConnections(config.modbus)
    const client = createMqttClient(
        domain,
        config.mqtt.brokerUrl,
        config.mqtt.options || {}
    )
    
    client.on("connect", function () {
        const serverUrl = (client.options as any).href
        consola.success(`Connected to MQTT broker: ${serverUrl} (clientId: ${client.options.clientId})`);

        client.subscribe(["hello", "bye", _topic("command")])
        client.publish("hello", domain);
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

        if (topic === "hello") {
            client.publish(_topic("available"), "online")
            devices.forEach(introduceDevice)
            consola.success("Introduction sent on hello packet")
        }

        if (topic === _topic("command")) {
            const command = JSON.parse(message.toString()) || {}

            if (command.name === "fetchDeviceStates") {
                devices.forEach(d => d.sendState())
            }
        }
    });

    LoadDevices(domain, client, modbusConnections, config.devices, devices);
    consola.success(`Initialized ${devices.length} devices`);

    // Devices availability heartbeat
    setInterval(checkDevicesAvailability, config.deviceAvailabilityHeartbeat || 500)
}
