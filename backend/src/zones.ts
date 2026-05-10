import { v4 as uuidv4 } from "uuid";
import { Router } from "express";

export interface Zone {
    id: string;
    name: string;
    polygon: [number, number][];
    createdAt: number;
}

let zones: Zone[] = [];

export function getZones() {
    return zones;
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
    return zone;
}

export function removeZone(id: string) {
    zones = zones.filter((z) => z.id !== id);
    notifyZoneChanged();
}

function notifyZoneChanged() {
    // Lazy require to avoid circular dep
    try {
        const { onZoneChanged } = require("./simulator");
        onZoneChanged();
    } catch { }
}

export const zonesRouter = Router();

zonesRouter.get("/zones", (req, res) => {
    res.json({ zones });
});

zonesRouter.post("/zones", (req, res) => {
    const zone = addZone(req.body);
    res.json(zone);
});

zonesRouter.delete("/zones/:id", (req, res) => {
    removeZone(req.params.id);
    res.json({ ok: true });
});