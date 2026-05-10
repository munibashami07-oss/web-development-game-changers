import { getZones } from "./zones";
import { addAlert } from "./alerts";
import { saveSnapshot } from "./history";
import { findPath, pathDistance, bearingTo, isClearOfZones, pointInPolygon } from "./routing";

export interface ShipState {
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
    path: [number, number][];          // remaining waypoints to destination
    pathTotal: [number, number][];     // full planned route (for display)
    weatherPenalty: boolean;
    insufficientFuel: boolean;
    pendingDirective?: { type: string; message: string; from?: string; issuedAt: number };
}

const PORTS: Record<string, [number, number]> = {
    "KWT-1": [29.48, 48.34],
    "BUS-1": [28.83, 50.73],
    "DMM-1": [26.56, 50.30],
    "BAH-1": [26.50, 50.55],
    "DOH-1": [25.46, 51.95],
    "AUH-1": [25.22, 54.18],
    "DXB-1": [25.50, 54.75],
    "BND-1": [26.62, 56.11],
    "SOH-1": [24.72, 57.02],
    "MCT-1": [23.92, 58.58],
};

const DEST_KEYS = Object.keys(PORTS);

let fleet: ShipState[] = [
    { shipId: "MV-1", name: "Aurora", captain: "Capt. Erik Solberg", position: [26.55, 56.20], speed: 14, heading: 105, destination: "MCT-1", fuel: 6800, cargo: "crude oil", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-2", name: "Borealis", captain: "Capt. Anya Petrova", position: [25.50, 57.20], speed: 19, heading: 270, destination: "DXB-1", fuel: 5400, cargo: "containers", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-3", name: "Cygnus", captain: "Capt. Hiroshi Tanaka", position: [25.70, 53.00], speed: 16, heading: 95, destination: "MCT-1", fuel: 7200, cargo: "LNG", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-4", name: "Dragon", captain: "Capt. Liam O'Connell", position: [26.40, 56.00], speed: 13, heading: 110, destination: "SOH-1", fuel: 5800, cargo: "bulk grain", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-5", name: "Emerald", captain: "Capt. Fatima Al-Hassan", position: [27.50, 51.20], speed: 12, heading: 165, destination: "DOH-1", fuel: 8200, cargo: "crude oil", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-6", name: "Falcon", captain: "Capt. Marcus Reyes", position: [25.40, 54.53], speed: 22, heading: 280, destination: "DOH-1", fuel: 4100, cargo: "containers", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-7", name: "Gharial", captain: "Capt. Imran Qureshi", position: [26.50, 53.50], speed: 14, heading: 270, destination: "KWT-1", fuel: 750, cargo: "crude oil", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-8", name: "Halcyon", captain: "Capt. Sofia Romano", position: [24.93, 56.94], speed: 19, heading: 250, destination: "DMM-1", fuel: 5200, cargo: "automobiles", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-9", name: "Iris", captain: "Capt. Nikolai Vasiliev", position: [28.20, 50.30], speed: 13, heading: 175, destination: "BAH-1", fuel: 7800, cargo: "crude oil", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-10", name: "Jade", captain: "Capt. Wei Chen", position: [25.02, 57.96], speed: 20, heading: 285, destination: "BND-1", fuel: 6300, cargo: "containers", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-11", name: "Kite", captain: "Capt. Olivia Bennett", position: [25.64, 52.18], speed: 18, heading: 95, destination: "MCT-1", fuel: 7600, cargo: "LNG", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-12", name: "Lotus", captain: "Capt. Rajesh Iyer", position: [29.10, 48.80], speed: 12, heading: 145, destination: "SOH-1", fuel: 8500, cargo: "crude oil", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-13", name: "Mirage", captain: "Capt. Yusuf Bakir", position: [24.60, 57.30], speed: 21, heading: 320, destination: "BAH-1", fuel: 5900, cargo: "containers", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-14", name: "Nova", captain: "Capt. Elena Marchetti", position: [24.12, 58.43], speed: 11, heading: 290, destination: "DOH-1", fuel: 4600, cargo: "bulk cement", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
    { shipId: "MV-15", name: "Orca", captain: "Capt. James Whitaker", position: [26.34, 55.91], speed: 13, heading: 215, destination: "MCT-1", fuel: 7100, cargo: "crude oil", status: "normal", path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false },
];

let weatherZones: any[] = [];
const firedAlerts = new Set<string>();
let tickCount = 0;
const proximityCooldown = new Map<string, number>(); // key "shipA|shipB" → tickCount when last fired

function toRadians(deg: number) { return (deg * Math.PI) / 180; }
function toDegrees(rad: number) { return (rad * 180) / Math.PI; }

function haversineNM(a: [number, number], b: [number, number]) {
    const R = 3440.065;
    const φ1 = toRadians(a[0]);
    const φ2 = toRadians(b[0]);
    const Δφ = toRadians(b[0] - a[0]);
    const Δλ = toRadians(b[1] - a[1]);
    const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

function haversineKM(a: [number, number], b: [number, number]) {
    return haversineNM(a, b) * 1.852;
}

// Plan a path for a ship; updates ship.path and ship.pathTotal
function replanShip(ship: ShipState): boolean {
    const dest = PORTS[ship.destination];
    if (!dest) return false;
    const path = findPath(ship.position, dest, getZones());
    if (!path || path.length < 2) {
        ship.status = "stranded";
        ship.path = [];
        ship.pathTotal = [];
        return false;
    }
    ship.path = path.slice(1); // first point is current position
    ship.pathTotal = path;
    if (ship.status === "stranded") ship.status = "normal"; // recovered
    // Check fuel sufficiency
    const dist = pathDistance(path);
    const burnRate = ship.speed * 0.8;
    const timeHr = dist / ship.speed;
    const fuelNeeded = burnRate * timeHr * (ship.weatherPenalty ? 1.3 : 1);
    ship.insufficientFuel = fuelNeeded > ship.fuel;
    return true;
}

function moveShip(ship: ShipState, seconds: number) {
    if (ship.status === "arrived" || ship.status === "stopped" || ship.status === "stranded") return;
    if (ship.path.length === 0) {
        if (!replanShip(ship)) return;
    }
    let target = ship.path[0];
    if (!target) return;

    const distNM = haversineNM(ship.position, target);
    const stepNM = (ship.speed * seconds) / 3600;

    // Update heading
    ship.heading = bearingTo(ship.position, target);

    if (stepNM >= distNM) {
        // Reached this waypoint
        ship.position = target;
        ship.path.shift();
        if (ship.path.length === 0) {
            // Arrived at destination
            ship.status = "arrived";
            // Auto-redispatch with new destination + refuel
            const others = DEST_KEYS.filter(k => k !== ship.destination);
            ship.destination = others[Math.floor(Math.random() * others.length)];
            ship.fuel = 6000 + Math.random() * 3000;
            ship.insufficientFuel = false;
            ship.status = "normal";
            replanShip(ship);
            return;
        }
    } else {
        // Move along bearing
        const fraction = stepNM / distNM;
        ship.position = [
            ship.position[0] + (target[0] - ship.position[0]) * fraction,
            ship.position[1] + (target[1] - ship.position[1]) * fraction,
        ];
    }

    // Burn fuel
    const fuelBurn = ship.speed * 0.8 * seconds / 3600;
    ship.fuel -= fuelBurn * (ship.weatherPenalty ? 1.3 : 1);
    if (ship.fuel <= 0) {
        ship.fuel = 0;
        ship.status = "stopped";
        const key = `out-of-fuel-${ship.shipId}`;
        if (!firedAlerts.has(key)) {
            firedAlerts.add(key);
            addAlert({ type: "OUT_OF_FUEL", shipId: ship.shipId, severity: "critical", message: `${ship.name} has run out of fuel and is adrift.` });
        }
    }
}

function checkWeather(ship: ShipState) {
    ship.weatherPenalty = false;
    for (const zone of weatherZones) {
        if (pointInPolygon(ship.position, zone.polygon)) {
            ship.weatherPenalty = true;
            break;
        }
    }
}

// Detect zone-path intersections; trigger reroute
function checkZoneIntersection(ship: ShipState) {
    if (ship.status === "arrived" || ship.status === "stopped" || ship.status === "stranded") return;
    const zones = getZones();
    if (zones.length === 0) return;
    if (ship.pathTotal.length < 2) return;

    // Sample path waypoints — if any waypoint or current pos is inside a zone, replan
    let needsReplan = false;
    if (!isClearOfZones(ship.position, zones)) {
        // Already inside a zone — geofence breach + reroute
        for (const zone of zones) {
            if (pointInPolygon(ship.position, zone.polygon)) {
                const k = `zone-${ship.shipId}-${zone.id}`;
                if (!firedAlerts.has(k)) {
                    firedAlerts.add(k);
                    addAlert({ type: "GEOFENCE_BREACH", shipId: ship.shipId, severity: "critical", message: `${ship.name} has entered restricted zone ${zone.name}` });
                }
            }
        }
        needsReplan = true;
    } else {
        // Sample upcoming path
        for (const wp of ship.path) {
            if (!isClearOfZones(wp, zones)) { needsReplan = true; break; }
        }
        // Also sample line segments between waypoints
        if (!needsReplan) {
            for (let i = 0; i < ship.path.length; i++) {
                const a = i === 0 ? ship.position : ship.path[i - 1];
                const b = ship.path[i];
                for (let t = 0.1; t < 1; t += 0.2) {
                    const sample: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
                    if (!isClearOfZones(sample, zones)) { needsReplan = true; break; }
                }
                if (needsReplan) break;
            }
        }
    }

    if (needsReplan && ship.status !== "rerouting") {
        ship.status = "rerouting";
        const replanned = replanShip(ship);
        if (replanned) {
            addAlert({ type: "REROUTE", shipId: ship.shipId, severity: "medium", message: `${ship.name} rerouting to avoid restricted zone.` });
            setTimeout(() => { if (ship.status === "rerouting") ship.status = "normal"; }, 8000);
        }
    }
}

// Proximity warnings — pairs within 2km
function checkProximity() {
    const PROX_KM = 2;
    const COOLDOWN = 60;
    for (let i = 0; i < fleet.length; i++) {
        for (let j = i + 1; j < fleet.length; j++) {
            const a = fleet[i], b = fleet[j];
            if (a.status === "stopped" || b.status === "stopped") continue;
            const dKm = haversineKM(a.position, b.position);
            if (dKm <= PROX_KM) {
                const key = `${a.shipId}|${b.shipId}`;
                const last = proximityCooldown.get(key) || -COOLDOWN;
                if (tickCount - last >= COOLDOWN) {
                    proximityCooldown.set(key, tickCount);
                    addAlert({
                        type: "PROXIMITY",
                        shipId: a.shipId,
                        severity: "high",
                        message: `${a.name} and ${b.name} within ${dKm.toFixed(2)}km — collision risk.`,
                        metadata: { otherShip: b.shipId, distanceKm: dKm },
                    });
                }
            }
        }
    }
}

function checkFuelAlerts(ship: ShipState) {
    const pct = (ship.fuel / 10000) * 100;
    const critKey = `fuel-critical-${ship.shipId}`;
    const warnKey = `fuel-warn-${ship.shipId}`;
    if (pct <= 10 && !firedAlerts.has(critKey)) {
        firedAlerts.add(critKey);
        addAlert({ type: "FUEL_CRITICAL", shipId: ship.shipId, severity: "critical", message: `${ship.name} fuel critically low — ${pct.toFixed(1)}% remaining.` });
    } else if (pct <= 25 && !firedAlerts.has(warnKey)) {
        firedAlerts.add(warnKey);
        addAlert({ type: "FUEL_WARNING", shipId: ship.shipId, severity: "high", message: `${ship.name} fuel below 25% — ${pct.toFixed(1)}% remaining.` });
    }
    if (pct > 30) firedAlerts.delete(warnKey);
    if (pct > 15) firedAlerts.delete(critKey);
}

// Random scenario events
const SCENARIO_EVENTS = [
    (ship: ShipState) => { addAlert({ type: "AIS_ANOMALY", shipId: ship.shipId, severity: "high", message: `${ship.name} AIS signal intermittent — possible transponder spoofing.` }); },
    (ship: ShipState) => { addAlert({ type: "HOSTILE_CONTACT", shipId: ship.shipId, severity: "critical", message: `${ship.name} reports unidentified vessel on intercept course — bearing 045.` }); },
    (ship: ShipState) => { addAlert({ type: "WEATHER_WARNING", shipId: ship.shipId, severity: "medium", message: `${ship.name} entering heavy weather corridor — Beaufort 7.` }); ship.weatherPenalty = true; },
    (ship: ShipState) => { addAlert({ type: "CARGO_ALERT", shipId: ship.shipId, severity: "medium", message: `${ship.name} cargo hold pressure anomaly — ${ship.cargo} at risk.` }); },
    (ship: ShipState) => { addAlert({ type: "COMMS_LOSS", shipId: ship.shipId, severity: "high", message: `${ship.name} primary communications offline.` }); },
];

let lastEventTick = 0;

function triggerRandomEvent() {
    if (tickCount - lastEventTick < 60 + Math.floor(Math.random() * 60)) return;
    lastEventTick = tickCount;
    const active = fleet.filter(s => s.status === "normal");
    if (active.length === 0) return;
    const ship = active[Math.floor(Math.random() * active.length)];
    SCENARIO_EVENTS[Math.floor(Math.random() * SCENARIO_EVENTS.length)](ship);
}

// Public API for directives from Command
export function applyDirective(shipId: string, type: string, payload: any = {}): boolean {
    const ship = fleet.find(s => s.shipId === shipId);
    if (!ship) return false;
    ship.pendingDirective = { type, message: payload.message || type, from: "Command", issuedAt: Date.now(), ...(payload.toPort && { toPort: payload.toPort }) } as any;
    return true;
}

// Captain accepts directive — apply it
export function captainAccept(shipId: string): boolean {
    const ship = fleet.find(s => s.shipId === shipId);
    if (!ship || !ship.pendingDirective) return false;
    const dir = ship.pendingDirective as any;
    if (dir.type === "REROUTE" || dir.type === "DIVERT") {
        ship.status = "rerouting";
        if (dir.type === "DIVERT" && dir.toPort) {
            ship.destination = dir.toPort;
        }
        replanShip(ship);
        addAlert({ type: "DIRECTIVE_ACCEPTED", shipId, severity: "low", message: `${ship.name} accepted directive: ${dir.type}` });
        setTimeout(() => { if (ship.status === "rerouting") ship.status = "normal"; }, 6000);
    } else if (dir.type === "HOLD") {
        ship.status = "anchored";
        ship.path = [];
        addAlert({ type: "DIRECTIVE_ACCEPTED", shipId, severity: "low", message: `${ship.name} holding position as ordered.` });
    } else if (dir.type === "EMERGENCY") {
        ship.status = "critical";
        addAlert({ type: "DIRECTIVE_ACCEPTED", shipId, severity: "critical", message: `${ship.name} executing emergency protocol.` });
    }
    ship.pendingDirective = undefined;
    return true;
}

export function captainEscalateDistress(shipId: string, message: string): boolean {
    const ship = fleet.find(s => s.shipId === shipId);
    if (!ship) return false;
    ship.status = "critical";
    addAlert({ type: "DISTRESS", shipId, severity: "critical", message: `MAYDAY from ${ship.name}: ${message}`, metadata: { captainEscalated: true, originalMessage: message } });
    ship.pendingDirective = undefined;
    return true;
}

export function getFleet() { return fleet; }
export function setWeatherZones(zones: any[]) { weatherZones = zones; }

// Triggered when a zone is added — replan all affected ships
export function onZoneChanged() {
    for (const ship of fleet) {
        if (ship.status === "arrived" || ship.status === "stopped" || ship.status === "stranded") continue;
        checkZoneIntersection(ship);
    }
}

let snapshotTimer = 0;

export function startSimulator() {
    console.log("Simulator started");
    // Initial path planning
    for (const ship of fleet) replanShip(ship);

    // Initial Gharial fuel alert after 5s
    setTimeout(() => {
        const ship = fleet[6];
        addAlert({ type: "FUEL_WARNING", shipId: ship.shipId, severity: "high", message: `${ship.name} fuel critically low — ${((ship.fuel / 10000) * 100).toFixed(1)}% remaining.` });
        firedAlerts.add(`fuel-warn-${ship.shipId}`);
    }, 5000);

    // 180 = each tick simulates 3 minutes of ship movement (very visible drift)
    const SIM_SPEED = 180;

    setInterval(() => {
        tickCount++;
        for (const ship of fleet) {
            moveShip(ship, SIM_SPEED);
            checkWeather(ship);
            checkZoneIntersection(ship);
            checkFuelAlerts(ship);
        }
        checkProximity();
        triggerRandomEvent();

        const { broadcast } = require("./websocket");
        broadcast({ type: "FLEET_UPDATE", ships: fleet, timestamp: Date.now() });

        snapshotTimer++;
        if (snapshotTimer >= 10) {
            saveSnapshot(fleet);
            snapshotTimer = 0;
        }
    }, 1000);
}