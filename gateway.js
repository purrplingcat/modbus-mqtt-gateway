const mqtt = require("mqtt");
const consola = require("consola");
const yaml = require("yaml");
const fs = require("fs");
const Device = require("./device");

consola.info("Parsing configuration file ...")
const config = yaml.parse(fs.readFileSync("config/config.yaml").toString())
const mqttClientOpts = (config.mqtt || {}).options || {}
const domain = config.domain || "modbus-gw";
const instanceId = Math.random().toString(16).substr(2, 8)
const devices = [];
consola.info(`Connecting to MQTT broker: ${config.mqtt.brokerUrl} ...`)
const client = mqtt.connect(config.mqtt.brokerUrl, { 
    clientId: domain + "#" + instanceId, 
    will: {topic: "bye", payload: domain}  
});
const _topic = (...args) => `${domain}/${args.join("/")}`;
let availableDevices = [];

function LoadDevices(deviceConf, devices) {
    Reflect.ownKeys(deviceConf).forEach(deviceName => {
        const conf = deviceConf[deviceName] || {};
        devices.push(new Device(deviceName, domain, conf, client))
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

function introduceDevice(device) {
    if (device.available) {
        availableDevices.push(device.name)
    }

    device.sendAvailability()
    device.sendState()
}

LoadDevices(config.devices, devices);
consola.success(`Initialized ${devices.length} devices`);

client.on("connect", function () {
    consola.success(`Connected to MQTT broker: ${client.options.href} (clientId: ${client.options.clientId})`);

    client.subscribe(["hello", "bye", _topic("command")])
    client.publish("hello", domain);
});

client.on("offline", function() {
    consola.warn("MQTT is offline");
})

client.on("error", function(err) {
    consola.error(`MQTT error: ${err.message}`, err);
})

client.on('message', function (topic, message) {
    if (!client.connected || client.disconnecting) {
        return;
    }

    if (topic === "hello") {
        client.publish(_topic("available", "online"))
        devices.forEach(introduceDevice)
        consola.info("Introduction sent on hello packet")
    }

    if (topic === _topic("command")) {
        const command = JSON.parse(message) || {}

        if (command.name === "fetchDeviceStates") {
            devices.forEach(d => d.sendState())
        }
    }
});

// Devices availability heartbeat
setInterval(checkDevicesAvailability, config.device_availability_heartbeat || 500)
