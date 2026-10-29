/*
 * Pure logic of the floor plan widgets (hand-over section 11): device list, pin states, taps,
 * glow/tint per zone, summaries of the side panel. No React, no VIS; covered by plan.test.ts.
 *
 * Coordinates are in the units of the SVG viewBox, so the values of the drafts (LAMPS, SOCK, DEV ...)
 * can be taken over unchanged.
 */
import { formatValue, isOn, lowBattery, noReception } from './model';

export const DEVICE_TYPES = [
    'lampe',
    'dimmer',
    'steckdose',
    'rollo',
    'fenster',
    'tuer',
    'tor',
    'glasbruch',
    'rauchmelder',
    'sirene',
    'bewegung',
    'wasser',
    'thermometer',
    'geraet',
] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export interface PlanDevice {
    typ: DeviceType;
    /** shown in lists and popups; empty = room name */
    name: string;
    /** room id = id of the room polygon in the SVG */
    raum: string;
    x: number;
    y: number;
    /** main data point: on/off, open/closed, triggered, value */
    oid: string;
    /** write target if it differs from oid */
    oidSchreiben?: string;
    /** dimmer level 0-100 */
    oidHelligkeit?: string;
    /** blind position 0-100 (100 = open, see invertieren) */
    oidPosition?: string;
    /** blind is moving (slats animation) */
    oidFaehrt?: string;
    /** smoke detector: own detection (has priority) */
    oidRauch?: string;
    /** smoke detector: driven as siren by the alarm adapter */
    oidSirene?: string;
    oidEmpfang?: string;
    empfangGrenze?: number;
    oidBatterie?: string;
    batterieGrenze?: number;
    /** contacts: true = closed; blinds: 0 = open */
    invertieren?: boolean;
    /** icon of the register instead of the type icon (geraet: washing machine ...) */
    icon?: string;
    einheit?: string;
    nachkomma?: number;
}

export type ValueOf = (oid: string | undefined) => unknown;

/** Reads the JSON list of the editor; tolerant: wrong entries are skipped and reported */
export function parseDevices(json: unknown): { devices: PlanDevice[]; errors: string[] } {
    const errors: string[] = [];
    let raw: unknown = json;
    if (typeof json === 'string') {
        if (!json.trim()) {
            return { devices: [], errors };
        }
        try {
            raw = JSON.parse(json);
        } catch (e) {
            return { devices: [], errors: [`JSON: ${(e as Error).message}`] };
        }
    }
    if (!Array.isArray(raw)) {
        return { devices: [], errors: ['JSON: Liste [ … ] erwartet'] };
    }
    const devices: PlanDevice[] = [];
    raw.forEach((item: unknown, i) => {
        const d = item as Partial<PlanDevice> | null;
        if (!d || typeof d !== 'object') {
            errors.push(`#${i + 1}: kein Objekt`);
            return;
        }
        if (!DEVICE_TYPES.includes(d.typ as DeviceType)) {
            errors.push(`#${i + 1}: unbekannter typ "${String(d.typ)}"`);
            return;
        }
        const x = Number(d.x);
        const y = Number(d.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            errors.push(`#${i + 1}: x/y fehlen`);
            return;
        }
        devices.push({
            ...d,
            typ: d.typ as DeviceType,
            name: d.name || '',
            raum: d.raum || '',
            x,
            y,
            oid: d.oid || '',
        });
    });
    return { devices, errors };
}

/** Every data point of a device (for subscriptions) */
export function deviceOids(d: PlanDevice): string[] {
    return [
        d.oid,
        d.oidSchreiben,
        d.oidHelligkeit,
        d.oidPosition,
        d.oidFaehrt,
        d.oidRauch,
        d.oidSirene,
        d.oidEmpfang,
        d.oidBatterie,
    ].filter((id): id is string => !!id);
}

// ---------------------------------------------------------------- state of a device

/** Dimmer level 0-100 (from oidHelligkeit; without it 100 while on) */
export function dimLevel(d: PlanDevice, val: ValueOf): number {
    if (d.oidHelligkeit) {
        const n = Number(val(d.oidHelligkeit));
        return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    }
    return isOn(val(d.oid)) ? 100 : 0;
}

