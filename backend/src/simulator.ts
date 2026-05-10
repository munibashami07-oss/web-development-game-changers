// backend/src/simulator.ts
// Tick-based fleet simulator. Loads fleet from JSON. Adds ship-to-ship
// assistance, predictive alerts, and AI-NLP-enriched distress via ai-service.

import axios from "axios";
import { getZones } from "./zones";
import { addAlert } from "./alerts";
import { saveSnapshot } from "./history";
import { findPath, findMultiplePaths, pathDistance, bearingTo, isClearOfZones, pointInPolygon, RouteCandidate } from "./routing";
import { getConfig, ShipSeed } from "./config";

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
    path: [number, number][];
    pathTotal: [number, number][];
    weatherPenalty: boolean;
    insufficientFuel: boolean;
    pendingDirective?: { type: string; message: string; from?: string; issuedAt: number; toPort?: string };
    pendingAssistRequest?: AssistRequest;
    routeOptions?: RouteCandidate[];
}

export interface AssistRequest {
    id: string;
    fromShipId: string;
    fromShipName: string;
    kind: "fuel" | "medical" | "escort" | "cargo";
    message: string;
    issuedAt: number;
}

const cfg = getConfig();
const PORTS: Record<string, [number, number]> = Object.fromEntries(
    Object.entries(cfg.ports).map(([k, v]) => [k, v.position])
);
const DEST_KEYS = Object.keys(PORTS);

function seedToShip(s: ShipSeed): ShipState {
    return {
        shipId: s.shipId, name: s.name, captain: s.captain, position: s.position,
        speed: s.speed, heading: s.heading, destination: s.destination,
        fuel: s.fuel, cargo: s.cargo, status: s.status,
        path: [], pathTotal: [], weatherPenalty: false, insufficientFuel: false,
    };
}

let fleet: ShipState[] = cfg.ships.map(seedToShip);

let weatherZones: any[] = [];
const firedAlerts = new Set<string>();
let tickCount = 0;
const proximityCooldown = new Map<string, number>();

function toRadians(deg: number) { return (deg * Math.PI) / 180; }

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
    ship.path = path.slice(1);
    ship.pathTotal = path;
    if (ship.status === "stranded") ship.status = "normal";
    const dist = pathDistance(path);
    const burnRate = ship.speed * 0.8;
    const timeHr = dist / ship.speed;
    const fuelNeeded = burnRate * timeHr * (ship.weatherPenalty ? 1.3 : 1);
    ship.insufficientFuel = fuelNeeded > ship.fuel;
    return true;
}

