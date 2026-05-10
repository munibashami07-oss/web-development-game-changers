import { useEffect, useRef } from 'react';
import { useFleetStore } from '../store/fleetStore';
import { normalizeFleet } from '../utils/normalize';

const WS_URL = (
    (import.meta as any).env?.VITE_WS_URL ||
    (import.meta as any).env?.VITE_API_URL ||
    'https://precious-prosperity-production-4daa.up.railway.app'
).replace(/^http/, 'ws');
export function useWebSocket() {
    const {
        setShips, addAlert, setAlerts, setConnected, role, captainShipId,
        addZone, removeZone, setZones, acknowledgeAlert, setLatencyMs,
    } = useFleetStore();
    const wsRef = useRef<WebSocket | null>(null);
    const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mountedRef = useRef(true);

    const connect = () => {
        if (!mountedRef.current) return;
        try {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                if (mountedRef.current) {
                    setConnected(true);
                    ws.send(JSON.stringify({
                        type: 'AUTH',
                        role,
                        shipId: role === 'captain' ? captainShipId : undefined,
                    }));
                    if (pingRef.current) clearInterval(pingRef.current);
                    pingRef.current = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'PING', t: Date.now() }));
                        }
                    }, 2000);
                }
            };

            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    const now = Date.now();
                    if (typeof msg.serverTime === 'number') {
                        const oneWay = now - msg.serverTime;
                        if (oneWay >= 0 && oneWay < 10000) setLatencyMs(oneWay);
                    }
                    if (msg.type === 'FLEET_UPDATE' && Array.isArray(msg.ships)) {
                        setShips(normalizeFleet(msg.ships));
                    } else if (msg.type === 'INITIAL_STATE') {
                        if (Array.isArray(msg.ships)) setShips(normalizeFleet(msg.ships));
                        if (Array.isArray(msg.alerts)) setAlerts(msg.alerts);
                        if (Array.isArray(msg.zones)) setZones(msg.zones);
                    } else if (msg.type === 'ALERT' && msg.alert) {
                        addAlert(msg.alert);
                    } else if (msg.type === 'ALERT_ACK' && msg.alertId) {
                        acknowledgeAlert(msg.alertId);
                    } else if (msg.type === 'ZONE_ADDED' && msg.zone) {
                        addZone(msg.zone);
                    } else if (msg.type === 'ZONE_REMOVED' && msg.id) {
                        removeZone(msg.id);
                    } else if (msg.type === 'PONG') {
                        const rtt = now - msg.clientTime;
                        if (rtt >= 0 && rtt < 10000) setLatencyMs(Math.round(rtt / 2));
                    }
                } catch { }
            };

            ws.onerror = () => { };

            ws.onclose = () => {
                if (!mountedRef.current) return;
                setConnected(false);
                if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
                retryRef.current = setTimeout(connect, 3000);
            };
        } catch {
            retryRef.current = setTimeout(connect, 3000);
        }
    };

    useEffect(() => {
        mountedRef.current = true;
        connect();
        return () => {
            mountedRef.current = false;
            if (retryRef.current) clearTimeout(retryRef.current);
            if (pingRef.current) clearInterval(pingRef.current);
            wsRef.current?.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, captainShipId]);
}