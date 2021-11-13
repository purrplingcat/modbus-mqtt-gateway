// create an empty modbus client
let x = 60000;
let g = {};
const consola = require("consola");
const ModbusRTU = require("modbus-serial");
const vector = {
    getInputRegister: function(addr, unitID) {
        // Synchronous handling
        return addr;
    },
    getMultipleHoldingRegisters: function(addr, length, unitID, callback) {
        // Asynchronous handling (with callback)
        consola.log(`Read ${addr} length ${length}, unit ${unitID}`);
        setTimeout(function() {
            const r = [];
            consola.trace(g);
            for (let i = 0; i < length; i++) { 
                if (g[`${unitID}.${addr + i}`] == null) {
                    g[`${unitID}.${addr + i}`] = Math.max(0, addr + x + (unitID - i))
                }
                r.push(g[`${unitID}.${addr + i}`]) 
            }
            consola.debug("Output data", r);
            callback(null, r);
        }, 10);
    },
    getCoil: function(addr, unitID) {
        // Asynchronous handling (with Promises, async/await supported)
        return new Promise(function(resolve) {
            setTimeout(function() {
                resolve((addr % 2) === 0);
            }, 10);
        });
    },
    setRegister: function(addr, value, unitID) {
        // Asynchronous handling supported also here
        consola.log("set register", unitID, addr, value);
        g[`${unitID}.${addr}`] = value;
        consola.trace(g);
        return;
    },
    setCoil: function(addr, value, unitID) {
        // Asynchronous handling supported also here
        consola.log("set coil", addr, value, unitID);
        return;
    },
    readDeviceIdentification: function(addr) {
        return {
            0x00: "PurrplingCat",
            0x01: "Fake-Modbus-device",
            0x02: "1.0.0",
            0x05: "FakeDevice",
            0x97: "Modbus TCP",
            0xAB: "For testing purposes only"
        };
    }
};

consola.level = Number(process.env.LOG_LEVEL ?? 3)

// set the server to answer for modbus requests
consola.info("ModbusTCP listening on modbus://127.0.0.1:8502");
var serverTCP = new ModbusRTU.ServerTCP(vector, { host: "127.0.0.1", port: 8502, debug: true, unitID: 255 });

serverTCP.on("socketError", function(err){
    // Handle socket error if needed, can be ignored
    consola.error(err);
});

// Refresh base data every 30s. It generates new sample data for each device registry
setInterval(() => {
    g = {}
    x = Math.round(Math.random() * 10000)
    consola.info("new base", x, new Date());
}, 30000);
