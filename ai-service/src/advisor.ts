import OpenAI from "openai";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
});
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

export async function triggerAdvisory() {
    let fleet = [];

    try {
        const res = await axios.get(`${BACKEND_URL}/api/fleet`);
        fleet = res.data.ships || [];
    } catch (err) {
        console.error("Could not fetch fleet for advisory:", err);
        return [];
    }

    if (fleet.length === 0) return [];

    try {
        const completion = await openai.chat.completions.create({
            model: "meta/llama-3.3-70b-instruct",
            max_tokens: 1000,
            messages: [
                {
                    role: "system",
                    content: `You are a maritime fleet advisor. Analyze the fleet state and identify up to 3 proactive actions Command should consider. For each action return:
- action: short imperative string (e.g. "Reroute MV-7 to Sohar")
- reason: one sentence explaining the urgency
- urgency: "low" | "medium" | "high"
- affectedShips: string[] of shipIds
Respond ONLY with a valid JSON array, no markdown, no explanation.`,
                },
                {
                    role: "user",
                    content: `Current fleet state: ${JSON.stringify(fleet)}`,
                },
            ],
        });

        const raw = completion.choices[0].message.content || "[]";
        const clean = raw.replace(/```json|```/g, "").trim();
        const suggestions = JSON.parse(clean);

        for (const suggestion of suggestions) {
            try {
                await axios.post(`${BACKEND_URL}/api/alerts`, {
                    type: "AI_ADVICE",
                    severity: suggestion.urgency === "high" ? "high" : "low",
                    message: suggestion.action,
                    metadata: {
                        reason: suggestion.reason,
                        affectedShips: suggestion.affectedShips,
                    },
                });
            } catch (err) {
                console.error("Failed to post advisory alert:", err);
            }
        }

        return suggestions;
    } catch (err) {
        console.error("OpenAI advisory failed:", err);
        return [];
    }
}

export function startAdvisoryInterval() {
    console.log("Starting AI fleet advisory interval...");
    setInterval(triggerAdvisory, 30000);
}