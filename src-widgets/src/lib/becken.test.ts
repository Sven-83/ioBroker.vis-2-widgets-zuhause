import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    AUFGABEN,
    CURVE_DEFAULT,
    dosierplan,
    doseMinutes,
    faellig,
    fanLevelFor,
    flasche,
    hhmm,
    lampLevel,
    lampRgb,
    lightText,
    liter,
    neuerName,
    parseCurve,
    parseVorlagen,
    parseWindows,
    plugSwitch,
    tageText,
    ueberschneidung,
    VORLAGEN,
    vorlagenJson,
    windowsText,
} from './becken';

describe('becken', () => {
    it('parses the schedule of the lamp (adapter text, 20.11.2026)', () => {
        assert.deepEqual(parseWindows('11:00-12:00, 14:00-20:00'), [
            [660, 720],
            [840, 1200],
        ]);
        assert.deepEqual(parseWindows('14:00-20:00,11:00-12:00'), [
            [660, 720],
            [840, 1200],
        ]);
        assert.deepEqual(parseWindows('00:00-24:00'), [[0, 1440]]);
        assert.deepEqual(parseWindows('kaputt, 12:00-11:00'), []);
        assert.deepEqual(parseWindows(undefined), []);
        assert.equal(windowsText([[600, 720]]), '10:00-12:00');
        assert.equal(hhmm(1440), '24:00');
    });

    it('lamp level with sunrise and sunset ramps', () => {
        const w = parseWindows('11:00-12:00, 14:00-20:00');
        assert.equal(lampLevel(659, w), 0);
        assert.equal(lampLevel(661, w), 1);
        assert.equal(lampLevel(665, w, 10, 1), 0.5);
        assert.equal(lampLevel(1195, w, 1, 10), 0.5);
        assert.equal(lampLevel(780, w), 0);
        assert.equal(lightText(930, w), 'an bis 20:00');
        assert.equal(lightText(780, w), 'aus · ab 14:00');
        assert.equal(lightText(1300, w), 'aus · ab 11:00');
        assert.equal(lightText(0, []), 'kein Zeitplan');
    });

    it('lamp colour: white adds to all channels, brightest = 255', () => {
        assert.deepEqual(lampRgb(255, 0, 0, 0), [255, 0, 0]);
        assert.deepEqual(lampRgb(0, 0, 0, 0), [0, 0, 0]);
        const [r, g, b] = lampRgb(133, 84, 129, 65);
        assert.equal(r, 255);
        assert.ok(g < b && b < r);
    });

    it('fan curve: off below the first point, linear between points', () => {
        assert.equal(fanLevelFor(25.9, CURVE_DEFAULT), 0);
        assert.equal(fanLevelFor(26, CURVE_DEFAULT), 5);
        assert.equal(fanLevelFor(26.5, CURVE_DEFAULT), 8);
        assert.equal(fanLevelFor(29, CURVE_DEFAULT), 20);
        assert.deepEqual(parseCurve('[[27,10],[26,4]]', null, null), [
            [26, 4],
            [27, 10],
        ]);
        assert.deepEqual(parseCurve(undefined, 26, 11), [[26, 11]]);
        assert.deepEqual(parseCurve('{x', null, null), CURVE_DEFAULT);
    });

    it('colour presets: fixed ones first, own ones from JSON, only own ones are saved', () => {
        const list = parseVorlagen('[{"name":"Eigene 1","r":300,"g":1,"b":2,"w":3},{"x":1}]');
        assert.equal(list.length, VORLAGEN.length + 1);
        assert.deepEqual(list.at(-1), { name: 'Eigene 1', r: 255, g: 1, b: 2, w: 3, eigen: true });
        assert.equal(vorlagenJson(list), '[{"name":"Eigene 1","r":255,"g":1,"b":2,"w":3}]');
        assert.equal(neuerName(list), 'Eigene 2');
        assert.equal(parseVorlagen('kaputt').length, VORLAGEN.length);
        assert.equal(VORLAGEN[0].name, 'Fisch');
    });

    it('bottle view from the pump fields of the adapter (values of 20.11.2026)', () => {
        const p2: Record<string, unknown> = {
            label: 'GH Boost',
            remaining: 445,
            refillAmount: 450,
            dailyDose: 5,
            daysLeft: 89,
            low: false,
        };
        assert.deepEqual(
            flasche(2, f => p2[f]),
            {
                n: 2,
                label: 'GH Boost',
                short: 'GH',
                col: '#7bd389',
                remaining: 445,
                refill: 450,
                daily: 5,
                days: 89,
                low: false,
            },
        );
        const leer: Record<string, unknown> = { label: '', remaining: null, refillAmount: 450, dailyDose: 0 };
        const p1 = flasche(1, f => leer[f]);
        assert.equal(p1.label, 'Eisen');
        assert.equal(p1.remaining, null);
        assert.equal(p1.days, null);
    });

    it('care: due states and intervals of Sven', () => {
        assert.equal(AUFGABEN.find(a => a.k === 'df')?.iv, 0);
        assert.deepEqual(faellig(20, 7), { stufe: 'gruen', text: 'in 13 T', frac: 0.35 });
        assert.equal(faellig(14, 12).stufe, 'gelb');
        assert.deepEqual(faellig(14, 16), { stufe: 'rot', text: '2 T über', frac: 1 });
        assert.equal(faellig(0, 9).text, 'vor 9 T');
        assert.equal(faellig(0, null).text, 'ohne Frist');
        assert.equal(faellig(30, null).text, 'nie erfasst');
        assert.equal(liter(60), 108);
    });

    it('Shelly ids like the aquarium script', () => {
        assert.equal(plugSwitch('filter'), 'shelly.0.SHPLG-S#C0FDB2#1.Relay0.Switch');
        assert.equal(plugSwitch('nachfuell'), 'shelly.1.shellyplusplugs#d48afc56bd84#1.Relay0.Switch');
    });

    it('daily dose plan: pump reports on/time, the adapter keeps amount + days', () => {
        const p2 = dosierplan(true, '14:03', '{"on":true,"time":"14:03","ml":5,"days":124}', 4);
        assert.deepEqual(p2, { on: true, minute: 843, ml: 5, days: 124, bekannt: true });
        const p3 = dosierplan(true, '14:00', '', 10);
        assert.deepEqual(p3, { on: true, minute: 840, ml: 10, days: 127, bekannt: false });
        assert.equal(dosierplan(false, '', undefined, 0).on, false);
        assert.equal(tageText(127), 'täglich');
        assert.equal(tageText(124), 'Mo–Fr');
        assert.equal(tageText(64 + 16 + 4), 'Mo, Mi, Fr');
        assert.equal(doseMinutes(10), 2);
        // never two pumps at the same time (Sven 20.11.2026)
        const andere = [
            { n: 2, plan: p2 },
            { n: 3, plan: p3 },
        ];
        assert.equal(ueberschneidung(1, 841, 1, andere), 3);
        assert.equal(ueberschneidung(1, 850, 1, andere), null);
        assert.equal(ueberschneidung(2, 843, 5, andere), null);
    });
});
