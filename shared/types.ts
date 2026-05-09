export type ShipStatus =
    | "normal"
    | "rerouting"
    | "distressed"
    | "stopped"
    | "arrived"
    | "stranded"
    | "insufficient_fuel";

export interface ShipState {
    shipId: string;
    name: string;
    position: [number, number];
    speed: number;
    heading: number;
    destination: string;
    fuel: number;
    cargo: string;
    status: ShipStatus;
    path: [number, number][];
    weatherPenalty: boolean;
}

export interface Zone {
    id: string;
    name: string;
    polygon: [number, number][];
    createdAt: number;
}

export interface Alert {
    id: string;
    type: string;
    shipId?: string;
    zoneId?: string;
    message: string;
    severity: "low" | "medium" | "high" | "critical";
    acknowledged: boolean;
    timestamp: number;
}

export interface Directive {
    id: string;
    fromCommand: boolean;
    shipId: string;
    action: "reroute" | "divert" | "hold" | "release";
    payload?: any;
    timestamp: number;
}

export type WSMessage =
    | { type: "FLEET_UPDATE"; ships: ShipState[]; timestamp: number }
    | { type: "ALERT"; alert: Alert }
    | { type: "DIRECTIVE"; directive: Directive }
    | {
        type: "CAPTAIN_RESPONSE";
        shipId: string;
        response: "ACCEPT" | "ESCALATE_DISTRESS";
        message?: string;
    }
    | { type: "DRAW_ZONE"; zone: Omit<Zone, "id" | "createdAt"> }
    | { type: "ACK_ALERT"; alertId: string }
    | { type: "DISTRESS_MESSAGE"; shipId: string; message: string }
    | { type: "AUTH"; role: "command" | "captain"; shipId?: string };