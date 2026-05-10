import { v4 as uuidv4 } from "uuid";
import { Router } from "express";

export interface Zone {
    id: string;
    name: string;
    polygon: [number, number][];
    createdAt: number;
}

let zones: Zone[] = [];

export function getZones() { return zones; }

function broadcastSafely(msg: any) {
    try {
        const { broadcast } = require("./websocket");
        broadcast(msg);
    } catch { }
}

export function addZone(data: { name?: string; polygon: [number, number][] }): Zone {
    const zone: Zone = {
        id: uuidv4(),
        name: data.name || `Zone-${zones.length + 1}`,
        polygon: data.polygon,
        createdAt: Date.now(),
    };
    zones.push(zone);
    notifyZoneChanged();
    broadcastSafely({ type: "ZONE_ADDED", zone });
    return zone;
}

export function removeZone(id: string) {
    zones = zones.filter((z) => z.id !== id);
    notifyZoneChanged();
    broadcastSafely({ type: "ZONE_REMOVED", id });
}

function notifyZoneChanged() {
    try {
        const { onZoneChanged } = require("./simulator");
        onZoneChanged();
    } catch { }
}

export const zonesRouter = Router();
zonesRouter.get("/zones", (req, res) => res.json({ zones }));
zonesRouter.post("/zones", (req, res) => res.json(addZone(req.body)));
zonesRouter.delete("/zones/:id", (req, res) => { removeZone(req.params.id); res.json({ ok: true }); });