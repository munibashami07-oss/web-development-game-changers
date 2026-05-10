export type ShipStatus = 'NOMINAL' | 'ALERT' | 'CRITICAL' | 'DISTRESS' | 'ANCHORED' | 'REROUTING';

export interface Ship {
    shipId: string;
    name: string;
    lat: number;
    lng: number;
    heading: number;
    speed: number;        // knots
    fuel: number;         // percentage 0-100
    cargo: string;
    status: ShipStatus;
    destination: { lat: number; lng: number; name: string };
    eta?: number;         // minutes
    flag?: string;
    imo?: string;
    directives?: Directive[];
}

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Alert {
    id: string;
    type: string;
    shipId?: string;
    severity: AlertSeverity;
    message: string;
    acknowledged: boolean;
    timestamp: number;
    metadata?: any;
}

export interface Zone {
    id: string;
    name: string;
    polygon: [number, number][];
    createdAt: number;
    type?: 'restricted' | 'warning' | 'weather';
}

export interface Directive {
    id: string;
    type: 'REROUTE' | 'HOLD' | 'DIVERT' | 'RELEASE' | 'EMERGENCY';
    message: string;
    timestamp: number;
    acknowledged?: boolean;
    from: 'command';
}

export interface WeatherZone {
    lat: number;
    lng: number;
    severity: number;
    radius: number;
}

export type UserRole = 'command' | 'captain';

export interface Snapshot {
    timestamp: number;
    ships: Ship[];
}