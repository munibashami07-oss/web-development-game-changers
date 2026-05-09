import express from "express";
import dotenv from "dotenv";
import { processDistress } from "./distress";
import { getWeatherZones, startWeatherPolling } from "./weather";
import { startProximityMonitor } from "./alerts";
import { triggerAdvisory, startAdvisoryInterval } from "./advisor";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "ai-service" });
});

app.post("/ai/distress", async (req, res) => {
    try {
        const { shipId, message } = req.body;
        if (!shipId || !message) {
            return res.status(400).json({ error: "shipId and message required" });
        }
        const result = await processDistress(shipId, message);
        res.json(result);
    } catch (err) {
        console.error("Distress error:", err);
        res.status(500).json({ error: "Failed to process distress message" });
    }
});

app.post("/ai/advise", async (req, res) => {
    try {
        const result = await triggerAdvisory();
        res.json(result);
    } catch (err) {
        console.error("Advisory error:", err);
        res.status(500).json({ error: "Failed to generate advisory" });
    }
});

app.get("/ai/weather", async (req, res) => {
    try {
        const zones = await getWeatherZones();
        res.json({ zones });
    } catch (err) {
        console.error("Weather error:", err);
        res.status(500).json({ error: "Failed to fetch weather" });
    }
});

app.listen(PORT, () => {
    console.log(`AI Service running on port ${PORT}`);
    startWeatherPolling();
    startAdvisoryInterval();
    startProximityMonitor();
});