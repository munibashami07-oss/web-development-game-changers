// backend/src/alerts.ts
// Alerts now broadcast over WebSocket the moment they're created.
// This is the fix for the spec requirement that geofence breach alerts
// fire within 1 second.

import { v4 as uuidv4 } from "uuid";

export interface Alert {
    id: string;
    type: string;
    shipId?: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    acknowledged: boolean;
    timestamp: number;
    metadata?: any;
    priority?: number;
}

let alerts: Alert[] = [];

const SEVERITY_BASE: Record<string, number> = {
    critical: 1000,
    high: 500,
    medium: 100,
    low: 10,
};

function computePriority(a: Alert): number {
    let p = SEVERITY_BASE[a.severity] || 0;
    const md = a.metadata || {};
    if (typeof md.injuryCount === "number" && md.injuryCount > 0) {
        p += md.injuryCount * 50;
    }
    if (md.requiresAssistance === true) p += 75;
    if (md.category === "medical" || md.category === "security") p += 100;
    if (a.type === "PREDICTIVE_ZONE" || a.type === "PREDICTIVE_FUEL") p += 25;
    return p;
}

export function addAlert(data: Partial<Alert>): Alert {
    const alert: Alert = {
        id: uuidv4(),
        type: data.type || "INFO",
        shipId: data.shipId,
        severity: data.severity || "low",
        message: data.message || "",
        acknowledged: false,
        timestamp: Date.now(),
        metadata: data.metadata,
        priority: 0,
    };
    alert.priority = computePriority(alert);
    alerts.push(alert);
    if (alerts.length > 200) alerts = alerts.slice(-200);

    try {
        const { broadcast } = require("./websocket");
        broadcast({ type: "ALERT", alert });
    } catch { }

    return alert;
}

export function acknowledgeAlert(id: string) {
    const alert = alerts.find((a) => a.id === id);
    if (alert) {
        alert.acknowledged = true;
        try {
            const { broadcast } = require("./websocket");
            broadcast({ type: "ALERT_ACK", alertId: id });
        } catch { }
    }
}

export function getAlerts() {
    return [...alerts].sort((a, b) => (b.priority || 0) - (a.priority || 0) || b.timestamp - a.timestamp);
}