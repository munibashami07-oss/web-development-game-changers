// src/components/AICommandBar.tsx
import { useState } from 'react';

const BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

interface CommandResult {
    summary: string;
    actions: Array<{ shipId: string; type: string; reason: string }>;
    queryAnswer?: string;
}

export function AICommandBar() {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CommandResult | null>(null);
    const [open, setOpen] = useState(false);

    const submit = async () => {
        if (!input.trim()) return;
        setLoading(true);
        setResult(null);
        try {
            const r = await fetch(`${BASE}/api/ai/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: input }),
            });
            const data = await r.json();
            setResult(data);
        } catch (e: any) {
            setResult({ summary: `Error: ${e.message}`, actions: [] });
        } finally {
            setLoading(false);
            setInput('');
        }
    };

    return (
        <div style={{
            position: 'absolute',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 600,
            width: open ? 600 : 280,
            transition: 'width 0.3s',
        }}>
            <div style={{
                background: 'rgba(7, 21, 37, 0.92)',
                border: '1px solid rgba(0, 212, 255, 0.4)',
                borderRadius: 3,
                padding: 8,
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 212, 255, 0.15)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: 2,
                        color: 'var(--cyan)',
                    }}>
                        ◈ AI CMD
                    </span>
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onFocus={() => setOpen(true)}
                        onBlur={() => !input && !result && setOpen(false)}
                        onKeyDown={e => e.key === 'Enter' && submit()}
                        placeholder={open
                            ? 'e.g. "reroute LNG carriers away from Hormuz"'
                            : 'Ask AI...'}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            padding: '4px 0',
                        }}
                    />
                    {input && (
                        <button onClick={submit} disabled={loading} style={{
                            background: 'rgba(0, 212, 255, 0.15)',
                            border: '1px solid var(--cyan)',
                            color: 'var(--cyan)',
                            padding: '4px 10px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: 1.5,
                            cursor: 'pointer',
                            borderRadius: 2,
                        }}>
                            {loading ? '...' : 'EXECUTE ▶'}
                        </button>
                    )}
                </div>
            </div>

            {result && (
                <div style={{
                    marginTop: 6,
                    background: 'rgba(7, 21, 37, 0.95)',
                    border: '1px solid var(--border-bright)',
                    borderRadius: 3,
                    padding: 10,
                    fontSize: 12,
                }}>
                    <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--text-dim)',
                        letterSpacing: 1.5,
                        marginBottom: 4,
                    }}>
                        ▸ AI RESPONSE
                    </div>
                    <div style={{ color: 'var(--text-primary)', marginBottom: 6 }}>
                        {result.summary}
                    </div>
                    {result.queryAnswer && (
                        <div style={{
                            padding: 6,
                            background: 'rgba(0, 255, 136, 0.05)',
                            border: '1px solid rgba(0, 255, 136, 0.2)',
                            borderRadius: 2,
                            color: 'var(--green)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                        }}>
                            {result.queryAnswer}
                        </div>
                    )}
                    {result.actions.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1.5, marginBottom: 4 }}>
                                ACTIONS DISPATCHED ({result.actions.length})
                            </div>
                            {result.actions.map((a, i) => (
                                <div key={i} style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 10,
                                    color: 'var(--text-secondary)',
                                    padding: '2px 0',
                                }}>
                                    <span style={{ color: 'var(--orange)' }}>{a.type}</span>
                                    <span> → {a.shipId}</span>
                                    {a.reason && <span style={{ color: 'var(--text-dim)' }}> · {a.reason}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                    <button onClick={() => setResult(null)} style={{
                        marginTop: 8,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        fontSize: 10,
                        cursor: 'pointer',
                    }}>
                        ✕ dismiss
                    </button>
                </div>
            )}
        </div>
    );
}