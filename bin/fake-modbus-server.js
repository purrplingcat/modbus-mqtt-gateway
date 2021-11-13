// create an empty modbus client
let x = 8000;
const ModbusRTU = require("modbus-serial");
const vector = {
    getInputRegister: function(addr, unitID) {
        // Synchronous handling
        return addr;
    },
    getMultipleHoldingRegisters: function(addr, length, unitID, callback) {
        // Asynchronous handling (with callback)
        console.log(`Read ${addr} length ${length}, unit ${unitID}`);
        setTimeout(function() {
            const r = [];
            for (let i = 0; i < length; i++) { 
                r.push(Math.max(0, addr + x + (unitID - i))) 
            }
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
        console.log("set register", addr, value, unitID);
        return;
    },
    setCoil: function(addr, value, unitID) {
        // Asynchronous handling supported also here
        console.log("set coil", addr, value, unitID);
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

// set the server to answer for modbus requests
console.log("ModbusTCP listening on modbus://127.0.0.1:8502");
var serverTCP = new ModbusRTU.ServerTCP(vector, { host: "127.0.0.1", port: 8502, debug: true, unitID: 255 });

serverTCP.on("socketError", function(err){
    // Handle socket error if needed, can be ignored
    console.error(err);
});

setInterval(() => x = 500 - Math.round(Math.random() * 1000), 10000);
