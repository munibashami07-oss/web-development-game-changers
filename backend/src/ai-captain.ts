// backend/src/ai-captain.ts
// Generates an in-character captain reply. Uses OpenAI if available; falls back
// to a deterministic templated reply otherwise.

interface ChatMsg { role: "command" | "captain"; text: string; }

export async function captainReply(ship: any, message: string, history: ChatMsg[]): Promise<string> {
    const fuelPct = ((ship.fuel / 10000) * 100).toFixed(0);
    const ctx = `You are ${ship.captain}, captain of ${ship.name} (${ship.shipId}). ` +
        `Cargo: ${ship.cargo}. Status: ${ship.status}. Fuel: ${fuelPct}%. ` +
        `Heading: ${ship.heading?.toFixed(0)}°. Speed: ${ship.speed?.toFixed(1)} knots. ` +
        `Bound for ${ship.destination}.` +
        (ship.weatherPenalty ? " Currently in adverse weather (30% extra fuel burn)." : "") +
        (ship.insufficientFuel ? " WARNING: insufficient fuel for current route." : "") +
        (ship.pendingDirective ? ` You have a pending directive: ${ship.pendingDirective.type} - ${ship.pendingDirective.message}.` : "");

    if (process.env.OPENAI_API_KEY) {
        try {
            const axios = require("axios");
            const messages: any[] = [
                {
                    role: "system",
                    content: `${ctx}\n\nReply in character as the captain. Keep replies short (1-3 sentences). Use radio-call brevity ("Aye, Command", "Copy that", "Roger"). React to your ship's state and any directives. Don't break character. Don't use markdown.`
                },
            ];
            for (const h of history.slice(-8)) {
                messages.push({ role: h.role === "command" ? "user" : "assistant", content: h.text });
            }
            messages.push({ role: "user", content: message });

            const res = await axios.post("https://api.openai.com/v1/chat/completions", {
                model: "gpt-4o-mini",
                messages,
                max_tokens: 120,
                temperature: 0.8,
            }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 10000 });

            return res.data.choices[0].message.content.trim();
        } catch (err) {
            // fall through to template
        }
    }

    // Fallback template
    const lower = message.toLowerCase();
    if (lower.includes("status") || lower.includes("report")) {
        return `${ship.name} reporting. Status ${ship.status}, fuel ${fuelPct}%, bearing ${ship.heading?.toFixed(0)}°, bound for ${ship.destination}. Over.`;
    }
    if (lower.includes("hold") || lower.includes("stop")) {
        return `Roger, Command. Reducing speed and holding position. Standing by.`;
    }
    if (lower.includes("reroute") || lower.includes("divert")) {
        return `Aye, Command. Plotting new course now. Will advise ETA shortly.`;
    }
    if (lower.includes("fuel")) {
        return `${fuelPct}% remaining, Command.${ship.insufficientFuel ? " Will not make destination on current path. Request reroute or assistance." : " Within margin."}`;
    }
    if (lower.includes("danger") || lower.includes("threat") || lower.includes("hostile")) {
        return `Acknowledged. Eyes on, Command. Will report any contacts immediately.`;
    }
    return `Copy that, Command. ${ship.name} standing by for further orders.`;
}