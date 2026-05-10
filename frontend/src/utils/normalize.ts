// src/utils/normalize.ts
// Converts backend ShipState format → frontend Ship format

const MAX_FUEL = 10000;

const STATUS_MAP: Record<string, string> = {
    normal: 'NOMINAL',
    nominal: 'NOMINAL',
    alert: 'ALERT',
    critical: 'CRITICAL',
    distress: 'DISTRESS',
    anchored: 'ANCHORED',
    rerouting: 'REROUTING',
    arrived: 'ANCHORED',
    stopped: 'STOPPED',
    stranded: 'STRANDED',
};

export function normalizeShip(raw: any) {
    const lat = raw.lat ?? raw.latitude ?? (Array.isArray(raw.position) ? raw.position[0] : undefined);
    const lng = raw.lng ?? raw.longitude ?? (Array.isArray(raw.position) ? raw.position[1] : undefined);

    const rawFuel = raw.fuel ?? 0;
    const fuel = rawFuel > 100 ? Math.min(100, (rawFuel / MAX_FUEL) * 100) : rawFuel;

    const rawStatus = (raw.status ?? 'normal').toLowerCase();
    const status = STATUS_MAP[rawStatus] ?? 'NOMINAL';

    return {
        ...raw,
        lat,
        lng,
        fuel,
        status,
        // Pass-through fields used by the map and panels
        pathTotal: raw.pathTotal,
        pendingDirective: raw.pendingDirective,
        insufficientFuel: raw.insufficientFuel,
    };
}

export function normalizeFleet(ships: any[]) {
    return ships.map(normalizeShip);
}