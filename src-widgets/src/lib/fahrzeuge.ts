/*
 * Vehicles card (adapter ioBroker.mobility): data points and pure helpers for the widget ZuhauseFahrzeuge.
 * Layout decided 13.11.2026: cars in the top row (fuel | electric | camper planned), both wallboxes with
 * start/stop below, warnings as symbols in the name line (worst first, max. 3, then "+n").
 */
import { formatNumber } from './model';

// ---------------------------------------------------------------- data points

/** Data points below mobility.0.ford.vehicle<N> */
export const VEHICLE_DP = [
    'name',
    'engineType',
    'lastUpdate',
    'fuelLevel',
    'fuelRange',
    'soc',
    'evRange',
    'plugStatus',
    'chargeStatus',
    'timeToFull',
    'warnings',
] as const;
export type VehicleDp = (typeof VEHICLE_DP)[number];

/** Data points below mobility.0.easee.charger<N> */
export const CHARGER_DP = [
    'name',
    'online',
    'opMode',
    'carConnected',
    'charging',
    'power',
    'sessionEnergy',
    'reasonText',
    'lastUpdate',
    'charge',
    'history.lastSession',
] as const;
export type ChargerDp = (typeof CHARGER_DP)[number];

/** Data points directly below the instance */
export const GLOBAL_DP = [
    'info.connection',
    'easee.streamConnected',
    'fuel.cheapestStation',
    'fuel.cheapestPrice',
] as const;
export type GlobalDp = (typeof GLOBAL_DP)[number];

/** Easee op modes (same table as in the adapter) */
export const OP_MODE = {
    offline: 0,
    disconnected: 1,
    awaitingStart: 2,
    charging: 3,
    completed: 4,
    error: 5,
    readyToCharge: 6,
    awaitingAuthentication: 7,
    deauthenticating: 8,
} as const;

/** The wallbox needs some seconds to confirm a command; the adapter re-reads after 10 s and 40 s */
export const COMMAND_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------- small readers

