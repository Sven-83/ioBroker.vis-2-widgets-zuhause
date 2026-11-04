/*
 * Pure logic of the energy page (adapter bk215, cloud reader of the Sunlit / SunEnergyXT BK215):
 * buckets per day / month / year from the cloud statistics, the week Mo–So across two months,
 * totals with self-sufficiency, self-use and savings, the live flow, the solar forecast from
 * open-meteo (calibrated with the own yield of the last days) and the hint for the start page.
 */

/** One bucket of stats.days / stats.months / stats.years (kWh, earnings in the cloud currency) */
export interface Bucket {
    key: number;
    /** solar yield */
    ertrag: number;
    /** home consumption */
    verbrauch: number;
    /** energy the system delivered to the home */
    anlage: number;
    earnings: number;
}

const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 0;
};

const json = (v: unknown): unknown => {
    if (typeof v !== 'string') {
        return v;
    }
    try {
        return JSON.parse(v);
    } catch {
        return undefined;
    }
};

export function parseBuckets(v: unknown): Bucket[] {
    const a = json(v);
    if (!Array.isArray(a)) {
        return [];
    }
    return a
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map(x => ({
            key: num(x.key),
            ertrag: num(x.yield ?? x.generation),
            verbrauch: num(x.consumption),
            anlage: num(x.systemEnergy ?? x.energyFromPV),
            earnings: num(x.earnings),
        }));
}

// ---------------------------------------------------------------- periods

export const ZEITRAEUME = ['heute', 'woche', 'monat', 'jahr', 'immer'] as const;
export type Zeitraum = (typeof ZEITRAEUME)[number];

export const ZEITRAUM_TEXT: Record<Zeitraum, string> = {
    heute: 'Heute',
    woche: 'Woche',
    monat: 'Monat',
    jahr: 'Seit 1.1.',
    immer: 'Immer',
};

/** One bar of the chart: consumption split into "from the system" and "from the grid" */
export interface Balken {
    label: string;
    /** long label for the tooltip */
    titel: string;
    ertrag: number;
    verbrauch: number;
    anlage: number;
    netz: number;
    earnings: number;
    /** no data (future day, gap) */
    leer: boolean;
    /** the running day / month / year */
    jetzt: boolean;
}

export interface Statistik {
    days: Bucket[];
    daysPrev: Bucket[];
    months: Bucket[];
    years: Bucket[];
}

const TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function balken(b: Bucket | undefined, label: string, titel: string, jetzt: boolean): Balken {
    if (!b || (b.ertrag <= 0 && b.verbrauch <= 0)) {
        return { label, titel, ertrag: 0, verbrauch: 0, anlage: 0, netz: 0, earnings: 0, leer: true, jetzt };
    }
    const anlage = Math.min(b.anlage, b.verbrauch);
    return {
        label,
        titel,
        ertrag: b.ertrag,
        verbrauch: b.verbrauch,
        anlage,
        netz: Math.max(0, b.verbrauch - anlage),
        earnings: b.earnings,
        leer: false,
        jetzt,
    };
}

const byKey = (list: Bucket[], key: number): Bucket | undefined => list.find(b => b.key === key);

/** Monday 0:00 of the week of d */
export function wochenStart(d: Date): Date {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    return s;
}

/** Bucket of one calendar day: this month from days, the previous month from daysPrev */
export function tagBucket(day: Date, now: Date, s: Statistik): Bucket | undefined {
    const sameMonth = day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth();
    if (sameMonth) {
        return day.getDate() <= now.getDate() ? byKey(s.days, day.getDate()) : undefined;
    }
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    if (day.getFullYear() === prev.getFullYear() && day.getMonth() === prev.getMonth()) {
        return byKey(s.daysPrev, day.getDate());
    }
    return undefined;
}

/** Bars of a period (not "heute": that one is a curve) */
export function balkenListe(z: Zeitraum, s: Statistik, now: Date): Balken[] {
    if (z === 'woche') {
        const mo = wochenStart(now);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(mo.getFullYear(), mo.getMonth(), mo.getDate() + i);
            const today = d.toDateString() === now.toDateString();
            return balken(
                d > now && !today ? undefined : tagBucket(d, now, s),
                TAGE[d.getDay()],
                `${TAGE[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`,
                today,
            );
        });
    }
    if (z === 'monat') {
        const n = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        return Array.from({ length: n }, (_, i) =>
            balken(
                i + 1 <= now.getDate() ? byKey(s.days, i + 1) : undefined,
                String(i + 1),
                `${i + 1}.${now.getMonth() + 1}.`,
                i + 1 === now.getDate(),
            ),
        );
    }
    if (z === 'jahr') {
        return MONATE.map((m, i) =>
            balken(
                i <= now.getMonth() ? byKey(s.months, i + 1) : undefined,
                m,
                `${m} ${now.getFullYear()}`,
                i === now.getMonth(),
            ),
        );
    }
    if (z === 'immer') {
        const used = s.years.filter(b => b.ertrag > 0 || b.verbrauch > 0).sort((a, b) => a.key - b.key);
        return used.map(b => balken(b, String(b.key), String(b.key), b.key === now.getFullYear()));
    }
    return [];
}

