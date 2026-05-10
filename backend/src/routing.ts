// backend/src/routing.ts
// A* pathfinding on a coarse grid over the operational area.
// Avoids land (Qatar peninsula, Bahrain, southern Iran/Oman coast strip) and restricted zones.

// Operational area bounding box: Persian Gulf + Gulf of Oman
const BBOX = { minLat: 23.5, maxLat: 30.0, minLng: 47.5, maxLng: 60.0 };

// Big permissive water polygon — everything inside the BBOX is navigable
// EXCEPT for the land masses below. This keeps ships out of trouble without
// over-constraining their starting positions.
export const NAVIGABLE_WATER: [number, number][] = [
    [BBOX.minLat, BBOX.minLng],
    [BBOX.minLat, BBOX.maxLng],
    [BBOX.maxLat, BBOX.maxLng],
    [BBOX.maxLat, BBOX.minLng],
    [BBOX.minLat, BBOX.minLng],
];

// Land masses to avoid (rough polygons)
const LAND_MASSES: [number, number][][] = [
    // Qatar peninsula (rough rectangle)
    [[24.55, 51.10], [25.95, 50.95], [26.10, 51.50], [25.50, 51.65], [24.85, 51.55], [24.55, 51.10]],
    // Bahrain
    [[25.95, 50.42], [26.32, 50.42], [26.32, 50.68], [25.95, 50.68]],
    // Northern Iranian coast inland (rough strip — anything north of Bandar Abbas line)
    [[27.20, 53.50], [29.00, 53.50], [29.00, 56.50], [27.20, 56.50]],
    // Southern Oman/UAE inland (south of operational area)
    [[23.50, 53.00], [24.40, 53.00], [24.40, 58.00], [23.50, 58.00]],
];

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
    if (point[0] < BBOX.minLat || point[0] > BBOX.maxLat) return false;
    if (point[1] < BBOX.minLng || point[1] > BBOX.maxLng) return false;
    for (const land of LAND_MASSES) {
        if (pointInPolygon(point, land)) return false;
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

/**
 * Compute path from start → end avoiding zones and land.
 * Returns waypoints [start, ...intermediate, end].
 * Falls back to direct [start, end] if A* fails — never returns null,
 * so ships never get stuck unable to move.
 */
export function findPath(
    start: [number, number],
    end: [number, number],
    zones: { polygon: [number, number][] }[]
): [number, number][] {
    // If straight line is clear (no zones, no land), skip A*
    if (isLineClear(start, end, zones)) {
        return [start, end];
    }

    const startSnap = snap(start);
    const endSnap = snap(end);

    const open: Node[] = [];
    const closed = new Set<string>();
    const startNode: Node = { pos: startSnap, g: 0, f: haversine(startSnap, endSnap), parent: null };
    open.push(startNode);

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
            while (n) {
                path.unshift(n.pos);
                n = n.parent;
            }
            path[0] = start;
            return simplify(path, zones);
        }

        for (const nb of neighbors(current.pos)) {
            const nk = key(nb);
            if (closed.has(nk)) continue;
            if (!isNavigable(nb)) continue;
            if (!isClearOfZones(nb, zones)) continue;

            const g = current.g + haversine(current.pos, nb);
            const h = haversine(nb, endSnap);
            const existing = open.find(o => key(o.pos) === nk);
            if (existing && existing.g <= g) continue;
            open.push({ pos: nb, g, f: g + h, parent: current });
        }
    }

    // FALLBACK: A* failed — return direct line so ship still moves
    return [start, end];
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