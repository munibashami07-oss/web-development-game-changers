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
        let client: Client = { ws, role: "command" };
        clients.push(client);

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
            } catch (e) { }
        });

        ws.on("close", () => {
            clients = clients.filter((c) => c !== client);
        });
    });

    console.log("WebSocket server initialized");
}

export function broadcast(msg: object) {
    const data = JSON.stringify(msg);
    for (const client of clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
            if ((msg as any).type === "FLEET_UPDATE" && client.role === "captain") {
                const fleet = (msg as any).ships;
                const ship = fleet.find((s: any) => s.shipId === client.shipId);
                if (ship) {
                    client.ws.send(JSON.stringify({ type: "FLEET_UPDATE", ships: [ship], timestamp: (msg as any).timestamp }));
                }
            } else {
                client.ws.send(data);
            }
        }
    }
}