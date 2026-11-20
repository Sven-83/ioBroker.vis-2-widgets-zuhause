/*
 * Tank view of the aquarium (spec Claude-Specs/chihiros-aquarium.md, part D / phase 6; preview accepted 20.11.2026,
 * .local/bin/aquarium/vorschau/vorschlaege/v2.html). Pure logic without React, so it can be tested:
 * data point ids, schedule windows, lamp level and colour, fan curve, colour presets, fertiliser bottles, care.
 * The widget reads the adapter chihiros.0, the Shelly plugs and the states of script.js.vis2.Aquarium.
 */

export const CH = 'chihiros.0';

/** Shelly plugs of the tank (same list as script.js.vis2.Aquarium) */
export const PLUGS = {
    filter: { name: 'Filter', id: 'shelly.0.SHPLG-S#C0FDB2#1', hold: true },
    heizung: { name: 'Heizung', id: 'shelly.0.SHPLG-S#C6E8A7#1', hold: true },
    uv: { name: 'UV-Klärer', id: 'shelly.0.SHPLG-S#FDC6B0#1', hold: true },
    skimmer: { name: 'Skimmer', id: 'shelly.0.SHPLG-S#E4460D#1', hold: false },
    nachfuell: { name: 'Nachfüllautomatik', id: 'shelly.1.shellyplusplugs#d48afc56bd84#1', hold: false },
    co2Plug: { name: 'CO₂-Steckdose', id: 'shelly.0.SHPLG-S#1C1037#1', hold: false },
    luefterPlug: { name: 'Lüfter-Steckdose', id: 'shelly.0.SHPLG-S#43EB9B#1', hold: false },
    hinter: { name: 'Hintergrundlicht', id: 'shelly.0.SHPLG-S#DE024E#1', hold: false },
} as const;

export type PlugKey = keyof typeof PLUGS;

/** plugs that must always stay on: they are switched by Bluetooth (Sven 17.11.2026), no switch in the view */
export const LOCKED: readonly PlugKey[] = ['co2Plug', 'luefterPlug'];

export const plugSwitch = (k: PlugKey): string => `${PLUGS[k].id}.Relay0.Switch`;
export const plugPower = (k: PlugKey): string => `${PLUGS[k].id}.Relay0.Power`;

const L = `${CH}.devices.lampe`;
const P = `${CH}.devices.dosierpumpe`;
const F = `${CH}.devices.luefter`;
const C = `${CH}.devices.co2`;
const D = `${CH}.devices.doctor`;
const A = `${CH}.aquarium`;

/** chihiros.0 data points used by the view */
export const IDS = {
    connection: `${CH}.info.connection`,
    lampOn: `${L}.on`,
    red: `${L}.red`,
    green: `${L}.green`,
    blue: `${L}.blue`,
    white: `${L}.white`,
    schedule: `${L}.schedule`,
    sunrise: `${L}.sunrise`,
    sunset: `${L}.sunset`,
    lampResult: `${L}.commandResult`,
    co2On: `${C}.on`,
    valve: `${C}.valveOpen`,
    co2Result: `${C}.commandResult`,
    waterTemp: `${A}.waterTemp`,
    tempMin: `${A}.tempMin`,
    tempMax: `${A}.tempMax`,
    warnDays: `${A}.warnDays`,
    mode: `${D}.mode`,
    fanLevel: `${F}.level`,
    fanRunning: `${F}.running`,
    fanAuto: `${F}.auto`,
    fanOnTemp: `${F}.autoOnTemp`,
    fanOffTemp: `${F}.autoOffTemp`,
    fanAutoLevel: `${F}.autoLevel`,
    pumpResult: `${P}.commandResult`,
    lastRead: `${L}.lastRead`,
} as const;

/** data points that come with the adapter update (phase 6b); the view switches them on when they exist */
export const FUTURE = {
    lampSchedule: `${L}.scheduleSet`,
    co2Schedule: `${C}.schedule`,
    fanCurve: `${F}.curve`,
    fanInstalled: `${F}.installed`,
    fanResume: `${F}.autoResumeAt`,
    tempHistory: `${A}.waterTempHistory`,
} as const;

export const pumpId = (n: number, name: string): string => `${P}.pump${n}.${name}`;
/** fields of a pump bottle (phase 4 of the adapter) */
export const PUMP_FIELDS = ['label', 'remaining', 'refillAmount', 'dailyDose', 'daysLeft', 'low', 'total'] as const;
/** P1 iron, P2 GH Boost, P3 NPK (P4 unused) */
export const PUMPS = [1, 2, 3] as const;
export const PUMP_COLOURS = ['#d0843f', '#7bd389', '#5fc4e6'] as const;
export const PUMP_SHORT = ['FE', 'GH', 'NPK'] as const;
/** largest manual dose (safety limit of the adapter) */
export const MAX_DOSE = 5;

/** litres of the tank (Sven 20.11.2026) */
export const TANK_L = 180;

// ---------- small helpers ----------

export const num = (x: unknown): number | null => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
    return Number.isFinite(n) ? n : null;
};

