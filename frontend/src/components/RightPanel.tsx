import { useState, useEffect } from 'react';
import { useFleetStore } from '../store/fleetStore';
import { AlertFeed } from './AlertFeed';
import { ShipDetail } from './ShipDetail';
import { api } from '../utils/api';

export function RightPanel() {
    const [tab, setTab] = useState<'alerts' | 'ship' | 'distress'>('alerts');
    const { alerts, selectedShipId } = useFleetStore();
    const unack = alerts.filter(a => !a.acknowledged).length;

    // Auto-switch to VESSEL tab when a ship is selected
    useEffect(() => {
        if (selectedShipId) setTab('ship');
    }, [selectedShipId]);

    return (
        <div className="right-panel">
            <div className="tabs">
                <div className={`tab ${tab === 'alerts' ? 'active' : ''}`} onClick={() => setTab('alerts')}>
                    ALERTS {unack > 0 && <span style={{ color: 'var(--red)' }}>({unack})</span>}
                </div>
                <div className={`tab ${tab === 'ship' ? 'active' : ''}`} onClick={() => setTab('ship')}>
                    VESSEL {selectedShipId && <span style={{ color: 'var(--cyan)', fontSize: 9 }}>●</span>}
                </div>
                <div className={`tab ${tab === 'distress' ? 'active' : ''}`} onClick={() => setTab('distress')}>
                    COMMS
                </div>
            </div>

            {tab === 'alerts' && (
                <>
                    <div className="panel-header">
                        <div className="panel-header-icon" style={{ background: unack > 0 ? 'var(--red)' : 'var(--cyan)', boxShadow: unack > 0 ? '0 0 6px var(--red)' : undefined }} />
                        <span className="panel-title">Alert Feed</span>
                        <span className="panel-count">{unack} ACTIVE</span>
                    </div>
                    <AlertFeed />
                </>
            )}

            {tab === 'ship' && (
                <>
                    <div className="panel-header">
                        <div className="panel-header-icon" />
                        <span className="panel-title">{selectedShipId || 'No Selection'}</span>
                    </div>
                    <ShipDetail />
                </>
            )}

            {tab === 'distress' && <DistressTab />}
        </div>
    );
}

function DistressTab() {
    const [msg, setMsg] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const { selectedShipId } = useFleetStore();

    const send = async () => {
        if (!msg.trim()) return;
        setSending(true);
        await api.postAlert({
            type: 'DISTRESS_MSG',
            shipId: selectedShipId || undefined,
            severity: 'critical',
            message: msg,
        });
        setSending(false);
        setSent(true);
        setMsg('');
        setTimeout(() => setSent(false), 3000);
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="panel-header">
                <div className="panel-header-icon" style={{ background: 'var(--red)' }} />
                <span className="panel-title">Distress Comms</span>
            </div>

            <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>
                    Vessel-to-Command Channel
                </div>

                {selectedShipId ? (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', marginBottom: 12 }}>
                        FROM: {selectedShipId}
                    </div>
                ) : (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--amber)', marginBottom: 12 }}>
                        ⚠ No vessel selected — select from registry
                    </div>
                )}

                <textarea
                    className="distress-textarea"
                    placeholder="Enter distress message or situation report..."
                    value={msg}
                    onChange={e => setMsg(e.target.value)}
                />

                <button
                    className="distress-send"
                    onClick={send}
                    disabled={sending || !msg.trim()}
                    style={{ opacity: !msg.trim() ? 0.4 : 1 }}
                >
                    {sent ? '✓ TRANSMITTED' : sending ? 'SENDING...' : '⚠ TRANSMIT DISTRESS'}
                </button>

                <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 3 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>
                        Quick Templates
                    </div>
                    {[
                        'Engine failure — request immediate assistance',
                        'Hostile vessel approach — bearing 045',
                        'Fire on deck — crew evacuating',
                        'Medical emergency — crew member critical',
                    ].map(t => (
                        <div
                            key={t}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', padding: '5px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                            onClick={() => setMsg(t)}
                        >
                            → {t}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
