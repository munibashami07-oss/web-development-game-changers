import { useState } from 'react';
import { useFleetStore } from '../store/fleetStore';
import type { Ship } from '../types';
import { api } from '../utils/api';
import { AIBriefing } from './AIBriefing';

import { BACKEND as BASE } from '../lib/api';

interface RouteCandidate {
    label: string;
    description: string;
    path: [number, number][];
    distanceNM: number;
    weatherExposureNM: number;
}

const PORTS: Record<string, { name: string; lat: number; lng: number }> = {
    'KWT-1': { name: 'Kuwait', lat: 29.48, lng: 48.34 },
    'BUS-1': { name: 'Bushehr', lat: 28.83, lng: 50.73 },
    'DMM-1': { name: 'Dammam', lat: 26.56, lng: 50.30 },
    'BAH-1': { name: 'Bahrain', lat: 26.50, lng: 50.55 },
    'DOH-1': { name: 'Doha', lat: 25.46, lng: 51.95 },
    'AUH-1': { name: 'Abu Dhabi', lat: 25.22, lng: 54.18 },
    'DXB-1': { name: 'Dubai', lat: 25.50, lng: 54.75 },
    'BND-1': { name: 'Bandar Abbas', lat: 26.62, lng: 56.11 },
    'SOH-1': { name: 'Sohar', lat: 24.72, lng: 57.02 },
    'MCT-1': { name: 'Muscat', lat: 23.92, lng: 58.58 },
};

function fuelColor(fuel: number) {
    if (fuel > 60) return 'var(--green)';
    if (fuel > 30) return 'var(--amber)';
    return 'var(--red)';
}

function statusColor(status: Ship['status']) {
    switch (status) {
        case 'NOMINAL': return 'var(--green)';
        case 'ALERT': return 'var(--amber)';
        case 'CRITICAL': return 'var(--red)';
        case 'DISTRESS': return 'var(--red)';
        case 'ANCHORED': return 'var(--cyan)';
        case 'REROUTING': return 'var(--orange)';
        case 'STRANDED': return 'var(--red)';
        case 'STOPPED': return 'var(--text-dim)';
        default: return 'var(--text-secondary)';
    }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 3440.065;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

async function sendDirective(ship: any, type: string, message: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const r = await fetch(`${BASE}/api/directives`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipId: ship.shipId, type, payload: { message } }),
        });
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err?.message || 'network error' };
    }
}

