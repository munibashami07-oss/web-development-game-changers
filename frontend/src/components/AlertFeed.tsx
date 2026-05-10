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

const SEVERITY_ORDER: Record<Alert['severity'], number> = {
    critical: 4, high: 3, medium: 2, low: 1,
};

/** Audible alert (spec requires "visual and audible" alerts).
 *  Two-tone klaxon for critical, single beep for high. */
function playAlertSound(severity: Alert['severity']) {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const beep = (freq: number, start: number, dur: number, vol = 0.12) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'square';
            gain.gain.setValueAtTime(vol, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + dur);
        };
        if (severity === 'critical') {
            beep(880, 0, 0.18);
            beep(660, 0.22, 0.22);
        } else if (severity === 'high') {
            beep(740, 0, 0.20);
        }
    } catch { /* audio context blocked — silent */ }
}

export function AlertFeed() {
    const { alerts, acknowledgeAlert } = useFleetStore();
    const feedRef = useRef<HTMLDivElement>(null);
    const seenIds = useRef<Set<string>>(new Set());

    // Sort: unack first, then by priority (set on backend), then severity, then time
    const sorted = [...alerts].sort((a, b) => {
        if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
        const pa = (a as any).priority ?? 0;
        const pb = (b as any).priority ?? 0;
        if (pa !== pb) return pb - pa;
        if (SEVERITY_ORDER[a.severity] !== SEVERITY_ORDER[b.severity]) {
            return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
        }
        return b.timestamp - a.timestamp;
    });

    useEffect(() => {
        // Fire audible alert ONLY for newly-arrived high/critical alerts
        for (const a of alerts) {
            if (seenIds.current.has(a.id)) continue;
            seenIds.current.add(a.id);
            if (!a.acknowledged && (a.severity === 'critical' || a.severity === 'high')) {
                playAlertSound(a.severity);
            }
        }
        // Cap the seen set to avoid unbounded growth
        if (seenIds.current.size > 500) {
            const arr = Array.from(seenIds.current);
            seenIds.current = new Set(arr.slice(arr.length - 250));
        }
    }, [alerts]);

    useEffect(() => {
        if (feedRef.current) feedRef.current.scrollTop = 0;
    }, [alerts.length]);

    const unack = sorted.filter(a => !a.acknowledged);
    const ack = sorted.filter(a => a.acknowledged);

    const renderAlert = (alert: Alert, isAck: boolean) => {
        const md = alert.metadata || {};
        const hasNLP = md.injuryCount !== undefined || md.damageEstimate || md.category || md.requiresAssistance;
        return (
            <div
                key={alert.id}
                className={`alert-item severity-${alert.severity}${isAck ? ' acknowledged' : ''}`}
                onClick={() => !isAck && acknowledgeAlert(alert.id)}
                title={isAck ? '' : 'Click to acknowledge'}
                style={isAck ? {} : { cursor: 'pointer' }}
            >
                <div className="alert-header">
                    <span className="alert-type" style={{ color: isAck ? 'var(--text-dim)' : severityColor(alert.severity) }}>
                        {!isAck && alert.severity === 'critical' && '⚠ '}{alert.type}
                    </span>
                    <span className="alert-time">{relTime(alert.timestamp)}</span>
                </div>
                <div className="alert-message">{alert.message}</div>
                {alert.shipId && <div className="alert-ship">↳ {alert.shipId}</div>}

                {/* NLP-extracted fields (from ai-service distress processor) */}
                {hasNLP && !isAck && (
                    <div style={{
                        marginTop: 8,
                        padding: 6,
                        background: 'rgba(0,0,0,0.25)',
                        borderLeft: `2px solid ${severityColor(alert.severity)}`,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        lineHeight: 1.5,
                        color: 'var(--text-secondary)',
                    }}>
                        <div style={{ color: 'var(--text-dim)', letterSpacing: 1.5, fontSize: 8, marginBottom: 4 }}>
                            ▸ AI ANALYSIS
                        </div>
                        {md.category && (
                            <div>
                                <span style={{ color: 'var(--text-dim)' }}>CATEGORY:</span>{' '}
                                <span style={{ color: 'var(--cyan)' }}>{String(md.category).toUpperCase()}</span>
                            </div>
                        )}
                        {typeof md.injuryCount === 'number' && md.injuryCount > 0 && (
                            <div>
                                <span style={{ color: 'var(--text-dim)' }}>INJURIES:</span>{' '}
                                <span style={{ color: 'var(--red)' }}>{md.injuryCount}</span>
                            </div>
                        )}
                        {md.damageEstimate && (
                            <div>
                                <span style={{ color: 'var(--text-dim)' }}>DAMAGE:</span>{' '}
                                <span>{md.damageEstimate}</span>
                            </div>
                        )}
                        {md.requiresAssistance && (
                            <div style={{ color: 'var(--orange)' }}>
                                ⚠ REQUIRES ASSISTANCE
                            </div>
                        )}
                        {md.originalMessage && (
                            <div style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--text-dim)' }}>
                                "{md.originalMessage}"
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="alert-feed" ref={feedRef}>
            {unack.map(a => renderAlert(a, false))}

            {ack.length > 0 && (
                <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 2, padding: '6px 4px', textTransform: 'uppercase' }}>
                        Acknowledged ({ack.length})
                    </div>
                    {ack.slice(0, 20).map(a => renderAlert(a, true))}
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
