import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { ShipList } from './components/ShipList';
import { FleetMap } from './components/FleetMap';
import { RightPanel } from './components/RightPanel';
import { PlaybackBar } from './components/PlaybackBar';
import { CaptainPanel } from './components/CaptainPanel';
import { AICommandBar } from './components/AICommandBar';
import { useWebSocket } from './hooks/useWebSocket';
import { useFleetStore } from './store/fleetStore';
import { api } from './utils/api';
import './index.css';

function DataLoader() {
    const { setShips, setAlerts, setZones, setHistory } = useFleetStore();

    useEffect(() => {
        api.getFleet().then(d => d.ships && setShips(d.ships)).catch(() => { });
        api.getAlerts().then(d => d.alerts && setAlerts(d.alerts)).catch(() => { });
        api.getZones().then(d => d.zones && setZones(d.zones)).catch(() => { });
        api.getHistory().then(d => d.snapshots && setHistory(d.snapshots)).catch(() => { });

        const t = setInterval(() => {
            api.getHistory().then(d => d.snapshots && setHistory(d.snapshots)).catch(() => { });
        }, 5_000);
        return () => clearInterval(t);
    }, []);

    return null;
}

export default function App() {
    useWebSocket();
    const role = useFleetStore(s => s.role);

    return (
        <div className="app-layout">
            <TopBar />

            {/* Left panel switches based on role */}
            {role === 'command' ? <ShipList /> : <CaptainPanel />}

            <div className="map-col">
                <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
                    <FleetMap />
                    {role === 'command' && <AICommandBar />}
                </div>
                <PlaybackBar />
            </div>

            <RightPanel />
            <DataLoader />
        </div>
    );
}
