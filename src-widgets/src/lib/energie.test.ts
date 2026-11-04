import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    achse,
    akkuProjektion,
    balkenListe,
    fluss,
    hinweis,
    historyPunkte,
    parseBuckets,
    parseKurve,
    parseModule,
    parseMppt,
    prognose,
    summe,
    tagBucket,
    uhrzeit,
    wochenStart,
    type Statistik,
} from './energie';

const day = (key: number, ertrag: number, verbrauch: number, anlage = ertrag): Record<string, number> => ({
    key,
    yield: ertrag,
    consumption: verbrauch,
    systemEnergy: anlage,
    earnings: anlage * 0.35,
});

// Wednesday 4.11.2026, 18:30
const NOW = new Date(2026, 10, 4, 18, 30);

const stats = (): Statistik => ({
    days: parseBuckets(JSON.stringify([day(1, 1.9, 22), day(2, 1.5, 20.4), day(3, 0.4, 16.8), day(4, 0.3, 10)])),
    daysPrev: parseBuckets([day(30, 2, 21), day(31, 3, 25)]),
    months: parseBuckets([day(1, 30, 559), day(11, 4, 69)]),
    years: parseBuckets([day(2024, 0, 0), day(2025, 777, 3573), day(2026, 1662, 5341)]),
});

describe('energie: buckets', () => {
    it('reads the cloud fields and ignores garbage', () => {
        assert.deepEqual(parseBuckets('[{"key":2,"yield":"1.5","consumption":3,"systemEnergy":1.4,"earnings":0.5}]'), [
            { key: 2, ertrag: 1.5, verbrauch: 3, anlage: 1.4, earnings: 0.5 },
        ]);
        assert.deepEqual(parseBuckets('kaputt'), []);
        assert.deepEqual(parseBuckets([null, 3]), []);
    });

    it('starts the week on Monday', () => {
        assert.equal(wochenStart(NOW).toDateString(), new Date(2026, 10, 2).toDateString());
        // Sunday belongs to the week before
        assert.equal(wochenStart(new Date(2026, 10, 8)).toDateString(), new Date(2026, 10, 2).toDateString());
    });

    it('takes days of the previous month from daysPrev', () => {
        const s = stats();
        assert.equal(tagBucket(new Date(2026, 9, 31), new Date(2026, 10, 1), s)?.ertrag, 3);
        assert.equal(tagBucket(new Date(2026, 10, 5), NOW, s), undefined);
    });

    it('builds the week Mo–So across the month change', () => {
        const s = stats();
        const w = balkenListe('woche', s, new Date(2026, 10, 1, 12));
        assert.deepEqual(
            w.map(b => b.label),
            ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
        );
        // Mo 26.10. … So 1.11.: only 30., 31. and 1. have data
        assert.deepEqual(
            w.map(b => b.leer),
            [true, true, true, true, false, false, false],
        );
        assert.equal(w[6].jetzt, true);
    });

    it('splits consumption into system and grid', () => {
        const [b] = balkenListe('woche', stats(), NOW).filter(x => x.titel.startsWith('Mo'));
        assert.equal(b.anlage, 1.5);
        assert.ok(Math.abs(b.netz - 18.9) < 1e-9);
        assert.equal(b.verbrauch, 20.4);
    });

    it('lists the month, the year up to now and only used years', () => {
        const s = stats();
        const m = balkenListe('monat', s, NOW);
        assert.equal(m.length, 30);
        assert.equal(m[3].jetzt, true);
        assert.equal(m[4].leer, true);
        const j = balkenListe('jahr', s, NOW);
        assert.equal(j.length, 12);
        assert.equal(j[0].ertrag, 30);
        assert.equal(j[11].leer, true);
        assert.deepEqual(
            balkenListe('immer', s, NOW).map(b => b.label),
            ['2025', '2026'],
        );
        assert.deepEqual(balkenListe('heute', s, NOW), []);
    });

    it('sums with self-sufficiency, self-use and savings', () => {
        const list = balkenListe('monat', stats(), NOW);
        const t = summe(list, 0.3);
        assert.ok(Math.abs(t.ertrag - 4.1) < 1e-9);
        assert.ok(Math.abs(t.autarkie! - 4.1 / 69.2) < 1e-9);
        assert.equal(t.eigenverbrauch, 1);
        assert.ok(Math.abs(t.ersparnis - 4.1 * 0.3) < 1e-9);
        assert.ok(Math.abs(t.netzkosten! - (69.2 - 4.1) * 0.3) < 1e-9);
        // without price: cloud earnings, no grid cost
        const c = summe(list, 0);
        assert.ok(Math.abs(c.ersparnis - 4.1 * 0.35) < 1e-9);
        assert.equal(c.netzkosten, null);
        assert.equal(summe([], 0.3).autarkie, null);
    });

    it('rounds axes to nice steps', () => {
        assert.deepEqual(achse(23), { max: 30, step: 10 });
        assert.deepEqual(achse(0), { max: 1, step: 0.25 });
        assert.deepEqual(achse(870), { max: 1000, step: 250 });
    });
});

