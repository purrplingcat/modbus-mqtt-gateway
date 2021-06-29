import consola, { Consola } from "consola";
import EventEmitter from "events";
import { MqttClient } from "mqtt";
import Handshake from "./handshake";

declare interface Discovery {
    on(event: "handshake", listener: (shake: Handshake, timestamp: Date) => void): this;
    on(event: "alive", listener: (uid: string, timestamp: Date) => void): this;
    on(event: "death", listener: (uid: string, timestamp: Date) => void): this;
    on(event: "subscribed", listener: () => void): this;
    on(event: "handshakeSent", listener: (shake: Handshake, timestamp: Date) => void): this;
}

class Discovery extends EventEmitter {
    private _mqtt: MqttClient;
    private _handshakeFactory: () => Handshake;
    private _logger: Consola;

    constructor(mqtt: MqttClient, handshakeFactory: () => Handshake, handshakeOnConnect = true, tag?: string) {
        super();
        this._mqtt = mqtt;
        this._mqtt.on("message", this._onMessage.bind(this));
        this._mqtt.on("connect", this._onConnect.bind(this, handshakeOnConnect));
        this._handshakeFactory = handshakeFactory;
        this._logger = consola.withScope("discovery");

        if (tag) {
            this._logger = this._logger.withTag(tag);
        }
    }

    private _onConnect(handshake: boolean) {
        this._mqtt.subscribe(["discovery/+", `discovery/+/${this.getUid()}`], (err) => {
            if (err) {
                this._logger.error("An error occured while subscribing discovery:", err);
                return;
            }

            this._logger.debug("Subscribed discovery");
            this.emit("subscribed");
            
            if (handshake) {
                this.handshake(handshake);
            }
        });
    }

    private async _onMessage(topic: string, message: Buffer) {
        if (!topic.startsWith("discovery/")) {
            return;
        }

        const timestamp = new Date();
        const split = topic.split("/");
        const discoveryType = split[1];

        switch (discoveryType) {
            case "alive":
                if (message.toString() === this.getUid()) {
                    return;
                }

                this._logger.debug(`Got keep-alive packet from '${message}'`);
                this.emit("alive", message.toString(), timestamp);
                break;
            case "death":
                if (message.toString() === this.getUid()) {
                    return;
                }

                this._logger.debug(`Got death packet from '${message}'`);
                this.emit("death", message.toString(), timestamp);
                break;
            case "handshake":
                const shake = JSON.parse(message.toString()) as Handshake;

                if (this.getUid() === shake.uid) {
                    return;
                }

                this._logger.debug(`Got handshake from '${shake.uid}' (expects reply: ${!!shake._thread})`);
                this.emit("handshake", shake, timestamp);
                //this.emit("alive", shake.uid, timestamp);

                // Reply on shake and introduce yourself if the shake has a thread
                if (shake._thread) {
                    this._logger.debug(`Sending handshake reply to '${shake.uid}' on topic '${shake._thread}'`);
                    await this.handshake(false, shake._thread);
                }
                break;
            default:
                this._logger.debug("Unknown discovery packet:", discoveryType);
        }
    }

    getHandshakePacket(): Handshake {
        const shakePacket = this._handshakeFactory();
        delete shakePacket._thread;

        return shakePacket;
    }

    getUid(): string {
        return this.getHandshakePacket().uid;
    }

    ping(): Promise<void> {
        return new Promise((resolve, reject) => {
            this._mqtt.publish("discovery/alive", this.getUid(), (err) => {
                if (err) {
                    return reject(new Error(`Error while sending keep-alive ping: ${err.message}`));
                }

                this._logger.debug(`Ping sucessfully sent (${this.getUid()})`);
                return resolve();
            });
        });
    }

    dead(): Promise<void> {
        return new Promise((resolve, reject) => {
            this._mqtt.publish("discovery/death", this.getUid(), (err) => {
                if (err) {
                    return reject(new Error(`Error while sending death: ${err.message}`));
                }

                this._logger.debug(`Death sucessfully sent (${this.getUid()})`);
                return resolve();
            });
        });
    }

    handshake(expectsReply = true, topic?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const shake = this.getHandshakePacket();

            if (expectsReply) {
                shake._thread = `discovery/handshake/${shake.uid}`;
            }

            this._mqtt.publish(topic || "discovery/handshake", JSON.stringify(shake), (err) => {
                if (err) {
                    return reject(new Error(`Error while sending handshake: ${err.message}`));
                }

                this._logger.debug(`Handshake sucessfully sent (${this.getUid()})`);
                this.emit("handshakeSent", shake, new Date());
                return resolve();
            });
        });
    }
}

export default Discovery;
