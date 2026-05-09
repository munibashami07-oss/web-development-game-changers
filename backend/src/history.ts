interface Snapshot {
    timestamp: number;
    ships: any[];
}

const snapshots: Snapshot[] = [];
const MAX = 120;

export function saveSnapshot(ships: any[]) {
    snapshots.push({ timestamp: Date.now(), ships: JSON.parse(JSON.stringify(ships)) });
    if (snapshots.length > MAX) snapshots.shift();
}

export function getHistory() {
    return snapshots;
}