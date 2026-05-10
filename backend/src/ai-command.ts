// backend/src/ai-command.ts
// Returns { summary, actions: [{shipId, type, reason}], queryAnswer? }
// to match what the AICommandBar UI expects.

import { applyDirective, generateRouteOptions, selectRouteOption } from "./simulator";
import { addZone } from "./zones";
import { addAlert } from "./alerts";

interface ActionRecord {
    shipId: string;
    type: string;
    reason: string;
}

export async function processNaturalCommand(
    command: string,
    fleet: any[],
    zones: any[]
): Promise<{ summary: string; actions: ActionRecord[]; queryAnswer?: string }> {
    const cmd = command.toLowerCase();
    const actions: ActionRecord[] = [];
    let summary = "";
    let queryAnswer: string | undefined;

    // Try OpenAI first if key is present, falling back to pattern matching on any error.
    if (process.env.OPENAI_API_KEY) {
        try {
            const ai = await processWithAI(command, fleet);
            if (ai) return ai;
        } catch (e) {
            // fall through
        }
    }

    // ── REROUTE / DIVERT / AVOID ─────────────────────────────────────
    if (cmd.includes("reroute") || cmd.includes("divert") || cmd.includes("avoid") || cmd.includes("away from")) {
        const targets = getTargetShips(cmd, fleet);
        if (targets.length === 0) {
            summary = "No matching vessels found. Try specifying ship type (LNG, crude, containers) or a vessel name.";
        } else {
            for (const ship of targets) {
                const opts = generateRouteOptions(ship.shipId);
                if (opts.length > 0) {
                    const chosen = opts.find(o => o.label === "weather_safe") || opts[0];
                    selectRouteOption(ship.shipId, chosen.label);
                    actions.push({
                        shipId: ship.shipId,
                        type: "REROUTE",
                        reason: `Adopted "${chosen.label}" route, ${chosen.distanceNM.toFixed(0)} NM`,
                    });
                } else {
                    actions.push({ shipId: ship.shipId, type: "REROUTE", reason: "No alternate route available" });
                }
            }
            summary = `Rerouted ${targets.length} vessel(s): ${targets.map(s => s.name).join(", ")}.`;
        }
    }

    // ── HOLD / STOP / ANCHOR ─────────────────────────────────────────
    else if (cmd.includes("hold") || cmd.includes("stop") || cmd.includes("anchor") || cmd.includes("halt")) {
        const targets = getTargetShips(cmd, fleet);
        if (targets.length === 0) {
            summary = "No matching vessels found.";
        } else {
            for (const ship of targets) {
                applyDirective(ship.shipId, "HOLD", { message: "Hold position — Command order" });
                actions.push({ shipId: ship.shipId, type: "HOLD", reason: "Awaiting captain ack" });
            }
            summary = `Hold order issued to ${targets.length} vessel(s): ${targets.map(s => s.name).join(", ")}.`;
        }
    }

    // ── EMERGENCY ────────────────────────────────────────────────────
    else if (cmd.includes("emergency") || cmd.includes("mayday")) {
        const targets = getTargetShips(cmd, fleet);
        const list = targets.length > 0 ? targets : [fleet[0]];
        for (const ship of list) {
            if (!ship) continue;
            applyDirective(ship.shipId, "EMERGENCY", { message: "Emergency protocol activated by Command" });
            addAlert({
                type: "EMERGENCY", shipId: ship.shipId, severity: "critical",
                message: `Emergency protocol activated for ${ship.name} by AI command.`,
            });
            actions.push({ shipId: ship.shipId, type: "EMERGENCY", reason: "Protocol active" });
        }
        summary = `Emergency protocol on ${list.map(s => s?.name).filter(Boolean).join(", ")}.`;
    }

    // ── STATUS / REPORT ──────────────────────────────────────────────
    else if (cmd.includes("status") || cmd.includes("report") || cmd.includes("how many") || cmd.includes("where")) {
        const normal = fleet.filter(s => s.status === "normal").length;
        const critical = fleet.filter(s => s.status === "critical" || s.status === "stopped").length;
        const rerouting = fleet.filter(s => s.status === "rerouting").length;
        const lowFuel = fleet.filter(s => s.fuel < 2000).length;
        summary = "Fleet status report.";
        queryAnswer = `${fleet.length} vessels total. ${normal} nominal, ${rerouting} rerouting, ${critical} critical. ${lowFuel} with low fuel.`;
    }

    // ── FUEL ─────────────────────────────────────────────────────────
    else if (cmd.includes("fuel")) {
        const lowFuel = fleet.filter(s => s.fuel < 2500).sort((a, b) => a.fuel - b.fuel);
        summary = "Fuel inventory.";
        queryAnswer = lowFuel.length === 0
            ? "All vessels have adequate fuel."
            : `Low fuel: ${lowFuel.map(s => `${s.name} (${((s.fuel / 10000) * 100).toFixed(0)}%)`).join(", ")}.`;
    }

    // ── ZONE / RESTRICT / BLOCKADE ───────────────────────────────────
    else if (cmd.includes("zone") || cmd.includes("restrict") || cmd.includes("blockade")) {
        const zone = addZone({
            name: "Hormuz Exclusion Zone",
            polygon: [[26.3, 56.0], [27.0, 56.0], [27.0, 57.2], [26.3, 57.2], [26.3, 56.0]] as [number, number][],
        });
        actions.push({ shipId: "—", type: "DRAW_ZONE", reason: zone.name });
        summary = "Hormuz Exclusion Zone created. Vessels in the area will reroute automatically.";
    }

    else {
        summary = `Command not understood: "${command}".`;
        queryAnswer = "Try: reroute LNG carriers, hold all vessels, fuel status, fleet status, restrict Hormuz, emergency MV-7.";
    }

    return { summary, actions, queryAnswer };
}

