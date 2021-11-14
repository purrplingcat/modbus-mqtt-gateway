module.exports = {
    apps: [
        {
            name: "modbus-mqtt-gateway",
            namespace: "modbus-mqtt",
            script: "bin/modbus-mqtt-gw.js",
            cwd: __dirname,
            time: true,
        },
    ],
};
