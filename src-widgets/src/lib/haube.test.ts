import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asLevel, presetLevelWrites, ringOffset, rotorPath, statusText, timerText } from './haube';

describe('haube', () => {
    describe('asLevel', () => {
        for (const level of [0, 1, 4]) {
            it(`keeps ${level}`, () => assert.equal(asLevel(level), level));
        }
        for (const value of [5, -1, 1.5, '2', null, undefined]) {
            it(`treats ${String(value)} as off`, () => assert.equal(asLevel(value), 0));
        }
    });

    describe('timerText', () => {
        it('shows minutes, rounded up', () => assert.equal(timerText(11 * 60_000 + 1), '12 Min'));
        it('shows exactly one minute as minutes', () => assert.equal(timerText(60_000), '1 Min'));
        it('shows seconds in the last minute', () => assert.equal(timerText(59_001), '60 s'));
        it('never shows less than zero', () => assert.equal(timerText(-5000), '0 s'));
    });

    describe('ringOffset', () => {
        it('is a full ring at the start', () => assert.equal(ringOffset(10 * 60_000, 10), 0));
        it('is half used at half time', () => assert.equal(ringOffset(5 * 60_000, 10), 50));
        it('is empty at the end', () => assert.equal(ringOffset(0, 10), 100));
        it('stays in range when the clocks differ', () => {
            assert.equal(ringOffset(20 * 60_000, 10), 0);
            assert.equal(ringOffset(-1000, 10), 100);
        });
        it('shows a full ring without a known duration', () => assert.equal(ringOffset(60_000, 0), 0));
    });

    describe('statusText', () => {
        it('names level and light', () =>
            assert.equal(statusText({ level: 2, light: true, connected: true }), 'Stufe 2 · Licht an'));
        it('names a fan that is off', () =>
            assert.equal(statusText({ level: 0, light: false, connected: true }), 'Lüfter aus · Licht aus'));
        it('adds the remaining time', () =>
            assert.equal(
                statusText({ level: 1, light: false, connected: true, remainingMs: 5 * 60_000 }),
                'Stufe 1 · Licht aus · noch 5 Min',
            ));
        it('says when the connection is lost', () =>
            assert.match(statusText({ level: 1, light: true, connected: false }), /Keine Verbindung/));
    });

    describe('presetLevelWrites', () => {
        it('only writes the level while the fan keeps running', () =>
            assert.deepEqual(presetLevelWrites({ level: 1, light: false, timer: 15 }, 3), [
                { key: 'level', value: 3 },
            ]));
        it('switches the light on before the level goes to 0', () =>
            assert.deepEqual(presetLevelWrites({ level: 2, light: false, timer: 0 }, 0), [
                { key: 'light', value: true },
                { key: 'level', value: 0 },
            ]));
        it('clears the timer when the level goes to 0', () =>
            assert.deepEqual(presetLevelWrites({ level: 2, light: true, timer: 30 }, 0), [
                { key: 'level', value: 0 },
                { key: 'timer', value: 0 },
            ]));
        it('writes nothing when nothing changes', () =>
            assert.deepEqual(presetLevelWrites({ level: 2, light: true, timer: 0 }, 2), []));
    });

    describe('rotorPath', () => {
        it('draws three blades from the centre', () => {
            const path = rotorPath(12, 15.5, 5.8);
            assert.equal(path.match(/M12 15\.5C/g)?.length, 3);
            assert.equal(path.match(/z/g)?.length, 3);
        });
    });
});
