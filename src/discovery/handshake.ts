type PlatformType = "rest" | "ws-events" | "zwave" | "modbus" | "zigbee" | "ip" | "modbus-tcp";

type Handshake = {
    uid: string;
    alias?: string;
    type: string;
    name: string;
    product: string;
    vendor: string;
    model?: string;
    revision?: string;
    serialNo?: string;
    firmware?: string;
    firmwareVersion?: string;
    available: boolean;
    keepalive: boolean;
    keepaliveTimeout: number;
    description?: string;
    comm?: CommChannel[];
    state?: Record<string, unknown>;
    via?: string;
    platform?: PlatformType;
    features?: string[];
    tags?: string[];
    location?: string;
    additional?: unknown;
    _thread?: string;
    _version: "1.0";
};

export type CommChannel = {
    topic: string;
    type: "state" | "set" | "availability" | "fetch";
    payload?: unknown;
};

export type DeviceType = {
    mimeType: string;
    kind: string;
    type: string;
    class: string;
};

export function decodeDeviceType(type: string): DeviceType {
    const mainSplit = type.split(",");
    const mimeSplit = mainSplit[0]?.split("/") || "";

    return {
        mimeType: mainSplit[0]?.trim() || "",
        kind: mimeSplit[0]?.trim() || "",
        type: mimeSplit[1]?.trim() || "",
        class: mainSplit[1].trim(),
    };
}

export default Handshake;
