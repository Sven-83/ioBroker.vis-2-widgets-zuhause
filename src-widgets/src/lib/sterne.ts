/*
 * Star projector (Tuya, adapter ioBroker.tuya): data points and pure helpers for the widget ZuhauseSterne.
 * Data points confirmed on 13.11.2026 by watching the app and by writing from ioBroker.
 */

/** Data points below the device folder tuya.0.<device id> */
export const DP = {
    power: '20',
    /** 0 = last change was the laser, 1 = last change was the colour; the lamp sets it itself, never write it */
    mode: '21',
    /** laser brightness, the adapter shows 1–100 % (device 10–1000) */
    intensity: '22',
    /** HHHHSSSSVVVV hex: hue 0–360, saturation 0–1000, value 0–1000 */
    colour: '24',
    /** speed of the star rotation 10–1000; the app shows the value divided by 10 */
    rotation: '101',
    laser: '102',
    rgb: '103',
    online: 'online',
} as const;

export const INTENSITY = { min: 1, max: 100 } as const;
export const ROTATION = { min: 10, max: 1000 } as const;

export interface Hsv {
    /** 0–360 */
    h: number;
    /** 0–1000 */
    s: number;
    /** 0–1000 */
    v: number;
}

export function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

/** Reads DP 24; anything else than 12 hex digits gives null */
export function parseColour(value: unknown): Hsv | null {
    if (typeof value !== 'string' || !/^[0-9a-fA-F]{12}$/.test(value)) {
        return null;
    }
    const part = (i: number): number => parseInt(value.slice(i * 4, i * 4 + 4), 16);
    return { h: clamp(part(0), 0, 360), s: clamp(part(1), 0, 1000), v: clamp(part(2), 0, 1000) };
}

/** Writes DP 24 in the same form the app uses */
export function colourData(c: Hsv): string {
    const hex = (n: number, hi: number): string => clamp(Math.round(n), 0, hi).toString(16).padStart(4, '0');
    return hex(c.h % 360, 360) + hex(c.s, 1000) + hex(c.v, 1000);
}

/** HSV (s, v 0–1000) to RGB 0–255 */
export function hsvToRgb(c: Hsv): [number, number, number] {
    const s = clamp(c.s, 0, 1000) / 1000;
    const v = clamp(c.v, 0, 1000) / 1000;
    const f = (n: number): number => {
        const k = (n + c.h / 60) % 6;
        return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    return [f(5), f(3), f(1)];
}

export function asIntensity(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? clamp(value, INTENSITY.min, INTENSITY.max)
        : INTENSITY.max;
}

export function asRotation(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? clamp(value, ROTATION.min, ROTATION.max)
        : ROTATION.min;
}

/** Rotation as the app shows it (1–100) */
export function rotationShown(rotation: number): number {
    return Math.round(asRotation(rotation) / 10);
}

/** Duration of one turn of the star field on the tile: slow 40 s … fast 4 s */
export function spinSeconds(rotation: number): number {
    const f = (asRotation(rotation) - ROTATION.min) / (ROTATION.max - ROTATION.min);
    return Math.round((40 - f * 36) * 10) / 10;
}

export interface SterneStatus {
    online: boolean;
    power: boolean;
    laser: boolean;
    rgb: boolean;
}

export function statusText(st: SterneStatus): string {
    if (!st.online) {
        return 'nicht erreichbar';
    }
    if (!st.power) {
        return 'aus';
    }
    if (st.laser && st.rgb) {
        return 'Laser und Farblicht an';
    }
    if (st.laser) {
        return 'nur Laser an';
    }
    if (st.rgb) {
        return 'nur Farblicht an';
    }
    return 'an, Laser und Farblicht aus';
}

// ---------------------------------------------------------------- colour wheel geometry

/** Angle of a point around the centre, clockwise from the top, 0–360 */
export function angleOf(dx: number, dy: number): number {
    const a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return a < 0 ? a + 360 : a;
}

/** Position on the ring: hue from the angle, saturation from the distance (inside white, outside saturated) */
export function hueSatAt(dx: number, dy: number, rIn: number, rOut: number): { h: number; s: number } {
    const r = Math.hypot(dx, dy);
    return {
        h: Math.round(angleOf(dx, dy)) % 360,
        s: Math.round(clamp((r - rIn) / (rOut - rIn), 0, 1) * 1000),
    };
}

/** Share 0–1 of an arc from a0 to a1 (degrees, may run backwards) for an angle */
export function arcShare(angle: number, a0: number, a1: number): number {
    return clamp((angle - a0) / (a1 - a0), 0, 1);
}

/** Point at an angle (clockwise from the top) and radius around the centre c */
export function pointAt(c: number, angle: number, r: number): [number, number] {
    const rad = (angle * Math.PI) / 180;
    return [c + r * Math.sin(rad), c - r * Math.cos(rad)];
}
