/*
 * Logic of the network tile and page (widget ZuhauseNetz), written for the adapter unifi-map:
 * reads summary.state, summary.json and topology.json, decides the look of the tile and places the map.
 * Pure functions, no DOM.
 */

/** gateway, switch, accessPoint or unknownSwitch (placeholder) */
export type NetzRolle = string;
export type NetzZustand = 'ok' | 'degraded' | 'offline' | 'consequence' | 'busy';

export interface NetzKnoten {
    id: string;
    name: string;
    model: string;
    role: NetzRolle;
    virtual: boolean;
    state: NetzZustand;
    uplinkId: string;
    causeId: string;
    updatable: boolean;
}

export interface NetzKante {
    from: string;
    to: string;
    type: string;
    speed: number | null;
    signal: number | null;
    degraded: boolean;
    port: number | null;
}

export interface NetzTopologie {
    rootId: string;
    nodes: NetzKnoten[];
    edges: NetzKante[];
}

/** One device of summary.json (details for the page) */
export interface NetzGeraet {
    id: string;
    uptime: number | null;
    firmware: string;
    clients: number | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parse(v: unknown): unknown {
    if (typeof v !== 'string' || !v) {
        return null;
    }
    try {
        return JSON.parse(v);
    } catch {
        return null;
    }
}

/** topology.json of the adapter; null if missing or broken */
export function parseTopologie(v: unknown): NetzTopologie | null {
    const t = parse(v) as { rootId?: unknown; nodes?: unknown; edges?: unknown } | null;
    if (!t || !Array.isArray(t.nodes)) {
        return null;
    }
    const nodes: NetzKnoten[] = (t.nodes as Record<string, unknown>[])
        .filter(n => n && typeof n.id === 'string')
        .map(n => ({
            id: str(n.id),
            name: str(n.name),
            model: str(n.model),
            role: str(n.role),
            virtual: n.virtual === true,
            state: (['ok', 'degraded', 'offline', 'consequence', 'busy'].includes(str(n.state))
                ? str(n.state)
                : 'ok') as NetzZustand,
            uplinkId: str(n.uplinkId),
            causeId: str(n.causeId),
            updatable: n.updatable === true,
        }));
    const edges: NetzKante[] = (Array.isArray(t.edges) ? (t.edges as Record<string, unknown>[]) : [])
        .filter(e => e && typeof e.from === 'string' && typeof e.to === 'string')
        .map(e => ({
            from: str(e.from),
            to: str(e.to),
            type: str(e.type),
            speed: num(e.speed),
            signal: num(e.signal),
            degraded: e.degraded === true,
            port: num(e.port),
        }));
    return { rootId: str(t.rootId), nodes, edges };
}

/** summary.json of the adapter: id -> details */
export function parseGeraete(v: unknown): Map<string, NetzGeraet> {
    const list = parse(v);
    const out = new Map<string, NetzGeraet>();
    if (!Array.isArray(list)) {
        return out;
    }
    for (const d of list as Record<string, unknown>[]) {
        if (d && typeof d.id === 'string') {
            out.set(d.id, { id: d.id, uptime: num(d.uptime), firmware: str(d.firmware), clients: num(d.clients) });
        }
    }
    return out;
}

/** What the tile shows */
export type KachelZustand = 'ok' | 'langsam' | 'update' | 'updateLaeuft' | 'gestoert' | 'keineDaten';

/**
 * Look of the tile. Failure before everything else, then a running update, then slow links, then an update.
 *
 * @param summaryState - summary.state of the adapter (ok, degraded, offline, stale)
 * @param topo - topology.json
 * @param connected - info.connection (false = no connection to the console)
 */
export function kachelZustand(summaryState: unknown, topo: NetzTopologie | null, connected: unknown): KachelZustand {
    if (summaryState === 'stale' || !topo || !topo.nodes.length || connected === false) {
        return 'keineDaten';
    }
    const real = topo.nodes.filter(n => !n.virtual);
    if (summaryState === 'offline' || real.some(n => n.state === 'offline')) {
        return 'gestoert';
    }
    if (real.some(n => n.state === 'busy')) {
        return 'updateLaeuft';
    }
    if (summaryState === 'degraded' || real.some(n => n.state === 'degraded')) {
        return 'langsam';
    }
    if (real.some(n => n.updatable)) {
        return 'update';
    }
    return 'ok';
}

export const KACHEL_TEXT: Record<KachelZustand, string> = {
    ok: 'Netzwerk',
    langsam: 'Netz langsam',
    update: 'Netzwerk',
    updateLaeuft: 'Update läuft',
    gestoert: 'Netz gestört',
    keineDaten: 'Netzwerk',
};

export const KACHEL_STATUS: Record<KachelZustand, string> = {
    ok: 'Netzwerk läuft',
    langsam: 'Uplink langsamer als gewohnt',
    update: 'Firmware-Update verfügbar',
    updateLaeuft: 'Firmware-Update läuft',
    gestoert: 'Gerät ausgefallen',
    keineDaten: 'Keine aktuellen Daten',
};

// ---------------------------------------------------------------- map

/** Size of a device card, column and row distance (SVG units) */
export const KARTE = { breite: 132, hoehe: 54, spalte: 144, zeile: 88, rand: 6 } as const;
/** Longest chain followed, so broken data with a loop cannot hang the page */
const MAX_TIEFE = 32;

export interface Punkt {
    x: number;
    y: number;
}

/** Places the tree from the console downwards; devices without a way to it get a row below */
export function anordnen(topo: NetzTopologie | null): {
    pos: Record<string, Punkt>;
    ohneWeg: string[];
    breite: number;
    hoehe: number;
} {
    const nodes = topo?.nodes ?? [];
    const byId = new Map(nodes.map(n => [n.id, n]));
    const kids = new Map<string, NetzKnoten[]>();
    for (const n of nodes) {
        if (n.id !== topo?.rootId && n.uplinkId && byId.has(n.uplinkId)) {
            const list = kids.get(n.uplinkId) ?? [];
            list.push(n);
            kids.set(n.uplinkId, list);
        }
    }
    // stable order: devices with something behind them first, then by name
    for (const list of kids.values()) {
        list.sort((a, b) => Number(kids.has(b.id)) - Number(kids.has(a.id)) || a.name.localeCompare(b.name));
    }
    const pos: Record<string, Punkt> = {};
    let blatt = 0;
    let tiefeMax = 0;
    const x = (i: number): number => KARTE.rand + KARTE.breite / 2 + i * KARTE.spalte;
    const y = (d: number): number => KARTE.rand + KARTE.hoehe / 2 + d * KARTE.zeile;
    const setze = (n: NetzKnoten, tiefe: number): void => {
        tiefeMax = Math.max(tiefeMax, tiefe);
        const kinder = tiefe < MAX_TIEFE ? (kids.get(n.id) ?? []).filter(k => !pos[k.id]) : [];
        pos[n.id] = { x: 0, y: y(tiefe) };
        if (!kinder.length) {
            pos[n.id].x = x(blatt++);
            return;
        }
        kinder.forEach(k => setze(k, tiefe + 1));
        const xs = kinder.map(k => pos[k.id].x);
        pos[n.id].x = (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    const root = byId.get(topo?.rootId ?? '');
    if (root) {
        setze(root, 0);
    }
    const ohneWeg = nodes.filter(n => !pos[n.id]).map(n => n.id);
    if (ohneWeg.length) {
        const zeile = root ? tiefeMax + 1 : 0;
        tiefeMax = zeile;
        ohneWeg.forEach((id, i) => (pos[id] = { x: x(i), y: y(zeile) }));
    }
    const spalten = Math.max(blatt, ohneWeg.length, 1);
    return {
        pos,
        ohneWeg,
        breite: KARTE.rand * 2 + KARTE.breite + (spalten - 1) * KARTE.spalte,
        hoehe: KARTE.rand * 2 + KARTE.hoehe + tiefeMax * KARTE.zeile,
    };
}

/** Link speed short: "1 G", "100 M", "2.5 G" */
export function tempo(mbps: number | null | undefined): string {
    if (typeof mbps !== 'number' || !Number.isFinite(mbps) || mbps <= 0) {
        return '';
    }
    return mbps >= 1000 ? `${Math.round(mbps / 100) / 10} G` : `${Math.round(mbps)} M`;
}

/** Text at a link: "Port 3 · 1 G", "Mesh · -62 dBm", "Port 4" */
export function kantenText(e: NetzKante, kind: NetzKnoten | undefined): string {
    let t = '';
    if (!kind?.virtual) {
        t = e.type === 'wireless' ? (e.signal !== null ? `Mesh · ${e.signal} dBm` : 'Mesh') : tempo(e.speed);
    }
    if (e.port !== null) {
        t = t ? `Port ${e.port} · ${t}` : `Port ${e.port}`;
    }
    return t;
}

/** Name on the card: switches without "Switch", the second line says it */
export function kartenName(n: NetzKnoten): string {
    if (n.virtual) {
        return 'Nicht UniFi';
    }
    return n.role === 'switch' ? n.name.replace(/^Switch\s+/i, '') || n.name : n.name;
}

/** Uptime: "13 T 16 h", "5 h" */
export function laufzeit(sec: number | null | undefined): string {
    if (typeof sec !== 'number' || sec < 0) {
        return '–';
    }
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return d ? `${d} T ${h} h` : `${h} h`;
}

/** Shortens text for a card */
export function kuerzen(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
