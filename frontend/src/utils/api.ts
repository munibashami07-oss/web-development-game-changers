// src/utils/api.ts
import { normalizeFleet } from './normalize';

import { BACKEND as BASE } from '../lib/api';

export const api = {
    async getFleet() {
        const r = await fetch(`${BASE}/api/fleet`);
        const data = await r.json();
        if (data.ships) data.ships = normalizeFleet(data.ships);
        return data;
    },
    async getAlerts() {
        const r = await fetch(`${BASE}/api/alerts`);
        return r.json();
    },
    async getZones() {
        const r = await fetch(`${BASE}/api/zones`);
        return r.json();
    },
    async getHistory() {
        const r = await fetch(`${BASE}/api/history`);
        const data = await r.json();
        if (data.snapshots) {
            data.snapshots = data.snapshots.map((snap: any) => ({
                ...snap,
                ships: snap.ships ? normalizeFleet(snap.ships) : [],
            }));
        }
        return data;
    },
    async postAlert(data: object) {
        const r = await fetch(`${BASE}/api/alerts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return r.json();
    },
    async postZone(data: object) {
        const r = await fetch(`${BASE}/api/zones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return r.json();
    },
    async deleteZone(id: string) {
        await fetch(`${BASE}/api/zones/${id}`, { method: 'DELETE' });
    },
};