/*
 * Scroll arrows for lists on the tablet (Sven 15.11.2026): swiping up at the top of a list makes
 * the kiosk browser reload the page, so long lists get an up and a down arrow.
 * Tap = one step, hold = runs on and gets faster. Pure logic here, the component is ScrollPfeile.
 */

/** one tap scrolls this share of the visible height */
export const STEP_SHARE = 0.6;
/** holding longer than this starts the continuous run */
export const HOLD_MS = 350;
/** speed of the continuous run in px/s: starts slow, reaches the maximum after RAMP_MS */
export const SPEED_MIN = 260;
export const SPEED_MAX = 1600;
export const RAMP_MS = 1800;

/** distance of one tap (at least one row of 34 px) */
export function stepPx(visible: number): number {
    return Math.max(34, Math.round(visible * STEP_SHARE));
}

/** speed of the continuous run after `heldMs` milliseconds of holding */
export function speed(heldMs: number): number {
    const t = Math.min(1, Math.max(0, (heldMs - HOLD_MS) / RAMP_MS));
    // eases in: slow for precise stopping, fast for long lists
    return Math.round(SPEED_MIN + (SPEED_MAX - SPEED_MIN) * t * t);
}

/** which arrows can do something (1 px tolerance for fractional scroll positions) */
export function limits(top: number, height: number, visible: number): { hoch: boolean; runter: boolean } {
    return { hoch: top > 1, runter: top + visible < height - 1 };
}