/** Blind position 0 (closed) - 100 (open) */
export function blindPosition(d: PlanDevice, val: ValueOf): number {
    const n = Number(val(d.oidPosition || d.oid));
    if (!Number.isFinite(n)) {
        return 0;
    }
    const p = Math.max(0, Math.min(100, n));
    return d.invertieren ? 100 - p : p;
}

/** Light, socket, device: on; contact: open; detector: triggered */
export function deviceOn(d: PlanDevice, val: ValueOf): boolean {
    switch (d.typ) {
        case 'dimmer':
            return d.oid ? isOn(val(d.oid)) : dimLevel(d, val) > 0;
        case 'rollo':
            return blindPosition(d, val) > 0;
        case 'fenster':
        case 'tuer':
        case 'tor':
            return d.invertieren ? !isOn(val(d.oid)) : isOn(val(d.oid));
        case 'rauchmelder':
            return isOn(val(d.oidRauch || d.oid)) || (!!d.oidSirene && isOn(val(d.oidSirene)));
        default:
            return isOn(val(d.oid));
    }
}

export type PinLook =
    'on' | 'off' | 'ok' | 'neutral' | 'warn' | 'alarm' | 'active' | 'water' | 'open' | 'part' | 'closed';

export interface PinState {
    look: PinLook;
    /** icon name of the register (state variant already chosen) */
    icon: string;
    /** small label at the pin: dimmer %, value, blind position */
    label: string;
    /** blind: closed part 0-100 for the shade inside the pin */
    shade?: number;
    /** animation runs (on, warning, alarm, moving) */
    animate: boolean;
    /** smoke detector: green LED flashes every 4 s while ok */
    led?: boolean;
    /** text of the alarm state (RAUCH / ALARM / BRUCH / WASSER) */
    alarmText?: string;
}

const TYPE_ICON: Record<DeviceType, { on: string; off: string }> = {
    lampe: { on: 'licht-an', off: 'licht' },
    dimmer: { on: 'licht-an', off: 'licht' },
    steckdose: { on: 'steckdose', off: 'steckdose' },
    rollo: { on: 'jalousie-offen', off: 'jalousie' },
    fenster: { on: 'fenster-offen', off: 'fenster' },
    tuer: { on: 'haustuer-offen', off: 'haustuer' },
    tor: { on: 'garage-offen', off: 'garage' },
    glasbruch: { on: 'glasbruch-alarm', off: 'glasbruch' },
    rauchmelder: { on: 'rauchmelder-alarm', off: 'rauchmelder' },
    sirene: { on: 'sirene-an', off: 'sirene' },
    bewegung: { on: 'bewegung-aktiv', off: 'bewegung' },
    wasser: { on: 'wasser-alarm', off: 'wasser' },
    thermometer: { on: 'thermometer', off: 'thermometer' },
    geraet: { on: 'energie', off: 'energie' },
};

export function pinState(d: PlanDevice, val: ValueOf, lang: string): PinState {
    const on = deviceOn(d, val);
    const icon = d.icon && d.typ === 'geraet' ? d.icon : TYPE_ICON[d.typ][on ? 'on' : 'off'];
    switch (d.typ) {
        case 'lampe':
        case 'steckdose':
            return { look: on ? 'on' : 'off', icon, label: '', animate: on };
        case 'dimmer': {
            const level = dimLevel(d, val);
            return {
                look: on ? 'on' : 'off',
                icon,
                label: on && d.oidHelligkeit ? `${Math.round(level)} %` : '',
                animate: on,
            };
        }
        case 'rollo': {
            const p = blindPosition(d, val);
            return {
                look: p >= 100 ? 'open' : p <= 0 ? 'closed' : 'part',
                icon,
                label: p <= 0 ? (lang === 'en' ? 'closed' : 'zu') : `${Math.round(p)} %`,
                shade: 100 - p,
                animate: !!d.oidFaehrt && isOn(val(d.oidFaehrt)),
            };
        }
        case 'fenster':
        case 'tuer':
        case 'tor':
            return { look: on ? 'warn' : 'ok', icon, label: '', animate: on };
        case 'glasbruch':
            return {
                look: on ? 'alarm' : 'neutral',
                icon,
                label: '',
                animate: on,
                alarmText: on ? 'BRUCH' : undefined,
            };
        case 'sirene':
            return {
                look: on ? 'alarm' : 'neutral',
                icon,
                label: '',
                animate: on,
                alarmText: on ? 'ALARM' : undefined,
            };
        case 'rauchmelder': {
            // two alarm states: own detection (smoke) has priority over the siren of the alarm adapter
            const smoke = isOn(val(d.oidRauch || d.oid));
            const siren = !!d.oidSirene && isOn(val(d.oidSirene));
            if (smoke) {
                return { look: 'alarm', icon: 'rauchmelder-alarm', label: '', animate: true, alarmText: 'RAUCH' };
            }
            if (siren) {
                return { look: 'alarm', icon: 'sirene-an', label: '', animate: true, alarmText: 'ALARM' };
            }
            return { look: 'neutral', icon: 'rauchmelder', label: '', animate: true, led: true };
        }
        case 'bewegung':
            return { look: on ? 'active' : 'neutral', icon, label: '', animate: on };
        case 'wasser':
            return {
                look: on ? 'water' : 'neutral',
                icon,
                label: '',
                animate: on,
                alarmText: on ? 'WASSER' : undefined,
            };
        case 'thermometer':
            return {
                look: 'neutral',
                icon,
                label: formatValue(val(d.oid), d.nachkomma ?? 1, d.einheit ?? '°', lang),
                animate: false,
            };
        case 'geraet':
            return { look: on ? 'ok' : 'off', icon, label: '', animate: on };
    }
}

