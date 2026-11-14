/*
 * Detail page of a car (adapter ioBroker.mobility): pure helpers for the widget ZuhauseAuto.
 * Layout decided 13.11.2026 (sketch v3): head with warnings in words, three cards (level, condition,
 * fuel stations or charging), below the evaluation over the full width.
 */
import { formatNumber } from './model';
import { num, text } from './fahrzeuge';

export const DAY_MS = 24 * 3_600_000;
export const WEEK_MS = 7 * DAY_MS;

// ---------------------------------------------------------------- head

/** "2022 · Benzin, Hybrid" from a model like "2022 Car - E1 (B479 EU)" and engine type "HEV" */
export function modelLine(model: unknown, engineType: unknown): string {
    const year = /\b(19|20)\d{2}\b/.exec(text(model))?.[0] ?? '';
    const drive: Record<string, string> = {
        BEV: 'Elektro',
        HEV: 'Benzin, Hybrid',
        MHEV: 'Benzin, Mild-Hybrid',
        PHEV: 'Plug-in-Hybrid',
        ICE: 'Benzin',
    };
    const d = drive[text(engineType).toUpperCase()] ?? '';
    return [year, d].filter(Boolean).join(' · ');
}

/** "14.11. 14:19" */
export function dateTime(ts: number): string {
    const d = new Date(ts);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------- level card

/** Litres and euros to fill up; null when the tank size or the level is unknown */
export function refill(
    levelPct: number | null,
    tankLitres: number | null,
    pricePerLitre: number | null,
): { litres: number; euro: number | null } | null {
    if (levelPct === null || !tankLitres || tankLitres <= 0) {
        return null;
    }
    const litres = Math.max(0, ((100 - Math.max(0, Math.min(100, levelPct))) / 100) * tankLitres);
    return { litres, euro: pricePerLitre !== null && pricePerLitre > 0 ? litres * pricePerLitre : null };
}

/**
 * The drop falling into the tank ring is a hint, not decoration (Sven 14.11.2026): only when the tank is low
 * (fuel warning, from 25 %) or when the page says "Jetzt tanken" (cheapest open station cheap, tank at most half full)
 */
export function dropWanted(levelPct: number | null, fuelWarning: boolean, bestRating: string): boolean {
    if (fuelWarning) {
        return true;
    }
    return bestRating === 'cheap' && levelPct !== null && levelPct <= 50;
}

/** Ford reports tyre pressure in kPa; shown in bar */
export function bar(kpa: unknown): number | null {
    const n = num(kpa);
    return n === null || n <= 0 ? null : Math.round(n) / 100;
}

/** Town of a station address "Street 1, Town" */
export function town(address: unknown): string {
    const parts = text(address).split(',');
    return parts.length > 1 ? parts[parts.length - 1].trim() : '';
}

// ---------------------------------------------------------------- price history

export type PricePoint = [number, number | null];

/** Reads fuel.station<N>.history7d */
export function parseSeries(value: unknown): PricePoint[] {
    let list: unknown;
    try {
        list = typeof value === 'string' && value ? JSON.parse(value) : [];
    } catch {
        return [];
    }
    if (!Array.isArray(list)) {
        return [];
    }
    const out: PricePoint[] = [];
    for (const p of list) {
        if (Array.isArray(p) && typeof p[0] === 'number' && Number.isFinite(p[0])) {
            const price = typeof p[1] === 'number' && Number.isFinite(p[1]) ? p[1] : null;
            out.push([p[0], price]);
        }
    }
    return out.sort((a, b) => a[0] - b[0]);
}

export interface Scale {
    t0: number;
    t1: number;
    pMin: number;
    pMax: number;
    width: number;
    height: number;
}

export function xOf(s: Scale, t: number): number {
    return ((t - s.t0) / (s.t1 - s.t0)) * s.width;
}

export function yOf(s: Scale, p: number): number {
    return s.height - ((p - s.pMin) / (s.pMax - s.pMin)) * s.height;
}

/** Price range of all series rounded out to 5 cent steps (at least 0.10 € high) */
export function priceRange(series: PricePoint[][]): { min: number; max: number } | null {
    const prices = series.flat().flatMap(p => (p[1] === null ? [] : [p[1]]));
    if (!prices.length) {
        return null;
    }
    let min = Math.floor((Math.min(...prices) - 0.01) * 20) / 20;
    let max = Math.ceil((Math.max(...prices) + 0.01) * 20) / 20;
    if (max - min < 0.1) {
        const mid = (max + min) / 2;
        min = Math.floor((mid - 0.05) * 20) / 20;
        max = min + 0.1;
    }
    return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100 };
}

