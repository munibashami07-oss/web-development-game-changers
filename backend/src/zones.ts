import { v4 as uuidv4 } from "uuid";

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
    return zone;
}

export function removeZone(id: string) {
    zones = zones.filter((z) => z.id !== id);
}

import { Router } from "express";
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