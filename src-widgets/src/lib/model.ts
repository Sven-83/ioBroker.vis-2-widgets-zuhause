/*
 * Pure logic of the widgets (no React, no VIS): tile types, tap actions, diagnosis badges,
 * weather codes, value formatting, school list. Covered by model.test.ts.
 */

/** Text of a state value or editor field; objects and null give "" */
export function str(val: unknown): string {
    return typeof val === 'string' ? val : typeof val === 'number' || typeof val === 'boolean' ? String(val) : '';
}

// ---------------------------------------------------------------- tile

/** Tile types of hand-over section 4 */
export const TILE_TYPES = ['schalter', 'schalter-pin', 'status-aus', 'status', 'status-warnung'] as const;
export type TileType = (typeof TILE_TYPES)[number];

/** Look of a tile = CSS state of hand-over section 4 */
export type TileLook = 'switch-on' | 'switch-off' | 'offable-on' | 'status-on' | 'status-off' | 'warn';

/** What a short tap does */
export type TapAction = 'write-true' | 'write-false' | 'open-pin' | 'none';

/** Interprets a state value as on/off: true, numbers > 0, "true"/"on"/"1"/"an"/"open" */
export function isOn(val: unknown): boolean {
    if (typeof val === 'boolean') {
        return val;
    }
    if (typeof val === 'number') {
        return val > 0;
    }
    if (typeof val === 'string') {
        return ['true', 'on', '1', 'an', 'ein', 'open', 'offen'].includes(val.trim().toLowerCase());
    }
    return false;
}

/**
 * "On when value is …": comma list of values for text states such as Home Connect
 * (BSH.Common.EnumType.OperationState.Run). An entry matches the whole value or its last part after the
 * last dot, case-insensitive; so "Run" is on, "Ready" / "Inactive" (standby) are off.
 * Empty list -> undefined (the tile uses isOn).
 */
export function matchesValue(val: unknown, list: string | undefined): boolean | undefined {
    const wanted = (list || '')
        .split(',')
        .map(w => w.trim().toLowerCase())
        .filter(Boolean);
    if (!wanted.length) {
        return undefined;
    }
    const text = str(val).trim().toLowerCase();
    if (!text) {
        return false;
    }
    const last = text.slice(text.lastIndexOf('.') + 1);
    return wanted.includes(text) || wanted.includes(last);
}

export function asTileType(typ: unknown): TileType {
    return TILE_TYPES.includes(typ as TileType) ? (typ as TileType) : 'schalter';
}

/** Warning for "status-warnung": the value equals warnBei (post: true = post there, window: false = open) */
export function isWarning(typ: TileType, on: boolean, warnBei: boolean): boolean {
    return typ === 'status-warnung' && on === warnBei;
}

export function tileLook(typ: TileType, on: boolean, warnBei: boolean): TileLook {
    switch (typ) {
        case 'schalter':
        case 'schalter-pin':
            return on ? 'switch-on' : 'switch-off';
        case 'status-aus':
            return on ? 'offable-on' : 'status-off';
        case 'status':
            return on ? 'status-on' : 'status-off';
        case 'status-warnung':
            if (isWarning(typ, on, warnBei)) {
                return 'warn';
            }
            // window (warnBei false): true = closed = green; post (warnBei true): false = grey
            return warnBei ? 'status-off' : 'status-on';
    }
}

/**
 * Tap rules (hand-over section 4):
 * schalter toggles · schalter-pin: on directly, off only via PIN dialog ·
 * status-aus: only off, a tap while off does nothing · status / status-warnung: no action
 */
export function tapAction(typ: TileType, on: boolean): TapAction {
    switch (typ) {
        case 'schalter':
            return on ? 'write-false' : 'write-true';
        case 'schalter-pin':
            return on ? 'open-pin' : 'write-true';
        case 'status-aus':
            return on ? 'write-false' : 'none';
        default:
            return 'none';
    }
}

/** A tile counts as active (animation runs) when it is on or warns */
export function isActive(look: TileLook): boolean {
    return look !== 'switch-off' && look !== 'status-off';
}

// ---------------------------------------------------------------- diagnosis

/**
 * Reception badge: boolean false (not reachable / not available), number 0,
 * or a number <= limit if a limit other than 0 is set (e.g. -90 for dBm).
 * Unknown value (null/undefined) -> no badge.
 */
export function noReception(val: unknown, limit: number): boolean {
    if (val === null || val === undefined || val === '') {
        return false;
    }
    if (typeof val === 'boolean') {
        return !val;
    }
    const n = typeof val === 'number' ? val : Number(val);
    if (Number.isNaN(n)) {
        return typeof val === 'string' && ['false', 'offline', 'off'].includes(val.toLowerCase());
    }
    return n === 0 || (limit !== 0 && n <= limit);
}

/** Battery badge: percent below the limit (default 20 %), or a boolean "low battery" flag that is true */
export function lowBattery(val: unknown, limit: number): boolean {
    if (val === null || val === undefined || val === '') {
        return false;
    }
    if (typeof val === 'boolean') {
        return val;
    }
    const n = typeof val === 'number' ? val : Number(val);
    return !Number.isNaN(n) && n < limit;
}

