import { useRef, useEffect } from 'react';
import { useFleetStore } from '../store/fleetStore';
import type { Alert } from '../types';

function relTime(ts: number) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

function severityColor(s: Alert['severity']) {
    switch (s) {
        case 'critical': return 'var(--red)';
        case 'high': return 'var(--orange)';
        case 'medium': return 'var(--amber)';
        default: return 'var(--cyan-dim)';
    }
}

export function AlertFeed() {
    const { alerts, acknowledgeAlert } = useFleetStore();
    const feedRef = useRef<HTMLDivElement>(null);
    const prevLen = useRef(0);

    useEffect(() => {
        const newAlerts = alerts.slice(0, alerts.length - prevLen.current);
        newAlerts.forEach(a => {
            if (a.severity === 'critical' && !a.acknowledged) {
                try {
                    const ctx = new AudioContext();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = 880;
                    gain.gain.setValueAtTime(0.1, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.3);
                } catch { }
            }
        });
        prevLen.current = alerts.length;
    }, [alerts]);

    useEffect(() => {
        if (feedRef.current) feedRef.current.scrollTop = 0;
    }, [alerts.length]);

    const unack = alerts.filter(a => !a.acknowledged);
    const ack = alerts.filter(a => a.acknowledged);

    return (
        <div className="alert-feed" ref={feedRef}>
            {unack.map(alert => (
                <div
                    key={alert.id}
                    className={`alert-item severity-${alert.severity}`}
                    onClick={() => acknowledgeAlert(alert.id)}
                    title="Click to acknowledge"
                >
                    <div className="alert-header">
                        <span className="alert-type" style={{ color: severityColor(alert.severity) }}>
                            {alert.severity === 'critical' && '⚠ '}{alert.type}
                        </span>
                        <span className="alert-time">{relTime(alert.timestamp)}</span>
                    </div>
                    <div className="alert-message">{alert.message}</div>
                    {alert.shipId && <div className="alert-ship">↳ {alert.shipId}</div>}
                </div>
            ))}

            {ack.length > 0 && (
                <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 2, padding: '6px 4px', textTransform: 'uppercase' }}>
                        Acknowledged ({ack.length})
                    </div>
                    {ack.slice(0, 20).map(alert => (
                        <div key={alert.id} className={`alert-item severity-${alert.severity} acknowledged`}>
                            <div className="alert-header">
                                <span className="alert-type" style={{ color: 'var(--text-dim)' }}>{alert.type}</span>
                                <span className="alert-time">{relTime(alert.timestamp)}</span>
                            </div>
                            <div className="alert-message">{alert.message}</div>
                        </div>
                    ))}
                </>
            )}

            {alerts.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                    NO ACTIVE ALERTS<br />
                    <span className="blink">_</span>
                </div>
            )}
        </div>
    );
}