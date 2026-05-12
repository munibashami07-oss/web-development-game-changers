import OpenAI from "openai";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
});
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function processDistress(shipId: string, message: string) {
    try {
        const completion = await openai.chat.completions.create({
            model: "meta/llama-3.3-70b-instruct",
            max_tokens: 500,
            messages: [
                {
                    role: "system",
                    content: `You are a maritime crisis analyst. A ship captain sent a free-form distress message. Extract:
- severity: "low" | "medium" | "high" | "critical"
- category: "mechanical" | "medical" | "weather" | "security" | "navigation" | "fuel"
- injuryCount: number (0 if none mentioned)
- damageEstimate: string (e.g. "engine room fire, ~40% propulsion loss")
- requiresAssistance: boolean
- summary: string (one sentence, plain English)
Respond ONLY with valid JSON, no markdown, no explanation.`,
                },
                {
                    role: "user",
                    content: `Ship ${shipId} distress message: "${message}"`,
                },
            ],
        });

        const raw = completion.choices[0].message.content || "{}";
        const parsed = JSON.parse(raw);

        const alert = {
            type: "DISTRESS",
            shipId,
            severity: parsed.severity || "medium",
            message: parsed.summary || message,
            metadata: parsed,
        };

        try {
            await axios.post(`${BACKEND_URL}/api/alerts`, alert);
        } catch (backendErr) {
            console.error("Could not reach backend to post alert:", backendErr);
        }

        return parsed;
    } catch (err) {
        console.error("OpenAI distress processing failed:", err);

        const fallback = {
            severity: "medium",
            category: "navigation",
            injuryCount: 0,
            damageEstimate: "unknown",
            requiresAssistance: true,
            summary: message,
        };

        try {
            await axios.post(`${BACKEND_URL}/api/alerts`, {
                type: "DISTRESS",
                shipId,
                severity: "medium",
                message,
                metadata: fallback,
            });
        } catch (_) { }

        return fallback;
    }
}