/** The value is older than maxMinutes (0 = check off) */
export function isStale(ts: number | undefined, maxMinutes: number, now: number): boolean {
    return maxMinutes > 0 && typeof ts === 'number' && ts > 0 && now - ts > maxMinutes * 60_000;
}

/** Device classes: which diagnosis badges a device can have (hand-over section 4) */
export const DEVICE_CLASSES: Record<string, { diag: ('empfang' | 'batterie')[] }> = {
    keine: { diag: [] },
    lampe: { diag: ['empfang'] },
    steckdose: { diag: ['empfang'] },
    jalousie: { diag: ['empfang'] },
    sirene: { diag: ['empfang'] },
    rauchmelder: { diag: ['empfang', 'batterie'] },
    fensterkontakt: { diag: ['empfang', 'batterie'] },
    glasbruch: { diag: ['empfang', 'batterie'] },
    thermometer: { diag: ['empfang', 'batterie'] },
    bewegung: { diag: ['empfang', 'batterie'] },
    wasser: { diag: ['empfang', 'batterie'] },
    fbh: { diag: ['empfang'] },
    geraet: { diag: ['empfang'] },
};

export function hasDiag(klasse: string | undefined, diag: 'empfang' | 'batterie'): boolean {
    return (DEVICE_CLASSES[klasse || 'geraet'] || DEVICE_CLASSES.geraet).diag.includes(diag);
}

// ---------------------------------------------------------------- pending command

/** How long a written value may wait for ack=true before the tile shows a red frame */
export const ACK_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------- PIN

export const PIN_DIGITS_DEFAULT = 4;

/** Next PIN entry after a key; complete = the entry has reached the number of digits */
export function pinKey(entry: string, key: string, digits: number): { entry: string; complete: boolean } {
    if (key === 'del') {
        return { entry: entry.slice(0, -1), complete: false };
    }
    if (!/^[0-9]$/.test(key) || entry.length >= digits) {
        return { entry, complete: entry.length >= digits };
    }
    const next = entry + key;
    return { entry: next, complete: next.length >= digits };
}

// ---------------------------------------------------------------- weather

export type WeatherIcon =
    | 'wetter-sonne'
    | 'wetter-teilweise'
    | 'wetter-wolke'
    | 'wetter-nebel'
    | 'wetter-regen'
    | 'wetter-schnee'
    | 'wetter-gewitter';

/** WMO weather code (open-meteo) -> icon */
export function weatherIcon(code: unknown): WeatherIcon | '' {
    const c = typeof code === 'number' ? code : Number(code);
    if (code === null || code === undefined || code === '' || Number.isNaN(c)) {
        return '';
    }
    if (c <= 1) {
        return 'wetter-sonne';
    }
    if (c === 2) {
        return 'wetter-teilweise';
    }
    if (c === 3) {
        return 'wetter-wolke';
    }
    if (c === 45 || c === 48) {
        return 'wetter-nebel';
    }
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) {
        return 'wetter-schnee';
    }
    if (c >= 95) {
        return 'wetter-gewitter';
    }
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) {
        return 'wetter-regen';
    }
    return 'wetter-wolke';
}

/** Icon colour per weather icon (sun yellow, fog blue-grey, rain blue, the rest neutral) */
export function weatherColor(icon: WeatherIcon | ''): string {
    switch (icon) {
        case 'wetter-sonne':
        case 'wetter-teilweise':
            return '#f2c14e';
        case 'wetter-nebel':
            return '#9db8d6';
        case 'wetter-regen':
        case 'wetter-gewitter':
            return '#8fb8e8';
        default:
            return '#cfccc3';
    }
}

const WEEKDAYS: Record<string, string[]> = {
    de: ['SONNTAG', 'MONTAG', 'DIENSTAG', 'MITTWOCH', 'DONNERSTAG', 'FREITAG', 'SAMSTAG'],
    en: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
};

/** Day label: HEUTE, MORGEN, then the weekday (offset in days from today) */
export function dayLabel(offset: number, today: Date, lang: string): string {
    const de = lang !== 'en';
    if (offset === 0) {
        return de ? 'HEUTE' : 'TODAY';
    }
    if (offset === 1) {
        return de ? 'MORGEN' : 'TOMORROW';
    }
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return (WEEKDAYS[de ? 'de' : 'en'] || WEEKDAYS.de)[d.getDay()];
}

