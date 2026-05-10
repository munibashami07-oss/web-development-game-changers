import { create } from 'zustand';
import type { Ship, Alert, Zone, Snapshot, UserRole } from '../types';

interface FleetState {
    ships: Ship[];
    alerts: Alert[];
    zones: Zone[];
    history: Snapshot[];
    selectedShipId: string | null;
    role: UserRole;
    captainShipId: string | null;
    playbackTime: number | null;
    isConnected: boolean;
    latencyMs: number | null;

    setShips: (ships: Ship[]) => void;
    addAlert: (alert: Alert) => void;
    setAlerts: (alerts: Alert[]) => void;
    acknowledgeAlert: (id: string) => void;
    addZone: (zone: Zone) => void;
    setZones: (zones: Zone[]) => void;
    removeZone: (id: string) => void;
    setHistory: (snapshots: Snapshot[]) => void;
    selectShip: (id: string | null) => void;
    setRole: (role: UserRole, shipId?: string) => void;
    setPlaybackTime: (t: number | null) => void;
    setConnected: (v: boolean) => void;
    setLatencyMs: (ms: number | null) => void;
}

export const useFleetStore = create<FleetState>((set) => ({
    ships: [],
    alerts: [],
    zones: [],
    history: [],
    selectedShipId: null,
    role: 'command',
    captainShipId: null,
    playbackTime: null,
    isConnected: false,
    latencyMs: null,

    setShips: (ships) => set({ ships }),
    addAlert: (alert) => set((s) => {
        if (s.alerts.some(a => a.id === alert.id)) return {};
        return { alerts: [alert, ...s.alerts].slice(0, 200) };
    }),
    setAlerts: (alerts) => set({ alerts }),
    acknowledgeAlert: (id) =>
        set((s) => ({
            alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
        })),
    addZone: (zone) => set((s) => {
        if (s.zones.some(z => z.id === zone.id)) return {};
        return { zones: [...s.zones, zone] };
    }),
    setZones: (zones) => set({ zones }),
    removeZone: (id) => set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),
    setHistory: (snapshots) => set({ history: snapshots }),
    selectShip: (id) => set({ selectedShipId: id }),
    setRole: (role, shipId) => set({ role, captainShipId: shipId || null }),
    setPlaybackTime: (t) => set({ playbackTime: t }),
    setConnected: (v) => set({ isConnected: v }),
    setLatencyMs: (ms) => set({ latencyMs: ms }),
}));