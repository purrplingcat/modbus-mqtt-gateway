import consola from "consola";
import yaml from "yaml"
import fs from "fs"
import startGateway from "./gateway";

export function errorHandler(err: Error) {
    consola.fatal(err);
    process.exit(1);
}

export default function run(argv: string[], env: NodeJS.ProcessEnv) {
    consola.info("Parsing configuration file ...")
    const configFile = argv[1] || env.MODBUS_MQTT_GW_CONFIG || "config/config.yaml"
    const config = yaml.parse(fs.readFileSync(configFile).toString())

    startGateway(config);
}
