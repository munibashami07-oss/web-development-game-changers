// src/hooks/useWebSocket.ts
import { useEffect, useRef } from 'react';
import { useFleetStore } from '../store/fleetStore';
import { normalizeFleet } from '../utils/normalize';

const WS_URL = (
    (import.meta as any).env?.VITE_WS_URL ||
    (import.meta as any).env?.VITE_API_URL ||
    'http://localhost:3001'
).replace(/^http/, 'ws');

export function useWebSocket() {
    const { setShips, addAlert, setConnected, role, captainShipId } = useFleetStore();
    const wsRef = useRef<WebSocket | null>(null);
    const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    const connect = () => {
        if (!mountedRef.current) return;
        try {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                if (mountedRef.current) {
                    setConnected(true);
                    // Send AUTH with current role
                    ws.send(JSON.stringify({
                        type: 'AUTH',
                        role,
                        shipId: role === 'captain' ? captainShipId : undefined,
                    }));
                }
            };

            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'FLEET_UPDATE' && Array.isArray(msg.ships)) {
                        setShips(normalizeFleet(msg.ships));
                    } else if (msg.type === 'ALERT' && msg.alert) {
                        addAlert(msg.alert);
                    } else if (msg.type === 'INITIAL_STATE') {
                        if (Array.isArray(msg.ships)) setShips(normalizeFleet(msg.ships));
                    }
                } catch { }
            };

            ws.onerror = () => { };

            ws.onclose = () => {
                if (!mountedRef.current) return;
                setConnected(false);
                retryRef.current = setTimeout(connect, 3000);
            };
        } catch {
            retryRef.current = setTimeout(connect, 3000);
        }
    };

    // Reconnect when role changes
    useEffect(() => {
        mountedRef.current = true;
        connect();
        return () => {
            mountedRef.current = false;
            if (retryRef.current) clearTimeout(retryRef.current);
            wsRef.current?.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, captainShipId]);
}