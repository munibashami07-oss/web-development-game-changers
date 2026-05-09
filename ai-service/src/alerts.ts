import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

interface ShipState {
  shipId: string;
  name: string;
  position: [number, number];
  speed: number;
  heading: number;
  destination: string;
  fuel: number;
  status: string;
  path: [number, number][];
  weatherPenalty: boolean;
}

interface Zone {
  id: string;
  polygon: [number, number][];
}

function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversineDistance(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function projectPosition(position: [number, number], heading: number, speed: number, seconds: number): [number, number] {
  const distanceM = (speed * 1852 * seconds) / 3600;
  const R = 6371000;
  const lat1 = toRadians(position[0]);
  const lng1 = toRadians(position[1]);
  const headingRad = toRadians(heading);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceM / R) + Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(headingRad));
  const lng2 = lng1 + Math.atan2(Math.sin(headingRad) * Math.sin(distanceM / R) * Math.cos(lat1), Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
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

async function postAlert(alert: object) {
  try {
    await axios.post(`${BACKEND_URL}/api/alerts`, alert);
  } catch (err) {
    console.error("Failed to post alert:", err);
  }
}

async function runProximityAndPredictiveCheck() {
  let fleet: ShipState[] = [];
  let zones: Zone[] = [];
  try {
    const [fleetRes, zonesRes] = await Promise.all([
      axios.get(`${BACKEND_URL}/api/fleet`),
      axios.get(`${BACKEND_URL}/api/zones`),
    ]);
    fleet = fleetRes.data.ships || [];
    zones = zonesRes.data.zones || [];
  } catch (err) {
    console.error("Could not fetch fleet/zones:", err);
    return;
  }

  for (const ship of fleet) {
    if (ship.status === "arrived" || ship.status === "stopped") continue;
    const futurePos = projectPosition(ship.position, ship.heading, ship.speed, 180);
    for (const zone of zones) {
      if (pointInPolygon(futurePos, zone.polygon)) {
        await postAlert({
          type: "PREDICTIVE_ZONE",
          shipId: ship.shipId,
          severity: "high",
          message: `${ship.name} will enter restricted zone in ~3 minutes`,
          metadata: { zoneId: zone.id, projectedPosition: futurePos },
        });
      }
    }

    if (ship.path && ship.path.length > 1) {
      let pathDistance = 0;
      for (let i = 0; i < ship.path.length - 1; i++) {
        pathDistance += haversineDistance(ship.path[i], ship.path[i + 1]);
      }
      const burnRate = ship.speed * 0.8;
      const timeHours = pathDistance / 1000 / (ship.speed * 1.852);
      const fuelNeeded = burnRate * timeHours * (ship.weatherPenalty ? 1.3 : 1);
      if (fuelNeeded > ship.fuel && ship.fuel > 0) {
        const shortfall = ((fuelNeeded - ship.fuel) / fuelNeeded) * pathDistance;
        await postAlert({
          type: "FUEL_CRITICAL",
          shipId: ship.shipId,
          severity: "critical",
          message: `${ship.name} will run out of fuel ~${Math.round(shortfall / 1000)}km short of destination`,
          metadata: { fuelRemaining: ship.fuel, fuelNeeded },
        });
      }
    }
  }
}

export function startProximityMonitor() {
  console.log("Starting proximity and predictive alert monitor...");
  setInterval(runProximityAndPredictiveCheck, 2000);
}