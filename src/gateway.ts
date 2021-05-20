import mqtt, { MqttClient } from "mqtt";
import consola from "consola";
import yaml from "yaml";
import fs from "fs";
import Device from "./device";
import { createMqttClient } from "./mqtt";
import { ConfigDict, DeviceConfig, GatewayConfig, MqttConfig } from "./types/config";

const devices: Device[] = [];
let availableDevices: string[] = [];

function LoadDevices(domain: string, client: MqttClient, deviceConf: ConfigDict<DeviceConfig>, devices: Device[]) {
    Reflect.ownKeys(deviceConf).forEach(deviceName => {
        const conf = deviceConf[<string>deviceName] || {};
        devices.push(new Device(<string>deviceName, domain, conf, client))
    });
}

function checkDevicesAvailability() {
    for (let device of devices) {
        if (device.available && !availableDevices.includes(device.name)) {
            availableDevices.push(device.name)
            device.sendAvailability()
        } else if (!device.available && availableDevices.includes(device.name)) {
            availableDevices = availableDevices.filter(dn => dn != device.name)
            device.sendAvailability()
        }
    }
}

function introduceDevice(device: Device) {
    if (device.available) {
        availableDevices.push(device.name)
    }

    device.sendAvailability()
    device.sendState()
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

export default function startGateway(config: GatewayConfig): void {
    const _topic = (...args: string[]) => `${config.domain}/${args.join("/")}`;
    const domain = config.domain || "modbus-gw"
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
            consola.info("Introduction sent on hello packet")
        }

        if (topic === _topic("command")) {
            const command = JSON.parse(message.toString()) || {}

            if (command.name === "fetchDeviceStates") {
                devices.forEach(d => d.sendState())
            }
        }
    });

    LoadDevices(domain, client, config.devices, devices);
    consola.success(`Initialized ${devices.length} devices`);

    // Devices availability heartbeat
    setInterval(checkDevicesAvailability, config.deviceAvailabilityHeartbeat || 500)
}
