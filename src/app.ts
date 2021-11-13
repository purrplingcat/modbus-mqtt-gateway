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
    consola.level = Number(env.LOG_LEVEL || LogLevel.Info);
    consola.log(`Modbus MQTT gateway ${application.manifest.version} at ${application.runner} ${application.runnerVersion}, node ${process.version}+${process.platform}-${process.arch}`)
    consola.log(`Copyright (c) ${application.manifest.author}, licensed under ${application.manifest.license}`)
    consola.log("");

    consola.info("Parsing configuration file ...")
    const configFile = argv[1] || env.MODBUS_MQTT_GW_CONFIG || "config/config.yaml"
    const config: GatewayConfig = Object.assign(
        createDefaultConfig(), 
        yaml.parse(fs.readFileSync(configFile).toString())
    )

    consola.info("Starting gateway ...")
    startGateway(config);
}
