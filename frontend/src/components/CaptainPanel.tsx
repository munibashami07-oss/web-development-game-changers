// src/components/CaptainPanel.tsx
import { useEffect, useState } from 'react';
import { useFleetStore } from '../store/fleetStore';

const BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

type AssistKind = 'fuel' | 'medical' | 'escort' | 'cargo';

const KIND_LABEL: Record<AssistKind, string> = {
    fuel: 'Fuel transfer',
    medical: 'Medical aid',
    escort: 'Escort',
    cargo: 'Cargo offload',
};

export function CaptainPanel() {
    const { ships, captainShipId } = useFleetStore();
    const ship: any = ships.find(s => s.shipId === captainShipId);
    const [escalateMsg, setEscalateMsg] = useState('');
    const [showEscalate, setShowEscalate] = useState(false);
    const [busy, setBusy] = useState(false);

    // Ship-to-ship assist state
    const [showAssist, setShowAssist] = useState(false);
    const [assistKind, setAssistKind] = useState<AssistKind>('fuel');
    const [assistMsg, setAssistMsg] = useState('');
    const [nearby, setNearby] = useState<any[]>([]);
    const [assistTarget, setAssistTarget] = useState<string>('');

    useEffect(() => {
        if (!showAssist || !captainShipId) return;
        let cancelled = false;
        fetch(`${BASE}/api/assist/nearby/${captainShipId}?rangeKm=80`)
            .then(r => r.json())
            .then(data => { if (!cancelled) setNearby(data.ships || []); })
            .catch(() => { });
        return () => { cancelled = true; };
    }, [showAssist, captainShipId]);

    if (!ship) return null;

    const directive = ship.pendingDirective;
    const incomingAssist = ship.pendingAssistRequest;

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

    const sendAssistRequest = async () => {
        if (!assistTarget) return;
        setBusy(true);
        await fetch(`${BASE}/api/assist/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fromShipId: ship.shipId,
                toShipId: assistTarget,
                kind: assistKind,
                message: assistMsg || `${ship.name} requests ${assistKind}`,
            }),
        });
        setBusy(false);
        setShowAssist(false);
        setAssistMsg('');
        setAssistTarget('');
    };

    const respondAssist = async (accept: boolean) => {
        setBusy(true);
        await fetch(`${BASE}/api/assist/${ship.shipId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accept }),
        });
        setBusy(false);
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

            {/* Incoming aid request from another ship */}
            {incomingAssist && (
                <div style={{
                    margin: 14,
                    padding: 12,
                    background: 'rgba(0, 212, 255, 0.08)',
                    border: '1px solid var(--cyan)',
                    borderRadius: 2,
                }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--cyan)' }}>
                        ▸ INCOMING AID REQUEST
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)', marginTop: 4 }}>
                        {KIND_LABEL[incomingAssist.kind as AssistKind] || incomingAssist.kind}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                        FROM: {incomingAssist.fromShipName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-primary)', marginTop: 6 }}>
                        {incomingAssist.message}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
                        <button onClick={() => respondAssist(true)} disabled={busy} style={{
                            background: 'rgba(0, 255, 136, 0.15)', border: '1px solid var(--green)', color: 'var(--green)',
                            padding: '8px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5,
                            cursor: 'pointer', borderRadius: 2,
                        }}>
                            ✓ ACCEPT
                        </button>
                        <button onClick={() => respondAssist(false)} disabled={busy} style={{
                            background: 'transparent', border: '1px solid var(--text-dim)', color: 'var(--text-secondary)',
                            padding: '8px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5,
                            cursor: 'pointer', borderRadius: 2,
                        }}>
                            ✕ DECLINE
                        </button>
                    </div>
                </div>
            )}

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

            {/* Request Assistance from another ship */}
            <div style={{ padding: '0 14px 14px' }}>
                {!showAssist ? (
                    <button onClick={() => setShowAssist(true)} style={{
                        width: '100%',
                        background: 'transparent',
                        border: '1px solid var(--cyan)',
                        color: 'var(--cyan)',
                        padding: '8px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        letterSpacing: 1.5,
                        cursor: 'pointer',
                        borderRadius: 2,
                    }}>
                        ⛑ REQUEST ASSISTANCE
                    </button>
                ) : (
                    <div style={{
                        padding: 10,
                        background: 'rgba(0, 212, 255, 0.06)',
                        border: '1px solid var(--cyan)',
                        borderRadius: 2,
                    }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--cyan)', marginBottom: 8 }}>
                            ⛑ REQUEST ASSISTANCE
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
                            {(['fuel', 'medical', 'escort', 'cargo'] as AssistKind[]).map(k => (
                                <button key={k} onClick={() => setAssistKind(k)} style={{
                                    background: assistKind === k ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                                    border: `1px solid ${assistKind === k ? 'var(--cyan)' : 'var(--border)'}`,
                                    color: assistKind === k ? 'var(--cyan)' : 'var(--text-secondary)',
                                    padding: 5,
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 9,
                                    letterSpacing: 1,
                                    cursor: 'pointer',
                                    borderRadius: 2,
                                }}>{KIND_LABEL[k].toUpperCase()}</button>
                            ))}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 4 }}>
                            NEARBY VESSELS ({nearby.length}):
                        </div>
                        <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 6 }}>
                            {nearby.length === 0 && (
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', padding: 4 }}>
                                    No vessels in range.
                                </div>
                            )}
                            {nearby.map((s: any) => (
                                <div key={s.shipId}
                                    onClick={() => setAssistTarget(s.shipId)}
                                    style={{
                                        padding: 5,
                                        marginBottom: 2,
                                        background: assistTarget === s.shipId ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                                        border: `1px solid ${assistTarget === s.shipId ? 'var(--cyan)' : 'var(--border)'}`,
                                        cursor: 'pointer',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 10,
                                        borderRadius: 2,
                                    }}>
                                    <span style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                                    <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>{s.shipId}</span>
                                </div>
                            ))}
                        </div>
                        <textarea
                            value={assistMsg}
                            onChange={e => setAssistMsg(e.target.value)}
                            placeholder="Brief message (optional)..."
                            style={{
                                width: '100%', minHeight: 40,
                                background: 'var(--bg-void)', border: '1px solid var(--border)',
                                color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
                                fontSize: 10, padding: 4, borderRadius: 2,
                            }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
                            <button onClick={() => { setShowAssist(false); setAssistTarget(''); }} style={{
                                background: 'transparent', border: '1px solid var(--border)',
                                color: 'var(--text-secondary)', padding: 5, fontFamily: 'var(--font-mono)',
                                fontSize: 10, cursor: 'pointer', borderRadius: 2,
                            }}>CANCEL</button>
                            <button onClick={sendAssistRequest} disabled={busy || !assistTarget} style={{
                                background: 'rgba(0, 212, 255, 0.2)', border: '1px solid var(--cyan)',
                                color: 'var(--cyan)', padding: 5, fontFamily: 'var(--font-mono)',
                                fontSize: 10, cursor: 'pointer', borderRadius: 2,
                                opacity: !assistTarget ? 0.4 : 1,
                            }}>SEND REQUEST</button>
                        </div>
                    </div>
                )}
            </div>

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
