/*
 * Christmas lights (star, reindeer, fairy lights): pure helpers for the widget ZuhauseWeihnacht.
 * The run times are written as JSON to <basis>.<kreis>.laufzeiten; the ioBroker script
 * "weihnachten" switches the lamps and confirms the JSON normalised (ack). The rules here mirror
 * that script (Sven, 15.11.2026): no end -> 23:00, never over midnight, start fixed or sunset ± min.
 */

export const DEFAULT_END = 23 * 60;
export const MAX_SUN_OFFSET = 120;
export const SUN_STEP = 5;
export const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;

export type KreisKey = 'stern' | 'rentier' | 'lichterkette';
export const KREISE: { key: KreisKey; name: string; short: string }[] = [
    { key: 'stern', name: 'Stern', short: 'Stern' },
    { key: 'rentier', name: 'Rentier', short: 'Rentier' },
    { key: 'lichterkette', name: 'Lichterkette', short: 'Lichterk.' },
];

/** one run time as stored: start fixed ("HH:MM") or relative to sunset (minutes), end optional */
export interface Entry {
    start?: string;
    sonne?: number;
    ende?: string;
}
export interface Plan {
    v: 1;
    tage: Entry[][];
}

/** editable form of an entry */
export interface Draft {
    su: boolean;
    von: number;
    off: number;
    frei: boolean;
    bis: number;
}

export function emptyPlan(): Plan {
    return { v: 1, tage: Array.from({ length: 7 }, () => []) };
}

