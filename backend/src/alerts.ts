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
}

let alerts: Alert[] = [];

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
    };
    alerts.push(alert);
    if (alerts.length > 200) alerts = alerts.slice(-200);
    return alert;
}

export function acknowledgeAlert(id: string) {
    const alert = alerts.find((a) => a.id === id);
    if (alert) alert.acknowledged = true;
}

export function getAlerts() {
    return alerts;
}