/** Step line (a price holds until the next change), gaps where the station had no price */
export function stepPath(points: PricePoint[], s: Scale): string {
    let d = '';
    let open = false;
    for (let i = 0; i < points.length; i++) {
        const [t, p] = points[i];
        const next = i + 1 < points.length ? points[i + 1][0] : s.t1;
        if (p === null || next <= s.t0 || t >= s.t1) {
            open = false;
            continue;
        }
        const a = xOf(s, Math.max(t, s.t0)).toFixed(1);
        const b = xOf(s, Math.min(next, s.t1)).toFixed(1);
        const y = yOf(s, p).toFixed(1);
        d += `${open ? 'L' : 'M'}${a} ${y}L${b} ${y}`;
        open = true;
    }
    return d;
}

/** Time spans without a price (station closed), for the grey night bands */
export function closedSpans(points: PricePoint[], t0: number, t1: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < points.length; i++) {
        if (points[i][1] !== null) {
            continue;
        }
        const a = Math.max(t0, points[i][0]);
        const b = Math.min(t1, i + 1 < points.length ? points[i + 1][0] : t1);
        if (b > a) {
            out.push([a, b]);
        }
    }
    return out;
}

/** Lowest price in the window (the latest time it was reached) */
export function lowest(series: PricePoint[][], t0: number): { t: number; p: number } | null {
    let best: { t: number; p: number } | null = null;
    for (const points of series) {
        for (const [t, p] of points) {
            if (p !== null && t >= t0 && (!best || p <= best.p)) {
                best = { t, p };
            }
        }
    }
    return best;
}

// ---------------------------------------------------------------- when to fill up

/** Reads fuel.station<N>.hourProfile (24 averages, null = too little data) */
export function parseProfile(value: unknown): (number | null)[] {
    let list: unknown;
    try {
        list = typeof value === 'string' && value ? JSON.parse(value) : null;
    } catch {
        return [];
    }
    if (!Array.isArray(list) || list.length !== 24) {
        return [];
    }
    return list.map(v => (typeof v === 'number' && Number.isFinite(v) ? v : null));
}

/** Average of several profiles per hour (hours without data in all of them stay null) */
export function combineProfiles(profiles: (number | null)[][]): (number | null)[] {
    const usable = profiles.filter(p => p.length === 24);
    return Array.from({ length: 24 }, (_, h) => {
        const values = usable.map(p => p[h]).filter((v): v is number => v !== null);
        return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    });
}

export type HourClass = 'gut' | 'normal' | 'teuer';

export interface HourBar {
    hour: number;
    price: number;
    cls: HourClass;
    /** bar height 20–100 % */
    height: number;
}

/** Bars for 6–21 o'clock: the cheapest 15 % of the span green, above 60 % red */
export function hourBars(profile: (number | null)[], from = 6, to = 21): HourBar[] {
    const hours: { hour: number; price: number }[] = [];
    for (let h = from; h <= to; h++) {
        const p = profile[h];
        if (p !== null && p !== undefined) {
            hours.push({ hour: h, price: p });
        }
    }
    if (!hours.length) {
        return [];
    }
    const lo = Math.min(...hours.map(x => x.price));
    const hi = Math.max(...hours.map(x => x.price));
    const span = hi - lo;
    return hours.map(({ hour, price }) => {
        const rel = span > 0 ? (price - lo) / span : 0;
        return {
            hour,
            price,
            cls: span < 0.005 ? 'normal' : rel < 0.15 ? 'gut' : rel > 0.6 ? 'teuer' : 'normal',
            height: 20 + 80 * (span > 0 ? (price - lo + 0.03) / (span + 0.03) : 0.5),
        };
    });
}

