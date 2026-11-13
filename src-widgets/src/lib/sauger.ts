/*
 * Logic of the vacuum robot page (widget ZuhauseSauger), written for the Dreame adapter dreamehome
 * (fork with control.MopWashArea and control.WetnessLevel). No React here, so it can be tested.
 *
 * Start of a room cleaning: the robot ignores suction/water inside the "selects" of StartCustom and
 * uses its current settings, so the page first writes every setting that differs, then starts.
 */

/** A room of the robot on the floor plan */
export interface SaugerRaum {
    name: string;
    /** RoomID of the robot (dreamehome map.<n>.<room>.RoomID) */
    id: number;
    /** polygons in viewBox coordinates of the plan, "x,y x,y ..." */
    flaechen: string[];
    /** label position; without it the middle of the first polygon */
    x?: number;
    y?: number;
    /** small label (small rooms) */
    klein?: boolean;
}

export type Modus = 'saugen' | 'wischen' | 'beides' | 'nachein';

/** control.CleaningMode of dreamehome (20 m² form, the adapter keeps the real mop wash area) */
export const MODUS_CODE: Record<Modus, number> = { beides: 5120, wischen: 5121, saugen: 5122, nachein: 5123 };
export const MODI: Modus[] = ['saugen', 'wischen', 'beides', 'nachein'];

export const ROUTEN = [1, 2, 3, 4] as const; // Standard, Intensiv, Tief, Schnell (control.CleanRoute)
export const SAUGSTUFEN = [0, 1, 2, 3] as const; // Leise, Standard, Intensiv, Max (control.SuctionLevel)

/** Water ranges as in the Dreamehome app */
export const WASSER_STUFEN = [
    { key: 'low', von: 1, bis: 5 },
    { key: 'mid', von: 6, bis: 16 },
    { key: 'high', von: 17, bis: 27 },
    { key: 'ultra', von: 28, bis: 32 },
] as const;

export const WASSER_MIN = 1;
export const WASSER_MAX = 32;
export const M2_MIN = 10;
export const M2_MAX = 35;

export function wasserStufe(w: number): (typeof WASSER_STUFEN)[number]['key'] {
    return (WASSER_STUFEN.find(s => w >= s.von && w <= s.bis) ?? WASSER_STUFEN[1]).key;
}

/** Relative widths of the scale segments: the borders lie between two levels (5|6, 16|17, 27|28) */
export function skalaAnteile(): number[] {
    return WASSER_STUFEN.map((s, i) => s.bis - s.von + 1 - (i === 0 || i === WASSER_STUFEN.length - 1 ? 0.5 : 0));
}

export function modusVonCode(v: unknown): Modus | null {
    const n = Number(v);
    if (!Number.isFinite(n)) {
        return null;
    }
    // high byte = mop wash area (adapter versions without normalization)
    const low = n >= 256 ? n & 0xff : n - 5120;
    return (['beides', 'wischen', 'saugen', 'nachein'] as Modus[])[low] ?? null;
}

export const saugt = (m: Modus): boolean => m !== 'wischen';
export const wischt = (m: Modus): boolean => m !== 'saugen';

// ---------------------------------------------------------------- data points

export interface SaugerIds {
    zustand: string;
    status: string;
    aufgabe: string;
    akku: string;
    raumJetzt: string;
    aktiveRaeume: string;
    modus: string;
    saug: string;
    max: string;
    wasser: string;
    m2: string;
    route: string;
    start: string;
    reihenfolge: string;
    pause: string;
    weiter: string;
    stopp: string;
    basis: string;
}

/** All data points below the device path, e.g. "dreamehome.0.852355969" */
export function saugerIds(geraet: string): SaugerIds | null {
    const g = String(geraet || '')
        .trim()
        .replace(/\.+$/, '');
    if (!/^[\w-]+\.\d+\.[\w-]+$/.test(g)) {
        return null;
    }
    return {
        zustand: `${g}.state.State`,
        status: `${g}.state.Status`,
        aufgabe: `${g}.state.TaskStatus`,
        akku: `${g}.state.BatteryLevel`,
        raumJetzt: `${g}.state.CurrentRoomCleaningNumber`,
        aktiveRaeume: `${g}.mqtt.state.ActiveSegments`,
        modus: `${g}.control.CleaningMode`,
        saug: `${g}.control.SuctionLevel`,
        max: `${g}.control.SuctionMaxPlus`,
        wasser: `${g}.control.WetnessLevel`,
        m2: `${g}.control.MopWashArea`,
        route: `${g}.control.CleanRoute`,
        start: `${g}.control.StartCustom`,
        reihenfolge: `${g}.control.CleanOrder`,
        pause: `${g}.control.Pause`,
        weiter: `${g}.control.Start`,
        stopp: `${g}.control.Stop`,
        basis: `${g}.control.Charge`,
    };
}

