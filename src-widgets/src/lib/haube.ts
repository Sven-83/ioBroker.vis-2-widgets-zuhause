/*
 * Logic of the hood tile (widget ZuhauseHaube), written for the adapter falmec.
 * The adapter decides what a short tap does (preset.toggle); the tile only shows confirmed values.
 */

export const HAUBE_LEVELS = [0, 1, 2, 3, 4] as const;
/** Timer choices in the popup, in minutes */
export const HAUBE_TIMERS = [15, 30, 60] as const;
/** Duration of one rotor turn per fan level in seconds; 0 = standing still */
export const ROTOR_TURN_S = [0, 4, 3, 2, 1.2] as const;
/** Canopy of the hood icon in a 24 x 24 box */
export const CANOPY_PATH = 'M2 4h20 M5 4v3.5h14V4';
/** Centre of the rotor in the icon; also the point it turns around */
export const ROTOR_CENTRE = { x: 12, y: 15.5, r: 5.8 } as const;

/** Rotor with three curved blades */
export function rotorPath(cx: number, cy: number, r: number): string {
    const unit: Array<[number, number]> = [
        [-0.2, -0.42],
        [-0.24, -0.95],
        [0.08, -1],
        [0.36, -0.95],
        [0.32, -0.38],
    ];
    return [0, 120, 240]
        .map(degrees => {
            const a = (degrees * Math.PI) / 180;
            const point = ([x, y]: [number, number]): string =>
                `${(cx + r * (x * Math.cos(a) - y * Math.sin(a))).toFixed(2)} ${(cy + r * (x * Math.sin(a) + y * Math.cos(a))).toFixed(2)}`;
            const [c1, c2, tip, c3, c4] = unit.map(point);
            return `M${cx} ${cy}C${c1} ${c2} ${tip}C${c3} ${c4} ${cx} ${cy}z`;
        })
        .join(' ');
}

/** Fan level from a state value; anything unknown counts as off */
export function asLevel(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4 ? value : 0;
}

/** Remaining time for the tile: minutes, seconds in the last minute */
export function timerText(remainingMs: number): string {
    const ms = Math.max(0, remainingMs);
    return ms >= 60_000 ? `${Math.ceil(ms / 60_000)} Min` : `${Math.ceil(ms / 1000)} s`;
}

/**
 * How much of the ring around the tile has been used up.
 *
 * @returns 0 (full ring) to 100 (empty), as dash offset for a path of length 100
 */
export function ringOffset(remainingMs: number, totalMinutes: number): number {
    if (!(totalMinutes > 0)) {
        return 0;
    }
    const left = remainingMs / (totalMinutes * 60_000);
    return Math.round((1 - Math.max(0, Math.min(1, left))) * 1000) / 10;
}

export interface HaubeStatus {
    level: number;
    light: boolean;
    connected: boolean;
    /** Remaining time of a running timer */
    remainingMs?: number;
}

/** One line for the popup and for screen readers */
export function statusText(s: HaubeStatus): string {
    if (!s.connected) {
        return 'Keine Verbindung, zeigt den letzten Stand';
    }
    const parts = [s.level ? `Stufe ${s.level}` : 'Lüfter aus', s.light ? 'Licht an' : 'Licht aus'];
    if (s.remainingMs !== undefined) {
        parts.push(`noch ${timerText(s.remainingMs)}`);
    }
    return parts.join(' · ');
}

export interface HaubePreset {
    level: number;
    light: boolean;
    /** Minutes, 0 = no timer */
    timer: number;
}

export interface PresetWrite {
    key: keyof HaubePreset;
    value: number | boolean;
}

/**
 * Writes for choosing a fan level in the preset, in the right order: the adapter refuses "everything off",
 * so the light has to be on before the level goes to 0. A preset without a fan has no timer.
 */
export function presetLevelWrites(current: HaubePreset, level: number): PresetWrite[] {
    const writes: PresetWrite[] = [];
    if (level === 0 && !current.light) {
        writes.push({ key: 'light', value: true });
    }
    if (level !== current.level) {
        writes.push({ key: 'level', value: level });
    }
    if (level === 0 && current.timer !== 0) {
        writes.push({ key: 'timer', value: 0 });
    }
    return writes;
}