/**
 * Number in German notation.
 *
 * @param x value
 * @param d decimals
 */
export const fmt = (x: number, d = 1): string => x.toFixed(d).replace('.', ',');

/**
 * Minutes of the day as "hh:mm"; 1440 stays "24:00".
 *
 * @param m minutes
 */
export function hhmm(m: number): string {
    const t = Math.max(0, Math.min(1440, Math.round(m)));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Time windows "11:00-12:00, 14:00-20:00" → [[660, 720], [840, 1200]]; broken parts are dropped.
 *
 * @param raw text of lampe.schedule or co2.schedule
 */
export function parseWindows(raw: unknown): Array<[number, number]> {
    if (typeof raw !== 'string') {
        return [];
    }
    const out: Array<[number, number]> = [];
    for (const part of raw.split(',')) {
        const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(part);
        if (!m) {
            continue;
        }
        const a = Number(m[1]) * 60 + Number(m[2]);
        const b = Number(m[3]) * 60 + Number(m[4]);
        if (a < b && b <= 1440) {
            out.push([a, b]);
        }
    }
    return out.sort((x, y) => x[0] - y[0]);
}

/**
 * Text of time windows, the format of the adapter.
 *
 * @param w windows in minutes
 */
export const windowsText = (w: Array<[number, number]>): string =>
    w.map(([a, b]) => `${hhmm(a)}-${hhmm(b)}`).join(', ');

/**
 * Lamp level 0..1 by schedule incl. sunrise and sunset ramps (minutes).
 *
 * @param min minute of the day
 * @param win schedule windows
 * @param up sunrise in minutes
 * @param down sunset in minutes
 */
export function lampLevel(min: number, win: Array<[number, number]>, up = 1, down = 1): number {
    for (const [a, b] of win) {
        if (min >= a && min < b) {
            return Math.max(0, Math.min(1, (min - a) / Math.max(1, up), (b - min) / Math.max(1, down)));
        }
    }
    return 0;
}

/**
 * Next change of the light: "an bis 20:00" / "aus · ab 14:00".
 *
 * @param min minute of the day
 * @param win schedule windows
 */
export function lightText(min: number, win: Array<[number, number]>): string {
    const cur = win.find(([a, b]) => min >= a && min < b);
    if (cur) {
        return `an bis ${hhmm(cur[1])}`;
    }
    if (!win.length) {
        return 'kein Zeitplan';
    }
    const next = win.find(([a]) => a > min) ?? win[0];
    return `aus · ab ${hhmm(next[0])}`;
}

/**
 * Visible colour of the RGBW channels (white adds to all), brightest channel = 255.
 *
 * @param r red 0..255
 * @param g green
 * @param b blue
 * @param w white
 */
export function lampRgb(r: number, g: number, b: number, w: number): [number, number, number] {
    const R = r + w * 0.9;
    const G = g + w * 0.9;
    const B = b + w * 0.9;
    const mx = Math.max(R, G, B, 1);
    return [Math.round((255 * R) / mx), Math.round((255 * G) / mx), Math.round((255 * B) / mx)];
}

// ---------- fan curve (phase 6b; until then the adapter knows one level from autoOnTemp) ----------

export type Curve = Array<[number, number]>;
export const CURVE_DEFAULT: Curve = [
    [26, 5],
    [27, 11],
    [28, 20],
];

/**
 * Fan level for a water temperature: off below the first point, linear between points.
 *
 * @param t water temperature
 * @param c curve points [temperature, level], sorted
 */
export function fanLevelFor(t: number, c: Curve): number {
    if (!c.length || t < c[0][0]) {
        return 0;
    }
    for (let i = 1; i < c.length; i++) {
        if (t < c[i][0]) {
            const [t0, l0] = c[i - 1];
            const [t1, l1] = c[i];
            return Math.round(l0 + ((l1 - l0) * (t - t0)) / (t1 - t0));
        }
    }
    return c[c.length - 1][1];
}

/**
 * Curve from JSON; when missing, the single level of the adapter becomes a one-point curve.
 *
 * @param raw value of luefter.curve
 * @param onTemp autoOnTemp of the adapter
 * @param level autoLevel of the adapter
 */
export function parseCurve(raw: unknown, onTemp: number | null, level: number | null): Curve {
    if (typeof raw === 'string' && raw) {
        try {
            const list = JSON.parse(raw) as unknown;
            if (Array.isArray(list)) {
                const c = list
                    .filter(
                        (p): p is [number, number] =>
                            Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'number'),
                    )
                    .sort((a, b) => a[0] - b[0]);
                if (c.length) {
                    return c;
                }
            }
        } catch {
            // fall through
        }
    }
    return onTemp !== null && level !== null ? [[onTemp, level]] : CURVE_DEFAULT.map(p => [...p] as [number, number]);
}

// ---------- colour presets (0_userdata.0.vis.aquarium.lichtVorlagen, Sven 20.11.2026) ----------

