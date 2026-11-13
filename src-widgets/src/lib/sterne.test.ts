import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    angleOf,
    arcShare,
    asIntensity,
    asRotation,
    colourData,
    hsvToRgb,
    hueSatAt,
    parseColour,
    rotationShown,
    spinSeconds,
    statusText,
} from './sterne';

describe('sterne', () => {
    describe('parseColour', () => {
        it('reads the blue from the write test', () =>
            assert.deepEqual(parseColour('00f003e803e8'), { h: 240, s: 1000, v: 1000 }));
        it('reads the dark red seen in the app', () =>
            assert.deepEqual(parseColour('015f03e80032'), { h: 351, s: 1000, v: 50 }));
        it('reads upper case', () => assert.deepEqual(parseColour('015F000003E8'), { h: 351, s: 0, v: 1000 }));
        for (const value of ['', '00f003e803e', '00f003e803e8a', 'zzzzzzzzzzzz', 42, null, undefined]) {
            it(`rejects ${JSON.stringify(value)}`, () => assert.equal(parseColour(value), null));
        }
        it('limits values out of range', () =>
            assert.deepEqual(parseColour('ffffffffffff'), { h: 360, s: 1000, v: 1000 }));
    });

    describe('colourData', () => {
        it('writes the blue from the write test', () =>
            assert.equal(colourData({ h: 240, s: 1000, v: 1000 }), '00f003e803e8'));
        it('writes white', () => assert.equal(colourData({ h: 240, s: 0, v: 1000 }), '00f0000003e8'));
        it('writes hue 360 as 0', () => assert.equal(colourData({ h: 360, s: 1000, v: 1000 }), '000003e803e8'));
        it('rounds and limits', () => assert.equal(colourData({ h: 10.6, s: 1200, v: -3 }), '000b03e80000'));
        it('round trip', () => assert.equal(colourData(parseColour('015f03e80032')!), '015f03e80032'));
    });

    describe('hsvToRgb', () => {
        it('blue', () => assert.deepEqual(hsvToRgb({ h: 240, s: 1000, v: 1000 }), [0, 0, 255]));
        it('white at saturation 0', () => assert.deepEqual(hsvToRgb({ h: 240, s: 0, v: 1000 }), [255, 255, 255]));
        it('red like the adapter (#ff0026)', () =>
            assert.deepEqual(hsvToRgb({ h: 351, s: 1000, v: 1000 }), [255, 0, 38]));
    });

    describe('values', () => {
        it('keeps an intensity of 47.4', () => assert.equal(asIntensity(47.4), 47.4));
        it('limits the intensity', () => assert.equal(asIntensity(0), 1));
        it('missing intensity = 100', () => assert.equal(asIntensity(undefined), 100));
        it('limits the rotation', () => assert.equal(asRotation(5000), 1000));
        it('missing rotation = 10', () => assert.equal(asRotation('x'), 10));
        it('shows 550 as 55 like the app', () => assert.equal(rotationShown(550), 55));
        it('shows 200 as 20 like the app', () => assert.equal(rotationShown(200), 20));
        it('turns slowly at 10', () => assert.equal(spinSeconds(10), 40));
        it('turns fast at 1000', () => assert.equal(spinSeconds(1000), 4));
    });

    describe('statusText', () => {
        const on = { online: true, power: true, laser: true, rgb: true };
        it('offline wins', () => assert.equal(statusText({ ...on, online: false }), 'nicht erreichbar'));
        it('off', () => assert.equal(statusText({ ...on, power: false }), 'aus'));
        it('both', () => assert.equal(statusText(on), 'Laser und Farblicht an'));
        it('laser only', () => assert.equal(statusText({ ...on, rgb: false }), 'nur Laser an'));
        it('colour only', () => assert.equal(statusText({ ...on, laser: false }), 'nur Farblicht an'));
        it('neither', () =>
            assert.equal(statusText({ ...on, laser: false, rgb: false }), 'an, Laser und Farblicht aus'));
    });

    describe('wheel geometry', () => {
        it('top is 0°', () => assert.equal(angleOf(0, -10), 0));
        it('right is 90°', () => assert.equal(angleOf(10, 0), 90));
        it('bottom is 180°', () => assert.equal(angleOf(0, 10), 180));
        it('left is 270°', () => assert.equal(angleOf(-10, 0), 270));
        it('inner edge = white', () => assert.deepEqual(hueSatAt(0, -76, 76, 117), { h: 0, s: 0 }));
        it('outer edge = saturated', () => assert.deepEqual(hueSatAt(117, 0, 76, 117), { h: 90, s: 1000 }));
        it('outside the ring stays saturated', () => assert.equal(hueSatAt(0, 200, 76, 117).s, 1000));
        it('arc share forwards', () => assert.equal(arcShare(270, 205, 335), 0.5));
        it('arc share backwards', () => assert.equal(arcShare(90, 155, 25), 0.5));
        it('arc share limited', () => assert.equal(arcShare(10, 205, 335), 0));
    });
});
