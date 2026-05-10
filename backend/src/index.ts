import express from "express";
import http from "http";
import dotenv from "dotenv";
import { initWebSocket, broadcast } from "./websocket";
import { startSimulator, getFleet, setWeatherZones, applyDirective, captainAccept, captainEscalateDistress } from "./simulator";
import { zonesRouter, getZones } from "./zones";
import { addAlert, getAlerts } from "./alerts";
import { getHistory } from "./history";
import { generateBriefing } from "./ai-briefing";
import { processNaturalCommand } from "./ai-command";

dotenv.config();

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT");
    next();
});

app.use("/api", zonesRouter);

app.get("/health", (req, res) => res.json({ status: "ok", service: "backend" }));
app.get("/api/fleet", (req, res) => res.json({ ships: getFleet() }));
app.get("/api/zones", (req, res) => res.json({ zones: getZones() }));
app.get("/api/history", (req, res) => res.json({ snapshots: getHistory() }));
app.get("/api/alerts", (req, res) => res.json({ alerts: getAlerts() }));

app.post("/api/alerts", (req, res) => {
    const alert = addAlert(req.body);
    broadcast({ type: "ALERT", alert });
    res.json(alert);
});

app.post("/api/weather-zones", (req, res) => {
    setWeatherZones(req.body.zones || []);
    res.json({ ok: true });
});

// Directives — Command issues, captain decides
app.post("/api/directives", (req, res) => {
    const { shipId, type, payload } = req.body;
    if (!shipId || !type) return res.status(400).json({ error: "shipId and type required" });
    const ok = applyDirective(shipId, type, payload || {});
    if (!ok) return res.status(404).json({ error: "ship not found" });
    broadcast({ type: "DIRECTIVE_ISSUED", shipId, directiveType: type, payload });
    addAlert({
        type: "DIRECTIVE_ISSUED",
        shipId,
        severity: type === "EMERGENCY" ? "critical" : "medium",
        message: `Command issued ${type} directive to ${shipId}`,
    });
    res.json({ ok: true });
});

app.post("/api/directives/:shipId/accept", (req, res) => {
    const ok = captainAccept(req.params.shipId);
    if (!ok) return res.status(404).json({ error: "no pending directive" });
    broadcast({ type: "DIRECTIVE_ACCEPTED", shipId: req.params.shipId });
    res.json({ ok: true });
});

app.post("/api/directives/:shipId/escalate", (req, res) => {
    const { message } = req.body;
    const ok = captainEscalateDistress(req.params.shipId, message || "Distress");
    if (!ok) return res.status(404).json({ error: "ship not found" });
    broadcast({ type: "DISTRESS_ESCALATED", shipId: req.params.shipId, message });
    res.json({ ok: true });
});

// AI Mission Briefing
app.get("/api/ai/briefing/:shipId", async (req, res) => {
    try {
        const ship = getFleet().find(s => s.shipId === req.params.shipId);
        if (!ship) return res.status(404).json({ error: "ship not found" });
        const briefing = await generateBriefing(ship, getFleet(), getZones(), getAlerts());
        res.json({ briefing });
    } catch (err: any) {
        res.status(500).json({ error: err.message || "AI failed" });
    }
});

// AI Natural Language Command
app.post("/api/ai/command", async (req, res) => {
    try {
        const { command } = req.body;
        if (!command) return res.status(400).json({ error: "command required" });
        const result = await processNaturalCommand(command, getFleet(), getZones());
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "AI failed" });
    }
});

const server = http.createServer(app);
initWebSocket(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    startSimulator();
});