export interface Summe {
    ertrag: number;
    verbrauch: number;
    anlage: number;
    netz: number;
    /** share of the consumption covered by the system, 0..1 (null without consumption) */
    autarkie: number | null;
    /** share of the yield used in the home, 0..1 (null without yield) */
    eigenverbrauch: number | null;
    /** saved money: system energy × price, or the cloud earnings without price */
    ersparnis: number;
    /** cost of the grid energy (only with price) */
    netzkosten: number | null;
}

export function summe(list: Balken[], preis: number): Summe {
    const t = list.reduce(
        (a, b) => ({
            ertrag: a.ertrag + b.ertrag,
            verbrauch: a.verbrauch + b.verbrauch,
            anlage: a.anlage + b.anlage,
            netz: a.netz + b.netz,
            earnings: a.earnings + b.earnings,
        }),
        { ertrag: 0, verbrauch: 0, anlage: 0, netz: 0, earnings: 0 },
    );
    const p = preis > 0 ? preis : 0;
    return {
        ertrag: t.ertrag,
        verbrauch: t.verbrauch,
        anlage: t.anlage,
        netz: t.netz,
        autarkie: t.verbrauch > 0 ? Math.min(1, t.anlage / t.verbrauch) : null,
        eigenverbrauch: t.ertrag > 0 ? Math.min(1, t.anlage / t.ertrag) : null,
        ersparnis: p ? t.anlage * p : t.earnings,
        netzkosten: p ? t.netz * p : null,
    };
}

/** "Nice" axis maximum and step for bars / curves */
export function achse(max: number, ticks = 4): { max: number; step: number } {
    if (!(max > 0)) {
        return { max: 1, step: 0.25 };
    }
    const raw = max / ticks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    return { max: Math.ceil(max / step) * step, step };
}

// ---------------------------------------------------------------- today curves

/** Point of a curve: minute of the day and value */
export interface Punkt {
    min: number;
    w: number;
}

/** today.curve of bk215: [{t:"HH:MM", solarW, homeW}] */
export function parseKurve(v: unknown): { solar: Punkt[]; haus: Punkt[] } {
    const a = json(v);
    const solar: Punkt[] = [];
    const haus: Punkt[] = [];
    if (!Array.isArray(a)) {
        return { solar, haus };
    }
    for (const x of a) {
        if (!x || typeof x !== 'object') {
            continue;
        }
        const r = x as Record<string, unknown>;
        const m = /^(\d{1,2}):(\d{2})/.exec(typeof r.t === 'string' ? r.t : '');
        if (!m) {
            continue;
        }
        const min = Number(m[1]) * 60 + Number(m[2]);
        if (r.solarW !== undefined && r.solarW !== null) {
            solar.push({ min, w: num(r.solarW) });
        }
        if (r.homeW !== undefined && r.homeW !== null) {
            haus.push({ min, w: num(r.homeW) });
        }
    }
    return { solar, haus };
}

/** History answer → points of the day of `now` (minutes since midnight) */
export function historyPunkte(result: unknown, now: Date): Punkt[] {
    if (!Array.isArray(result)) {
        return [];
    }
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const out: Punkt[] = [];
    for (const e of result) {
        const r = e as { ts?: unknown; val?: unknown } | null;
        if (!r || typeof r.ts !== 'number' || r.val === null || r.val === undefined) {
            continue;
        }
        const w = num(r.val);
        const min = (r.ts - start) / 60_000;
        if (min >= 0 && min < 24 * 60) {
            out.push({ min, w });
        }
    }
    return out.sort((a, b) => a.min - b.min);
}

/** Linear projection of the battery level from now to full or empty (from the adapter estimate) */
export function akkuProjektion(
    soc: number | null,
    fullAt: number | null,
    emptyAt: number | null,
    minSoc: number,
    now: Date,
): { bis: Punkt; ziel: 'voll' | 'leer' } | null {
    if (soc === null) {
        return null;
    }
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const ende = start + 24 * 60 * 60_000;
    const ziel = fullAt ? 'voll' : emptyAt ? 'leer' : null;
    const at = fullAt ?? emptyAt;
    if (!ziel || !at || at <= now.getTime()) {
        return null;
    }
    const zielSoc = ziel === 'voll' ? 100 : minSoc;
    if (at <= ende) {
        return { bis: { min: (at - start) / 60_000, w: zielSoc }, ziel };
    }
    // cut at midnight on the straight line
    const f = (ende - now.getTime()) / (at - now.getTime());
    return { bis: { min: 24 * 60, w: soc + (zielSoc - soc) * f }, ziel };
}

// ---------------------------------------------------------------- live flow

