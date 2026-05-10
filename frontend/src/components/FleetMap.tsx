import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useFleetStore } from '../store/fleetStore';
import { Radar } from './Radar';
import type { Ship } from '../types';

// Esri World Imagery — satellite/aerial view; CSS filter applied below to match dark naval aesthetic
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// All port coordinates — matches backend PORTS
const PORTS: Record<string, { name: string; lat: number; lng: number }> = {
    'KWT-1': { name: 'Kuwait', lat: 29.48, lng: 48.34 },
    'BUS-1': { name: 'Bushehr', lat: 28.83, lng: 50.73 },
    'DMM-1': { name: 'Dammam', lat: 26.56, lng: 50.30 },
    'BAH-1': { name: 'Bahrain', lat: 26.50, lng: 50.55 },
    'DOH-1': { name: 'Doha', lat: 25.46, lng: 51.95 },
    'AUH-1': { name: 'Abu Dhabi', lat: 25.22, lng: 54.18 },
    'DXB-1': { name: 'Dubai', lat: 25.50, lng: 54.75 },
    'BND-1': { name: 'Bandar Abbas', lat: 26.62, lng: 56.11 },
    'SOH-1': { name: 'Sohar', lat: 24.72, lng: 57.02 },
    'MCT-1': { name: 'Muscat', lat: 23.92, lng: 58.58 },
};

function shipColor(ship: Ship | any) {
    // Fuel-based override — low fuel ships get amber/red regardless of status
    const fuel = (ship as any).fuel;
    if (fuel != null) {
        if (fuel <= 15) return '#ff3366';   // critical fuel — red
        if (fuel <= 30) return '#ffaa00';   // low fuel — amber
    }
    // Otherwise use status color
    switch (ship.status) {
        case 'NOMINAL': return '#00ff88';
        case 'ALERT': return '#ffaa00';
        case 'CRITICAL': return '#ff3366';
        case 'DISTRESS': return '#ff0033';
        case 'ANCHORED': return '#00d4ff';
        case 'REROUTING': return '#ff6600';
        case 'STRANDED': return '#ff0033';
        case 'STOPPED': return '#666666';
        default: return '#7aa8cc';
    }
}

