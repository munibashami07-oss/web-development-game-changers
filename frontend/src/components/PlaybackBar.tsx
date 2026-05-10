import { useEffect, useRef, useState } from 'react';
import { useFleetStore } from '../store/fleetStore';

export function PlaybackBar() {
    const { history, playbackTime, setPlaybackTime } = useFleetStore();
    const [playing, setPlaying] = useState(false);
    const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const min = history[0]?.timestamp ?? 0;
    const max = history[history.length - 1]?.timestamp ?? 1;
    const range = max - min || 1;
    const isLive = playbackTime === null;
    const value = isLive ? max : playbackTime;
    const elapsedSec = Math.floor((value - min) / 1000);

    // Auto-advance when playing — declared BEFORE any conditional return
    useEffect(() => {
        if (!playing) {
            if (playRef.current) clearInterval(playRef.current);
            return;
        }
        playRef.current = setInterval(() => {
            const cur = playbackTime ?? max;
            const next = cur + 5_000;
            if (next >= max) {
                setPlaybackTime(null);
                setPlaying(false);
            } else {
                setPlaybackTime(next);
            }
        }, 200);
        return () => { if (playRef.current) clearInterval(playRef.current); };
    }, [playing, playbackTime, max]);

    // Now safe to early-return after all hooks are declared
    if (history.length < 2) {
        return (
            <div className="playback-bar">
                <div className="playback-label">
                    <span>TIMELINE PLAYBACK</span>
                    <span style={{ color: 'var(--text-dim)' }}>
                        Recording history... ({history.length} snapshots)
                    </span>
                </div>
                <input type="range" className="playback-slider" disabled value={0} min={0} max={1} readOnly />
            </div>
        );
    }

    const fmt = (ts: number) => {
        const d = new Date(ts);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
    };

    const togglePlay = () => {
        if (isLive) {
            setPlaybackTime(min);
            setPlaying(true);
        } else {
            setPlaying(p => !p);
        }
    };

    const goLive = () => {
        setPlaying(false);
        setPlaybackTime(null);
    };

    return (
        <div className="playback-bar">
            <div className="playback-label">
                <span>TIMELINE PLAYBACK</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--text-dim)',
                        letterSpacing: 1,
                    }}>
                        T+{Math.floor(elapsedSec / 60)}m {elapsedSec % 60}s
                    </span>
                    <button
                        onClick={togglePlay}
                        style={{
                            background: playing ? 'rgba(255, 170, 0, 0.15)' : 'rgba(0, 212, 255, 0.12)',
                            border: `1px solid ${playing ? 'var(--amber)' : 'var(--cyan)'}`,
                            color: playing ? 'var(--amber)' : 'var(--cyan)',
                            padding: '3px 10px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: 1.5,
                            cursor: 'pointer',
                            borderRadius: 2,
                        }}
                    >
                        {playing ? '⏸ PAUSE' : isLive ? '▶ REPLAY' : '▶ PLAY'}
                    </button>
                    {!isLive && (
                        <button
                            onClick={goLive}
                            style={{
                                background: 'rgba(0, 255, 136, 0.12)',
                                border: '1px solid var(--green)',
                                color: 'var(--green)',
                                padding: '3px 10px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                letterSpacing: 1.5,
                                cursor: 'pointer',
                                borderRadius: 2,
                            }}
                        >
                            ● LIVE
                        </button>
                    )}
                    <span style={{
                        color: isLive ? 'var(--green)' : 'var(--amber)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: 1,
                    }}>
                        {isLive ? '● LIVE' : `⏸ ${fmt(value)}`}
                    </span>
                </div>
            </div>
            <input
                type="range"
                className="playback-slider"
                min={min}
                max={max}
                step={1000}
                value={value}
                style={{
                    background: `linear-gradient(to right, var(--cyan) ${((value - min) / range) * 100}%, var(--bg-void) 0%)`,
                }}
                onChange={e => {
                    setPlaying(false);
                    const t = Number(e.target.value);
                    if (t >= max - 1500) setPlaybackTime(null);
                    else setPlaybackTime(t);
                }}
            />
        </div>
    );
}