export interface Fluss {
    solarW: number;
    /** + charging, − discharging */
    akkuW: number;
    wrW: number;
    /** + grid import, − export */
    netzW: number;
    hausW: number;
}

/** Live flow; the home is grid + inverter when both are known (same source as the meter) */
export function fluss(v: { solarW: unknown; akkuW: unknown; wrW: unknown; netzW: unknown; hausW: unknown }): Fluss {
    const solarW = Math.max(0, num(v.solarW));
    const akkuW = num(v.akkuW);
    const wrW = Math.max(0, num(v.wrW));
    const netzKnown = v.netzW !== null && v.netzW !== undefined && v.netzW !== '';
    const netzW = num(v.netzW);
    const hausW = netzKnown ? Math.max(0, netzW + wrW) : Math.max(0, num(v.hausW));
    return { solarW, akkuW, wrW, netzW, hausW };
}

// ---------------------------------------------------------------- forecast

export interface Prognose {
    heute: number;
    morgen: number;
    /** kWh per MJ/m², from the own past days */
    faktor: number;
}

/**
 * open-meteo daily shortwave_radiation_sum (MJ/m²) with past days → forecast kWh for today and tomorrow.
 * The factor comes from the yield of the past days (no panel data needed); null with too little data.
 */
export function prognose(answer: unknown, now: Date, s: Statistik): Prognose | null {
    const d = (answer as { daily?: { time?: unknown; shortwave_radiation_sum?: unknown } } | null)?.daily;
    if (!d || !Array.isArray(d.time) || !Array.isArray(d.shortwave_radiation_sum)) {
        return null;
    }
    const iso = (x: Date): string =>
        `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const heuteIso = iso(now);
    const morgenIso = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    let sumErtrag = 0;
    let sumMj = 0;
    let tage = 0;
    let mjHeute: number | null = null;
    let mjMorgen: number | null = null;
    d.time.forEach((t, i) => {
        const mj = num((d.shortwave_radiation_sum as unknown[])[i]);
        if (t === heuteIso) {
            mjHeute = mj;
            return;
        }
        if (t === morgenIso) {
            mjMorgen = mj;
            return;
        }
        if (typeof t !== 'string' || t > heuteIso || mj <= 0) {
            return;
        }
        const [y, m, day] = t.split('-').map(Number);
        const b = tagBucket(new Date(y, m - 1, day), now, s);
        if (b && b.ertrag > 0) {
            sumErtrag += b.ertrag;
            sumMj += mj;
            tage++;
        }
    });
    if (tage < 3 || sumMj <= 0 || mjHeute === null || mjMorgen === null) {
        return null;
    }
    const faktor = sumErtrag / sumMj;
    return { heute: faktor * mjHeute, morgen: faktor * mjMorgen, faktor };
}

export function prognoseUrl(lat: number, lon: number): string {
    return (
        `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
        '&daily=shortwave_radiation_sum&past_days=14&forecast_days=2&timezone=auto'
    );
}

// ---------------------------------------------------------------- start page hint

export type Hinweis = { art: 'cloud' | 'leer'; text: string } | null;

/** Warning for the start page: cloud gone (no connection or no read for 10 min) or battery empty */
export function hinweis(
    o: { verbunden: unknown; lastSync: unknown; soc: unknown; minSoc: number },
    now: number,
): Hinweis {
    const sync = num(o.lastSync);
    if (o.verbunden === false || o.verbunden === 'false' || (sync > 0 && now - sync > 10 * 60_000)) {
        return { art: 'cloud', text: 'Sunlit-Cloud nicht erreichbar' };
    }
    if (o.soc !== null && o.soc !== undefined && o.soc !== '' && num(o.soc) <= o.minSoc) {
        return { art: 'leer', text: 'Akku an der Grenze · Strom aus dem Netz' };
    }
    return null;
}

/** "18:40" / "morgen 07:10" */
export function uhrzeit(ts: number | null, now: Date): string {
    if (!ts) {
        return '';
    }
    const d = new Date(ts);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return d.toDateString() === now.toDateString() ? hm : `morgen ${hm}`;
}

/** Module levels of live.moduleSoc */
export function parseModule(v: unknown): { module: number; name: string; soc: number }[] {
    const a = json(v);
    return Array.isArray(a)
        ? a
              .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
              .map(x => ({
                  module: num(x.module),
                  name: typeof x.name === 'string' && x.name ? x.name : `M${num(x.module)}`,
                  soc: num(x.soc),
              }))
        : [];
}

/** Solar inputs of live.mppt */
export function parseMppt(v: unknown): { name: string; w: number }[] {
    const a = json(v);
    return Array.isArray(a)
        ? a
              .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
              .map(x => ({
                  name: (typeof x.name === 'string' ? x.name : typeof x.id === 'string' ? x.id : '')
                      .replace(/^MPPT\d*-?\s*/i, '')
                      .trim(),
                  w: num(x.w),
              }))
        : [];
}
