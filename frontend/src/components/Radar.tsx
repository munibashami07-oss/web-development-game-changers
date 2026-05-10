import { useEffect, useState } from 'react';
import { useFleetStore } from '../store/fleetStore';

// Center of the operational area (Strait of Hormuz)
const RADAR_CENTER = { lat: 26.0, lng: 56.5 };
const RADAR_RANGE_NM = 250; // nautical miles

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 3440.065;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function bearing(lat1: number, lng1: number, lat2: number, lng2: number) {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function Radar() {
    const { ships, selectedShipId, selectShip } = useFleetStore();
    const [sweepAngle, setSweepAngle] = useState(0);

    useEffect(() => {
        let raf: number;
        const animate = () => {
            setSweepAngle(a => (a + 1.2) % 360);
            raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf);
    }, []);

    const SIZE = 180;
    const CENTER = SIZE / 2;
    const MAX_R = SIZE / 2 - 8;

    // Map ships to radar coordinates
    const blips = ships
        .filter((s: any) => s.lat != null && s.lng != null)
        .map((s: any) => {
            const dist = haversine(RADAR_CENTER.lat, RADAR_CENTER.lng, s.lat, s.lng);
            const brg = bearing(RADAR_CENTER.lat, RADAR_CENTER.lng, s.lat, s.lng);
            if (dist > RADAR_RANGE_NM) return null;
            const r = (dist / RADAR_RANGE_NM) * MAX_R;
            const θ = ((brg - 90) * Math.PI) / 180;
            return {
                shipId: s.shipId,
                x: CENTER + r * Math.cos(θ),
                y: CENTER + r * Math.sin(θ),
                status: s.status,
                bearing: brg,
            };
        })
        .filter(Boolean) as Array<{ shipId: string; x: number; y: number; status: string; bearing: number }>;

    const blipColor = (status: string) => {
        if (status === 'CRITICAL' || status === 'DISTRESS') return '#ff3366';
        if (status === 'ALERT') return '#ffaa00';
        return '#00ff88';
    };

    // Distance from sweep — for trail effect
    const distFromSweep = (blipBearing: number) => {
        const adj = (blipBearing - 90 + 360) % 360;
        const sweep = sweepAngle;
        let diff = sweep - adj;
        while (diff < 0) diff += 360;
        return diff; // 0 = sweep just passed; 360 approaching
    };

    return (
        <div style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            width: SIZE,
            height: SIZE + 24,
            zIndex: 500,
            pointerEvents: 'auto',
        }}>
            <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 2,
                color: 'var(--cyan)',
                textAlign: 'center',
                marginBottom: 4,
                textTransform: 'uppercase',
            }}>
                ◉ Tactical Radar · {RADAR_RANGE_NM}nm
            </div>

            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{
                background: 'radial-gradient(circle, rgba(0,255,136,0.06), rgba(7,21,37,0.95))',
                borderRadius: '50%',
                border: '1px solid rgba(0, 255, 136, 0.4)',
                boxShadow: '0 0 16px rgba(0, 255, 136, 0.2), inset 0 0 16px rgba(0, 255, 136, 0.08)',
            }}>
                {/* Range rings */}
                {[0.25, 0.5, 0.75, 1].map((r, i) => (
                    <circle
                        key={i}
                        cx={CENTER}
                        cy={CENTER}
                        r={MAX_R * r}
                        fill="none"
                        stroke="rgba(0, 255, 136, 0.2)"
                        strokeWidth={0.5}
                        strokeDasharray="2 3"
                    />
                ))}

                {/* Crosshairs */}
                <line x1={CENTER} y1={4} x2={CENTER} y2={SIZE - 4} stroke="rgba(0, 255, 136, 0.18)" strokeWidth={0.5} />
                <line x1={4} y1={CENTER} x2={SIZE - 4} y2={CENTER} stroke="rgba(0, 255, 136, 0.18)" strokeWidth={0.5} />

                {/* Cardinal labels */}
                <text x={CENTER} y={10} textAnchor="middle" fontSize={8} fill="rgba(0, 255, 136, 0.6)" fontFamily="'Share Tech Mono', monospace">N</text>
                <text x={CENTER} y={SIZE - 2} textAnchor="middle" fontSize={8} fill="rgba(0, 255, 136, 0.6)" fontFamily="'Share Tech Mono', monospace">S</text>
                <text x={SIZE - 6} y={CENTER + 3} textAnchor="middle" fontSize={8} fill="rgba(0, 255, 136, 0.6)" fontFamily="'Share Tech Mono', monospace">E</text>
                <text x={6} y={CENTER + 3} textAnchor="middle" fontSize={8} fill="rgba(0, 255, 136, 0.6)" fontFamily="'Share Tech Mono', monospace">W</text>

                {/* Sweep line + cone */}
                <defs>
                    <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(0, 255, 136, 0.5)" />
                        <stop offset="100%" stopColor="rgba(0, 255, 136, 0)" />
                    </linearGradient>
                </defs>
                <g transform={`rotate(${sweepAngle}, ${CENTER}, ${CENTER})`}>
                    <path
                        d={`M${CENTER},${CENTER} L${CENTER + MAX_R},${CENTER} A${MAX_R},${MAX_R} 0 0 0 ${CENTER + MAX_R * Math.cos(-Math.PI / 6)},${CENTER + MAX_R * Math.sin(-Math.PI / 6)} Z`}
                        fill="url(#sweepGrad)"
                    />
                    <line
                        x1={CENTER}
                        y1={CENTER}
                        x2={CENTER + MAX_R}
                        y2={CENTER}
                        stroke="rgba(0, 255, 136, 0.9)"
                        strokeWidth={1}
                    />
                </g>

                {/* Center dot */}
                <circle cx={CENTER} cy={CENTER} r={2.5} fill="#00ff88" />

                {/* Blips */}
                {blips.map(blip => {
                    const distBehind = distFromSweep(blip.bearing);
                    const opacity = Math.max(0.3, 1 - distBehind / 360);
                    const isSelected = blip.shipId === selectedShipId;
                    const color = blipColor(blip.status);
                    const r = isSelected ? 4 : 2.5;

                    return (
                        <g key={blip.shipId} style={{ cursor: 'pointer' }} onClick={() => selectShip(blip.shipId)}>
                            {isSelected && (
                                <circle cx={blip.x} cy={blip.y} r={r + 4} fill="none" stroke={color} strokeWidth={1} opacity={0.6}>
                                    <animate attributeName="r" from={r + 2} to={r + 7} dur="1.2s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" from={0.7} to={0} dur="1.2s" repeatCount="indefinite" />
                                </circle>
                            )}
                            <circle
                                cx={blip.x}
                                cy={blip.y}
                                r={r}
                                fill={color}
                                opacity={opacity}
                            />
                        </g>
                    );
                })}

                {/* Frame ticks */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
                    const θ = ((deg - 90) * Math.PI) / 180;
                    const x1 = CENTER + (MAX_R - 2) * Math.cos(θ);
                    const y1 = CENTER + (MAX_R - 2) * Math.sin(θ);
                    const x2 = CENTER + MAX_R * Math.cos(θ);
                    const y2 = CENTER + MAX_R * Math.sin(θ);
                    return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0, 255, 136, 0.6)" strokeWidth={1} />;
                })}
            </svg>
        </div>
    );
}