// ---------------------------------------------------------------- settings

export interface Einstellung {
    modus: Modus;
    saug: number;
    max: boolean;
    wasser: number;
    m2: number;
    route: number;
    durchgaenge: number;
}

export const STANDARD: Einstellung = {
    modus: 'nachein',
    saug: 1,
    max: false,
    wasser: 15,
    m2: 20,
    route: 1,
    durchgaenge: 1,
};

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(n)));

/** Settings as the robot reports them (fallback for missing values) */
export function ausRoboter(val: (id: string) => unknown, ids: SaugerIds, fallback = STANDARD): Einstellung {
    const num = (id: string, d: number): number => {
        const n = Number(val(id));
        return val(id) === null || val(id) === undefined || val(id) === '' || !Number.isFinite(n) ? d : n;
    };
    const route = num(ids.route, fallback.route);
    return {
        modus: modusVonCode(val(ids.modus)) ?? fallback.modus,
        saug: clamp(num(ids.saug, fallback.saug), 0, 3),
        max: num(ids.max, fallback.max ? 1 : 0) === 1,
        wasser: clamp(num(ids.wasser, fallback.wasser), WASSER_MIN, WASSER_MAX),
        m2: clamp(num(ids.m2, fallback.m2), M2_MIN, M2_MAX),
        route: route >= 1 && route <= 4 ? route : fallback.route,
        durchgaenge: fallback.durchgaenge,
    };
}

/** Values written from the page that the robot has not confirmed yet: shown instead of the robot's */
export type Ausstehend = Partial<Record<keyof Einstellung, { v: Einstellung[keyof Einstellung]; t: number }>>;

/** How long a written value wins over the robot's report without confirmation */
export const AUSSTEHEND_MS = 10000;

/**
 * What the page shows: the robot's settings, except values just written and not reported back yet.
 * Removes confirmed and expired entries from `pend`, so afterwards every change from the app shows again.
 */
export function anzeigen(roboter: Einstellung, pend: Ausstehend, now: number): Einstellung {
    const out = { ...roboter } as Record<keyof Einstellung, unknown>;
    for (const k of Object.keys(pend) as (keyof Einstellung)[]) {
        const p = pend[k]!;
        if (now - p.t >= AUSSTEHEND_MS || roboter[k] === p.v) {
            delete pend[k];
        } else {
            out[k] = p.v;
        }
    }
    return out as unknown as Einstellung;
}

export interface Schreiben {
    id: string;
    value: number | string;
}

/**
 * Writes before the start, only what differs from the robot. Order: the cleaning mode first (it shares
 * S4P23 with the mop wash area), then the rest.
 */
export function vorbereiten(wunsch: Einstellung, roboter: Einstellung, ids: SaugerIds): Schreiben[] {
    const out: Schreiben[] = [];
    if (wunsch.modus !== roboter.modus) {
        out.push({ id: ids.modus, value: MODUS_CODE[wunsch.modus] });
    }
    if (wischt(wunsch.modus) && wunsch.m2 !== roboter.m2) {
        out.push({ id: ids.m2, value: wunsch.m2 });
    }
    if (saugt(wunsch.modus) && wunsch.saug !== roboter.saug) {
        out.push({ id: ids.saug, value: wunsch.saug });
    }
    if (saugt(wunsch.modus) && wunsch.max !== roboter.max) {
        out.push({ id: ids.max, value: wunsch.max ? 1 : 0 });
    }
    if (wischt(wunsch.modus) && wunsch.wasser !== roboter.wasser) {
        out.push({ id: ids.wasser, value: wunsch.wasser });
    }
    if (wunsch.route !== roboter.route) {
        out.push({ id: ids.route, value: wunsch.route });
    }
    return out;
}

/**
 * Value for control.CleanOrder (map action S6A2, newer maps: "cleanareaorder"). These robots clean the rooms
 * of a job in the order stored on the map, not in the order of "selects", so the page stores the chosen
 * order before the start: chosen rooms first, then all other known rooms (the list must stay complete).
 */
