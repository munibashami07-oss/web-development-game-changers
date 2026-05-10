// backend/src/ai-briefing.ts
// Generates a natural language tactical briefing for a selected vessel.
// Falls back to deterministic template if no API key.

import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const PORTS: Record<string, string> = {
    "KWT-1": "Kuwait", "BUS-1": "Bushehr", "DMM-1": "Dammam",
    "BAH-1": "Bahrain", "DOH-1": "Doha", "AUH-1": "Abu Dhabi",
    "DXB-1": "Dubai", "BND-1": "Bandar Abbas", "SOH-1": "Sohar", "MCT-1": "Muscat",
};

function haversineNM(a: [number, number], b: [number, number]): number {
    const R = 3440.065;
    const φ1 = (a[0] * Math.PI) / 180;
    const φ2 = (b[0] * Math.PI) / 180;
    const Δφ = ((b[0] - a[0]) * Math.PI) / 180;
    const Δλ = ((b[1] - a[1]) * Math.PI) / 180;
    const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

export async function generateBriefing(ship: any, fleet: any[], zones: any[], alerts: any[]): Promise<string> {
    const fuelPct = (ship.fuel / 10000) * 100;
    const destPortName = PORTS[ship.destination] || ship.destination;
    const destCoords: [number, number] | null = ({
        "KWT-1": [29.48, 48.34], "BUS-1": [28.83, 50.73], "DMM-1": [26.56, 50.30],
        "BAH-1": [26.50, 50.55], "DOH-1": [25.46, 51.95], "AUH-1": [25.22, 54.18],
        "DXB-1": [25.50, 54.75], "BND-1": [26.62, 56.11], "SOH-1": [24.72, 57.02], "MCT-1": [23.92, 58.58],
    } as any)[ship.destination];

    const distNM = destCoords ? haversineNM(ship.position, destCoords) : 0;
    const etaHr = ship.speed > 0 ? distNM / ship.speed : 0;
    const burnRate = ship.speed * 0.8;
    const fuelNeeded = burnRate * etaHr * (ship.weatherPenalty ? 1.3 : 1);
    const fuelMargin = ship.fuel - fuelNeeded;

    const recentAlerts = alerts
        .filter(a => a.shipId === ship.shipId)
        .slice(-5)
        .map(a => `${a.severity.toUpperCase()}: ${a.message}`);

    // Deterministic fallback briefing if no API key
    if (!openai) {
        return generateDeterministic(ship, destPortName, fuelPct, distNM, etaHr, fuelMargin, recentAlerts);
    }

    try {
        const ctx = {
            shipName: ship.name,
            shipId: ship.shipId,
            captain: ship.captain,
            cargo: ship.cargo,
            position: { lat: ship.position[0].toFixed(3), lng: ship.position[1].toFixed(3) },
            speed: ship.speed,
            heading: ship.heading,
            destination: destPortName,
            distanceToDestNM: distNM.toFixed(0),
            etaHours: etaHr.toFixed(1),
            fuelPct: fuelPct.toFixed(1),
            fuelMarginUnits: fuelMargin.toFixed(0),
            status: ship.status,
            inAdverseWeather: ship.weatherPenalty,
            insufficientFuel: ship.insufficientFuel,
            zonesActive: zones.length,
            recentAlerts,
        };

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 280,
            messages: [
                {
                    role: "system",
                    content: `You are a maritime fleet operations analyst providing tactical briefings.
Write in the voice of a professional ops officer — terse, factual, no preamble.
Format: ONE short paragraph (3-5 sentences).
Cover: vessel state, fuel risk, ETA, and ONE specific recommendation.
Use nautical terminology. Reference the captain by name.
NEVER use markdown, bullets, or headers. Output plain prose only.`,
                },
                {
                    role: "user",
                    content: `Generate tactical briefing for vessel:\n${JSON.stringify(ctx, null, 2)}`,
                },
            ],
        });

        return completion.choices[0]?.message?.content?.trim() || generateDeterministic(ship, destPortName, fuelPct, distNM, etaHr, fuelMargin, recentAlerts);
    } catch (err) {
        console.error("Briefing AI failed:", err);
        return generateDeterministic(ship, destPortName, fuelPct, distNM, etaHr, fuelMargin, recentAlerts);
    }
}

function generateDeterministic(ship: any, destPortName: string, fuelPct: number, distNM: number, etaHr: number, fuelMargin: number, recentAlerts: string[]): string {
    const captainShort = ship.captain?.replace(/^Capt\. /, "") || "Captain";
    const status = ship.status?.toUpperCase() || "NORMAL";
    const fuelDesc = fuelPct < 15 ? "critical" : fuelPct < 30 ? "low" : fuelPct < 60 ? "moderate" : "nominal";

    const sentences = [
        `${ship.name} is in ${status} state, holding ${ship.speed.toFixed(1)} knots on heading ${ship.heading.toFixed(0)}° toward ${destPortName}.`,
        `Fuel reserves are ${fuelDesc} at ${fuelPct.toFixed(1)}% with ${etaHr.toFixed(1)} hours to destination across ${distNM.toFixed(0)} nautical miles.`,
    ];

    if (fuelMargin < 0) {
        sentences.push(`Fuel projection insufficient — vessel will run dry approximately ${Math.abs(fuelMargin).toFixed(0)} units short. Recommend immediate diversion to nearest port.`);
    } else if (ship.weatherPenalty) {
        sentences.push(`Adverse weather corridor imposing 30% fuel penalty. Recommend monitoring and considering southerly deviation if conditions worsen.`);
    } else if (ship.insufficientFuel) {
        sentences.push(`Insufficient fuel flagged for current path. Recommend diversion or refueling rendezvous.`);
    } else if (status === "REROUTING") {
        sentences.push(`Vessel actively rerouting to avoid restricted zone. ${captainShort} executing autonomous deviation.`);
    } else {
        sentences.push(`No immediate concerns. ${captainShort} maintains course as planned.`);
    }

    if (recentAlerts.length > 0) {
        sentences.push(`Recent activity: ${recentAlerts[recentAlerts.length - 1]}.`);
    }

    return sentences.join(" ");
}