// backend/src/routing.ts
// A* pathfinding. Bbox / navigable polygon / land masses now loaded from
// fleet.json via config.ts, so swapping fleet.json swaps the operational
// area without code changes. Also exports findMultiplePaths for the
// bonus "multiple route options on reroute" feature.

import { getConfig } from "./config";

export function pointInPolygon(point: [number, number], poly: [number, number][]): boolean {
    let inside = false;
    const [px, py] = point;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

export function isNavigable(point: [number, number]): boolean {
    const cfg = getConfig();
    const bb = cfg.bbox;
    if (point[0] < bb.minLat || point[0] > bb.maxLat) return false;
    if (point[1] < bb.minLng || point[1] > bb.maxLng) return false;
    if (cfg.navigableWater && cfg.navigableWater.length >= 4) {
        if (!pointInPolygon(point, cfg.navigableWater)) return false;
    }
    for (const land of cfg.landMasses) {
        if (pointInPolygon(point, land.polygon)) return false;
    }
    return true;
}

export function isClearOfZones(point: [number, number], zones: { polygon: [number, number][] }[]): boolean {
    for (const zone of zones) {
        if (pointInPolygon(point, zone.polygon)) return false;
    }
    return true;
}

function haversine(a: [number, number], b: [number, number]): number {
    const R = 3440.065;
    const φ1 = (a[0] * Math.PI) / 180;
    const φ2 = (b[0] * Math.PI) / 180;
    const Δφ = ((b[0] - a[0]) * Math.PI) / 180;
    const Δλ = ((b[1] - a[1]) * Math.PI) / 180;
    const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

const GRID = 0.15;
function snap(p: [number, number]): [number, number] {
    return [Math.round(p[0] / GRID) * GRID, Math.round(p[1] / GRID) * GRID];
}
function key(p: [number, number]): string {
    return `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
}
function neighbors(p: [number, number]): [number, number][] {
    const out: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            out.push([p[0] + dy * GRID, p[1] + dx * GRID]);
        }
    }
    return out;
}

interface Node {
    pos: [number, number];
    g: number;
    f: number;
    parent: Node | null;
}

export function findPath(
    start: [number, number],
    end: [number, number],
    zones: { polygon: [number, number][] }[],
    weatherPenalty?: (p: [number, number]) => number,
): [number, number][] {
    if (isLineClear(start, end, zones)) return [start, end];

    const startSnap = snap(start);
    const endSnap = snap(end);

    const open: Node[] = [];
    const closed = new Set<string>();
    open.push({ pos: startSnap, g: 0, f: haversine(startSnap, endSnap), parent: null });

    let iterations = 0;
    const MAX_ITER = 3000;

    while (open.length > 0 && iterations++ < MAX_ITER) {
        open.sort((a, b) => a.f - b.f);
        const current = open.shift()!;
        const ck = key(current.pos);
        if (closed.has(ck)) continue;
        closed.add(ck);

        if (haversine(current.pos, endSnap) < GRID * 1.5) {
            const path: [number, number][] = [end];
            let n: Node | null = current;
            while (n) { path.unshift(n.pos); n = n.parent; }
            path[0] = start;
            return simplify(path, zones);
        }

        for (const nb of neighbors(current.pos)) {
            const nk = key(nb);
            if (closed.has(nk)) continue;
            if (!isNavigable(nb)) continue;
            if (!isClearOfZones(nb, zones)) continue;

            let stepCost = haversine(current.pos, nb);
            if (weatherPenalty) stepCost += weatherPenalty(nb);
            const g = current.g + stepCost;
            const h = haversine(nb, endSnap);
            const existing = open.find(o => key(o.pos) === nk);
            if (existing && existing.g <= g) continue;
            open.push({ pos: nb, g, f: g + h, parent: current });
        }
    }

    return [start, end];
}

export interface RouteCandidate {
    label: "direct" | "weather_safe" | "fuel_efficient";
    description: string;
    path: [number, number][];
    distanceNM: number;
    weatherExposureNM: number;
}

export function findMultiplePaths(
    start: [number, number],
    end: [number, number],
    zones: { polygon: [number, number][] }[],
    weatherZones: { polygon: [number, number][] }[],
): RouteCandidate[] {
    const inWeather = (p: [number, number]) =>
        weatherZones.some(z => pointInPolygon(p, z.polygon));

    const exposureOf = (path: [number, number][]) => {
        let nm = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const seg = haversine(path[i], path[i + 1]);
            const mid: [number, number] = [(path[i][0] + path[i + 1][0]) / 2, (path[i][1] + path[i + 1][1]) / 2];
            if (inWeather(mid)) nm += seg;
        }
        return nm;
    };

    const direct = findPath(start, end, zones);
    const weatherSafe = findPath(start, end, zones, p => (inWeather(p) ? 100 : 0));
    const fuelEfficient = findPath(start, end, zones, p => (inWeather(p) ? 30 : 0));

    const candidates: RouteCandidate[] = [];
    candidates.push({
        label: "direct",
        description: "Shortest path. Faster but may pass through bad weather.",
        path: direct,
        distanceNM: pathDistance(direct),
        weatherExposureNM: exposureOf(direct),
    });
    const distSafe = pathDistance(weatherSafe);
    if (distSafe > 0 && JSON.stringify(weatherSafe) !== JSON.stringify(direct)) {
        candidates.push({
            label: "weather_safe",
            description: "Avoids adverse weather. Longer but safer.",
            path: weatherSafe,
            distanceNM: distSafe,
            weatherExposureNM: exposureOf(weatherSafe),
        });
    }
    const distFuel = pathDistance(fuelEfficient);
    if (distFuel > 0 &&
        JSON.stringify(fuelEfficient) !== JSON.stringify(direct) &&
        JSON.stringify(fuelEfficient) !== JSON.stringify(weatherSafe)) {
        candidates.push({
            label: "fuel_efficient",
            description: "Balances distance and weather. Most fuel-efficient.",
            path: fuelEfficient,
            distanceNM: distFuel,
            weatherExposureNM: exposureOf(fuelEfficient),
        });
    }
    return candidates;
}

function isLineClear(a: [number, number], b: [number, number], zones: { polygon: [number, number][] }[]): boolean {
    const SAMPLES = 25;
    for (let i = 1; i < SAMPLES; i++) {
        const t = i / SAMPLES;
        const p: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (!isNavigable(p)) return false;
        if (!isClearOfZones(p, zones)) return false;
    }
    return true;
}

function simplify(path: [number, number][], zones: { polygon: [number, number][] }[]): [number, number][] {
    if (path.length <= 2) return path;
    const out: [number, number][] = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
        let j = path.length - 1;
        while (j > i + 1 && !isLineClear(path[i], path[j], zones)) j--;
        out.push(path[j]);
        i = j;
    }
    return out;
}

export function pathDistance(path: [number, number][]): number {
    let d = 0;
    for (let i = 0; i < path.length - 1; i++) d += haversine(path[i], path[i + 1]);
    return d;
}

export function bearingTo(a: [number, number], b: [number, number]): number {
    const φ1 = (a[0] * Math.PI) / 180;
    const φ2 = (b[0] * Math.PI) / 180;
    const Δλ = ((b[1] - a[1]) * Math.PI) / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}