export interface Vorlage {
    name: string;
    r: number;
    g: number;
    b: number;
    w: number;
    /** own preset: may be deleted */
    eigen: boolean;
}

export const VORLAGEN: Vorlage[] = [
    { name: 'Fisch', r: 133, g: 84, b: 129, w: 65, eigen: false },
    { name: 'Pflanzen kräftig', r: 200, g: 120, b: 170, w: 140, eigen: false },
    { name: 'Abend warm', r: 190, g: 70, b: 20, w: 30, eigen: false },
    { name: 'Mondlicht', r: 0, g: 0, b: 40, w: 0, eigen: false },
];

const ch = (x: unknown): number => Math.max(0, Math.min(255, Math.round(Number(x) || 0)));

/**
 * Own presets from JSON, appended to the fixed ones.
 *
 * @param raw value of lichtVorlagen
 */
export function parseVorlagen(raw: unknown): Vorlage[] {
    const own: Vorlage[] = [];
    if (typeof raw === 'string' && raw) {
        try {
            const list = JSON.parse(raw) as unknown;
            if (Array.isArray(list)) {
                for (const x of list as Array<Record<string, unknown>>) {
                    if (x && typeof x.name === 'string' && x.name) {
                        own.push({ name: x.name, r: ch(x.r), g: ch(x.g), b: ch(x.b), w: ch(x.w), eigen: true });
                    }
                }
            }
        } catch {
            // only the fixed presets
        }
    }
    return [...VORLAGEN, ...own];
}

/**
 * JSON of the own presets only.
 *
 * @param list all presets
 */
export const vorlagenJson = (list: Vorlage[]): string =>
    JSON.stringify(list.filter(v => v.eigen).map(({ name, r, g, b, w }) => ({ name, r, g, b, w })));

/**
 * Next free name "Eigene n".
 *
 * @param list all presets
 */
export function neuerName(list: Vorlage[]): string {
    for (let i = 1; ; i++) {
        const n = `Eigene ${i}`;
        if (!list.some(v => v.name === n)) {
            return n;
        }
    }
}

// ---------- fertiliser bottles ----------

export interface Flasche {
    n: number;
    label: string;
    short: string;
    col: string;
    /** ml left, null = not filled / unused */
    remaining: number | null;
    refill: number;
    daily: number;
    days: number | null;
    low: boolean;
}

/**
 * Bottle view of a pump.
 *
 * @param n pump number
 * @param get value of a pump field
 */
export function flasche(n: number, get: (field: (typeof PUMP_FIELDS)[number]) => unknown): Flasche {
    const label =
        typeof get('label') === 'string' && get('label') ? String(get('label')) : n === 1 ? 'Eisen' : `Pumpe ${n}`;
    return {
        n,
        label,
        short: PUMP_SHORT[n - 1] ?? `P${n}`,
        col: PUMP_COLOURS[n - 1] ?? '#a3a19a',
        remaining: num(get('remaining')),
        refill: num(get('refillAmount')) ?? 450,
        daily: num(get('dailyDose')) ?? 0,
        days: num(get('daysLeft')),
        low: get('low') === true,
    };
}

// ---------- care (phase 7: data of script.js.vis2.Aquarium; until then the defaults) ----------

export interface Aufgabe {
    k: string;
    n: string;
    /** interval in days, 0 = no deadline (only history) */
    iv: number;
}

/** intervals set by Sven 20.11.2026 */
export const AUFGABEN: Aufgabe[] = [
    { k: 'ww', n: 'Wasserwechsel', iv: 20 },
    { k: 'vf', n: 'Vorfilter', iv: 50 },
    { k: 'fi', n: 'Filter', iv: 365 },
    { k: 'sc', n: 'Scheiben', iv: 14 },
    { k: 'rs', n: 'Rückschnitt', iv: 30 },
    { k: 'df', n: 'Diffusor', iv: 0 },
    { k: 'sl', n: 'Schläuche', iv: 365 },
    { k: 'wq', n: 'Wassertest', iv: 14 },
];

export type Faellig = { stufe: 'gruen' | 'gelb' | 'rot' | 'grau'; text: string; frac: number };

/**
 * Due state of a task.
 *
 * @param iv interval in days (0 = none)
 * @param tage days since it was done last, null = never
 */
export function faellig(iv: number, tage: number | null): Faellig {
    if (tage === null) {
        return { stufe: 'grau', text: iv ? 'nie erfasst' : 'ohne Frist', frac: 0 };
    }
    if (!iv) {
        return { stufe: 'grau', text: `vor ${tage} T`, frac: 0 };
    }
    const left = iv - tage;
    const frac = Math.min(1, tage / iv);
    if (left < 0) {
        return { stufe: 'rot', text: `${-left} T über`, frac };
    }
    if (left <= 3) {
        return { stufe: 'gelb', text: `fällig ${left} T`, frac };
    }
    return { stufe: 'gruen', text: `in ${left} T`, frac };
}

/**
 * Litres of a water change.
 *
 * @param pct percent of the tank
 */
export const liter = (pct: number): number => Math.round((pct * TANK_L) / 100);
