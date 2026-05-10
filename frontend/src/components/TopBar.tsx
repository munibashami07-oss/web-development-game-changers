import { useFleetStore } from '../store/fleetStore';
import { LiveClock } from './LiveClock';
import { RoleSwitcher } from './RoleSwitcher';

export function TopBar() {
    const { ships, alerts, isConnected } = useFleetStore();

    const critical = alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length;
    const nominal = ships.filter(s => s.status === 'NOMINAL').length;

    return (
        <header className="topbar">
            <div className="logo">
                NAVCOM<span> // FLEET OPS</span>
            </div>

            <div className="topbar-divider" />

            <div className="topbar-stat">
                <span className="topbar-stat-label">Vessels</span>
                <span className="topbar-stat-value">{ships.length}</span>
            </div>

            <div className="topbar-divider" />

            <div className="topbar-stat">
                <span className="topbar-stat-label">Nominal</span>
                <span className="topbar-stat-value" style={{ color: 'var(--green)' }}>{nominal}</span>
            </div>

            <div className="topbar-divider" />

            <div className="topbar-stat">
                <span className="topbar-stat-label">Alerts</span>
                <span className="topbar-stat-value" style={{ color: critical > 0 ? 'var(--red)' : 'var(--text-secondary)' }}>
                    {critical > 0 ? `⚠ ${critical}` : alerts.filter(a => !a.acknowledged).length}
                </span>
            </div>

            <div className="topbar-divider" />

            <div className="scenario-badge">
                ⚡ STRAIT OF HORMUZ CRISIS
            </div>

            <div className="topbar-status">
                <RoleSwitcher />
                <div className="topbar-divider" />
                <LiveClock />
                <div className="topbar-divider" />
                <div className={`status-dot ${isConnected ? '' : 'offline'}`} />
                <span className="status-label">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
        </header>
    );
}
