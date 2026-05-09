import { v4 as uuidv4 } from "uuid";
import { getZones } from "./zones";
import { addAlert } from "./alerts";
import { saveSnapshot } from "./history";

export interface ShipState {
    shipId: string;
    name: string;
    position: [number, number];
    speed: number;
    heading: number;
    destination: string;
    fuel: number;
    cargo: string;
    status: string;
    path: [number, number][];
    weatherPenalty: boolean;
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

let fleet: ShipState[] = [
    { shipId: "MV-1", name: "Aurora", position: [26.55, 56.20], speed: 14, heading: 105, destination: "MCT-1", fuel: 6800, cargo: "crude oil", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-2", name: "Borealis", position: [25.50, 57.20], speed: 19, heading: 270, destination: "DXB-1", fuel: 5400, cargo: "containers", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-3", name: "Cygnus", position: [25.70, 53.00], speed: 16, heading: 95, destination: "MCT-1", fuel: 7200, cargo: "LNG", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-4", name: "Dragon", position: [26.40, 56.00], speed: 13, heading: 110, destination: "SOH-1", fuel: 5800, cargo: "bulk grain", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-5", name: "Emerald", position: [27.50, 51.20], speed: 12, heading: 165, destination: "DOH-1", fuel: 8200, cargo: "crude oil", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-6", name: "Falcon", position: [25.40, 54.53], speed: 22, heading: 280, destination: "DOH-1", fuel: 4100, cargo: "containers", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-7", name: "Gharial", position: [26.50, 53.50], speed: 14, heading: 270, destination: "KWT-1", fuel: 750, cargo: "crude oil", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-8", name: "Halcyon", position: [24.93, 56.94], speed: 19, heading: 250, destination: "DMM-1", fuel: 5200, cargo: "automobiles", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-9", name: "Iris", position: [28.20, 50.30], speed: 13, heading: 175, destination: "BAH-1", fuel: 7800, cargo: "crude oil", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-10", name: "Jade", position: [25.02, 57.96], speed: 20, heading: 285, destination: "BND-1", fuel: 6300, cargo: "containers", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-11", name: "Kite", position: [25.64, 52.18], speed: 18, heading: 95, destination: "MCT-1", fuel: 7600, cargo: "LNG", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-12", name: "Lotus", position: [29.10, 48.80], speed: 12, heading: 145, destination: "SOH-1", fuel: 8500, cargo: "crude oil", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-13", name: "Mirage", position: [24.60, 57.30], speed: 21, heading: 320, destination: "BAH-1", fuel: 5900, cargo: "containers", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-14", name: "Nova", position: [24.12, 58.43], speed: 11, heading: 290, destination: "DOH-1", fuel: 4600, cargo: "bulk cement", status: "normal", path: [], weatherPenalty: false },
    { shipId: "MV-15", name: "Orca", position: [26.34, 55.91], speed: 13, heading: 215, destination: "MCT-1", fuel: 7100, cargo: "crude oil", status: "normal", path: [], weatherPenalty: false },
];

let weatherZones: any[] = [];

function toRadians(deg: number) { return (deg * Math.PI) / 180; }
function toDegrees(rad: number) { return (rad * 180) / Math.PI; }

function moveShip(ship: ShipState, seconds: number) {
    if (ship.status === "arrived" || ship.status === "stopped") return;
    const distanceM = (ship.speed * 1852 * seconds) / 3600;
    const R = 6371000;
    const lat1 = toRadians(ship.position[0]);
    const lng1 = toRadians(ship.position[1]);
    const headingRad = toRadians(ship.heading);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceM / R) + Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(headingRad));
    const lng2 = lng1 + Math.atan2(Math.sin(headingRad) * Math.sin(distanceM / R) * Math.cos(lat1), Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2));
    ship.position = [toDegrees(lat2), toDegrees(lng2)];
    const fuelBurn = ship.speed * 0.8 * seconds / 3600;
    ship.fuel -= fuelBurn * (ship.weatherPenalty ? 1.3 : 1);
    if (ship.fuel <= 0) { ship.fuel = 0; ship.status = "stopped"; }
}

function updateHeadingToDestination(ship: ShipState) {
    if (ship.status === "arrived" || ship.status === "stopped") return;
    const dest = PORTS[ship.destination];
    if (!dest) return;
    const dLng = dest[1] - ship.position[1];
    const dLat = dest[0] - ship.position[0];
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < 0.1) { ship.status = "arrived"; return; }
    const angle = Math.atan2(dLng, dLat);
    ship.heading = (toDegrees(angle) + 360) % 360;
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

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
    let inside = false;
    const [px, py] = point;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

function checkZones(ship: ShipState) {
    const zones = getZones();
    for (const zone of zones) {
        if (pointInPolygon(ship.position, zone.polygon)) {
            addAlert({
                type: "GEOFENCE_BREACH",
                shipId: ship.shipId,
                severity: "critical",
                message: `${ship.name} has entered restricted zone ${zone.name}`,
                metadata: { zoneId: zone.id },
            });
        }
    }
}

export function getFleet() { return fleet; }
export function setWeatherZones(zones: any[]) { weatherZones = zones; }

let snapshotTimer = 0;

export function startSimulator() {
    console.log("Simulator started");
    setInterval(() => {
        for (const ship of fleet) {
            updateHeadingToDestination(ship);
            moveShip(ship, 1);
            checkWeather(ship);
            checkZones(ship);
        }
        const { broadcast } = require("./websocket");
        broadcast({ type: "FLEET_UPDATE", ships: fleet, timestamp: Date.now() });
        snapshotTimer++;
        if (snapshotTimer >= 30) {
            saveSnapshot(fleet);
            snapshotTimer = 0;
        }
    }, 1000);
}