export function num(value: unknown): number | null {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
        return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function clampPct(value: number | null): number {
    return value === null ? 0 : Math.max(0, Math.min(100, value));
}

// ---------------------------------------------------------------- vehicles

export type Drive = 'fuel' | 'ev';

/** BEV = electric; everything else (petrol, HEV, MHEV, PHEV) fills up at the station */
export function driveOf(engineType: unknown): Drive {
    return text(engineType).toUpperCase() === 'BEV' ? 'ev' : 'fuel';
}

export function isPluggedIn(plugStatus: unknown): boolean {
    const s = text(plugStatus).toUpperCase();
    return s !== '' && s !== 'DISCONNECTED';
}

export function isCharging(chargeStatus: unknown): boolean {
    return text(chargeStatus).toUpperCase() === 'CHARGING';
}

/**
 * Time the car is expected to be full: Ford reports minutes at the time of its last answer.
 * null when unknown, not charging or already in the past.
 */
export function fullAt(timeToFull: unknown, lastUpdate: unknown, now: number): number | null {
    const minutes = num(timeToFull);
    const at = num(lastUpdate);
    if (minutes === null || minutes <= 0 || at === null) {
        return null;
    }
    const t = at + minutes * 60_000;
    return t > now ? t : null;
}

export function clock(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- warnings

export type WarnLevel = 'critical' | 'warning' | 'info';

export interface Warning {
    key: string;
    level: WarnLevel;
    value?: number;
    unit?: string;
    wheel?: string;
}

/** Symbol per adapter key (paths in the widget) */
export const WARN_SYMBOL: Record<string, string> = {
    alarm: 'alarm',
    tyre: 'reifen',
    tyreLoss: 'reifen',
    unlocked: 'offen',
    door: 'tuer',
    window: 'fenster',
    chargeFault: 'ladefehler',
    fuel: 'tank',
    battery: 'akku',
    battery12v: 'v12',
    oil: 'oel',
    notPluggedIn: 'stecker',
    batteryPerformance: 'hvakku',
    frost: 'frost',
    stale: 'alt',
    login: 'login',
};

const WARN_TEXT: Record<string, string> = {
    alarm: 'Alarm ausgelöst',
    tyre: 'Reifendruck',
    tyreLoss: 'Reifen verliert Luft',
    unlocked: 'nicht verriegelt',
    door: 'Tür/Klappe offen',
    window: 'Fenster offen',
    chargeFault: 'Laden abgebrochen',
    fuel: 'Tank fast leer',
    battery: 'Akku niedrig',
    battery12v: '12-V-Batterie schwach',
    oil: 'Öl wechseln',
    notPluggedIn: 'nicht eingesteckt',
    batteryPerformance: 'Akku-Leistung begrenzt',
    frost: 'Frost',
    stale: 'Daten veraltet',
    login: 'Ford-Login läuft bald ab',
};

const WHEEL_TEXT: Record<string, string> = {
    frontLeft: 'vorne links',
    frontRight: 'vorne rechts',
    rearLeft: 'hinten links',
    rearRight: 'hinten rechts',
};

const LEVEL_RANK: Record<WarnLevel, number> = { critical: 0, warning: 1, info: 2 };

/** Reads ford.vehicle<N>.warnings; unknown keys or levels are dropped, worst first (stable) */
export function parseWarnings(value: unknown): Warning[] {
    let list: unknown;
    try {
        list = typeof value === 'string' && value ? JSON.parse(value) : [];
    } catch {
        return [];
    }
    if (!Array.isArray(list)) {
        return [];
    }
    const out: Warning[] = [];
    for (const item of list) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const w = item as Record<string, unknown>;
        const key = text(w.key);
        const level = text(w.level) as WarnLevel;
        if (!WARN_SYMBOL[key] || !(level in LEVEL_RANK)) {
            continue;
        }
        const entry: Warning = { key, level };
        const value = num(w.value);
        if (value !== null) {
            entry.value = value;
        }
        if (text(w.unit)) {
            entry.unit = text(w.unit);
        }
        if (text(w.wheel)) {
            entry.wheel = text(w.wheel);
        }
        out.push(entry);
    }
    return out
        .map((w, i) => ({ w, i }))
        .sort((a, b) => LEVEL_RANK[a.w.level] - LEVEL_RANK[b.w.level] || a.i - b.i)
        .map(x => x.w);
}

/** Tooltip / screen reader text, e.g. "12-V-Batterie schwach: 30 %" */
export function warningText(w: Warning, lang = 'de'): string {
    let t = WARN_TEXT[w.key] ?? w.key;
    if (w.wheel && WHEEL_TEXT[w.wheel]) {
        t += ` ${WHEEL_TEXT[w.wheel]}`;
    }
    if (w.value !== undefined) {
        const decimals = w.unit === 'bar' || w.unit === 'V' ? (w.unit === 'V' ? 2 : 1) : 0;
        t += `: ${formatNumber(w.value, decimals, lang)}${w.unit ? (w.unit === '%' ? ' %' : ` ${w.unit}`) : ''}`;
    }
    return t;
}

/** At most `max` symbols; the rest becomes "+n" */
export function visibleWarnings(list: Warning[], max = 3): { shown: Warning[]; more: number } {
    return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}

// ---------------------------------------------------------------- wallboxes

/** frei = no car, bereit = car plugged in, laedt = charging, warte = command sent, not confirmed yet */
export type WallboxPhase = 'offline' | 'frei' | 'bereit' | 'laedt' | 'fehler';

export interface ChargerInput {
    online: unknown;
    opMode: unknown;
    carConnected: unknown;
    charging: unknown;
}

export function wallboxPhase(c: ChargerInput): WallboxPhase {
    if (c.online === false || num(c.opMode) === OP_MODE.offline) {
        return 'offline';
    }
    const mode = num(c.opMode);
    if (mode === OP_MODE.charging || (mode === null && c.charging === true)) {
        return 'laedt';
    }
    if (mode === OP_MODE.error) {
        return 'fehler';
    }
    if (mode === OP_MODE.disconnected || (mode === null && c.carConnected !== true)) {
        return 'frei';
    }
    return 'bereit';
}

export interface Pending {
    /** true = start, false = stop */
    wanted: boolean;
    since: number;
}

export type PendingResult = 'wait' | 'done' | 'rejected' | 'timeout';

/**
 * State of a sent command. The adapter writes `charge` (ack) to the requested value right after sending
 * and back to the real value when the command was refused; the wallbox confirms through its op mode.
 */
export function pendingResult(
    p: Pending,
    phase: WallboxPhase,
    charge: { val: unknown; ack: boolean; ts: number } | undefined,
    now: number,
): PendingResult {
    if (p.wanted ? phase === 'laedt' : phase !== 'laedt') {
        return 'done';
    }
    if (charge?.ack && charge.ts >= p.since && charge.val === !p.wanted) {
        return 'rejected';
    }
    return now - p.since >= COMMAND_TIMEOUT_MS ? 'timeout' : 'wait';
}

/** kWh of the last finished session (easee.charger<N>.history.lastSession), null when none */
export function lastSessionKwh(value: unknown): number | null {
    try {
        const s: unknown = typeof value === 'string' && value ? JSON.parse(value) : null;
        return s && typeof s === 'object' ? num((s as Record<string, unknown>).kwh) : null;
    } catch {
        return null;
    }
}

export interface WallboxTextInput {
    phase: WallboxPhase | 'warte';
    opMode: unknown;
    power: unknown;
    sessionEnergy: unknown;
    reasonText: unknown;
    lastKwh: number | null;
    /** name of the electric car when Ford says it is plugged in and only this wallbox has a car */
    car: string;
}

export function wallboxText(i: WallboxTextInput, lang = 'de'): string {
    switch (i.phase) {
        case 'offline':
            return 'offline';
        case 'warte':
            return 'warte auf Wallbox …';
        case 'fehler':
            return text(i.reasonText) || 'Fehler';
        case 'frei':
            return i.lastKwh !== null ? `frei · zuletzt ${formatNumber(i.lastKwh, 1, lang)} kWh` : 'frei · kein Auto';
        case 'laedt': {
            const kw = num(i.power);
            const kwh = num(i.sessionEnergy);
            const parts = [
                kw !== null ? `${formatNumber(kw, 1, lang)} kW` : '',
                kwh !== null ? `${formatNumber(kwh, 1, lang)} kWh` : '',
            ].filter(Boolean);
            return parts.join(' · ') || 'lädt';
        }
        default: {
            const who = i.car || 'Auto';
            return num(i.opMode) === OP_MODE.completed ? `${who} · fertig geladen` : `${who} steckt`;
        }
    }
}

// ---------------------------------------------------------------- head line

/** "Ford 17:54 · Wallbox live" */
export function standText(fordTs: number | null, streamLive: unknown, wallboxTs: number | null): string {
    const parts: string[] = [];
    if (fordTs !== null) {
        parts.push(`Ford ${clock(fordTs)}`);
    }
    if (streamLive === true) {
        parts.push('Wallbox live');
    } else if (wallboxTs !== null) {
        parts.push(`Wallbox ${clock(wallboxTs)}`);
    }
    return parts.join(' · ');
}

export function price(value: unknown, lang = 'de'): string {
    const n = num(value);
    return n === null ? '—' : `${formatNumber(n, 3, lang)} €`;
}