function moveShip(ship: ShipState, seconds: number) {
    if (ship.status === "arrived" || ship.status === "stopped" || ship.status === "stranded" || ship.status === "anchored") return;
    if (ship.path.length === 0) {
        if (!replanShip(ship)) return;
    }
    let target = ship.path[0];
    if (!target) return;

    const distNM = haversineNM(ship.position, target);
    const stepNM = (ship.speed * seconds) / 3600;
    ship.heading = bearingTo(ship.position, target);

    if (stepNM >= distNM) {
        ship.position = target;
        ship.path.shift();
        if (ship.path.length === 0) {
            ship.status = "arrived";
            const others = DEST_KEYS.filter(k => k !== ship.destination);
            ship.destination = others[Math.floor(Math.random() * others.length)];
            ship.fuel = 6000 + Math.random() * 3000;
            ship.insufficientFuel = false;
            ship.status = "normal";
            replanShip(ship);
            return;
        }
    } else {
        const fraction = stepNM / distNM;
        ship.position = [
            ship.position[0] + (target[0] - ship.position[0]) * fraction,
            ship.position[1] + (target[1] - ship.position[1]) * fraction,
        ];
    }

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

function checkZoneIntersection(ship: ShipState) {
    if (ship.status === "arrived" || ship.status === "stopped" || ship.status === "stranded") return;
    const zones = getZones();
    if (zones.length === 0) return;
    if (ship.pathTotal.length < 2) return;

    let needsReplan = false;
    if (!isClearOfZones(ship.position, zones)) {
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
        for (const wp of ship.path) {
            if (!isClearOfZones(wp, zones)) { needsReplan = true; break; }
        }
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

const predictiveCooldown = new Map<string, number>();
const PREDICTIVE_COOLDOWN_TICKS = 30;

function projectPosition(pos: [number, number], heading: number, speed: number, seconds: number): [number, number] {
    const distNM = (speed * seconds) / 3600;
    const R = 3440.065;
    const lat1 = toRadians(pos[0]);
    const lng1 = toRadians(pos[1]);
    const hd = toRadians(heading);
    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(distNM / R) + Math.cos(lat1) * Math.sin(distNM / R) * Math.cos(hd)
    );
    const lng2 = lng1 + Math.atan2(
        Math.sin(hd) * Math.sin(distNM / R) * Math.cos(lat1),
        Math.cos(distNM / R) - Math.sin(lat1) * Math.sin(lat2),
    );
    return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}

function checkPredictive(ship: ShipState) {
    if (ship.status !== "normal" && ship.status !== "rerouting") return;
    const zones = getZones();

    const future = projectPosition(ship.position, ship.heading, ship.speed, 180);
    for (const zone of zones) {
        if (pointInPolygon(future, zone.polygon) && !pointInPolygon(ship.position, zone.polygon)) {
            const key = `pred-zone-${ship.shipId}-${zone.id}`;
            const last = predictiveCooldown.get(key) || -PREDICTIVE_COOLDOWN_TICKS;
            if (tickCount - last >= PREDICTIVE_COOLDOWN_TICKS) {
                predictiveCooldown.set(key, tickCount);
                addAlert({
                    type: "PREDICTIVE_ZONE",
                    shipId: ship.shipId,
                    severity: "high",
                    message: `${ship.name} will enter restricted zone ${zone.name} in ~3 minutes.`,
                    metadata: { zoneId: zone.id, projectedPosition: future },
                });
            }
        }
    }

    if (ship.insufficientFuel && ship.path.length > 0 && ship.fuel > 0) {
        const dest = PORTS[ship.destination];
        if (dest) {
            const remainingNM = pathDistance([ship.position, ...ship.path]);
            const burnRate = ship.speed * 0.8;
            const hoursOfFuel = ship.fuel / (burnRate * (ship.weatherPenalty ? 1.3 : 1));
            const rangeNM = ship.speed * hoursOfFuel;
            const shortfall = remainingNM - rangeNM;
            if (shortfall > 5) {
                const key = `pred-fuel-${ship.shipId}`;
                const last = predictiveCooldown.get(key) || -PREDICTIVE_COOLDOWN_TICKS;
                if (tickCount - last >= PREDICTIVE_COOLDOWN_TICKS) {
                    predictiveCooldown.set(key, tickCount);
                    addAlert({
                        type: "PREDICTIVE_FUEL",
                        shipId: ship.shipId,
                        severity: "high",
                        message: `${ship.name} will run out of fuel ~${(shortfall * 1.852).toFixed(0)}km short of ${ship.destination}.`,
                        metadata: { shortfallNM: shortfall, currentFuel: ship.fuel },
                    });
                }
            }
        }
    }
}

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

export function applyDirective(shipId: string, type: string, payload: any = {}): boolean {
    const ship = fleet.find(s => s.shipId === shipId);
    if (!ship) return false;
    ship.pendingDirective = {
        type,
        message: payload.message || type,
        from: "Command",
        issuedAt: Date.now(),
        ...(payload.toPort && { toPort: payload.toPort }),
    };
    return true;
}

export function captainAccept(shipId: string): boolean {
    const ship = fleet.find(s => s.shipId === shipId);
    if (!ship || !ship.pendingDirective) return false;
    const dir = ship.pendingDirective;
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

export async function captainEscalateDistress(shipId: string, message: string): Promise<boolean> {
    const ship = fleet.find(s => s.shipId === shipId);
    if (!ship) return false;
    ship.status = "critical";
    ship.pendingDirective = undefined;

    const aiUrl = process.env.AI_SERVICE_URL || "http://ai-service:3002";
    try {
        await axios.post(`${aiUrl}/ai/distress`, { shipId, message }, { timeout: 6000 });
        return true;
    } catch (err) {
        addAlert({
            type: "DISTRESS",
            shipId,
            severity: "critical",
            message: `MAYDAY from ${ship.name}: ${message}`,
            metadata: { captainEscalated: true, originalMessage: message, aiUnavailable: true },
        });
        return true;
    }
}

const assistRequests = new Map<string, AssistRequest>();

export function requestAssistance(
    fromShipId: string,
    toShipId: string,
    kind: AssistRequest["kind"],
    message: string,
): { ok: true; request: AssistRequest } | { ok: false; error: string } {
    const from = fleet.find(s => s.shipId === fromShipId);
    const to = fleet.find(s => s.shipId === toShipId);
    if (!from) return { ok: false, error: "from ship not found" };
    if (!to) return { ok: false, error: "to ship not found" };
    if (to.pendingAssistRequest) return { ok: false, error: "target already has a pending assist request" };

    const req: AssistRequest = {
        id: `assist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fromShipId,
        fromShipName: from.name,
        kind,
        message,
        issuedAt: Date.now(),
    };
    to.pendingAssistRequest = req;
    assistRequests.set(req.id, req);

    addAlert({
        type: "ASSIST_REQUEST",
        shipId: fromShipId,
        severity: "high",
        message: `${from.name} requesting ${kind} assistance from ${to.name}: ${message}`,
        metadata: { fromShipId, toShipId, kind, requestId: req.id },
    });

    return { ok: true, request: req };
}

export function respondAssistance(toShipId: string, accept: boolean): { ok: boolean; error?: string } {
    const to = fleet.find(s => s.shipId === toShipId);
    if (!to) return { ok: false, error: "ship not found" };
    if (!to.pendingAssistRequest) return { ok: false, error: "no pending assist request" };
    const req = to.pendingAssistRequest;
    const from = fleet.find(s => s.shipId === req.fromShipId);

    if (accept) {
        if (req.kind === "fuel" && from) {
            const transfer = Math.min(2500, to.fuel * 0.4);
            from.fuel = Math.min(10000, from.fuel + transfer);
            to.fuel = Math.max(0, to.fuel - transfer);
        }
        addAlert({
            type: "ASSIST_ACCEPTED",
            shipId: toShipId,
            severity: "medium",
            message: `${to.name} accepted ${req.kind} assistance request from ${req.fromShipName}.`,
            metadata: { requestId: req.id, kind: req.kind, fromShipId: req.fromShipId },
        });
    } else {
        addAlert({
            type: "ASSIST_DECLINED",
            shipId: toShipId,
            severity: "medium",
            message: `${to.name} declined ${req.kind} assistance request from ${req.fromShipName}.`,
            metadata: { requestId: req.id, kind: req.kind, fromShipId: req.fromShipId },
        });
    }

    to.pendingAssistRequest = undefined;
    assistRequests.delete(req.id);
    return { ok: true };
}

export function findNearbyShips(shipId: string, rangeKm = 50): ShipState[] {
    const me = fleet.find(s => s.shipId === shipId);
    if (!me) return [];
    return fleet
        .filter(s => s.shipId !== shipId && s.status !== "stopped" && s.status !== "stranded" && s.status !== "arrived")
        .map(s => ({ ship: s, distKm: haversineKM(me.position, s.position) }))
        .filter(x => x.distKm <= rangeKm)
        .sort((a, b) => a.distKm - b.distKm)
        .map(x => x.ship);
}

export function generateRouteOptions(shipId: string): RouteCandidate[] {
    const ship = fleet.find(s => s.shipId === shipId);
    if (!ship) return [];
    const dest = PORTS[ship.destination];
    if (!dest) return [];
    const opts = findMultiplePaths(ship.position, dest, getZones(), weatherZones);
    ship.routeOptions = opts;
    return opts;
}

export function selectRouteOption(shipId: string, label: string): boolean {
    const ship = fleet.find(s => s.shipId === shipId);
    if (!ship || !ship.routeOptions) return false;
    const chosen = ship.routeOptions.find(o => o.label === label);
    if (!chosen) return false;
    ship.path = chosen.path.slice(1);
    ship.pathTotal = chosen.path;
    ship.status = "rerouting";
    const burnRate = ship.speed * 0.8;
    const timeHr = chosen.distanceNM / ship.speed;
    const fuelNeeded = burnRate * timeHr * (ship.weatherPenalty ? 1.3 : 1);
    ship.insufficientFuel = fuelNeeded > ship.fuel;
    addAlert({
        type: "ROUTE_SELECTED",
        shipId,
        severity: "low",
        message: `${ship.name} adopting "${chosen.label}" route (${chosen.distanceNM.toFixed(0)}NM).`,
        metadata: { label, distanceNM: chosen.distanceNM },
    });
    setTimeout(() => { if (ship.status === "rerouting") ship.status = "normal"; }, 6000);
    return true;
}

export function getFleet() { return fleet; }
export function setWeatherZones(zones: any[]) { weatherZones = zones; }
export function getWeatherZones() { return weatherZones; }

export function onZoneChanged() {
    for (const ship of fleet) {
        if (ship.status === "arrived" || ship.status === "stopped" || ship.status === "stranded") continue;
        checkZoneIntersection(ship);
    }
}

let snapshotTimer = 0;

export function startSimulator() {
    console.log(`Simulator started with ${fleet.length} ships from fleet.json`);
    for (const ship of fleet) replanShip(ship);

    setTimeout(() => {
        const ship = fleet.find(s => s.shipId === "MV-7") || fleet[6];
        if (ship) {
            addAlert({ type: "FUEL_WARNING", shipId: ship.shipId, severity: "high", message: `${ship.name} fuel critically low — ${((ship.fuel / 10000) * 100).toFixed(1)}% remaining.` });
            firedAlerts.add(`fuel-warn-${ship.shipId}`);
        }
    }, 5000);

    const SIM_SPEED = 180;

    setInterval(() => {
        tickCount++;
        for (const ship of fleet) {
            moveShip(ship, SIM_SPEED);
            checkWeather(ship);
            checkZoneIntersection(ship);
            checkFuelAlerts(ship);
            checkPredictive(ship);
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