const SHORT_DAYS: Record<string, string[]> = {
    de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Date of the page head: "Mi, 28.10.26" */
export function headDate(date: Date, lang: string): string {
    const day = (lang === 'en' ? SHORT_DAYS.en : SHORT_DAYS.de)[date.getDay()];
    return `${day}, ${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${pad2(date.getFullYear() % 100)}`;
}

export interface HeadTab {
    label: string;
    view: string;
}

/** Tabs of the page head: "Wohnung:Licht-Wohnung, Keller:Licht-Keller" */
export function parseTabs(text: unknown): HeadTab[] {
    return str(text)
        .split(/[,;\n]+/)
        .map(part => {
            const i = part.indexOf(':');
            return i > 0 ? { label: part.slice(0, i).trim(), view: part.slice(i + 1).trim() } : null;
        })
        .filter((tab): tab is HeadTab => !!tab && !!tab.label && !!tab.view);
}

/** Clock of the page head: "12:29" */
export function headTime(date: Date): string {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// ---------------------------------------------------------------- values

/** Number with fixed decimals and the decimal comma of the language; "—" without a value */
export function formatNumber(val: unknown, decimals: number, lang: string): string {
    if (val === null || val === undefined || val === '') {
        return '—';
    }
    const n = typeof val === 'number' ? val : Number(val);
    if (Number.isNaN(n)) {
        return str(val);
    }
    const d = Math.max(0, Math.min(6, Math.round(decimals)));
    // -0 after rounding ("-0,0") looks like a sign error
    const rounded = Number(n.toFixed(d)) === 0 ? 0 : n;
    return rounded.toLocaleString(lang === 'en' ? 'en-US' : 'de-DE', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
        useGrouping: Math.abs(n) >= 10_000,
    });
}

/** Value with unit; "°" sticks to the number, other units get a thin space */
export function formatValue(val: unknown, decimals: number, unit: string, lang: string): string {
    const num = formatNumber(val, decimals, lang);
    if (!unit) {
        return num;
    }
    return unit.startsWith('°') ? `${num}${unit}` : `${num} ${unit}`;
}

// ---------------------------------------------------------------- school

export interface Vertretung {
    klasse: string;
    stunde: string;
    fach: string;
    lehrer: string;
    vertreter: string;
    raum: string;
    text: string;
    entfall: boolean;
}

/** Parses a JSON array; anything else -> [] */
export function parseJsonArray<T>(val: unknown): T[] {
    if (Array.isArray(val)) {
        return val as T[];
    }
    if (typeof val !== 'string' || !val.trim()) {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(val);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

/** Normalised class name: "05a " -> "5a" (same rule as script C) */
export function normClass(k: string): string {
    return String(k).toLowerCase().replace(/\s+/g, '').replace(/^0+/, '');
}

/** Class list from the editor field: "5a, 7b; 10c" -> ["5a","7b","10c"] */
export function classList(text: unknown): string[] {
    return str(text)
        .split(/[,;\n]+/)
        .map(s => s.trim())
        .filter(Boolean);
}

/** Toggles a class in the selection (JSON array of the state), keeps the order of the editor list */
export function toggleClass(selected: string[], klasse: string, order: string[]): string[] {
    const n = normClass(klasse);
    const has = selected.some(s => normClass(s) === n);
    const next = has ? selected.filter(s => normClass(s) !== n) : [...selected, klasse];
    return next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Rows of the selected classes (script C filters already; this keeps the widget right if it does not) */
export function rowsForClasses(rows: Vertretung[], selected: string[]): Vertretung[] {
    const wanted = selected.map(normClass);
    return rows.filter(r =>
        String(r.klasse || '')
            .split(/[,\s]+/)
            .map(normClass)
            .some(k => wanted.includes(k)),
    );
}

/** Short info text of a row: "fällt aus" for cancelled lessons, else the text or the substitute/room */
export function rowInfo(r: Vertretung, lang: string): string {
    if (r.entfall) {
        return lang === 'en' ? 'cancelled' : 'fällt aus';
    }
    if (r.text) {
        return r.text;
    }
    const parts = [r.vertreter, r.raum].filter(Boolean);
    return parts.join(' · ');
}

const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Untis title "23.10.2026 Freitag, Woche A" -> "Fr 23.10."; unknown formats are returned unchanged */
export function planDate(titel: unknown): string {
    const s = str(titel).trim();
    const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})?/.exec(s);
    if (!m) {
        return s;
    }
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = m[3] ? Number(m[3]) : new Date().getFullYear();
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) {
        return s;
    }
    return `${WD_SHORT[d.getDay()]} ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.`;
}

/** Untis "Stand: 28.10.2026 13:34" -> "13:34" on the same day, else "28.10. 13:34" */
export function standShort(stand: unknown, now: Date): string {
    const s = str(stand).trim();
    const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})?\s+(\d{1,2}:\d{2})/.exec(s);
    if (!m) {
        return s;
    }
    const sameDay = Number(m[1]) === now.getDate() && Number(m[2]) === now.getMonth() + 1;
    return sameDay ? m[4] : `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}. ${m[4]}`;
}

/** One-line notes: "Key value" joined with " · ", after maxItems entries "+n weitere" */
export function notesLine(hinweise: { k?: string; v?: string }[], maxItems: number): string {
    const items = hinweise.map(h => [h.k, h.v].filter(Boolean).join(' ')).filter(Boolean);
    if (items.length <= maxItems) {
        return items.join(' · ');
    }
    return `${items.slice(0, maxItems).join(' · ')} · +${items.length - maxItems} weitere`;
}
