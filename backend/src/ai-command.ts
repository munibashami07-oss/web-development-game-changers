// backend/src/ai-command.ts
// Parses free-form Command instructions into structured fleet actions.
// "reroute all LNG carriers away from Hormuz" → list of REROUTE directives

import OpenAI from "openai";
import { applyDirective } from "./simulator";
import { addAlert } from "./alerts";

const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

interface CommandResult {
    summary: string;
    actions: Array<{ shipId: string; type: string; payload?: any; reason: string }>;
    queryAnswer?: string;
}

export async function processNaturalCommand(command: string, fleet: any[], zones: any[]): Promise<CommandResult> {
    if (!openai) {
        return parseDeterministic(command, fleet);
    }

    try {
        const fleetSummary = fleet.map(s => ({
            shipId: s.shipId,
            name: s.name,
            cargo: s.cargo,
            destination: s.destination,
            fuelPct: ((s.fuel / 10000) * 100).toFixed(1),
            status: s.status,
            speed: s.speed,
            position: [s.position[0].toFixed(2), s.position[1].toFixed(2)],
        }));

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 600,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are a fleet command parser. Convert a natural-language operator command into structured actions.

Possible action types:
- REROUTE — recompute path to current destination, avoiding hazards
- HOLD — anchor in place
- DIVERT — change destination port (provide payload.toPort = port code)
- EMERGENCY — emergency protocol

Available port codes: KWT-1, BUS-1, DMM-1, BAH-1, DOH-1, AUH-1, DXB-1, BND-1, SOH-1, MCT-1.

If the command is a QUESTION (e.g. "which ships are low on fuel"), set actions=[] and put the answer in queryAnswer.

Output strictly this JSON shape:
{
  "summary": "one-sentence summary of what will happen",
  "actions": [{"shipId": "MV-X", "type": "REROUTE", "payload": {"toPort": "DXB-1"}, "reason": "why this ship"}],
  "queryAnswer": "only if the command was a question"
}`,
                },
                {
                    role: "user",
                    content: `Fleet state: ${JSON.stringify(fleetSummary)}\n\nActive restricted zones: ${zones.length}\n\nOperator command: "${command}"`,
                },
            ],
        });

        const raw = completion.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(raw) as CommandResult;

        // Apply each action
        for (const action of parsed.actions || []) {
            applyDirective(action.shipId, action.type, action.payload || {});
            addAlert({
                type: `AI_DIRECTIVE_${action.type}`,
                shipId: action.shipId,
                severity: action.type === "EMERGENCY" ? "critical" : "medium",
                message: `[AI Command] ${action.reason}`,
            });
        }

        return parsed;
    } catch (err: any) {
        console.error("Command AI failed:", err);
        return parseDeterministic(command, fleet);
    }
}

// Fallback: keyword matching
function parseDeterministic(command: string, fleet: any[]): CommandResult {
    const lower = command.toLowerCase();
    const actions: CommandResult["actions"] = [];

    let targets = fleet;
    if (/lng/.test(lower)) targets = targets.filter(s => /lng/i.test(s.cargo));
    if (/oil|crude/.test(lower)) targets = targets.filter(s => /oil|crude/i.test(s.cargo));
    if (/container/.test(lower)) targets = targets.filter(s => /container/i.test(s.cargo));
    if (/low.*fuel|critical/.test(lower)) targets = targets.filter(s => s.fuel / 10000 < 0.25);

    let directiveType: string | null = null;
    if (/reroute/.test(lower)) directiveType = "REROUTE";
    else if (/hold|stop|anchor/.test(lower)) directiveType = "HOLD";
    else if (/divert/.test(lower)) directiveType = "DIVERT";
    else if (/emergency/.test(lower)) directiveType = "EMERGENCY";

    if (directiveType) {
        for (const ship of targets) {
            applyDirective(ship.shipId, directiveType, {});
            actions.push({
                shipId: ship.shipId,
                type: directiveType,
                reason: `Matched keyword filter on "${command}"`,
            });
        }
        return {
            summary: `Issued ${directiveType} to ${actions.length} vessel(s) (deterministic parser).`,
            actions,
        };
    }

    // Question fallback
    if (/low.*fuel/.test(lower)) {
        const low = fleet.filter(s => s.fuel / 10000 < 0.25).map(s => `${s.name} (${((s.fuel / 10000) * 100).toFixed(1)}%)`);
        return {
            summary: "Fuel status query",
            actions: [],
            queryAnswer: low.length === 0 ? "No vessels currently below 25% fuel." : `Vessels low on fuel: ${low.join(", ")}.`,
        };
    }

    return {
        summary: "Could not parse command (no AI available, keyword fallback found nothing).",
        actions: [],
    };
}