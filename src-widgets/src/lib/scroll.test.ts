import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HOLD_MS, limits, RAMP_MS, SPEED_MAX, SPEED_MIN, speed, stepPx } from './scroll';

describe('scroll arrows', () => {
    it('one tap moves a good part of the visible list, at least one row', () => {
        assert.equal(stepPx(330), 198);
        assert.equal(stepPx(20), 34);
    });
    it('holding starts slow and gets faster up to the maximum', () => {
        assert.equal(speed(0), SPEED_MIN);
        assert.equal(speed(HOLD_MS), SPEED_MIN);
        const mitte = speed(HOLD_MS + RAMP_MS / 2);
        assert.ok(mitte > SPEED_MIN && mitte < SPEED_MAX);
        assert.ok(speed(HOLD_MS + RAMP_MS / 4) < mitte);
        assert.equal(speed(HOLD_MS + RAMP_MS), SPEED_MAX);
        assert.equal(speed(60_000), SPEED_MAX);
    });
    it('arrows at the ends are off', () => {
        assert.deepEqual(limits(0, 1000, 330), { hoch: false, runter: true });
        assert.deepEqual(limits(300, 1000, 330), { hoch: true, runter: true });
        assert.deepEqual(limits(669.6, 1000, 330), { hoch: true, runter: false });
        assert.deepEqual(limits(0, 200, 330), { hoch: false, runter: false });
    });
});
