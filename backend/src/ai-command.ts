// backend/src/ai-command.ts
// Parses natural language commands and executes them on the fleet.
// Works WITHOUT OpenAI key using pattern matching.
// With OpenAI key, uses GPT for smarter parsing.

import { getFleet, applyDirective, generateRouteOptions, selectRouteOption } from "./simulator";
import { addZone } from "./zones";
import { addAlert } from "./alerts";

export async function processNaturalCommand(
    command: string,
    fleet: any[],
    zones: any[]
): Promise<{ response: string; actions: string[] }> {
    const cmd = command.toLowerCase();
    const actions: string[] = [];
    let response = "";

    // Try OpenAI first if key exists
    if (process.env.OPENAI_API_KEY) {
        try {
            return await processWithAI(command, fleet, zones);
        } catch (e) {
            // fall through to pattern matching
        }
    }

    // Pattern matching fallback — always works

    // REROUTE commands
    if (cmd.includes("reroute") || cmd.includes("divert") || cmd.includes("avoid") || cmd.includes("away from")) {
        const targets = getTargetShips(cmd, fleet);
        if (targets.length === 0) {
            response = "No matching vessels found. Try specifying ship type (LNG, crude, containers) or name.";
        } else {
            for (const ship of targets) {
                generateRouteOptions(ship.shipId);
                selectRouteOption(ship.shipId, "weather_safe");
                actions.push(`Rerouted ${ship.name} via weather-safe path`);
            }
            response = `Rerouted ${targets.length} vessel(s): ${targets.map(s => s.name).join(", ")}. They are now taking safer routes away from the crisis zone.`;
        }
    }

    // HOLD / STOP commands
    else if (cmd.includes("hold") || cmd.includes("stop") || cmd.includes("anchor") || cmd.includes("halt")) {
        const targets = getTargetShips(cmd, fleet);
        if (targets.length === 0) {
            response = "No matching vessels found.";
        } else {
            for (const ship of targets) {
                applyDirective(ship.shipId, "HOLD", { message: "Hold position — command order" });
                actions.push(`Issued HOLD to ${ship.name}`);
            }
            response = `Hold order issued to ${targets.length} vessel(s): ${targets.map(s => s.name).join(", ")}. Awaiting captain acknowledgment.`;
        }
    }

    // EMERGENCY commands
    else if (cmd.includes("emergency") || cmd.includes("mayday") || cmd.includes("distress")) {
        const targets = getTargetShips(cmd, fleet);
        const ship = targets[0] || fleet[0];
        if (ship) {
            applyDirective(ship.shipId, "EMERGENCY", { message: "Emergency protocol activated by command" });
            addAlert({
                type: "EMERGENCY",
                shipId: ship.shipId,
                severity: "critical",
                message: `Emergency protocol activated for ${ship.name} by AI command.`
            });
            actions.push(`Emergency protocol on ${ship.name}`);
            response = `Emergency protocol activated for ${ship.name}. All nearby vessels notified.`;
        }
    }

    // STATUS query
    else if (cmd.includes("status") || cmd.includes("report") || cmd.includes("how many") || cmd.includes("where")) {
        const normal = fleet.filter(s => s.status === "normal").length;
        const critical = fleet.filter(s => s.status === "critical" || s.status === "stopped").length;
        const rerouting = fleet.filter(s => s.status === "rerouting").length;
        const lowFuel = fleet.filter(s => s.fuel < 2000).length;
        response = `Fleet status: ${fleet.length} vessels total. ${normal} nominal, ${rerouting} rerouting, ${critical} critical. ${lowFuel} vessels have low fuel. All vessels are being tracked in the Strait of Hormuz operational zone.`;
    }

    // FUEL query
    else if (cmd.includes("fuel")) {
        const lowFuel = fleet.filter(s => s.fuel < 2500).sort((a, b) => a.fuel - b.fuel);
        if (lowFuel.length === 0) {
            response = "All vessels have adequate fuel levels.";
        } else {
            response = `${lowFuel.length} vessel(s) with low fuel: ${lowFuel.map(s => `${s.name} (${((s.fuel / 10000) * 100).toFixed(0)}%)`).join(", ")}.`;
        }
    }

    // DRAW ZONE / RESTRICT AREA
    else if (cmd.includes("zone") || cmd.includes("restrict") || cmd.includes("blockade") || cmd.includes("hormuz")) {
        // Draw a zone around the Strait of Hormuz
        const hormuzZone = {
            name: "Hormuz Exclusion Zone",
            polygon: [
                [26.3, 56.0], [27.0, 56.0], [27.0, 57.2], [26.3, 57.2], [26.3, 56.0]
            ] as [number, number][]
        };
        addZone(hormuzZone);
        actions.push("Created Hormuz Exclusion Zone");
        response = "Hormuz Exclusion Zone created. All vessels in the area will be rerouted automatically.";
    }

    else {
        response = `Command received: "${command}". Available commands: reroute [vessel type], hold [vessel], emergency [vessel], fuel status, fleet status, restrict hormuz.`;
    }

    return { response, actions };
}

function getTargetShips(cmd: string, fleet: any[]): any[] {
    // Match by cargo type
    if (cmd.includes("lng")) return fleet.filter(s => s.cargo?.toLowerCase().includes("lng"));
    if (cmd.includes("crude") || cmd.includes("oil") || cmd.includes("tanker")) return fleet.filter(s => s.cargo?.toLowerCase().includes("crude"));
    if (cmd.includes("container")) return fleet.filter(s => s.cargo?.toLowerCase().includes("container"));
    if (cmd.includes("bulk")) return fleet.filter(s => s.cargo?.toLowerCase().includes("bulk"));

    // Match by ship name
    for (const ship of fleet) {
        if (cmd.includes(ship.name.toLowerCase()) || cmd.includes(ship.shipId.toLowerCase())) {
            return [ship];
        }
    }

    // Match "all vessels"
    if (cmd.includes("all") || cmd.includes("every") || cmd.includes("fleet")) {
        return fleet.filter(s => s.status !== "stopped" && s.status !== "stranded");
    }

    // Default: return ships near Hormuz (lng 55-57.5)
    if (cmd.includes("hormuz") || cmd.includes("strait")) {
        return fleet.filter(s => s.position[1] >= 55 && s.position[1] <= 57.5);
    }

    return [];
}

async function processWithAI(command: string, fleet: any[], zones: any[]) {
    const axios = require("axios");
    const fleetSummary = fleet.map(s =>
        `${s.shipId} ${s.name}: cargo=${s.cargo}, status=${s.status}, fuel=${((s.fuel / 10000) * 100).toFixed(0)}%, pos=[${s.position[0].toFixed(2)},${s.position[1].toFixed(2)}]`
    ).join("\n");

    const res = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-3.5-turbo",
        messages: [{
            role: "system",
            content: `You are a naval fleet command AI. Given a command, respond with a JSON object: {"intent":"reroute|hold|emergency|status|zone","targets":"all|lng|crude|containers|[shipId]","response":"human readable response"}. Be concise.`
        }, {
            role: "user",
            content: `Fleet:\n${fleetSummary}\n\nCommand: ${command}`
        }],
        max_tokens: 200,
    }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });

    const text = res.data.choices[0].message.content;
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    // Execute the parsed intent
    return processNaturalCommand(
        `${parsed.intent} ${parsed.targets}`,
        fleet,
        zones
    );
}