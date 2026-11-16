/*
 * Pure logic of the heating page (adapter junghome-bt-mesh): room list, colours, key figures,
 * setpoint wheel, vacation setback. No React, no VIS; covered by heizung.test.ts.
 *
 * Room names, polygons and data points come from the project (field "raeume"), never from this repo.
 */

/** One room of the floor plan */
export interface HeizRaum {
    /** key, unique in the list */
    id: string;
    /** shown on the plan and in the popup */
    name: string;
    /** areas: ids of room polygons of the SVG or own point lists "x,y x,y ..." (viewBox units) */
    flaechen: string[];
    /** centre of glow and symbol (viewBox units); default: middle of the areas */
    mitte?: [number, number];
    /** channel of a JUNG HOME thermostat, e.g. junghome-bt-mesh.0.thermostats.0006 */
    thermostat?: string;
    /** temperature data point; with a thermostat it replaces the thermostat value */
    ist?: string;
    /** the room has its own floor heating circuit (default: true with a thermostat) */
    heizkreis?: boolean;
    /** what measures, e.g. "Rauchmelder" (text in the popup) */
    quelle?: string;
    /** the sensor hangs at the ceiling: value is shown as provisional */
    decke?: boolean;
    /** small symbol for narrow rooms */
    klein?: boolean;
}

export type RaumArt = 'jung' | 'alt' | 'mess' | 'leer';

/** Reads the JSON list of the editor; tolerant: wrong entries are skipped and reported */
export function parseHeizRaeume(json: unknown): { raeume: HeizRaum[]; fehler: string[] } {
    const fehler: string[] = [];
    let raw: unknown = json;
    if (typeof json === 'string') {
        if (!json.trim()) {
            return { raeume: [], fehler };
        }
        try {
            raw = JSON.parse(json);
        } catch (e) {
            return { raeume: [], fehler: [`JSON: ${(e as Error).message}`] };
        }
    }
    if (!Array.isArray(raw)) {
        return { raeume: [], fehler: ['JSON: Liste [ … ] erwartet'] };
    }
    const raeume: HeizRaum[] = [];
    raw.forEach((item: unknown, i) => {
        const r = item as (Partial<HeizRaum> & { flaeche?: unknown }) | null;
        if (!r || typeof r !== 'object') {
            fehler.push(`#${i + 1}: kein Objekt`);
            return;
        }
        const id = typeof r.id === 'string' ? r.id.trim() : '';
        if (!id || raeume.some(x => x.id === id)) {
            fehler.push(`#${i + 1}: id fehlt oder doppelt`);
            return;
        }
        const list = Array.isArray(r.flaechen) ? r.flaechen : r.flaeche !== undefined ? [r.flaeche] : [id];
        const flaechen = list.filter((f): f is string => typeof f === 'string' && f.trim() !== '');
        const m = r.mitte;
        const mitte =
            Array.isArray(m) && m.length === 2 && m.every(n => typeof n === 'number' && Number.isFinite(n))
                ? ([m[0], m[1]] as [number, number])
                : undefined;
        const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
        raeume.push({
            id,
            name: text(r.name) ?? id,
            flaechen,
            mitte,
            thermostat: text(r.thermostat)?.replace(/\.$/, ''),
            ist: text(r.ist),
            heizkreis: typeof r.heizkreis === 'boolean' ? r.heizkreis : undefined,
            quelle: text(r.quelle),
            decke: r.decke === true,
            klein: r.klein === true,
        });
    });
    return { raeume, fehler };
}

/** Kind of the symbol: JUNG HOME thermostat, circuit with old thermostat, measuring only, nothing */
export function raumArt(r: HeizRaum, hatWert: boolean): RaumArt {
    if (r.thermostat) {
        return 'jung';
    }
    if (r.heizkreis) {
        return 'alt';
    }
    return hatWert ? 'mess' : 'leer';
}

/** Data points of a thermostat channel */
export function thermostatIds(channel: string): {
    soll: string;
    ist: string;
    heizt: string;
    boost: string;
    boostBis: string;
    urlaub: string;
} {
    return {
        soll: `${channel}.setpoint`,
        ist: `${channel}.temperature`,
        heizt: `${channel}.heating`,
        boost: `${channel}.boost`,
        boostBis: `${channel}.boostUntil`,
        urlaub: `${channel}.vacation`,
    };
}

