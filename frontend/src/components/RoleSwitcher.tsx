// src/components/RoleSwitcher.tsx
import { useState } from 'react';
import { useFleetStore } from '../store/fleetStore';

export function RoleSwitcher() {
    const { role, setRole, captainShipId, ships } = useFleetStore();
    const [open, setOpen] = useState(false);

    const switchToCommand = () => {
        setRole('command');
        setOpen(false);
    };

    const switchToCaptain = (shipId: string) => {
        setRole('captain', shipId);
        setOpen(false);
    };

    const captainShip = captainShipId ? ships.find(s => s.shipId === captainShipId) : null;

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    background: role === 'captain' ? 'rgba(255, 102, 0, 0.15)' : 'rgba(0, 212, 255, 0.12)',
                    border: `1px solid ${role === 'captain' ? 'var(--orange)' : 'var(--cyan)'}`,
                    color: role === 'captain' ? 'var(--orange)' : 'var(--cyan)',
                    padding: '4px 10px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: 2,
                    cursor: 'pointer',
                    borderRadius: 2,
                }}
            >
                {role === 'command'
                    ? '◆ COMMAND MODE'
                    : `⚓ CAPTAIN: ${captainShip?.name || captainShipId}`}
                <span style={{ marginLeft: 6 }}>▾</span>
            </button>
            {open && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    background: 'var(--bg-deep)',
                    border: '1px solid var(--border-bright)',
                    borderRadius: 2,
                    padding: 6,
                    minWidth: 220,
                    maxHeight: 360,
                    overflowY: 'auto',
                    zIndex: 1000,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                }}>
                    <div onClick={switchToCommand} style={{
                        padding: '6px 8px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: role === 'command' ? 'var(--cyan)' : 'var(--text-secondary)',
                        background: role === 'command' ? 'rgba(0, 212, 255, 0.08)' : 'transparent',
                    }}>
                        ◆ Fleet Command
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                    <div style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1.5 }}>
                        CAPTAIN VIEW
                    </div>
                    {ships.map(s => (
                        <div key={s.shipId} onClick={() => switchToCaptain(s.shipId)} style={{
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: captainShipId === s.shipId ? 'var(--orange)' : 'var(--text-secondary)',
                            background: captainShipId === s.shipId ? 'rgba(255, 102, 0, 0.08)' : 'transparent',
                            display: 'flex',
                            justifyContent: 'space-between',
                        }}>
                            <span>⚓ {s.name}</span>
                            <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{s.shipId}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
