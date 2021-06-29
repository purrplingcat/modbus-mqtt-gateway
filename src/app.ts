import consola, { LogLevel } from "consola";
import yaml from "yaml"
import fs from "fs"
import startGateway, { createDefaultConfig } from "./gateway";
import { GatewayConfig } from "./types/config";

export function errorHandler(err: Error) {
    consola.fatal(err);
    process.exit(1);
}

export default function run(argv: string[], env: NodeJS.ProcessEnv) {
    consola.info("Parsing configuration file ...")
    const configFile = argv[1] || env.MODBUS_MQTT_GW_CONFIG || "config/config.yaml"
    const config: GatewayConfig = Object.assign(
        createDefaultConfig(), 
        yaml.parse(fs.readFileSync(configFile).toString())
    )

    consola.level = LogLevel.Trace;

    consola.info("Starting gateway ...")
    startGateway(config);
}
