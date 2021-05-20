import mqtt, { MqttClient } from "mqtt";
import consola from "consola";
import yaml from "yaml";
import fs from "fs";
import Device from "./device";

const instanceId = Math.random().toString(16).substr(2, 8)
const devices: Device[] = [];
let availableDevices: string[] = [];

function LoadDevices(domain: string, client: MqttClient, deviceConf: any, devices: Device[]) {
    Reflect.ownKeys(deviceConf).forEach(deviceName => {
        const conf = deviceConf[deviceName] || {};
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

export default function startGateway(config: any) {
    consola.info(`Connecting to MQTT broker: ${config.mqtt.brokerUrl} ...`)
    const mqttClientOpts = (config.mqtt || {}).options || {}
    const domain = config.domain || "modbus-gw";
    const _topic = (...args: string[]) => `${domain}/${args.join("/")}`;
    const client = mqtt.connect(config.mqtt.brokerUrl, {
        clientId: domain + "#" + instanceId,
        will: { topic: "bye", payload: domain, qos: 0, retain: false }
    });

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
    setInterval(checkDevicesAvailability, config.device_availability_heartbeat || 500)
}