describe('energie: today', () => {
    it('reads the cloud curve', () => {
        const k = parseKurve('[{"t":"00:02","solarW":0,"homeW":387.6},{"t":"12:30","solarW":410},{"t":"x"}]');
        assert.deepEqual(k.solar, [
            { min: 2, w: 0 },
            { min: 750, w: 410 },
        ]);
        assert.deepEqual(k.haus, [{ min: 2, w: 387.6 }]);
    });

    it('keeps only history points of today', () => {
        const start = new Date(2026, 10, 4).getTime();
        const p = historyPunkte(
            [
                { ts: start + 90 * 60_000, val: 700 },
                { ts: start - 60_000, val: 1 },
                { ts: start + 60_000, val: null },
                { ts: start + 30 * 60_000, val: '650' },
            ],
            NOW,
        );
        assert.deepEqual(p, [
            { min: 30, w: 650 },
            { min: 90, w: 700 },
        ]);
        assert.deepEqual(historyPunkte(undefined, NOW), []);
    });

    it('projects the battery to empty, cut at midnight', () => {
        const in2h = NOW.getTime() + 2 * 3600_000;
        assert.deepEqual(akkuProjektion(30, null, in2h, 10, NOW), { bis: { min: 20.5 * 60, w: 10 }, ziel: 'leer' });
        const in11h = NOW.getTime() + 11 * 3600_000;
        const p = akkuProjektion(60, in11h, null, 10, NOW)!;
        assert.equal(p.ziel, 'voll');
        assert.equal(p.bis.min, 24 * 60);
        assert.ok(Math.abs(p.bis.w - (60 + 40 * (5.5 / 11))) < 1e-9);
        assert.equal(akkuProjektion(30, null, null, 10, NOW), null);
    });

    it('computes the home as grid + inverter', () => {
        assert.deepEqual(fluss({ solarW: 300, akkuW: 120, wrW: 180, netzW: 702, hausW: 937 }), {
            solarW: 300,
            akkuW: 120,
            wrW: 180,
            netzW: 702,
            hausW: 882,
        });
        assert.equal(fluss({ solarW: 0, akkuW: 0, wrW: 0, netzW: undefined, hausW: 937 }).hausW, 937);
        assert.equal(fluss({ solarW: 900, akkuW: 0, wrW: 800, netzW: -300, hausW: 0 }).hausW, 500);
    });
});

describe('energie: forecast and hint', () => {
    const answer = {
        daily: {
            time: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'],
            shortwave_radiation_sum: [4, 3, 1, 2, 5],
        },
    };

    it('calibrates the forecast with the own yield', () => {
        const p = prognose(answer, NOW, stats())!;
        // (1.9 + 1.5 + 0.4) / (4 + 3 + 1)
        assert.ok(Math.abs(p.faktor - 3.8 / 8) < 1e-9);
        assert.ok(Math.abs(p.heute - (3.8 / 8) * 2) < 1e-9);
        assert.ok(Math.abs(p.morgen - (3.8 / 8) * 5) < 1e-9);
    });

    it('gives no forecast with too few days', () => {
        const s = stats();
        s.days = s.days.slice(0, 2);
        assert.equal(prognose(answer, NOW, s), null);
        assert.equal(prognose({}, NOW, stats()), null);
    });

    it('warns about the cloud first, then the empty battery', () => {
        const now = NOW.getTime();
        assert.equal(hinweis({ verbunden: false, lastSync: now, soc: 5, minSoc: 10 }, now)?.art, 'cloud');
        assert.equal(hinweis({ verbunden: true, lastSync: now - 11 * 60_000, soc: 50, minSoc: 10 }, now)?.art, 'cloud');
        assert.equal(hinweis({ verbunden: true, lastSync: now, soc: 10, minSoc: 10 }, now)?.art, 'leer');
        assert.equal(hinweis({ verbunden: true, lastSync: now, soc: 11, minSoc: 10 }, now), null);
        assert.equal(hinweis({ verbunden: true, lastSync: now, soc: null, minSoc: 10 }, now), null);
    });

    it('formats times and the live lists', () => {
        assert.equal(uhrzeit(new Date(2026, 10, 4, 20, 5).getTime(), NOW), '20:05');
        assert.equal(uhrzeit(new Date(2026, 10, 5, 7, 10).getTime(), NOW), 'morgen 07:10');
        assert.equal(uhrzeit(null, NOW), '');
        assert.deepEqual(parseModule('[{"module":1,"soc":18}]'), [{ module: 1, name: 'M1', soc: 18 }]);
        assert.deepEqual(parseModule('[{"module":1,"name":"BK215","soc":22}]'), [
            { module: 1, name: 'BK215', soc: 22 },
        ]);
        assert.deepEqual(parseMppt('[{"id":"a","name":"MPPT1-Panel Terasse","w":12}]'), [
            { name: 'Panel Terasse', w: 12 },
        ]);
    });
});
