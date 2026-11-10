/*
 * Circles of a tile (e.g. the networks of an alarm or camera system): a ring around the icon with one segment
 * and one letter per circle. Pure logic, drawn by components/KreisRing.tsx.
 */

/** Look of a circle */
export type KreisLook = 'aus' | 'gewaehlt' | 'scharf' | 'wartet';

/** One configured circle */
export interface Kreis {
    /** one or two letters next to the segment */
    buchstabe: string;
    /** circle is armed (true), disarmed (false) or unknown */
    scharf: boolean | undefined;
    /** circle belongs to the selection the tile switches; unknown counts as selected */
    gewaehlt: boolean | undefined;
    /** a command for this circle is running (e.g. blink.0.networks.<id>.armPending) */
    laeuft?: boolean;
}

/**
 * Look of a circle: a running command of the circle wins, then armed, then "waiting" for a selected circle
 * while the tile switches, then selected or not.
 *
 * @param kreis - Circle
 * @param pending - The tile waits for its command
 */
export function kreisLook(kreis: Kreis, pending: boolean): KreisLook {
    if (kreis.laeuft === true) {
        return 'wartet';
    }
    if (kreis.scharf === true) {
        return 'scharf';
    }
    const selected = kreis.gewaehlt !== false;
    if (pending && selected) {
        return 'wartet';
    }
    return selected ? 'gewaehlt' : 'aus';
}

/**
 * A command of any circle is running (e.g. disarming after the PIN): the tile shows it is busy and ignores taps,
 * so a second tap during the few seconds Blink needs cannot switch the circles back.
 *
 * @param kreise - Configured circles
 */
export function kreiseLaufen(kreise: readonly Kreis[]): boolean {
    return kreise.some(kreis => kreis.laeuft === true);
}

/**
 * Letter of a circle: given text trimmed to two characters, upper case; empty if none.
 *
 * @param text - Configured text
 */
export function kreisBuchstabe(text: unknown): string {
    return typeof text === 'string' ? text.trim().slice(0, 2).toUpperCase() : '';
}

/** Point on a circle, angle in degrees from the x axis (clockwise, y down) */
function point(cx: number, cy: number, r: number, deg: number): [number, number] {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/**
 * Geometry of the ring: segments evenly around the icon, the first at the top, clockwise; each letter
 * outside the middle of its segment.
 *
 * @param count - Number of circles (1 to 4)
 * @param size - Width and height of the drawing
 * @param radius - Radius of the ring
 * @param letterGap - Distance of the letters outside the ring
 */
export function kreisGeometrie(
    count: number,
    size: number,
    radius: number,
    letterGap: number,
): { d: string; letter: [number, number] }[] {
    const n = Math.max(1, Math.min(4, Math.round(count)));
    const c = size / 2;
    const step = 360 / n;
    // a gap between the segments, none for a single circle
    const half = n === 1 ? 179.9 : step / 2 - 10;
    return Array.from({ length: n }, (_, i) => {
        const mid = -90 + i * step;
        const [x1, y1] = point(c, c, radius, mid - half);
        const [x2, y2] = point(c, c, radius, mid + half);
        const large = half * 2 > 180 ? 1 : 0;
        return {
            d: `M${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
            letter: point(c, c, radius + letterGap, mid),
        };
    });
}