export function ShipDetail() {
    const { ships, selectedShipId } = useFleetStore();
    const ship: any = ships.find(s => s.shipId === selectedShipId);

    const [msg, setMsg] = useState('');
    const [sending, setSending] = useState(false);
    const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
    const [sentTick, setSentTick] = useState(0);
    const [routeOptions, setRouteOptions] = useState<RouteCandidate[] | null>(null);
    const [loadingRoutes, setLoadingRoutes] = useState(false);

    if (!ship) {
        return (
            <div className="no-ship">
                <div className="no-ship-icon">🛳</div>
                <div className="no-ship-text">SELECT A VESSEL<br />FROM THE REGISTRY</div>
            </div>
        );
    }
    const sendMessage = async () => {
        if (!msg.trim()) return;
        setSending(true);
        try {
            await api.postAlert({
                type: 'COMMAND_MESSAGE',
                shipId: ship.shipId,
                severity: 'medium',
                message: `[CMD → ${ship.name}] ${msg}`,
            });
            setSentTick(Date.now());
            setMsg('');
            setTimeout(() => setSentTick(0), 2500);
        } catch (err: any) {
            setToast({ text: `✗ Failed to transmit: ${err?.message || 'unknown error'}`, kind: 'error' });
            setTimeout(() => setToast(null), 4000);
        } finally {
            setSending(false);
        }
    };
    const destPort = ship.destination ? PORTS[ship.destination] : null;
    const distance = destPort ? haversine(ship.lat, ship.lng, destPort.lat, destPort.lng) : 0;
    const etaHours = ship.speed > 0 && distance > 0 ? distance / ship.speed : 0;
    const etaH = Math.floor(etaHours);
    const etaM = Math.floor((etaHours - etaH) * 60);

    return (
        <div className="ship-detail">
            <div className="ship-detail-header">
                <div>
                    <div className="ship-detail-name">{ship.name || ship.shipId}</div>
                    <div className="ship-detail-id">
                        {ship.shipId} · {(ship.cargo || 'unknown').toUpperCase()}
                    </div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <span style={{
                        background: `${statusColor(ship.status)}22`,
                        color: statusColor(ship.status),
                        border: `1px solid ${statusColor(ship.status)}`,
                        padding: '4px 10px', borderRadius: 2,
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        letterSpacing: 2,
                    }}>
                        {ship.status}
                    </span>
                </div>
            </div>

            {/* AI Briefing */}
            <AIBriefing shipId={ship.shipId} />

            {/* Captain bar */}
            {ship.captain && (
                <div style={{
                    padding: '8px 10px',
                    background: 'rgba(0, 212, 255, 0.06)',
                    border: '1px solid rgba(0, 212, 255, 0.2)',
                    borderRadius: 2,
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <div style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: 'rgba(0, 212, 255, 0.15)',
                        border: '1px solid var(--cyan)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)',
                    }}>
                        {ship.captain.split(' ').slice(-1)[0][0]}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1.5 }}>
                            COMMAND OFFICER
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                            {ship.captain}
                        </div>
                    </div>
                </div>
            )}

            {/* Insufficient fuel warning */}
            {ship.insufficientFuel && (
                <div style={{
                    padding: 8,
                    marginBottom: 10,
                    background: 'rgba(255, 51, 102, 0.1)',
                    border: '1px solid var(--red)',
                    borderRadius: 2,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--red)',
                    letterSpacing: 1,
                }}>
                    ⚠ INSUFFICIENT FUEL FOR PLANNED ROUTE
                </div>
            )}

            {/* Route */}
            {destPort && (
                <div style={{
                    padding: '10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 2,
                    marginBottom: 12,
                }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1.5, marginBottom: 6 }}>
                        ROUTE
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                            CURRENT
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, var(--cyan), var(--green))', position: 'relative' }}>
                            <div style={{
                                position: 'absolute', right: -4, top: -3,
                                width: 0, height: 0,
                                borderLeft: '6px solid var(--green)',
                                borderTop: '4px solid transparent',
                                borderBottom: '4px solid transparent',
                            }} />
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)' }}>
                            {destPort.name.toUpperCase()}
                        </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1.5 }}>DISTANCE</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--cyan)' }}>{distance.toFixed(1)} <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>nm</span></div>
                        </div>
                        <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1.5 }}>ETA</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--cyan)' }}>{etaH}h {etaM}m</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Telemetry */}
            <div className="detail-grid">
                <div className="detail-cell">
                    <div className="detail-cell-label">Speed</div>
                    <div className="detail-cell-value">{ship.speed?.toFixed(1)}<span className="detail-cell-unit">kts</span></div>
                </div>
                <div className="detail-cell">
                    <div className="detail-cell-label">Heading</div>
                    <div className="detail-cell-value">{ship.heading?.toFixed(0)}<span className="detail-cell-unit">°</span></div>
                </div>
                <div className="detail-cell">
                    <div className="detail-cell-label">Latitude</div>
                    <div className="detail-cell-value" style={{ fontSize: 14 }}>{ship.lat?.toFixed(4)}<span className="detail-cell-unit">°N</span></div>
                </div>
                <div className="detail-cell">
                    <div className="detail-cell-label">Longitude</div>
                    <div className="detail-cell-value" style={{ fontSize: 14 }}>{ship.lng?.toFixed(4)}<span className="detail-cell-unit">°E</span></div>
                </div>
            </div>

            {/* Fuel */}
            <div className="fuel-bar-container">
                <div className="fuel-bar-header">
                    <span className="fuel-label">Fuel Level</span>
                    <span className="fuel-pct" style={{ color: fuelColor(ship.fuel) }}>
                        {ship.fuel?.toFixed(1)}%
                    </span>
                </div>
                <div className="fuel-bar">
                    <div className="fuel-bar-fill" style={{
                        width: `${ship.fuel}%`,
                        background: fuelColor(ship.fuel),
                        boxShadow: `0 0 6px ${fuelColor(ship.fuel)}`,
                    }} />
                </div>
            </div>

            <div style={{ marginBottom: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: 2, marginTop: 4 }}>
                ISSUE DIRECTIVE
            </div>

            <div className="directive-grid">
                <button className="directive-btn reroute" onClick={async () => {
                    const r = await sendDirective(ship, 'REROUTE', 'Alter course to safe corridor');
                    setToast(r.ok
                        ? { text: `✓ REROUTE dispatched to ${ship.name} — awaiting captain ack`, kind: 'ok' }
                        : { text: `✗ REROUTE failed: ${r.error}`, kind: 'error' });
                    setTimeout(() => setToast(null), 4000);
                }}>
                    REROUTE
                </button>
                <button className="directive-btn hold" onClick={async () => {
                    const r = await sendDirective(ship, 'HOLD', 'Maintain position and hold');
                    setToast(r.ok
                        ? { text: `✓ HOLD dispatched to ${ship.name} — awaiting captain ack`, kind: 'ok' }
                        : { text: `✗ HOLD failed: ${r.error}`, kind: 'error' });
                    setTimeout(() => setToast(null), 4000);
                }}>
                    HOLD
                </button>
                <button className="directive-btn divert" onClick={async () => {
                    const r = await sendDirective(ship, 'DIVERT', 'Divert to nearest safe port');
                    setToast(r.ok
                        ? { text: `✓ DIVERT dispatched to ${ship.name} — awaiting captain ack`, kind: 'ok' }
                        : { text: `✗ DIVERT failed: ${r.error}`, kind: 'error' });
                    setTimeout(() => setToast(null), 4000);
                }}>
                    DIVERT
                </button>
                <button className="directive-btn emergency" onClick={async () => {
                    const r = await sendDirective(ship, 'EMERGENCY', 'EMERGENCY PROTOCOL ACTIVATED');
                    setToast(r.ok
                        ? { text: `✓ EMERGENCY dispatched to ${ship.name}`, kind: 'ok' }
                        : { text: `✗ EMERGENCY failed: ${r.error}`, kind: 'error' });
                    setTimeout(() => setToast(null), 4000);
                }}>
                    ⚠ EMERGENCY
                </button>
            </div>

            {toast && (
                <div style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    borderRadius: 2,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: 1,
                    background: toast.kind === 'ok' ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 51, 102, 0.12)',
                    border: `1px solid ${toast.kind === 'ok' ? 'var(--green)' : 'var(--red)'}`,
                    color: toast.kind === 'ok' ? 'var(--green)' : 'var(--red)',
                }}>
                    {toast.text}
                </div>
            )}

            {/* Multi-route options (bonus): generate alternative paths and let operator pick */}
            <div style={{ marginTop: 12 }}>
                {!routeOptions ? (
                    <button
                        onClick={async () => {
                            setLoadingRoutes(true);
                            try {
                                const r = await fetch(`${BASE}/api/routes/${ship.shipId}`);
                                const data = await r.json();
                                setRouteOptions(data.routes || []);
                            } catch { /* noop */ }
                            setLoadingRoutes(false);
                        }}
                        disabled={loadingRoutes}
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: '1px dashed var(--cyan)',
                            color: 'var(--cyan)',
                            padding: '6px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: 1.5,
                            cursor: 'pointer',
                            borderRadius: 2,
                        }}
                    >
                        {loadingRoutes ? 'COMPUTING...' : '🗺 SHOW ROUTE OPTIONS'}
                    </button>
                ) : (
                    <div style={{
                        padding: 8,
                        background: 'rgba(0, 212, 255, 0.06)',
                        border: '1px solid var(--cyan)',
                        borderRadius: 2,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--cyan)' }}>
                                ROUTE OPTIONS ({routeOptions.length})
                            </span>
                            <span
                                onClick={() => setRouteOptions(null)}
                                style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}
                            >✕ CLOSE</span>
                        </div>
                        {routeOptions.length === 0 && (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', padding: 4 }}>
                                No alternative routes available.
                            </div>
                        )}
                        {routeOptions.map(opt => (
                            <div key={opt.label} style={{
                                padding: 6,
                                marginBottom: 4,
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 2,
                            }}>
                                <div style={{
                                    fontFamily: 'var(--font-mono)', fontSize: 11,
                                    color: 'var(--text-primary)', letterSpacing: 1, marginBottom: 2,
                                }}>
                                    {opt.label.replace(/_/g, ' ').toUpperCase()}
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                    {opt.description}
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
                                    {opt.distanceNM.toFixed(0)} NM
                                    {opt.weatherExposureNM > 0 && (
                                        <> · <span style={{ color: 'var(--amber)' }}>
                                            {opt.weatherExposureNM.toFixed(0)} NM in storms
                                        </span></>
                                    )}
                                </div>
                                <button
                                    onClick={async () => {
                                        await fetch(`${BASE}/api/routes/${ship.shipId}/select`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ label: opt.label }),
                                        });
                                        setRouteOptions(null);
                                    }}
                                    style={{
                                        marginTop: 4, width: '100%',
                                        background: 'rgba(0, 212, 255, 0.15)',
                                        border: '1px solid var(--cyan)',
                                        color: 'var(--cyan)', padding: 4,
                                        fontFamily: 'var(--font-mono)', fontSize: 9,
                                        letterSpacing: 1, cursor: 'pointer', borderRadius: 2,
                                    }}>
                                    ▶ ADOPT THIS ROUTE
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: 16, marginBottom: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: 2 }}>
                ▸ DIRECT MESSAGE
            </div>

            <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 2,
                padding: 8,
            }}>
                <textarea
                    value={msg}
                    onChange={e => setMsg(e.target.value)}
                    placeholder={`Compose message to ${ship.name}...`}
                    style={{
                        width: '100%',
                        minHeight: 60,
                        background: 'var(--bg-void)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        padding: 8,
                        resize: 'vertical',
                        outline: 'none',
                        borderRadius: 2,
                    }}
                />
                <button
                    onClick={sendMessage}
                    disabled={sending || !msg.trim()}
                    style={{
                        width: '100%',
                        marginTop: 6,
                        background: sentTick ? 'rgba(0, 255, 136, 0.15)' : 'rgba(0, 212, 255, 0.12)',
                        border: `1px solid ${sentTick ? 'var(--green)' : 'var(--cyan)'}`,
                        color: sentTick ? 'var(--green)' : 'var(--cyan)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        letterSpacing: 2,
                        padding: '8px',
                        cursor: !msg.trim() || sending ? 'not-allowed' : 'pointer',
                        opacity: !msg.trim() ? 0.4 : 1,
                        borderRadius: 2,
                    }}
                >
                    {sentTick ? '✓ TRANSMITTED' : sending ? 'TRANSMITTING...' : `▶ TRANSMIT TO ${ship.shipId}`}
                </button>
            </div>
        </div>
    );
}
