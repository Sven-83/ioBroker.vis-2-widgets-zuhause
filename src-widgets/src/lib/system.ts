/*
 * ioBroker status tile (script.js.vis2.iobroker-waechter, spec Claude-Specs/iobroker-status.md):
 * pure logic for the tile and the popup, without React, so it can be tested.
 * The watcher writes JSON states under 0_userdata.0.system.iobrokerStatus; this file only reads them.
 */

export const DEFAULT_BASE = '0_userdata.0.system.iobrokerStatus';

/** States of the watcher read by the widget (relative to the base) */
export const SYS = {
    ampel: 'ampel',
    kurztext: 'kurztext',
    updates: 'updates',
    instanzen: 'instanzen',
    host: 'host',
    letztePruefung: 'letztePruefung',
    letzterEingriff: 'letzterEingriff',
    gesehen: 'gesehen',
} as const;

/** The watcher checks every 2 minutes; older than this = the watcher stands still */
export const STILL_MS = 10 * 60 * 1000;

export type Stufe = 'ok' | 'gelb' | 'rot' | 'aus' | 'info';

export interface Instanz {
    id: string;
    mode: string;
    en: boolean;
    alive: boolean;
    conn: boolean | null;
    seit: number | null;
    rss: number | null;
    ver: string;
    avail: string | null;
    eigen: boolean;
    neu: boolean;
    fehler: { n: number; letzte: string } | null;
    stufe: Stufe;
    text: string;
}

export interface OhneInstanz {
    id: string;
    ver: string;
    avail: string;
}

export interface Liste {
    ts: number;
    liste: Instanz[];
    ohneInstanz: OhneInstanz[];
    /** switched-on scripts (mode 'skript', id without "script.js."), only shown, never restarted */
    skripte: Instanz[];
}

export interface Host {
    name: string;
    ramGesamt: number | null;
    ramVerfuegbar: number | null;
    diskGroesse: number | null;
    diskFrei: number | null;
    cpu: number | null;
    last: number | null;
    uptimeS: number | null;
    controllerRss: number | null;
    swap: { gesamt: number; belegt: number } | null;
}

const STUFEN: Stufe[] = ['ok', 'gelb', 'rot', 'aus', 'info'];