export interface Diagnosis {
    noReception: boolean;
    lowBattery: boolean;
}

/** Battery-powered types (hand-over section 4); mains devices only get the reception badge */
const BATTERY_TYPES = new Set<DeviceType>([
    'fenster',
    'tuer',
    'glasbruch',
    'rauchmelder',
    'bewegung',
    'wasser',
    'thermometer',
]);

export function diagnosis(d: PlanDevice, val: ValueOf): Diagnosis {
    return {
        noReception: !!d.oidEmpfang && noReception(val(d.oidEmpfang), Number(d.empfangGrenze) || 0),
        lowBattery:
            BATTERY_TYPES.has(d.typ) && !!d.oidBatterie && lowBattery(val(d.oidBatterie), d.batterieGrenze ?? 20),
    };
}

// ---------------------------------------------------------------- taps

export type PinAction =
    | { kind: 'write'; oid: string; value: boolean | number }
    | { kind: 'popup'; popup: 'dimmer' | 'rollo' }
    | { kind: 'none' };

/** Short tap: lights/sockets toggle, blind open <-> closed, gate opens/closes; sensors do nothing */
export function tapAction(d: PlanDevice, val: ValueOf): PinAction {
    const on = deviceOn(d, val);
    const target = d.oidSchreiben || d.oid;
    switch (d.typ) {
        case 'lampe':
        case 'steckdose':
            return target ? { kind: 'write', oid: target, value: !on } : { kind: 'none' };
        case 'dimmer':
            if (d.oid || d.oidSchreiben) {
                return { kind: 'write', oid: target, value: !on };
            }
            return d.oidHelligkeit ? { kind: 'write', oid: d.oidHelligkeit, value: on ? 0 : 100 } : { kind: 'none' };
        case 'rollo': {
            const id = d.oidSchreiben || d.oidPosition || d.oid;
            const next = on ? 0 : 100;
            return id ? { kind: 'write', oid: id, value: d.invertieren ? 100 - next : next } : { kind: 'none' };
        }
        case 'tor':
            // "Tippen öffnet bzw. schließt" (hand-over 11.2b); written value = the wanted state
            return target ? { kind: 'write', oid: target, value: d.invertieren ? on : !on } : { kind: 'none' };
        default:
            return { kind: 'none' };
    }
}

/** Long press (500 ms): only dimmers (brightness) and blinds (height) */
export function longPressPopup(d: PlanDevice): 'dimmer' | 'rollo' | null {
    if (d.typ === 'dimmer' && d.oidHelligkeit) {
        return 'dimmer';
    }
    return d.typ === 'rollo' ? 'rollo' : null;
}

/** Value to write for a blind position (0 closed - 100 open) */
export function blindWrite(d: PlanDevice, pos: number): { oid: string; value: number } | null {
    const id = d.oidSchreiben || d.oidPosition || d.oid;
    const p = Math.max(0, Math.min(100, Math.round(pos)));
    return id ? { oid: id, value: d.invertieren ? 100 - p : p } : null;
}