/** "11 Uhr", "12–14 Uhr", "ab 19 Uhr" for consecutive hours of one class */
export function hourRanges(bars: HourBar[], cls: HourClass, lastHour = 21): string[] {
    const hours = bars.filter(b => b.cls === cls).map(b => b.hour);
    const out: string[] = [];
    let i = 0;
    while (i < hours.length) {
        let j = i;
        while (j + 1 < hours.length && hours[j + 1] === hours[j] + 1) {
            j++;
        }
        const a = hours[i];
        const b = hours[j];
        out.push(a === b ? `${a} Uhr` : b === lastHour ? `ab ${a} Uhr` : `${a}–${b + 1} Uhr`);
        i = j + 1;
    }
    return out;
}

export interface TipInput {
    bars: HourBar[];
    /** rating of the cheapest open station right now: cheap / normal / expensive / unknown, '' = closed */
    rating: string;
    hour: number;
    levelPct: number | null;
}

/** One line of advice under the station list; parts in **bold*/
export function fuelTip(i: TipInput): string {
    const good = hourRanges(i.bars, 'gut');
    const bad = hourRanges(i.bars, 'teuer');
    if (i.rating === 'cheap') {
        return i.levelPct !== null && i.levelPct <= 50 ? '**Jetzt tanken:** gerade günstig' : 'Gerade **günstig**';
    }
    if (i.rating === 'expensive') {
        const next = i.bars.find(b => b.hour > i.hour && b.cls === 'gut');
        return next ? `Gerade **teuer** · günstiger meist um **${next.hour} Uhr**` : 'Gerade **teuer**';
    }
    if (!good.length) {
        return i.bars.length ? 'Preise schwanken kaum über den Tag' : 'Noch zu wenig Preisdaten';
    }
    const g = good.map(x => `**${x}**`).join(' und ');
    return bad.length ? `Günstig: ${g} · nicht ${bad.join(', ')}` : `Günstig: ${g}`;
}

// ---------------------------------------------------------------- km per week

export interface WeekBar {
    label: string;
    km: number;
    longKm: number;
}

/** Reads ford.vehicle<N>.history.weeks ("2026-W46" → "46") */
export function parseWeeks(value: unknown): WeekBar[] {
    let list: unknown;
    try {
        list = typeof value === 'string' && value ? JSON.parse(value) : [];
    } catch {
        return [];
    }
    if (!Array.isArray(list)) {
        return [];
    }
    return list
        .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
        .map(w => ({
            label: /W(\d+)$/.exec(text(w.period))?.[1] ?? text(w.period),
            km: Math.max(0, num(w.km) ?? 0),
            longKm: Math.max(0, num(w.longKm) ?? 0),
        }));
}

/** Average of the weeks that have data, share of long trips; null without any km */
export function weekSummary(weeks: WeekBar[]): { avg: number; longShare: number; weeksWithData: number } | null {
    const used = weeks.filter(w => w.km > 0);
    if (!used.length) {
        return null;
    }
    const km = used.reduce((a, w) => a + w.km, 0);
    const long = used.reduce((a, w) => a + Math.min(w.longKm, w.km), 0);
    return { avg: km / used.length, longShare: km > 0 ? long / km : 0, weeksWithData: used.length };
}

// ---------------------------------------------------------------- formatting

/** 1,809 → ["1,80", "9"] for the price with the small tenth cent */
export function priceParts(p: number, lang = 'de'): [string, string] {
    const s = formatNumber(p, 3, lang);
    return [s.slice(0, -1), s.slice(-1)];
}

/** Splits "**bold**" markup into parts */
export function boldParts(s: string): { text: string; bold: boolean }[] {
    return s
        .split('**')
        .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
        .filter(p => p.text);
}

// ---------------------------------------------------------------- electric car

export interface FordWeek {
    period: string;
    km: number;
    kwhPer100: number | null;
    kwhCharged: number;
    temp: number | null;
}