function num(x: unknown): number | null {
    return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function str(x: unknown): string {
    return typeof x === 'string' ? x : '';
}

function zeilen(arr: unknown[]): Instanz[] {
    return arr
        .filter(
            (x): x is Record<string, unknown> =>
                !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string',
        )
        .map(x => {
            const f = x.fehler as Record<string, unknown> | null | undefined;
            const stufe = STUFEN.includes(x.stufe as Stufe) ? (x.stufe as Stufe) : 'info';
            return {
                id: str(x.id),
                mode: str(x.mode) || 'none',
                en: x.en === true,
                alive: x.alive === true,
                conn: typeof x.conn === 'boolean' ? x.conn : null,
                seit: num(x.seit),
                rss: num(x.rss),
                ver: str(x.ver),
                avail: str(x.avail) || null,
                eigen: x.eigen === true,
                neu: x.neu === true,
                fehler: f && typeof f === 'object' && num(f.n) ? { n: num(f.n) ?? 0, letzte: str(f.letzte) } : null,
                stufe,
                text: str(x.text),
            };
        });
}

/** Reads the JSON of the state "instanzen"; broken or missing data gives an empty list */
export function parseListe(val: unknown): Liste {
    let raw: unknown = val;
    if (typeof val === 'string') {
        try {
            raw = JSON.parse(val);
        } catch {
            raw = null;
        }
    }
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const liste = Array.isArray(o.liste) ? o.liste : [];
    const ohne = Array.isArray(o.ohneInstanz) ? o.ohneInstanz : [];
    return {
        ts: num(o.ts) ?? 0,
        liste: zeilen(liste),
        ohneInstanz: ohne
            .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
            .map(x => ({ id: str(x.id), ver: str(x.ver), avail: str(x.avail) }))
            .filter(x => x.id && x.avail),
        skripte: zeilen(Array.isArray(o.skripte) ? o.skripte : []).map(x => ({ ...x, mode: 'skript' })),
    };
}

/** Reads the JSON of the state "host" */
export function parseHost(val: unknown): Host | null {
    let raw: unknown = val;
    if (typeof val === 'string') {
        try {
            raw = JSON.parse(val);
        } catch {
            return null;
        }
    }
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const o = raw as Record<string, unknown>;
    const s = o.swap as Record<string, unknown> | null | undefined;
    const sg = s ? num(s.gesamt) : null;
    const sb = s ? num(s.belegt) : null;
    return {
        name: str(o.name),
        ramGesamt: num(o.ramGesamt),
        ramVerfuegbar: num(o.ramVerfuegbar),
        diskGroesse: num(o.diskGroesse),
        diskFrei: num(o.diskFrei),
        cpu: num(o.cpu),
        last: num(o.last),
        uptimeS: num(o.uptimeS),
        controllerRss: num(o.controllerRss),
        swap: sg && sb !== null ? { gesamt: sg, belegt: sb } : null,
    };
}

// ---------------------------------------------------------------- tile

export type TileArt = 'ok' | 'gelb' | 'rot' | 'steht' | 'leer';

export interface TileView {
    art: TileArt;
    /** small line under the label */
    text: string;
    /** number of available updates, 0 = no badge */
    updates: number;
    /** the watcher restarts something right now */
    arbeit: boolean;
}

/**
 * Look of the tile. Updates never colour it (there are almost always some), they are a badge.
 * yellow = restart running or repaired and not seen yet; red = repair failed;
 * dashed grey = the watcher has not reported for STILL_MS.
 */
export function tileView(p: {
    ampel: unknown;
    kurztext: unknown;
    updates: unknown;
    letztePruefung: unknown;
    liste: Liste;
    now: number;
}): TileView {
    const updates = Math.max(0, Math.round(num(p.updates) ?? 0));
    const last = num(p.letztePruefung);
    if (last === null || last <= 0) {
        return { art: 'leer', text: 'keine Daten', updates: 0, arbeit: false };
    }
    if (p.now - last > STILL_MS) {
        return { art: 'steht', text: 'Wächter steht', updates: 0, arbeit: false };
    }
    const arbeit = p.liste.liste.some(x => x.stufe === 'gelb');
    const ampel = num(p.ampel) ?? 0;
    const text = str(p.kurztext) || '–';
    if (ampel >= 2) {
        return { art: 'rot', text, updates, arbeit };
    }
    if (ampel === 1) {
        return { art: 'gelb', text: arbeit ? 'repariert …' : text, updates, arbeit };
    }
    return { art: 'ok', text, updates, arbeit: false };
}

// ---------------------------------------------------------------- popup

export type Filter = 'alle' | 'prob' | 'upd' | 'fehler' | 'eigen' | 'skripte';

export const FILTER: { key: Filter; label: string }[] = [
    { key: 'alle', label: 'Alle' },
    { key: 'prob', label: 'Probleme' },
    { key: 'upd', label: 'Updates' },
    { key: 'fehler', label: 'Fehler heute' },
    { key: 'eigen', label: 'Eigene' },
    { key: 'skripte', label: 'Skripte' },
];

const problem = (x: Instanz): boolean => x.stufe === 'rot' || x.stufe === 'gelb';

/** Filter for adapter instances (scripts: see passtSkript) */
export function passt(x: Instanz, f: Filter): boolean {
    switch (f) {
        case 'prob':
            return problem(x);
        case 'upd':
            return !!x.avail;
        case 'fehler':
            return !!x.fehler;
        case 'eigen':
            return x.eigen;
        case 'skripte':
            return false;
        default:
            return true;
    }
}

/** Filter for scripts: they have no updates and are never "own adapters" */
export function passtSkript(x: Instanz, f: Filter): boolean {
    switch (f) {
        case 'prob':
            return problem(x);
        case 'fehler':
            return !!x.fehler;
        case 'upd':
        case 'eigen':
            return false;
        default:
            return true;
    }
}

export function zaehlen(l: Liste): Record<Filter, number> {
    const n = (f: Filter): number => l.liste.filter(x => passt(x, f)).length;
    const fehler = (a: Instanz[]): number => a.reduce((s, x) => s + (x.fehler?.n ?? 0), 0);
    return {
        alle: l.liste.length,
        prob: n('prob') + l.skripte.filter(problem).length,
        upd: n('upd') + l.ohneInstanz.length,
        fehler: fehler(l.liste) + fehler(l.skripte),
        eigen: n('eigen'),
        skripte: l.skripte.length,
    };
}

export interface Gruppe {
    titel: string;
    zeilen: Instanz[];
}

/**
 * Problems first (instances and scripts), then running, then without own process, then switched off,
 * then the running scripts. A script with a problem sits at the top, it does not hide at the bottom.
 */
export function gruppen(l: Liste, f: Filter): Gruppe[] {
    const skripte = l.skripte.filter(x => passtSkript(x, f));
    const g: [string, (x: Instanz) => boolean][] = [
        ['Läuft', x => x.stufe === 'ok'],
        ['Ohne eigenen Prozess', x => x.stufe === 'info'],
        ['Abgeschaltet – wird nicht überwacht', x => x.stufe === 'aus'],
    ];
    const out: Gruppe[] = [
        {
            titel: 'Braucht Aufmerksamkeit',
            zeilen: [...l.liste.filter(x => problem(x) && passt(x, f)), ...skripte.filter(problem)],
        },
        ...g.map(([titel, test]) => ({ titel, zeilen: l.liste.filter(x => test(x) && passt(x, f)) })),
        { titel: 'Skripte – nur angezeigt, kein Neustart', zeilen: skripte.filter(x => !problem(x)) },
    ];
    return out.filter(x => x.zeilen.length);
}

/** "läuft seit": minutes, hours or days */
export function seitText(ms: number | null, now: number): string {
    if (!ms) {
        return '—';
    }
    const min = (now - ms) / 60_000;
    if (min < 60) {
        return `${Math.max(1, Math.round(min))} min`;
    }
    if (min < 24 * 60) {
        return `${Math.round(min / 60)} h`;
    }
    const tage = Math.round(min / 1440);
    return tage === 1 ? '1 Tag' : `${tage} Tage`;
}

/** Colour level of a meter: from 80 % yellow, from 90 % red */
export function meterStufe(prozent: number): '' | 'gelb' | 'rot' {
    return prozent >= 90 ? 'rot' : prozent >= 80 ? 'gelb' : '';
}

const gb = (mb: number): string =>
    (mb / 1024).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface Meter {
    titel: string;
    prozent: number;
    unten: string;
    /** part of the line that is highlighted (e.g. swap almost full) */
    hinweis?: string;
}

/** Three meters: memory, SD card, processor. Missing values leave a meter out. */
export function meters(h: Host | null): Meter[] {
    if (!h) {
        return [];
    }
    const out: Meter[] = [];
    if (h.ramGesamt && h.ramVerfuegbar !== null) {
        const belegt = h.ramGesamt - h.ramVerfuegbar;
        const m: Meter = {
            titel: 'Arbeitsspeicher',
            prozent: Math.round((belegt / h.ramGesamt) * 100),
            unten: `${gb(belegt)} von ${gb(h.ramGesamt)} GB belegt`,
        };
        if (h.swap && h.swap.gesamt > 0) {
            const sp = Math.round((h.swap.belegt / h.swap.gesamt) * 100);
            if (sp >= 80) {
                m.hinweis = `Swap ${sp} %`;
            } else {
                m.unten += ` · Swap ${sp} %`;
            }
        }
        out.push(m);
    }
    if (h.diskGroesse && h.diskFrei !== null) {
        const belegt = h.diskGroesse - h.diskFrei;
        out.push({
            titel: 'Speicherkarte',
            prozent: Math.round((belegt / h.diskGroesse) * 100),
            unten: `${gb(belegt)} von ${gb(h.diskGroesse)} GB · ${gb(h.diskFrei)} GB frei`,
        });
    }
    if (h.cpu !== null) {
        const teile: string[] = [];
        if (h.last !== null) {
            teile.push(`Last ${h.last.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`);
        }
        if (h.uptimeS !== null) {
            const tage = Math.floor(h.uptimeS / 86_400);
            teile.push(tage === 1 ? 'Pi läuft seit 1 Tag' : `Pi läuft seit ${tage} Tagen`);
        }
        out.push({ titel: 'Prozessor', prozent: Math.round(h.cpu), unten: teile.join(' · ') });
    }
    return out;
}