// ---------------------------------------------------------------- popups

/** Auto close of the popups (hand-over 11.1): after a quick choice, after the slider, without input */
export const POPUP_CLOSE_MS = { quick: 600, slider: 1200, idle: 5000 } as const;

// ---------------------------------------------------------------- glow / tint

export interface Glow {
    x: number;
    y: number;
    /** radius in viewBox units */
    r: number;
    /** rgb "242,193,78" */
    rgb: string;
    /** gradient stops: [offset 0-1, alpha] */
    stops: [number, number][];
}

/**
 * Glow of a device inside its zone (hand-over 11.1 "Raum leuchtet", 11.2a tint):
 * light yellow by brightness, open blind daylight, open window / alarm red.
 * Radii follow the drafts (plan 884 px wide), scaled to the viewBox width.
 */
export function deviceGlow(d: PlanDevice, val: ValueOf, viewBoxWidth: number): Glow | null {
    const px = (n: number): number => (n / 884) * viewBoxWidth;
    switch (d.typ) {
        case 'lampe':
        case 'dimmer': {
            if (!deviceOn(d, val)) {
                return null;
            }
            const f = d.typ === 'dimmer' ? dimLevel(d, val) / 100 || 1 : 1;
            const a = 0.16 + 0.36 * f;
            return {
                x: d.x,
                y: d.y,
                r: px(150 + 130 * f),
                rgb: '242,193,78',
                // 5 soft steps 100 / 72 / 42 / 18 / 5 % -> 0
                stops: [
                    [0, a],
                    [0.22, a * 0.72],
                    [0.45, a * 0.42],
                    [0.7, a * 0.18],
                    [0.88, a * 0.05],
                    [1, 0],
                ],
            };
        }
        case 'rollo': {
            const f = blindPosition(d, val) / 100;
            if (f <= 0) {
                return null;
            }
            const r = px(110 + 80 * f);
            return {
                x: d.x,
                y: d.y,
                r,
                rgb: '190,215,245',
                stops: [
                    [0, 0.22 * f],
                    [px(70) / r, 0.1 * f],
                    [1, 0],
                ],
            };
        }
        case 'fenster':
        case 'tuer':
        case 'glasbruch':
        case 'rauchmelder':
        case 'wasser': {
            if (!deviceOn(d, val)) {
                return null;
            }
            const r = px(170);
            return {
                x: d.x,
                y: d.y,
                r,
                rgb: d.typ === 'wasser' ? '74,163,255' : '229,72,77',
                stops: [
                    [0, 0.34],
                    [px(60) / r, 0.16],
                    [px(120) / r, 0.05],
                    [1, 0],
                ],
            };
        }
        default:
            return null;
    }
}

/** Zone of a room: open areas without walls share one zone (e.g. entrance + hall + kitchen + living) */
export function zoneOf(room: string, zones: { id: string; raeume: string[] }[]): string {
    return zones.find(z => z.raeume.includes(room))?.id || room;
}

