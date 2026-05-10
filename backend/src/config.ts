// backend/src/config.ts
// Loads fleet.json at startup. Single source of truth for bbox, navigable
// water polygon, land masses, ports, and starting ships.
//
// Resolution order:
//   1) FLEET_CONFIG env var
//   2) ./fleet.json (cwd)
//   3) ../fleet.json (when running from compiled dist/)
//   4) ../../fleet.json (when running from src/ via ts-node)

import fs from "fs";
import path from "path";

export interface PortDef { name: string; position: [number, number]; }
export interface LandMass { name: string; polygon: [number, number][]; }
export interface ShipSeed {
    shipId: string;
    name: string;
    captain: string;
    position: [number, number];
    speed: number;
    heading: number;
    destination: string;
    fuel: number;
    cargo: string;
    status: string;
}
export interface FleetConfig {
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
    navigableWater: [number, number][];
    landMasses: LandMass[];
    ports: Record<string, PortDef>;
    ships: ShipSeed[];
}

let loaded: FleetConfig | null = null;

function tryLoad(p: string): FleetConfig | null {
    try {
        if (!fs.existsSync(p)) return null;
        const raw = fs.readFileSync(p, "utf-8");
        return JSON.parse(raw) as FleetConfig;
    } catch (err) {
        console.error(`[config] failed to read ${p}:`, err);
        return null;
    }
}

export function loadConfig(): FleetConfig {
    if (loaded) return loaded;

    const candidates: string[] = [];
    if (process.env.FLEET_CONFIG) candidates.push(process.env.FLEET_CONFIG);
    candidates.push(
        path.resolve(process.cwd(), "fleet.json"),
        path.resolve(process.cwd(), "..", "fleet.json"),
        path.resolve(__dirname, "..", "..", "fleet.json"),
        path.resolve(__dirname, "..", "..", "..", "fleet.json"),
    );

    for (const c of candidates) {
        const cfg = tryLoad(c);
        if (cfg) {
            console.log(`[config] loaded fleet config from ${c}`);
            loaded = cfg;
            return cfg;
        }
    }

    throw new Error(
        `[config] could not locate fleet.json. Tried: ${candidates.join(", ")}. ` +
        `Set FLEET_CONFIG env var to override.`
    );
}

export function getConfig(): FleetConfig {
    if (!loaded) return loadConfig();
    return loaded;
}