// src/components/CaptainPanel.tsx
import { useState } from 'react';
import { useFleetStore } from '../store/fleetStore';

const BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export function CaptainPanel() {
    const { ships, captainShipId } = useFleetStore();
    const ship: any = ships.find(s => s.shipId === captainShipId);
    const [escalateMsg, setEscalateMsg] = useState('');
    const [showEscalate, setShowEscalate] = useState(false);
    const [busy, setBusy] = useState(false);

    if (!ship) return null;

    const directive = ship.pendingDirective;

    const accept = async () => {
        setBusy(true);
        await fetch(`${BASE}/api/directives/${ship.shipId}/accept`, { method: 'POST' });
        setBusy(false);
    };

    const escalate = async () => {
        if (!escalateMsg.trim()) return;
        setBusy(true);
        await fetch(`${BASE}/api/directives/${ship.shipId}/escalate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: escalateMsg }),
        });
        setBusy(false);
        setShowEscalate(false);
        setEscalateMsg('');
    };

    return (
        <div className="left-panel" style={{ borderRight: '2px solid var(--orange)' }}>
            <div style={{
                padding: '14px',
                background: 'linear-gradient(180deg, rgba(255, 102, 0, 0.12), transparent)',
                borderBottom: '1px solid var(--orange)',
            }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--orange)' }}>
                    ⚓ CAPTAIN'S BRIDGE
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                    {ship.name}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {ship.captain || '—'}
                </div>
            </div>

            {directive ? (
                <div style={{
                    margin: 14,
                    padding: 12,
                    background: 'rgba(255, 102, 0, 0.1)',
                    border: '1px solid var(--orange)',
                    borderRadius: 2,
                    animation: 'pulse-border 1.5s ease-in-out infinite',
                }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--orange)' }}>
                        ▸ INCOMING DIRECTIVE
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--orange)', marginTop: 4 }}>
                        {directive.type}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 6 }}>
                        {directive.message}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginTop: 6 }}>
                        FROM: {directive.from || 'COMMAND'}
                    </div>

                    {!showEscalate ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
                            <button onClick={accept} disabled={busy} style={{
                                background: 'rgba(0, 255, 136, 0.15)',
                                border: '1px solid var(--green)',
                                color: 'var(--green)',
                                padding: '8px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                letterSpacing: 1.5,
                                cursor: 'pointer',
                                borderRadius: 2,
                            }}>
                                ✓ ACCEPT
                            </button>
                            <button onClick={() => setShowEscalate(true)} disabled={busy} style={{
                                background: 'rgba(255, 51, 102, 0.15)',
                                border: '1px solid var(--red)',
                                color: 'var(--red)',
                                padding: '8px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                letterSpacing: 1.5,
                                cursor: 'pointer',
                                borderRadius: 2,
                            }}>
                                ⚠ ESCALATE
                            </button>
                        </div>
                    ) : (
                        <div style={{ marginTop: 10 }}>
                            <textarea
                                value={escalateMsg}
                                onChange={e => setEscalateMsg(e.target.value)}
                                placeholder="Describe distress / inability to comply..."
                                style={{
                                    width: '100%',
                                    minHeight: 60,
                                    background: 'var(--bg-void)',
                                    border: '1px solid var(--red)',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 11,
                                    padding: 6,
                                    borderRadius: 2,
                                }}
                            />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                                <button onClick={() => setShowEscalate(false)} style={{
                                    background: 'transparent',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-secondary)',
                                    padding: 6,
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 10,
                                    cursor: 'pointer',
                                    borderRadius: 2,
                                }}>CANCEL</button>
                                <button onClick={escalate} disabled={busy || !escalateMsg.trim()} style={{
                                    background: 'rgba(255, 51, 102, 0.2)',
                                    border: '1px solid var(--red)',
                                    color: 'var(--red)',
                                    padding: 6,
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 10,
                                    cursor: 'pointer',
                                    borderRadius: 2,
                                }}>⚠ TRANSMIT MAYDAY</button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    NO PENDING DIRECTIVES
                </div>
            )}

            {/* Ship telemetry */}
            <div style={{ padding: '0 14px' }}>
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
                        <div className="detail-cell-label">Fuel</div>
                        <div className="detail-cell-value">{ship.fuel?.toFixed(1)}<span className="detail-cell-unit">%</span></div>
                    </div>
                    <div className="detail-cell">
                        <div className="detail-cell-label">Status</div>
                        <div className="detail-cell-value" style={{ fontSize: 12 }}>{ship.status}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
