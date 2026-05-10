import { useFleetStore } from '../store/fleetStore';
import type { Ship } from '../types';

function fuelColor(fuel: number) {
    if (fuel > 60) return 'var(--green)';
    if (fuel > 30) return 'var(--amber)';
    return 'var(--red)';
}

// Returns a color for the status indicator based on fuel + status
function indicatorColor(ship: any) {
    if (ship.fuel != null) {
        if (ship.fuel <= 15) return 'var(--red)';
        if (ship.fuel <= 30) return 'var(--amber)';
    }
    switch (ship.status) {
        case 'NOMINAL': return 'var(--green)';
        case 'ALERT': return 'var(--amber)';
        case 'CRITICAL': return 'var(--red)';
        case 'DISTRESS': return 'var(--red)';
        case 'ANCHORED': return 'var(--cyan)';
        case 'REROUTING': return 'var(--orange)';
        case 'STRANDED': return 'var(--red)';
        case 'STOPPED': return 'var(--text-dim)';
        default: return 'var(--text-secondary)';
    }
}

function statusSymbol(ship: any) {
    if (ship.fuel != null && ship.fuel <= 15) return '⛽';
    if (ship.status === 'CRITICAL' || ship.status === 'DISTRESS') return '⚠';
    if (ship.status === 'STRANDED' || ship.status === 'STOPPED') return '✕';
    if (ship.status === 'REROUTING') return '⤿';
    if (ship.status === 'ANCHORED') return '⚓';
    if (ship.status === 'ALERT') return '⚡';
    return '●';
}

export function ShipList() {
    const { ships, selectedShipId, selectShip, alerts } = useFleetStore();

    const sortedShips = [...ships].sort((a: any, b: any) => {
        // Critical fuel first
        const aFuelCrit = (a.fuel ?? 100) <= 15 ? 0 : 1;
        const bFuelCrit = (b.fuel ?? 100) <= 15 ? 0 : 1;
        if (aFuelCrit !== bFuelCrit) return aFuelCrit - bFuelCrit;

        const order: Record<string, number> = {
            DISTRESS: 0, CRITICAL: 1, STRANDED: 1, ALERT: 2, REROUTING: 3, ANCHORED: 4, STOPPED: 5, NOMINAL: 6,
        };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    const unackCount = (shipId: string) =>
        alerts.filter(a => a.shipId === shipId && !a.acknowledged).length;

    return (
        <div className="left-panel">
            <div className="scenario-panel">
                <div className="scenario-title">⚡ Strait of Hormuz</div>
                <div className="scenario-desc">High-Risk Red Zone — Geopolitical Crisis Active</div>
            </div>

            <div className="panel-header">
                <div className="panel-header-icon" />
                <span className="panel-title">Fleet Registry</span>
                <span className="panel-count">{ships.length} VESSELS</span>
            </div>

            <div className="ship-list">
                {sortedShips.map((ship: any) => {
                    const alertCount = unackCount(ship.shipId);
                    const color = indicatorColor(ship);
                    const lowFuel = ship.fuel != null && ship.fuel <= 30;

                    return (
                        <div
                            key={ship.shipId}
                            className={`ship-item status-${ship.status} ${selectedShipId === ship.shipId ? 'selected' : ''}`}
                            onClick={() => selectShip(ship.shipId)}
                        >
                            <div className="ship-icon" style={{
                                color,
                                background: `${color}22`,
                                border: `1px solid ${color}`,
                                boxShadow: lowFuel ? `0 0 6px ${color}` : 'none',
                                animation: ship.fuel != null && ship.fuel <= 15 ? 'pulse-red 1s ease-in-out infinite' : 'none',
                                fontSize: 13,
                            }}>
                                {statusSymbol(ship)}
                            </div>
                            <div className="ship-info">
                                <div className="ship-name">{ship.name || ship.shipId}</div>
                                <div className="ship-meta">
                                    {ship.speed?.toFixed(1)} kts · <span style={{ color: fuelColor(ship.fuel) }}>{ship.fuel?.toFixed(0)}% fuel</span>
                                    {alertCount > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>⚠{alertCount}</span>}
                                </div>
                                <div className="fuel-mini">
                                    <div className="fuel-mini-fill" style={{
                                        width: `${ship.fuel}%`,
                                        background: fuelColor(ship.fuel),
                                    }} />
                                </div>
                            </div>
                            <span className="ship-status-badge" style={{
                                color,
                                borderColor: color,
                                background: `${color}15`,
                            }}>{ship.status}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
