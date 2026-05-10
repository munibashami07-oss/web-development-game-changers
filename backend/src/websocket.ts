// backend/src/websocket.ts
// Stamps every broadcast with serverTime for client-side latency measurement.
// Sends INITIAL_STATE on connect so freshly opened tabs are in sync immediately.

import { WebSocketServer, WebSocket } from "ws";
import http from "http";

interface Client {
    ws: WebSocket;
    role: "command" | "captain";
    shipId?: string;
}

let clients: Client[] = [];
let wss: WebSocketServer;

export function initWebSocket(server: http.Server) {
    wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
        const client: Client = { ws, role: "command" };
        clients.push(client);

        try {
            const { getFleet } = require("./simulator");
            const { getAlerts } = require("./alerts");
            const { getZones } = require("./zones");
            ws.send(JSON.stringify({
                type: "INITIAL_STATE",
                ships: getFleet(),
                alerts: getAlerts(),
                zones: getZones(),
                serverTime: Date.now(),
            }));
        } catch { }

        ws.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === "AUTH") {
                    client.role = msg.role;
                    client.shipId = msg.shipId;
                }
                if (msg.type === "DRAW_ZONE") {
                    const { addZone } = require("./zones");
                    const zone = addZone(msg.zone);
                    broadcast({ type: "ZONE_ADDED", zone });
                }
                if (msg.type === "ACK_ALERT") {
                    const { acknowledgeAlert } = require("./alerts");
                    acknowledgeAlert(msg.alertId);
                }
                if (msg.type === "PING") {
                    ws.send(JSON.stringify({ type: "PONG", clientTime: msg.t, serverTime: Date.now() }));
                }
            } catch (e) { }
        });

        ws.on("close", () => {
            clients = clients.filter((c) => c !== client);
        });
    });

    console.log("WebSocket server initialized");
}

export function broadcast(msg: any) {
    const stamped = { ...msg, serverTime: Date.now() };
    const data = JSON.stringify(stamped);
    for (const client of clients) {
        if (client.ws.readyState !== WebSocket.OPEN) continue;
        if (stamped.type === "FLEET_UPDATE" && client.role === "captain") {
            const fleet = stamped.ships;
            const ship = fleet.find((s: any) => s.shipId === client.shipId);
            if (ship) {
                client.ws.send(JSON.stringify({
                    type: "FLEET_UPDATE",
                    ships: [ship],
                    timestamp: stamped.timestamp,
                    serverTime: stamped.serverTime,
                }));
            }
        } else {
            client.ws.send(data);
        }
    }
}

export function getClientCount() { return clients.length; }