export function reihenfolgeBefehl(gewaehlt: number[], alle: number[]): string {
    const ids: number[] = [];
    for (const id of [...gewaehlt, ...alle]) {
        if (Number.isInteger(id) && id > 0 && !ids.includes(id)) {
            ids.push(id);
        }
    }
    const cleanareaorder = ids.map((id, i) => ({ [String(id)]: i + 1 }));
    return JSON.stringify([{ piid: 4, value: JSON.stringify({ cleanareaorder }) }]);
}

/**
 * Value for control.StartCustom: [room, repeats, suction, water, 1] per room, rooms in the chosen order.
 * The 5th field must stay 1 on robots with per-room settings (X40 & co.): with 2, 3, ... they only clean
 * the first room (seen 2026-11-11, same note in Tasshack/dreame-vacuum clean_segment).
 */
export function startBefehl(raeume: number[], e: Einstellung): string {
    const rep = clamp(e.durchgaenge, 1, 3);
    const selects = raeume.map(id => [id, rep, e.saug, e.wasser, 1]);
    return JSON.stringify([
        { piid: 1, value: 18 },
        { piid: 10, value: JSON.stringify({ selects }) },
    ]);
}

// ---------------------------------------------------------------- running cleaning

/** Room ids of the running job in their order (mqtt.state.ActiveSegments = [[id, rep, suction, water, order], ...]) */
export function aktiveRaeume(v: unknown): number[] {
    let arr: unknown = v;
    if (typeof v === 'string') {
        try {
            arr = JSON.parse(v);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(arr)) {
        return [];
    }
    return arr
        .filter((s): s is unknown[] => Array.isArray(s) && Number.isFinite(Number(s[0])))
        .sort((a, b) => (Number(a[4]) || 0) - (Number(b[4]) || 0))
        .map(s => Number(s[0]));
}

/** Text of a state value (numbers and strings; objects give '') */
export function text(v: unknown): string {
    return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
}
const txt = text;

/** A job runs (or is paused) as long as the task status is not "done" */
export function laeuft(aufgabe: unknown): boolean {
    const t = txt(aufgabe).toLowerCase();
    return !!t && !/abgeschlossen|completed|unbekannt|unknown/.test(t);
}

export function pausiert(aufgabe: unknown, zustand: unknown, status: unknown): boolean {
    return /pausiert|paused/i.test(`${txt(aufgabe)} ${txt(zustand)} ${txt(status)}`);
}

/** The robot works in a room (not on the way, not at the base) */
export function imRaum(zustand: unknown): boolean {
    return (
        /reinigung|saugen|wischen|sweep|mop|clean/i.test(txt(zustand)) &&
        !/mopp-|mop clean|wasch|wash|trockn|dry/i.test(txt(zustand))
    );
}

/**
 * How long the robot must stay in the next room before the progress moves on. While mopping it drives
 * briefly into the next room and back (seen 2026-11-13: kitchen for under a minute, then the hall again).
 */
export const RAUM_HALTE_MS = 2 * 60_000;

/** Next room of the order the robot is in, not yet confirmed */
export interface Kandidat {
    idx: number;
    seit: number;
}

/**
 * Index of the current room in the order. The position based room of the adapter also reports the hall
 * on the way and the base room while fetching mops, so only rooms of the job count and never backwards.
 * The first room counts at once, every further one only after RAUM_HALTE_MS in it; going back into an
 * earlier room of the job before that drops the candidate.
 */
export function fortschritt(
    reihenfolge: number[],
    raumJetzt: unknown,
    zustand: unknown,
    bisher: number,
    kandidat: Kandidat | null,
    jetzt: number,
): { fort: number; kandidat: Kandidat | null } {
    const i = reihenfolge.indexOf(Number(raumJetzt));
    if (i < 0 || !imRaum(zustand)) {
        // on the way, at the base, in a room outside the job: nothing new
        return { fort: bisher, kandidat };
    }
    if (i <= bisher) {
        return { fort: bisher, kandidat: null };
    }
    if (bisher < 0) {
        return { fort: i, kandidat: null };
    }
    const k = kandidat?.idx === i ? kandidat : { idx: i, seit: jetzt };
    return jetzt - k.seit >= RAUM_HALTE_MS ? { fort: i, kandidat: null } : { fort: bisher, kandidat: k };
}

/** Longest pause between the vacuum and the mop round (fetch and wash mops) before the job counts as done */
export const WECHSEL_MAX_MS = 10 * 60_000;

/** Course of a job: "nachein" (mop after vacuum) reports "done" once between the two rounds */
export interface Ablauf {
    /** task status said "running" at the last check */
    lief: boolean;
    /** 1 = first (or only) round, 2 = mop round of "nachein" */
    runde: 1 | 2;
    /** since when the robot is between the rounds (0 = not) */
    wechselSeit: number;
}

export const ABLAUF_START: Ablauf = { lief: false, runde: 1, wechselSeit: 0 };

/**
 * Next step of the job course.
 * start: a job begins · runde2: the mop round begins (progress starts again) · wechsel: between the rounds ·
 * ende: the job is done · weiter: nothing new
 */
export function ablauf(
    a: Ablauf,
    laeuftJetzt: boolean,
    modus: Modus | null,
    jetzt: number,
): { a: Ablauf; schritt: 'start' | 'runde2' | 'wechsel' | 'ende' | 'weiter' } {
    if (laeuftJetzt) {
        if (a.wechselSeit) {
            return { a: { lief: true, runde: 2, wechselSeit: 0 }, schritt: 'runde2' };
        }
        if (!a.lief) {
            return { a: { lief: true, runde: 1, wechselSeit: 0 }, schritt: 'start' };
        }
        return { a, schritt: 'weiter' };
    }
    if (a.lief) {
        if (modus === 'nachein' && a.runde === 1) {
            return { a: { lief: false, runde: 1, wechselSeit: jetzt }, schritt: 'wechsel' };
        }
        return { a: ABLAUF_START, schritt: 'ende' };
    }
    if (a.wechselSeit) {
        return jetzt - a.wechselSeit > WECHSEL_MAX_MS
            ? { a: ABLAUF_START, schritt: 'ende' }
            : { a, schritt: 'wechsel' };
    }
    return { a, schritt: 'weiter' };
}

// ---------------------------------------------------------------- configuration

export function parseRaeume(json: unknown): { raeume: SaugerRaum[]; fehler: string[] } {
    let arr: unknown = json;
    const fehler: string[] = [];
    if (typeof json === 'string') {
        if (!json.trim()) {
            return { raeume: [], fehler };
        }
        try {
            arr = JSON.parse(json);
        } catch (e) {
            return { raeume: [], fehler: [`JSON: ${(e as Error).message}`] };
        }
    }
    if (!Array.isArray(arr)) {
        return { raeume: [], fehler: json ? ['JSON: Liste erwartet'] : [] };
    }
    const raeume: SaugerRaum[] = [];
    arr.forEach((r: Record<string, unknown>, i) => {
        const id = Number(r?.id);
        const flaechen = (Array.isArray(r?.flaechen) ? r.flaechen : [r?.flaechen])
            .map(f => String(f ?? '').trim())
            .filter(f => /^-?[\d.]+,-?[\d.]+(\s+-?[\d.]+,-?[\d.]+){2,}$/.test(f));
        if (!r || typeof r !== 'object' || !Number.isFinite(id) || !flaechen.length) {
            fehler.push(`Raum ${i + 1}: id und flaechen nötig`);
            return;
        }
        raeume.push({
            name: typeof r.name === 'string' && r.name ? r.name : `Raum ${id}`,
            id,
            flaechen,
            x: Number.isFinite(Number(r.x)) ? Number(r.x) : undefined,
            y: Number.isFinite(Number(r.y)) ? Number(r.y) : undefined,
            klein: !!r.klein,
        });
    });
    return { raeume, fehler };
}

/** Dashed borders between rooms that share a wall-less area: [[x1, y1, x2, y2], ...] */
export function parseLinien(json: unknown): [number, number, number, number][] {
    let arr: unknown = json;
    if (typeof json === 'string') {
        try {
            arr = JSON.parse(json || '[]');
        } catch {
            return [];
        }
    }
    if (!Array.isArray(arr)) {
        return [];
    }
    return arr
        .filter((l): l is unknown[] => Array.isArray(l) && l.length === 4 && l.every(n => Number.isFinite(Number(n))))
        .map(l => l.map(Number) as [number, number, number, number]);
}

/** Label position: configured, else middle of the bounding box of the first polygon */
export function labelPos(r: SaugerRaum): { x: number; y: number } {
    if (r.x !== undefined && r.y !== undefined) {
        return { x: r.x, y: r.y };
    }
    const pts = r.flaechen[0].split(/\s+/).map(p => p.split(',').map(Number));
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
