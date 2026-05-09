import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

const GRID_POINTS = [
    { lat: 22, lng: 48 }, { lat: 22, lng: 54 }, { lat: 22, lng: 60 },
    { lat: 26, lng: 48 }, { lat: 26, lng: 54 }, { lat: 26, lng: 60 },
    { lat: 30, lng: 48 }, { lat: 30, lng: 54 }, { lat: 30, lng: 60 },
];

export interface WeatherZone {
    center: [number, number];
    polygon: [number, number][];
    windspeed: number;
    precipitation: number;
    adverse: boolean;
}

let cachedZones: WeatherZone[] = [];

export async function getWeatherZones(): Promise<WeatherZone[]> {
    return cachedZones;
}

async function fetchWeatherForPoint(lat: number, lng: number) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=windspeed_10m,precipitation&forecast_days=1`;
        const res = await axios.get(url);
        const data = res.data;
        const currentHour = new Date().getUTCHours();
        const windspeed = data.hourly.windspeed_10m[currentHour] || 0;
        const precipitation = data.hourly.precipitation[currentHour] || 0;
        return { windspeed, precipitation };
    } catch (err) {
        console.error(`Weather fetch failed for ${lat},${lng}:`, err);
        return { windspeed: 0, precipitation: 0 };
    }
}

function makePolygon(lat: number, lng: number): [number, number][] {
    const d = 1;
    return [
        [lat - d, lng - d],
        [lat - d, lng + d],
        [lat + d, lng + d],
        [lat + d, lng - d],
        [lat - d, lng - d],
    ];
}

export async function refreshWeather() {
    console.log("Refreshing weather data...");
    const zones: WeatherZone[] = [];

    for (const point of GRID_POINTS) {
        const { windspeed, precipitation } = await fetchWeatherForPoint(
            point.lat,
            point.lng
        );
        const adverse = windspeed > 25 || precipitation > 2;
        zones.push({
            center: [point.lat, point.lng],
            polygon: makePolygon(point.lat, point.lng),
            windspeed,
            precipitation,
            adverse,
        });
    }

    cachedZones = zones;

    const adverseZones = zones.filter((z) => z.adverse);
    try {
        await axios.post(`${BACKEND_URL}/api/weather-zones`, {
            zones: adverseZones.map((z) => ({
                polygon: z.polygon,
                windspeed: z.windspeed,
                precipitation: z.precipitation,
            })),
        });
        console.log(`Sent ${adverseZones.length} adverse weather zones to backend`);
    } catch (err) {
        console.error("Could not send weather zones to backend:", err);
    }
}

export function startWeatherPolling() {
    refreshWeather();
    setInterval(refreshWeather, 5 * 60 * 1000);
}