function getTargetShips(cmd: string, fleet: any[]): any[] {
    if (cmd.includes("lng")) return fleet.filter(s => s.cargo?.toLowerCase().includes("lng"));
    if (cmd.includes("crude") || cmd.includes("oil") || cmd.includes("tanker"))
        return fleet.filter(s => s.cargo?.toLowerCase().includes("crude"));
    if (cmd.includes("container")) return fleet.filter(s => s.cargo?.toLowerCase().includes("container"));
    if (cmd.includes("bulk")) return fleet.filter(s => s.cargo?.toLowerCase().includes("bulk"));

    for (const ship of fleet) {
        if (cmd.includes(ship.name.toLowerCase()) || cmd.includes(ship.shipId.toLowerCase())) {
            return [ship];
        }
    }

    if (cmd.includes("all") || cmd.includes("every") || cmd.includes("fleet")) {
        return fleet.filter(s => s.status !== "stopped" && s.status !== "stranded");
    }

    if (cmd.includes("hormuz") || cmd.includes("strait")) {
        return fleet.filter(s => s.position[1] >= 55 && s.position[1] <= 57.5);
    }

    return [];
}

async function processWithAI(
    command: string,
    fleet: any[]
): Promise<{ summary: string; actions: ActionRecord[]; queryAnswer?: string } | null> {
    const axios = require("axios");
    const fleetSummary = fleet.map(s =>
        `${s.shipId} ${s.name}: cargo=${s.cargo}, status=${s.status}, fuel=${((s.fuel / 10000) * 100).toFixed(0)}%`
    ).join("\n");

    const res = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `You are a naval fleet command AI. Parse the user's command and reply ONLY with JSON:
{"intent":"reroute|hold|emergency|status|fuel|zone|unknown","targets":"all|lng|crude|containers|bulk|hormuz|<shipId>","summary":"one-line acknowledgment","queryAnswer":"only set for status/fuel queries, otherwise omit"}
No prose. No markdown.`,
            },
            { role: "user", content: `Fleet:\n${fleetSummary}\n\nCommand: ${command}` },
        ],
        max_tokens: 200,
        response_format: { type: "json_object" },
    }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 10000 });

    const parsed = JSON.parse(res.data.choices[0].message.content);

    // Re-run pattern matcher with the AI's parsed intent so it actually executes the action.
    const synthCmd = `${parsed.intent} ${parsed.targets}`;
    const result = await processNaturalCommand(synthCmd, fleet, []);
    return {
        summary: parsed.summary || result.summary,
        actions: result.actions,
        queryAnswer: parsed.queryAnswer || result.queryAnswer,
    };
}