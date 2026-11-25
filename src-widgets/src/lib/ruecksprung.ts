/*
 * Return to the start page after inactivity (WCAG 2.2 SC 2.2.1: the time is adjustable, 0 = off).
 * Pure decision logic without DOM or timers, so it can be tested with a fake clock.
 *
 * Order after the idle time has passed:
 *   1. close the topmost open level (detail, then popup, …) – one per step, the caller asks again at once
 *   2. leave a menu page or tab and show the start page
 *   3. on the start page: dim the screen once neither a touch nor motion in front of the tablet came for the
 *      idle time (also when nobody left the start page). Motion only keeps the screen bright, it does not hold
 *      a page or popup open – that is up to touches alone.
 * Nothing happens while a video or live image plays, or while a finger is down / an input has focus –
 * the latter at most for the safety limit, so a stuck touch cannot keep a page open forever.
 */

export interface RuecksprungConfig {
    /** idle time in ms; 0 = off */
    zeitMs: number;
    /** longest time a running operation (finger down, input focused) may hold the return back */
    limitMs: number;
}

export interface RuecksprungLage {
    now: number;
    /** time of the last touch, key or input */
    letzteAktivitaet: number;
    /** since when an operation runs (finger down, input focused); null = none */
    bedienungSeit: number | null;
    /** a video or live image is playing */
    medienLaufen: boolean;
    /** open levels from bottom to top (ids) */
    ebenen: readonly string[];
    /** the start page is shown (menu entry and tab) */
    aufStartseite: boolean;
    /** time of the last motion in front of the tablet (Fully camera); 0 = none */
    letzteBewegung: number;
    /** the screen is dimmed already */
    gedimmt: boolean;
}

export type RuecksprungSchritt =
    { art: 'warten'; inMs: number | null } | { art: 'ebene'; id: string } | { art: 'startseite' } | { art: 'dimmen' };

export const DEFAULT_ZEIT_S = 120;
export const DEFAULT_LIMIT_S = 300;
const MIN_ZEIT_S = 10;
const MAX_ZEIT_S = 3600;

/** Seconds from a widget field: '' / invalid = default, 0 = off, otherwise clamped */
export function sekunden(raw: unknown, def: number, offErlaubt: boolean): number {
    if (raw === '' || raw === null || raw === undefined) {
        return def;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
        return def;
    }
    if (n === 0) {
        return offErlaubt ? 0 : def;
    }
    return Math.min(MAX_ZEIT_S, Math.max(MIN_ZEIT_S, Math.round(n)));
}

/** Next step; 'warten' carries the time until it is worth asking again (null = only on a change) */
export function naechsterSchritt(cfg: RuecksprungConfig, l: RuecksprungLage): RuecksprungSchritt {
    if (cfg.zeitMs <= 0 || l.medienLaufen) {
        return { art: 'warten', inMs: null };
    }
    let bereit = l.letzteAktivitaet + cfg.zeitMs;
    if (l.bedienungSeit !== null) {
        bereit = Math.max(bereit, l.bedienungSeit + Math.max(cfg.limitMs, cfg.zeitMs));
    }
    if (l.now < bereit) {
        return { art: 'warten', inMs: bereit - l.now };
    }
    if (l.ebenen.length > 0) {
        return { art: 'ebene', id: l.ebenen[l.ebenen.length - 1] };
    }
    if (!l.aufStartseite) {
        return { art: 'startseite' };
    }
    if (l.gedimmt) {
        return { art: 'warten', inMs: null };
    }
    const dimmBereit = l.letzteBewegung + cfg.zeitMs;
    if (l.now < dimmBereit) {
        return { art: 'warten', inMs: dimmBereit - l.now };
    }
    return { art: 'dimmen' };
}

// ---------------------------------------------------------------- Jäger menu path

/** Hash of the vis path that makes the Jäger layout show a menu entry: #view/widget/menu */
export function startHash(view: string, widgetId: string, menu: string): string {
    return `#${[view, widgetId, menu].map(p => encodeURIComponent(p.trim())).join('/')}`;
}

/** true = the hash shows the start page (no path, no menu part, or the start menu) */
export function istStartHash(hash: string, view: string, widgetId: string, menu: string): boolean {
    const teile = hash
        .replace(/^#/, '')
        .split('/')
        .map(p => {
            try {
                return decodeURIComponent(p);
            } catch {
                return p;
            }
        });
    const [v, w, m] = teile;
    if (!v) {
        // no path: vis shows the default view with its default menu entry
        return true;
    }
    if (v !== view) {
        return false;
    }
    if (!w) {
        return true;
    }
    return w === widgetId && (!m || m === menu);
}