/** Parses the zone list of the editor: [{ "id": "offen", "raeume": ["eingang", "flur"] }] */
export function parseZones(json: unknown): { id: string; raeume: string[] }[] {
    try {
        const raw: unknown = typeof json === 'string' ? (json.trim() ? JSON.parse(json) : []) : json;
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw
            .filter((z: unknown): z is { id: unknown; raeume: unknown } => !!z && typeof z === 'object')
            .map(z => ({ id: String(z.id), raeume: Array.isArray(z.raeume) ? z.raeume.map(String) : [] }))
            .filter(z => z.id && z.raeume.length);
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------- SVG

export interface Room {
    id: string;
    name: string;
    /** polygon points "x,y x,y ..." */
    points: string;
}

/** viewBox "-6 -6 717 594" -> numbers; fallback width/height */
export function parseViewBox(vb: string | null | undefined): { x: number; y: number; w: number; h: number } | null {
    const n = String(vb ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
    return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0
        ? { x: n[0], y: n[1], w: n[2], h: n[3] }
        : null;
}

/** Bounding box of polygon points */
export function pointsBox(points: string): { x: number; y: number; w: number; h: number } {
    const nums = points
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter(Number.isFinite);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    if (!xs.length || !ys.length) {
        return { x: 0, y: 0, w: 0, h: 0 };
    }
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Room name for lists: data-name of the SVG, else the id with a capital letter */
export function roomName(id: string, rooms: Room[]): string {
    const r = rooms.find(room => room.id === id);
    return r?.name || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
}

// ---------------------------------------------------------------- side panel

export type PanelFunction = 'licht' | 'steckdose' | 'rollo' | 'sicherheit';

export interface RoomRow {
    raum: string;
    name: string;
    on: number;
    total: number;
}

/** Light: per room "n von m an" */
export function roomRows(devices: PlanDevice[], val: ValueOf, rooms: Room[], types: DeviceType[]): RoomRow[] {
    const rows: RoomRow[] = [];
    for (const d of devices) {
        if (!types.includes(d.typ)) {
            continue;
        }
        let row = rows.find(r => r.raum === d.raum);
        if (!row) {
            row = { raum: d.raum, name: roomName(d.raum, rooms), on: 0, total: 0 };
            rows.push(row);
        }
        row.total++;
        if (deviceOn(d, val)) {
            row.on++;
        }
    }
    // order of the rooms in the SVG, rooms unknown to the SVG at the end
    const order = (id: string): number => {
        const i = rooms.findIndex(r => r.id === id);
        return i < 0 ? 999 : i;
    };
    return rows.sort((a, b) => order(a.raum) - order(b.raum));
}

/** "Wartung: 1 ohne Empfang (Flur) · 2 Batterie schwach (Bad, Küche)" or "" */
export function maintenanceText(devices: PlanDevice[], val: ValueOf, rooms: Room[]): string {
    const wifi: string[] = [];
    const batt: string[] = [];
    for (const d of devices) {
        const g = diagnosis(d, val);
        if (g.noReception) {
            wifi.push(roomName(d.raum, rooms));
        }
        if (g.lowBattery) {
            batt.push(roomName(d.raum, rooms));
        }
    }
    const uniq = (a: string[]): string => [...new Set(a)].join(', ');
    const parts: string[] = [];
    if (wifi.length) {
        parts.push(`${wifi.length} ohne Empfang (${uniq(wifi)})`);
    }
    if (batt.length) {
        parts.push(`${batt.length} Batterie schwach (${uniq(batt)})`);
    }
    return parts.length ? `Wartung: ${parts.join(' · ')}` : '';
}

/** Blinds: "3 offen · 1 teilweise · 6 zu" */
export function blindSummary(devices: PlanDevice[], val: ValueOf): { open: number; part: number; closed: number } {
    const s = { open: 0, part: 0, closed: 0 };
    for (const d of devices) {
        if (d.typ !== 'rollo') {
            continue;
        }
        const p = blindPosition(d, val);
        if (p >= 100) {
            s.open++;
        } else if (p <= 0) {
            s.closed++;
        } else {
            s.part++;
        }
    }
    return s;
}

export interface SecurityGroup {
    key: 'kontakte' | 'rauch' | 'glas' | 'bewegung' | 'sirene' | 'wasser';
    label: string;
    total: number;
    active: PlanDevice[];
}

/** Security summary: windows & doors / smoke / glass / motion / siren / water */
export function securityGroups(devices: PlanDevice[], val: ValueOf): SecurityGroup[] {
    const defs: { key: SecurityGroup['key']; label: string; types: DeviceType[] }[] = [
        { key: 'kontakte', label: 'Fenster & Türen', types: ['fenster', 'tuer', 'tor'] },
        { key: 'rauch', label: 'Rauchmelder', types: ['rauchmelder'] },
        { key: 'glas', label: 'Glasbruch', types: ['glasbruch'] },
        { key: 'bewegung', label: 'Bewegung', types: ['bewegung'] },
        { key: 'wasser', label: 'Wasser', types: ['wasser'] },
        { key: 'sirene', label: 'Sirene', types: ['sirene'] },
    ];
    return defs
        .map(def => {
            const all = devices.filter(d => def.types.includes(d.typ));
            return { key: def.key, label: def.label, total: all.length, active: all.filter(d => deviceOn(d, val)) };
        })
        .filter(g => g.total > 0);
}