function jsonList(value: unknown): Record<string, unknown>[] {
    let list: unknown;
    try {
        list = typeof value === 'string' && value ? JSON.parse(value) : [];
    } catch {
        return [];
    }
    return Array.isArray(list)
        ? list.filter((w): w is Record<string, unknown> => !!w && typeof w === 'object' && !!text(w.period))
        : [];
}

/** Reads ford.vehicle<N>.history.weeks with the fields of the electric car */
export function parseFordWeeks(value: unknown): FordWeek[] {
    return jsonList(value).map(w => ({
        period: text(w.period),
        km: Math.max(0, num(w.km) ?? 0),
        kwhPer100: num(w.kwhPer100),
        kwhCharged: Math.max(0, num(w.kwhCharged) ?? 0),
        temp: num(w.temp),
    }));
}

export interface EaseePeriod {
    period: string;
    sessions: number;
    kwh: number;
    cost: number;
}

/** Reads easee.history.weeks / months */
export function parseEasee(value: unknown): EaseePeriod[] {
    return jsonList(value).map(w => ({
        period: text(w.period),
        sessions: Math.max(0, num(w.sessions) ?? 0),
        kwh: Math.max(0, num(w.kwh) ?? 0),
        cost: Math.max(0, num(w.cost) ?? 0),
    }));
}

export interface ChargedPeriod {
    period: string;
    label: string;
    home: number;
    /** null = Ford had no data for that period yet */
    away: number | null;
}

/** Short label of a period key: "2026-W46" → "46", "2026-11-14" → "Sa", "2026-11" → "Nov" */
export function periodLabel(period: string): string {
    const week = /W(\d+)$/.exec(period);
    if (week) {
        return week[1];
    }
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
    if (day) {
        const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12);
        return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
    }
    return monthLabel(period);
}

/**
 * Charged energy of the last `count` periods (days, weeks or months): at home from the wallbox sessions,
 * on the road = what Ford saw the battery gain minus the wallbox (only periods Ford already recorded).
 * Ford measures in the car and the wallbox at the grid, so differences below 3 kWh count as charging losses.
 */
export function chargedPeriods(easee: EaseePeriod[], ford: FordWeek[], count: number): ChargedPeriod[] {
    const fordBy = new Map(ford.map(w => [w.period, w]));
    const firstFord = ford.find(w => w.km > 0 || w.kwhCharged > 0)?.period ?? null;
    return easee.slice(-count).map(w => {
        const f = fordBy.get(w.period);
        const recorded = firstFord !== null && f !== undefined && w.period >= firstFord;
        const away = recorded ? Math.max(0, f.kwhCharged - w.kwh) : null;
        return {
            period: w.period,
            label: periodLabel(w.period),
            home: w.kwh,
            away: away !== null && away < 3 ? 0 : away,
        };
    });
}

/** Price per kWh at home from the costs of the year (the price set in the adapter) */
export function homePrice(yearCost: unknown, yearEnergy: unknown): number | null {
    const c = num(yearCost);
    const e = num(yearEnergy);
    return c !== null && e !== null && e > 0 ? c / e : null;
}

/** "2026-11" → "Nov" */
export function monthLabel(period: string): string {
    const m = /^\d{4}-(\d{2})$/.exec(period);
    const names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    return m ? (names[Number(m[1]) - 1] ?? period) : period;
}

/** Months from the first one with a session on (at most `count`) */
export function costMonths(months: EaseePeriod[], count = 6): EaseePeriod[] {
    const first = months.findIndex(m => m.sessions > 0 || m.kwh > 0);
    return first < 0 ? [] : months.slice(first).slice(-count);
}

/** Text under the battery ring */
export function plugText(plug: unknown, charge: unknown, powerKw: number | null, lang = 'de'): string {
    const c = text(charge).toUpperCase();
    if (c === 'CHARGING') {
        return powerKw !== null && powerKw > 0 ? `lädt · ${formatNumber(powerKw, 1, lang)} kW` : 'lädt';
    }
    const p = text(plug).toUpperCase();
    if (!p || p === 'DISCONNECTED') {
        return p ? 'nicht eingesteckt' : '';
    }
    return c === 'CHARGE_COMPLETE' || c === 'COMPLETE' ? 'eingesteckt · voll' : 'eingesteckt';
}
