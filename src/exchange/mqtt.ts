import consola from "consola";
import mqtt, { IClientOptions, MqttClient } from "mqtt"

export function createMqttClient(uid: string, brokerUrl: string, options: IClientOptions): MqttClient {
    consola.info(`Connecting to MQTT broker: ${brokerUrl} ...`)
    const instanceId = Math.random().toString(16).substr(2, 8)
    return mqtt.connect(brokerUrl, {
        ...options,
        clientId: uid + "#" + instanceId,
        will: { topic: "discovery/death", payload: uid, qos: 0, retain: false }
    });
}