/** Data points of the vacation setback of an adapter instance */
export function urlaubIds(instance: string): { aktiv: string; rueckkehr: string; vorheizen: string; raeume: string } {
    const i = instance.trim().replace(/\.$/, '') || 'junghome-bt-mesh.0';
    return {
        aktiv: `${i}.vacation.active`,
        rueckkehr: `${i}.vacation.returnAt`,
        vorheizen: `${i}.vacation.preheatFrom`,
        raeume: `${i}.vacation.rooms`,
    };
}

/** Every data point the page needs */
export function alleIds(raeume: HeizRaum[], instance: string): string[] {
    const ids: string[] = Object.values(urlaubIds(instance));
    for (const r of raeume) {
        if (r.thermostat) {
            ids.push(...Object.values(thermostatIds(r.thermostat)));
        }
        if (r.ist) {
            ids.push(r.ist);
        }
    }
    return [...new Set(ids)];
}

// ---------------------------------------------------------------- numbers

/** Number or null (null, '', NaN, non-numbers) */
export function zahl(v: unknown): number | null {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') {
        return null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/** "21,5" (German) or "21.5"; "–" without value */
export function grad(n: number | null, lang: string, digits = 1): string {
    if (n === null) {
        return '–';
    }
    const s = n.toFixed(digits);
    return lang === 'en' ? s : s.replace('.', ',');
}

export type Rgb = [number, number, number];

/** Colour of a temperature: 18 °C blue, 21 °C neutral, 24 °C warm orange; grey without value */
export function farbe(t: number | null): Rgb {
    if (t === null) {
        return [120, 120, 128];
    }
    const stops: [number, Rgb][] = [
        [18, [74, 141, 255]],
        [21, [232, 230, 223]],
        [24, [255, 138, 61]],
    ];
    if (t <= stops[0][0]) {
        return stops[0][1];
    }
    if (t >= stops[2][0]) {
        return stops[2][1];
    }
    const i = t <= 21 ? 1 : 2;
    const [a, ca] = stops[i - 1];
    const [b, cb] = stops[i];
    const g = (t - a) / (b - a);
    return ca.map((v, k) => Math.round(v + (cb[k] - v) * g)) as Rgb;
}

export const rgba = (c: Rgb, a: number): string => `rgba(${c.join(',')},${a})`;

// ---------------------------------------------------------------- plan geometry

export type Punkt = [number, number];

/** "x,y x,y ..." -> points; invalid pairs are skipped */
export function punkte(points: string): Punkt[] {
    return points
        .trim()
        .split(/\s+/)
        .map(p => p.split(',').map(Number))
        .filter((p): p is Punkt => p.length === 2 && p.every(Number.isFinite));
}

/** An area is a point list when it contains a digit pair "x,y", else it is the id of an SVG polygon */
export function istPunktliste(f: string): boolean {
    return /\d\s*,\s*-?\d/.test(f);
}

/** Point lists of a room: own lists directly, ids from the SVG (unknown ids are skipped) */
export function flaechenPunkte(r: HeizRaum, svgRooms: { id: string; points: string }[]): string[] {
    return r.flaechen
        .map(f => (istPunktliste(f) ? f : svgRooms.find(s => s.id === f)?.points || ''))
        .filter(p => punkte(p).length >= 3);
}

/** Centre and glow radius of a room (middle of the bounding box of all areas) */
export function raumMitte(r: HeizRaum, flaechen: string[]): { x: number; y: number; radius: number } | null {
    const all = flaechen.flatMap(punkte);
    if (!all.length) {
        return null;
    }
    const xs = all.map(p => p[0]);
    const ys = all.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const [x, y] = r.mitte ?? [(x0 + x1) / 2, (y0 + y1) / 2];
    return { x, y, radius: Math.hypot(x1 - x0, y1 - y0) * 0.62 };
}

// ---------------------------------------------------------------- key figures

export interface RaumWert {
    name: string;
    ist: number | null;
    heizt: boolean;
    art: RaumArt;
}

export interface Kennzahlen {
    mittel: number | null;
    waermster: RaumWert | null;
    kuehlster: RaumWert | null;
    heizen: number;
    jung: number;
    kreise: number;
}

export function kennzahlen(werte: RaumWert[]): Kennzahlen {
    const mess = werte.filter(w => w.ist !== null);
    const mittel = mess.length ? mess.reduce((s, w) => s + (w.ist as number), 0) / mess.length : null;
    const pick = (better: (a: number, b: number) => boolean): RaumWert | null =>
        mess.reduce<RaumWert | null>(
            (best, w) => (!best || better(w.ist as number, best.ist as number) ? w : best),
            null,
        );
    return {
        mittel,
        waermster: pick((a, b) => a > b),
        kuehlster: pick((a, b) => a < b),
        heizen: werte.filter(w => w.heizt).length,
        jung: werte.filter(w => w.art === 'jung').length,
        kreise: werte.filter(w => w.art === 'jung' || w.art === 'alt').length,
    };
}

// ---------------------------------------------------------------- setpoint wheel

export const SOLL_MIN = 5;
export const SOLL_MAX = 30;
/** arc of the wheel in degrees (0 = right, clockwise): from bottom left over the top to bottom right */
export const RAD_START = 140;
export const RAD_ENDE = 400;

/** Setpoint on the device grid (0.5 °C, 5–30 °C) */
export function sollRaster(t: number): number {
    return Math.max(SOLL_MIN, Math.min(SOLL_MAX, Math.round(t * 2) / 2));
}

export function sollWinkel(t: number): number {
    const c = Math.max(SOLL_MIN, Math.min(SOLL_MAX, t));
    return RAD_START + ((c - SOLL_MIN) / (SOLL_MAX - SOLL_MIN)) * (RAD_ENDE - RAD_START);
}

/** Setpoint at a pointer position relative to the wheel centre (dx, dy in px, y downwards) */
export function sollAusZeiger(dx: number, dy: number): number {
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (a < 90) {
        a += 360;
    }
    a = Math.max(RAD_START, Math.min(RAD_ENDE, a));
    return sollRaster(SOLL_MIN + ((a - RAD_START) / (RAD_ENDE - RAD_START)) * (SOLL_MAX - SOLL_MIN));
}

export type Zustand = 'heizt' | 'erreicht' | 'wartet' | 'unbekannt';

export function zustand(ist: number | null, soll: number | null, heizt: boolean): Zustand {
    if (heizt) {
        return 'heizt';
    }
    if (ist === null || soll === null) {
        return 'unbekannt';
    }
    return ist >= soll ? 'erreicht' : 'wartet';
}

// ---------------------------------------------------------------- vacation

const TAGE_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const TAGE_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sa 22.11. 18:00" (local time) */
export function kurzeZeit(ms: number, lang: string): string {
    const d = new Date(ms);
    const p = (n: number): string => String(n).padStart(2, '0');
    const zeit = `${p(d.getHours())}:${p(d.getMinutes())}`;
    return lang === 'en'
        ? `${TAGE_EN[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} ${zeit}`
        : `${TAGE_DE[d.getDay()]} ${p(d.getDate())}.${p(d.getMonth() + 1)}. ${zeit}`;
}

/** Suggested return for a new vacation: in 7 days at 18:00 */
export function vorschlagRueckkehr(now: number): number {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 18, 0).getTime();
}

/** Moves a return time by days/hours; never earlier than one hour from now */
export function verschiebe(ms: number, tage: number, stunden: number, now: number): number {
    const d = new Date(ms);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + tage, d.getHours() + stunden, 0).getTime();
    const min = Math.ceil((now + 3_600_000) / 3_600_000) * 3_600_000;
    return Math.max(next, min);
}

/** Start of the pre-heating (the adapter brings the setpoints back then) */
export function vorheizenAb(rueckkehr: number, stunden: number): number {
    return rueckkehr - stunden * 3_600_000;
}

/** Boost progress 0–1 and remaining minutes */
export function boostRest(bis: number | null, minuten: number, now: number): { anteil: number; minuten: number } {
    if (!bis || bis <= now) {
        return { anteil: 0, minuten: 0 };
    }
    const rest = bis - now;
    const dauer = Math.max(1, minuten) * 60_000;
    return { anteil: Math.max(0, Math.min(1, 1 - rest / dauer)), minuten: Math.ceil(rest / 60_000) };
}
