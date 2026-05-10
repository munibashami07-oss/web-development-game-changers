// src/components/AIBriefing.tsx
import { useEffect, useState } from 'react';
import { BACKEND as BASE } from '../lib/api';

export function AIBriefing({ shipId }: { shipId: string }) {
    const [briefing, setBriefing] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setBriefing(null);
        setError(null);
        setLoading(true);

        fetch(`${BASE}/api/ai/briefing/${shipId}`)
            .then(r => r.json())
            .then(d => {
                if (cancelled) return;
                if (d.briefing) setBriefing(d.briefing);
                else setError(d.error || 'No briefing returned');
            })
            .catch(e => { if (!cancelled) setError(e.message); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [shipId]);

    return (
        <div style={{
            margin: '12px 0',
            padding: 12,
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.06), rgba(0, 255, 136, 0.04))',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            borderRadius: 2,
            position: 'relative',
            overflow: 'hidden',
        }}>
            <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 2,
                color: 'var(--cyan)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
            }}>
                <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: loading ? 'var(--amber)' : 'var(--cyan)',
                    boxShadow: `0 0 6px ${loading ? 'var(--amber)' : 'var(--cyan)'}`,
                    animation: loading ? 'pulse 1s ease-in-out infinite' : 'none',
                }} />
                AI MISSION BRIEFING
                {loading && <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>analyzing...</span>}
            </div>

            {briefing && (
                <div style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: 'var(--text-primary)',
                    fontStyle: 'italic',
                }}>
                    {briefing}
                </div>
            )}

            {error && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    {error}
                </div>
            )}

            {loading && !briefing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{
                            height: 8,
                            background: 'rgba(0, 212, 255, 0.15)',
                            borderRadius: 2,
                            width: `${85 - i * 15}%`,
                            animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                    ))}
                </div>
            )}
        </div>
    );
}