export function parseHm(s: unknown): number | null {
    if (typeof s !== 'string') {
        return null;
    }
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function fmtHm(min: number): string {
    const x = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
}

/** Mo = 0 … So = 6 */
export function weekdayIndex(date: Date): number {
    return (date.getDay() + 6) % 7;
}

/** reads the JSON of the data point; anything broken gives an empty plan */
export function parsePlan(raw: unknown): Plan {
    let obj: unknown = raw;
    if (typeof raw === 'string') {
        if (!raw.trim()) {
            return emptyPlan();
        }
        try {
            obj = JSON.parse(raw);
        } catch {
            return emptyPlan();
        }
    }
    const tage = (obj as { tage?: unknown } | null)?.tage;
    if (!Array.isArray(tage) || tage.length !== 7) {
        return emptyPlan();
    }
    const plan = emptyPlan();
    tage.forEach((list: unknown, d) => {
        if (!Array.isArray(list)) {
            return;
        }
        for (const e of list as Entry[]) {
            if (!e || typeof e !== 'object') {
                continue;
            }
            const out: Entry = {};
            if (typeof e.sonne === 'number' && Number.isInteger(e.sonne) && Math.abs(e.sonne) <= MAX_SUN_OFFSET) {
                out.sonne = e.sonne;
            } else if (parseHm(e.start) !== null) {
                out.start = fmtHm(parseHm(e.start)!);
            } else {
                continue;
            }
            if (parseHm(e.ende) !== null) {
                out.ende = fmtHm(parseHm(e.ende)!);
            }
            plan.tage[d].push(out);
        }
    });
    return plan;
}

export function serializePlan(plan: Plan): string {
    return JSON.stringify(plan);
}

export function toDraft(e: Entry): Draft {
    return {
        su: e.sonne !== undefined,
        von: parseHm(e.start) ?? 17 * 60,
        off: e.sonne ?? 0,
        frei: parseHm(e.ende) === null,
        bis: parseHm(e.ende) ?? DEFAULT_END,
    };
}

export function fromDraft(d: Draft): Entry {
    const e: Entry = d.su ? { sonne: d.off } : { start: fmtHm(d.von) };
    if (!d.frei) {
        e.ende = fmtHm(d.bis);
    }
    return e;
}

export function sameEntry(a: Entry, b: Entry): boolean {
    return a.start === b.start && a.sonne === b.sonne && a.ende === b.ende;
}

export function newDraft(): Draft {
    return { su: false, von: 17 * 60, off: 0, frei: true, bis: DEFAULT_END };
}

/** start minute of an entry on a day; sunset in minutes of that day (null = unknown) */
export function startMin(e: Entry | Draft, sunset: number | null): number | null {
    if ('su' in e) {
        return e.su ? (sunset === null ? null : sunset + e.off) : e.von;
    }
    if (e.sonne !== undefined) {
        return sunset === null ? null : sunset + e.sonne;
    }
    return parseHm(e.start);
}

export function endMin(e: Entry | Draft): number {
    if ('su' in e) {
        return e.frei ? DEFAULT_END : e.bis;
    }
    return parseHm(e.ende) ?? DEFAULT_END;
}

/** the entry runs on that day (end after start, never over midnight) */
export function validOn(e: Entry | Draft, sunset: number | null): boolean {
    const s = startMin(e, sunset);
    return s === null ? ('su' in e ? e.su : e.sonne !== undefined) : endMin(e) > s;
}

export interface Window {
    start: number;
    end: number;
}

/** merged run times of one weekday in minutes */
export function windowsOf(list: Entry[], sunset: number | null): Window[] {
    const w: Window[] = [];
    for (const e of list) {
        const s = startMin(e, sunset);
        const en = endMin(e);
        if (s !== null && en > s) {
            w.push({ start: s, end: en });
        }
    }
    w.sort((a, b) => a.start - b.start);
    const merged: Window[] = [];
    for (const x of w) {
        const last = merged[merged.length - 1];
        if (last && x.start <= last.end) {
            last.end = Math.max(last.end, x.end);
        } else {
            merged.push({ ...x });
        }
    }
    return merged;
}

export function minuteOfDay(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
}

/** sorts the entries of a day by their start */
export function sortDay(list: Entry[], sunset: number | null): Entry[] {
    return [...list].sort((a, b) => (startMin(a, sunset) ?? 0) - (startMin(b, sunset) ?? 0));
}

/**
 * Saves a draft for several days. On the edited day it replaces the entry at idx; on the other days
 * it replaces an identical copy of the original (so Mo–Fr change together) or adds it.
 */
export function applyDraft(
    plan: Plan,
    day: number,
    idx: number,
    orig: Entry | null,
    draft: Draft,
    days: Set<number>,
): Plan {
    const entry = fromDraft(draft);
    const next: Plan = { v: 1, tage: plan.tage.map(l => [...l]) };
    for (const d of days) {
        const list = next.tage[d];
        const j = d === day && idx >= 0 ? idx : orig ? list.findIndex(x => sameEntry(x, orig)) : -1;
        if (j >= 0) {
            list[j] = { ...entry };
        } else {
            list.push({ ...entry });
        }
    }
    return next;
}

export function removeEntry(plan: Plan, day: number, idx: number): Plan {
    return { v: 1, tage: plan.tage.map((l, d) => (d === day ? l.filter((_, i) => i !== idx) : [...l])) };
}

/** days that have exactly this entry (preselection when editing) */
export function daysWith(plan: Plan, e: Entry): Set<number> {
    const s = new Set<number>();
    plan.tage.forEach((l, d) => l.some(x => sameEntry(x, e)) && s.add(d));
    return s;
}

export function daysText(days: Set<number>): string {
    const d = [...days].sort((a, b) => a - b);
    if (d.length === 7) {
        return 'alle Tage';
    }
    if (d.join() === '0,1,2,3,4') {
        return 'Mo–Fr';
    }
    if (d.join() === '5,6') {
        return 'Sa + So';
    }
    return d.map(i => DAYS[i]).join(', ');
}

export function signed(n: number): string {
    return `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;
}

// ---------------------------------------------------------------- sunset (display only)

/**
 * Sunset in local minutes of the day (NOAA approximation, ± 1 min). Only for display in the popup;
 * the script switches with getAstroDate of ioBroker. Coordinates come from system.config.
 */
export function sunsetMinutes(date: Date, lat: number, lon: number): number | null {
    const start = new Date(date.getFullYear(), 0, 0);
    const n = Math.round(
        (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - start.getTime()) / 864e5,
    );
    const g = ((2 * Math.PI) / 365) * (n - 1);
    const r = Math.PI / 180;
    const eq =
        229.18 *
        (0.000075 +
            0.001868 * Math.cos(g) -
            0.032077 * Math.sin(g) -
            0.014615 * Math.cos(2 * g) -
            0.040849 * Math.sin(2 * g));
    const de =
        0.006918 -
        0.399912 * Math.cos(g) +
        0.070257 * Math.sin(g) -
        0.006758 * Math.cos(2 * g) +
        0.000907 * Math.sin(2 * g) -
        0.002697 * Math.cos(3 * g) +
        0.00148 * Math.sin(3 * g);
    const x = Math.cos(90.833 * r) / (Math.cos(lat * r) * Math.cos(de)) - Math.tan(lat * r) * Math.tan(de);
    if (x < -1 || x > 1) {
        return null;
    }
    const ha = Math.acos(x) / r;
    const utc = 720 - 4 * (lon - ha) - eq;
    // offset of local time on that day (CET/CEST), measured at noon
    const offset = -new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTimezoneOffset();
    return Math.round(utc + offset);
}

/** sunset for each weekday of the coming 7 days (index Mo … So) */
export function sunsetWeek(now: Date, lat: number | null, lon: number | null): (number | null)[] {
    const out: (number | null)[] = Array.from({ length: 7 }, () => null);
    if (lat === null || lon === null) {
        return out;
    }
    for (let i = 0; i < 7; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12);
        out[weekdayIndex(d)] = sunsetMinutes(d, lat, lon);
    }
    return out;
}

// ---------------------------------------------------------------- status line of a circuit

export interface KreisStatus {
    on: boolean;
    online: boolean;
    hand: boolean;
    handBis: number;
    nachtTimer: boolean;
    naechsterStart: number;
}

function dayTime(ts: number, now: Date): string {
    const d = new Date(ts);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const hm = fmtHm(minuteOfDay(d));
    if (that === today) {
        return hm;
    }
    if (that - today === 864e5) {
        return `morgen ${hm}`;
    }
    return `${DAYS[weekdayIndex(d)]} ${hm}`;
}

export function statusLine(s: KreisStatus, plan: Plan, now: Date, sunsets: (number | null)[]): string {
    if (!s.online) {
        return 'nicht erreichbar';
    }
    if (s.hand && s.handBis > now.getTime()) {
        if (s.nachtTimer && s.on) {
            return `An · Nacht-Timer noch ${Math.max(1, Math.ceil((s.handBis - now.getTime()) / 60000))} min`;
        }
        return `${s.on ? 'An' : 'Aus'} · Hand bis ${dayTime(s.handBis, now)}`;
    }
    const day = weekdayIndex(now);
    const running = windowsOf(plan.tage[day], sunsets[day]).find(
        w => w.start <= minuteOfDay(now) && minuteOfDay(now) < w.end,
    );
    if (s.on && running) {
        return `An · Zeitplan bis ${fmtHm(running.end)}`;
    }
    if (s.on) {
        return 'An';
    }
    return s.naechsterStart > now.getTime()
        ? `Aus · nächste Laufzeit ${dayTime(s.naechsterStart, now)}`
        : 'Aus · keine Laufzeit';
}