function createShipIcon(ship: Ship, selected: boolean) {
    const color = shipColor(ship);
    const size = selected ? 36 : 28;
    const pulse = ship.status === 'DISTRESS' || ship.status === 'CRITICAL';
    const pulseRing = pulse ? `
    <circle cx="14" cy="14" r="12" fill="none" stroke="${color}" stroke-width="1" opacity="0.4">
      <animate attributeName="r" from="12" to="22" dur="1.2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.5" to="0" dur="1.2s" repeatCount="indefinite"/>
    </circle>` : '';

    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    ${pulseRing}
    <g transform="rotate(${ship.heading}, 14, 14)">
      <polygon points="14,3 20,23 14,18 8,23" fill="${color}" opacity="${selected ? 1 : 0.92}"/>
      <line x1="14" y1="3" x2="14" y2="23" stroke="${color}" stroke-width="0.5" opacity="0.4"/>
    </g>
    ${selected ? `<circle cx="14" cy="14" r="13" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.7"/>` : ''}
  </svg>`;

    return L.divIcon({
        html: svg,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

function createPortIcon() {
    const svg = `<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="5" r="4" fill="#00d4ff" opacity="0.25" stroke="#00d4ff" stroke-width="1"/>
    <circle cx="5" cy="5" r="2" fill="#00d4ff" opacity="0.8"/>
  </svg>`;
    return L.divIcon({ html: svg, className: '', iconSize: [10, 10], iconAnchor: [5, 5] });
}

export function FleetMap() {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const markersRef = useRef<Map<string, L.Marker>>(new Map());
    const destLinesRef = useRef<Map<string, L.Polyline>>(new Map());
    const trailsLayerRef = useRef<L.LayerGroup | null>(null);
    const zonesLayerRef = useRef<L.LayerGroup | null>(null);
    const portsLayerRef = useRef<L.LayerGroup | null>(null);
    const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [drawMode, setDrawMode] = useState(false);
    const drawPoints = useRef<[number, number][]>([]);
    const drawLayerRef = useRef<L.LayerGroup | null>(null);

    const { ships, selectedShipId, selectShip, zones, addZone, playbackTime, history } = useFleetStore();

    // Determine displayed ships (live or playback)
    // Find the snapshot closest to playbackTime
    const findClosestSnapshot = (t: number) => {
        if (history.length === 0) return null;
        let closest = history[0];
        let bestDiff = Math.abs(closest.timestamp - t);
        for (const snap of history) {
            const diff = Math.abs(snap.timestamp - t);
            if (diff < bestDiff) { bestDiff = diff; closest = snap; }
        }
        return closest;
    };

    const displayShips = playbackTime !== null
        ? (findClosestSnapshot(playbackTime)?.ships || ships)
        : ships;

    // Init map
    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        const map = L.map(mapRef.current, {
            center: [25.5, 54.5],
            zoom: 7,
            zoomControl: true,
            attributionControl: false,
        });

        L.tileLayer(TILE_URL, { maxZoom: 18 }).addTo(map);

        map.on('mousemove', (e) => setMouseCoords({ lat: e.latlng.lat, lng: e.latlng.lng }));

        zonesLayerRef.current = L.layerGroup().addTo(map);
        drawLayerRef.current = L.layerGroup().addTo(map);
        trailsLayerRef.current = L.layerGroup().addTo(map);

        // Add port markers
        portsLayerRef.current = L.layerGroup().addTo(map);
        const portIcon = createPortIcon();
        Object.entries(PORTS).forEach(([key, port]) => {
            L.marker([port.lat, port.lng], { icon: portIcon })
                .bindTooltip(
                    `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;background:#071525;border:1px solid #00d4ff44;padding:4px 8px;color:#00d4ff;">⚓ ${port.name}</div>`,
                    { className: 'custom-tooltip', direction: 'top', offset: [0, -6] }
                )
                .addTo(portsLayerRef.current!);
        });

        mapInstance.current = map;
        return () => { map.remove(); mapInstance.current = null; };
    }, []);

    // Draw restricted zones
    useEffect(() => {
        if (!mapInstance.current || !zonesLayerRef.current) return;
        zonesLayerRef.current.clearLayers();
        zones.forEach(zone => {
            const latlngs = zone.polygon.map(([lat, lng]) => [lat, lng] as [number, number]);
            L.polygon(latlngs, {
                color: '#ff3366', fillColor: '#ff3366',
                fillOpacity: 0.08, weight: 1.5, dashArray: '6, 4',
            }).bindTooltip(`⛔ ${zone.name}`, {
                className: 'leaflet-zone-tooltip', permanent: false,
            }).addTo(zonesLayerRef.current!);
        });
    }, [zones]);

    // Update ship markers + destination lines
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;
        const existing = new Set(markersRef.current.keys());
        const existingLines = new Set(destLinesRef.current.keys());

        displayShips.forEach(ship => {
            const lat = ship.lat ?? (ship as any).latitude ?? (Array.isArray((ship as any).position) ? (ship as any).position[0] : undefined);
            const lng = ship.lng ?? (ship as any).longitude ?? (Array.isArray((ship as any).position) ? (ship as any).position[1] : undefined);
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;

            const shipWithCoords = { ...ship, lat, lng };
            const selected = ship.shipId === selectedShipId;
            const color = shipColor(shipWithCoords);
            const icon = createShipIcon(shipWithCoords, selected);

            // Ship marker
            if (markersRef.current.has(ship.shipId)) {
                const marker = markersRef.current.get(ship.shipId)!;
                marker.setLatLng([lat, lng]);
                marker.setIcon(icon);
                existing.delete(ship.shipId);
            } else {
                const marker = L.marker([lat, lng], { icon })
                    .addTo(map)
                    .on('click', () => selectShip(ship.shipId));
                markersRef.current.set(ship.shipId, marker);
                existing.delete(ship.shipId);
            }

            // Tooltip
            const marker = markersRef.current.get(ship.shipId)!;
            marker.unbindTooltip();
            marker.bindTooltip(
                `<div style="font-family:'Share Tech Mono',monospace;font-size:11px;background:#071525;border:1px solid ${color}44;padding:6px 10px;color:#e8f4ff;border-radius:2px;min-width:140px;">
                  <div style="color:${color};font-weight:700;letter-spacing:1px;">${ship.shipId} · ${ship.name || ''}</div>
                  <div style="color:#7aa8cc;margin-top:3px;">${ship.speed?.toFixed(1)} kts · HDG ${ship.heading?.toFixed(0)}°</div>
                  <div style="color:#7aa8cc;">Fuel: ${ship.fuel?.toFixed(1)}%</div>
                  <div style="color:${color};margin-top:2px;">▶ ${(ship as any).destination || '—'}</div>
                  <div style="color:${color};font-size:10px;">${ship.status}</div>
                </div>`,
                { className: 'custom-tooltip', direction: 'top', offset: [0, -14] }
            );

            // Destination line — use planned A* path if backend provides it
            const destKey = (ship as any).destination as string;
            const port = destKey ? PORTS[destKey] : null;
            if (port) {
                const planned = (ship as any).pathTotal as [number, number][] | undefined;
                const lineCoords: [number, number][] = planned && planned.length >= 2
                    ? planned
                    : [[lat, lng], [port.lat, port.lng]];
                const lineColor = selected ? color : `${color}44`;
                const lineWeight = selected ? 3 : 0.8;
                const lineOpacity = selected ? 1 : 0.55;
                const dash = selected ? '8, 6' : '4, 6';

                if (destLinesRef.current.has(ship.shipId)) {
                    const line = destLinesRef.current.get(ship.shipId)!;
                    line.setLatLngs(lineCoords);
                    line.setStyle({ color: lineColor, weight: lineWeight, opacity: lineOpacity, dashArray: dash });
                    existingLines.delete(ship.shipId);
                } else {
                    const line = L.polyline(lineCoords, {
                        color: lineColor,
                        weight: lineWeight,
                        dashArray: dash,
                        opacity: lineOpacity,
                    }).addTo(map);
                    destLinesRef.current.set(ship.shipId, line);
                    existingLines.delete(ship.shipId);
                }

                const lineEl = (destLinesRef.current.get(ship.shipId) as any)?._path;
                if (lineEl) {
                    if (selected) lineEl.classList.add('selected-route-line');
                    else lineEl.classList.remove('selected-route-line');
                }
            }
        });

        // Remove stale markers and lines
        existing.forEach(id => { markersRef.current.get(id)?.remove(); markersRef.current.delete(id); });
        existingLines.forEach(id => { destLinesRef.current.get(id)?.remove(); destLinesRef.current.delete(id); });
    }, [displayShips, selectedShipId]);

    // Draw trails for selected ship from history snapshots
    useEffect(() => {
        if (!trailsLayerRef.current) return;
        trailsLayerRef.current.clearLayers();
        if (!selectedShipId || history.length < 2) return;

        const points: [number, number][] = [];
        for (const snap of history) {
            const s = snap.ships.find((x: any) => x.shipId === selectedShipId);
            if (s) {
                const lat = s.lat ?? (Array.isArray(s.position) ? s.position[0] : undefined);
                const lng = s.lng ?? (Array.isArray(s.position) ? s.position[1] : undefined);
                if (lat != null && lng != null) points.push([lat, lng]);
            }
        }
        // Add current live position too
        const liveShip = ships.find(s => s.shipId === selectedShipId) as any;
        if (liveShip && liveShip.lat != null && liveShip.lng != null) {
            points.push([liveShip.lat, liveShip.lng]);
        }

        if (points.length < 2) return;

        // Draw the historical track as a faded polyline
        L.polyline(points, {
            color: '#00d4ff',
            weight: 2,
            opacity: 0.4,
            dashArray: '2, 4',
        }).addTo(trailsLayerRef.current);

        // Add little dots at each historical position
        points.slice(0, -1).forEach((p, i) => {
            const opacity = 0.2 + (i / points.length) * 0.4;
            L.circleMarker(p, {
                radius: 2,
                color: '#00d4ff',
                fillColor: '#00d4ff',
                fillOpacity: opacity,
                opacity,
                weight: 0,
            }).addTo(trailsLayerRef.current!);
        });
    }, [selectedShipId, history, ships, playbackTime]);

    // Pan to selected ship
    useEffect(() => {
        if (!selectedShipId || !mapInstance.current) return;
        const ship = ships.find(s => s.shipId === selectedShipId);
        if (ship?.lat && ship?.lng) {
            mapInstance.current.panTo([ship.lat, ship.lng], { animate: true, duration: 0.6 });
        }
    }, [selectedShipId]);

    // Draw mode
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        const handleClick = (e: L.LeafletMouseEvent) => {
            if (!drawMode) return;
            const pt: [number, number] = [e.latlng.lat, e.latlng.lng];
            drawPoints.current.push(pt);
            drawLayerRef.current?.clearLayers();
            if (drawPoints.current.length >= 3) {
                L.polygon(drawPoints.current, {
                    color: '#ffaa00', fillColor: '#ffaa00',
                    fillOpacity: 0.1, weight: 1.5, dashArray: '4, 4',
                }).addTo(drawLayerRef.current!);
            }
        };

        const handleDblClick = (e: L.LeafletMouseEvent) => {
            if (!drawMode || drawPoints.current.length < 3) return;
            e.originalEvent.preventDefault();
            const polygon = [...drawPoints.current];
            drawPoints.current = [];
            drawLayerRef.current?.clearLayers();
            const name = `ZONE-${Date.now().toString().slice(-4)}`;
            addZone({ id: `z-${Date.now()}`, name, polygon, createdAt: Date.now() });
            fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/zones`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, polygon }),
            });
            setDrawMode(false);
        };

        map.on('click', handleClick);
        map.on('dblclick', handleDblClick);
        drawMode ? map.dragging.disable() : map.dragging.enable();

        return () => {
            map.off('click', handleClick);
            map.off('dblclick', handleDblClick);
            map.dragging.enable();
        };
    }, [drawMode, addZone]);

    return (
        <div className="map-container">
            <div className="scanline-overlay" />

            <div className="map-controls">
                <button
                    className={`map-ctrl-btn ${drawMode ? 'active' : ''}`}
                    onClick={() => { setDrawMode(d => !d); drawPoints.current = []; drawLayerRef.current?.clearLayers(); }}
                >
                    {drawMode ? '✕ CANCEL' : '+ DRAW ZONE'}
                </button>
                <button className="map-ctrl-btn" onClick={() => mapInstance.current?.setView([25.5, 54.5], 7)}>
                    ⊙ RESET VIEW
                </button>
            </div>

            {drawMode && (
                <div style={{
                    position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(255,170,0,0.12)', border: '1px solid var(--amber)',
                    padding: '4px 16px', zIndex: 600,
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    color: 'var(--amber)', letterSpacing: 2,
                }}>
                    CLICK TO PLACE POINTS · DOUBLE-CLICK TO CLOSE ZONE
                </div>
            )}

            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

            {mouseCoords && (
                <div className="coord-display">
                    {mouseCoords.lat.toFixed(4)}°N &nbsp; {mouseCoords.lng.toFixed(4)}°E
                </div>
            )}

            <div className="corner-deco tl" />
            <div className="corner-deco tr" />
            <div className="corner-deco bl" />
            <div className="corner-deco br" />

            <Radar />
        </div>
    );
}
