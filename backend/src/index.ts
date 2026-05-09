import express from "express";
import http from "http";
import dotenv from "dotenv";
import { initWebSocket, broadcast } from "./websocket";
import { startSimulator, getFleet, setWeatherZones } from "./simulator";
import { zonesRouter, getZones } from "./zones";
import { addAlert, getAlerts } from "./alerts";
import { getHistory, saveSnapshot } from "./history";

dotenv.config();

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE");
    next();
});

app.use("/api", zonesRouter);

app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "backend" });
});

app.get("/api/fleet", (req, res) => {
    res.json({ ships: getFleet() });
});

app.get("/api/zones", (req, res) => {
    res.json({ zones: getZones() });
});

app.get("/api/history", (req, res) => {
    res.json({ snapshots: getHistory() });
});

app.get("/api/alerts", (req, res) => {
    res.json({ alerts: getAlerts() });
});

app.post("/api/alerts", (req, res) => {
    const alert = addAlert(req.body);
    broadcast({ type: "ALERT", alert });
    res.json(alert);
});

app.post("/api/weather-zones", (req, res) => {
    setWeatherZones(req.body.zones || []);
    res.json({ ok: true });
});

const server = http.createServer(app);
initWebSocket(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    startSimulator();
});