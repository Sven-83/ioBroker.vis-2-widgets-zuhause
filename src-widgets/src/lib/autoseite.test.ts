import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    bar,
    chargedPeriods,
    costMonths,
    homePrice,
    monthLabel,
    parseEasee,
    parseFordWeeks,
    plugText,
    boldParts,
    closedSpans,
    dropWanted,
    combineProfiles,
    fuelTip,
    hourBars,
    hourRanges,
    lowest,
    modelLine,
    parseProfile,
    parseSeries,
    parseWeeks,
    periodLabel,
    priceParts,
    priceRange,
    refill,
    stepPath,
    town,
    weekSummary,
} from './autoseite';

describe('autoseite', () => {
    it('modelLine', () => {
        assert.equal(modelLine('2022 Car - E1 (B479 EU)', 'HEV'), '2022 · Benzin, Hybrid');
        assert.equal(modelLine('2025 Car', 'BEV'), '2025 · Elektro');
        assert.equal(modelLine('', ''), '');
    });

    it('refill', () => {
        assert.deepEqual(refill(50, 42, 2), { litres: 21, euro: 42 });
        assert.equal(refill(50, 0, 2), null);
        assert.deepEqual(refill(100, 42, null), { litres: 0, euro: null });
    });

    it('dropWanted', () => {
        assert.equal(dropWanted(20, true, ''), true);
        assert.equal(dropWanted(42, false, 'cheap'), true);
        assert.equal(dropWanted(70, false, 'cheap'), false);
        assert.equal(dropWanted(42, false, 'normal'), false);
        assert.equal(dropWanted(null, false, 'cheap'), false);
    });

    it('bar from kPa', () => {
        assert.equal(bar(246), 2.46);
        assert.equal(bar(null), null);
    });

    it('town', () => {
        assert.equal(town('Street 1, Town'), 'Town');
        assert.equal(town('nothing'), '');
    });

    describe('price series', () => {
        const t0 = 1_000_000;
        const pts = parseSeries(
            JSON.stringify([
                [t0 + 100, 1.9],
                [t0, 1.8],
                [t0 + 200, null],
                ['x', 1],
            ]),
        );
        it('parses and sorts', () =>
            assert.deepEqual(pts, [
                [t0, 1.8],
                [t0 + 100, 1.9],
                [t0 + 200, null],
            ]));
        it('broken JSON', () => assert.deepEqual(parseSeries('{'), []));
        it('step path with gap', () => {
            const s = { t0, t1: t0 + 400, pMin: 1.7, pMax: 2.0, width: 400, height: 30 };
            assert.equal(stepPath(pts, s), 'M0.0 20.0L100.0 20.0L100.0 10.0L200.0 10.0');
        });
        it('closed spans', () => assert.deepEqual(closedSpans(pts, t0, t0 + 400), [[t0 + 200, t0 + 400]]));
        it('price range rounded to 5 cent', () =>
            assert.deepEqual(
                priceRange([
                    [
                        [0, 1.809],
                        [1, 2.219],
                    ],
                ]),
                { min: 1.75, max: 2.25 },
            ));
        it('flat price gets 10 cent', () => {
            const r = priceRange([[[0, 1.8]]]);
            assert.ok(r && Math.abs(r.max - r.min - 0.1) < 1e-9);
        });
        it('lowest: the latest time of the minimum', () =>
            assert.deepEqual(
                lowest(
                    [
                        [
                            [10, 1.8],
                            [20, 1.9],
                            [30, 1.8],
                        ],
                    ],
                    0,
                ),
                { t: 30, p: 1.8 },
            ));
    });

    describe('when to fill up', () => {
        const prof = Array.from({ length: 24 }, (_, h) =>
            h === 11 ? 1.85 : h >= 12 && h <= 13 ? 2.2 : h >= 19 ? 1.86 : 1.95,
        );
        const bars = hourBars(prof);
        it('profile must have 24 entries', () => {
            assert.equal(parseProfile(JSON.stringify(prof)).length, 24);
            assert.deepEqual(parseProfile('[1,2]'), []);
        });
        it('combine averages per hour', () => {
            const c = combineProfiles([
                [1, ...Array(23).fill(null)],
                [3, ...Array(23).fill(null)],
            ]);
            assert.equal(c[0], 2);
            assert.equal(c[1], null);
        });
        it('classes', () => {
            assert.equal(bars.length, 16);
            assert.equal(bars.find(b => b.hour === 11)?.cls, 'gut');
            assert.equal(bars.find(b => b.hour === 12)?.cls, 'teuer');
            assert.equal(bars.find(b => b.hour === 8)?.cls, 'normal');
        });
        it('ranges', () => {
            assert.deepEqual(hourRanges(bars, 'gut'), ['11 Uhr', 'ab 19 Uhr']);
            assert.deepEqual(hourRanges(bars, 'teuer'), ['12–14 Uhr']);
        });
        it('tip from the profile', () =>
            assert.equal(
                fuelTip({ bars, rating: 'normal', hour: 9, levelPct: 40 }),
                'Günstig: **11 Uhr** und **ab 19 Uhr** · nicht 12–14 Uhr',
            ));
        it('tip when cheap and the tank is half empty', () =>
            assert.equal(
                fuelTip({ bars, rating: 'cheap', hour: 9, levelPct: 40 }),
                '**Jetzt tanken:** gerade günstig',
            ));
        it('tip when expensive', () =>
            assert.equal(
                fuelTip({ bars, rating: 'expensive', hour: 12, levelPct: 40 }),
                'Gerade **teuer** · günstiger meist um **19 Uhr**',
            ));
        it('no data', () =>
            assert.equal(fuelTip({ bars: [], rating: '', hour: 9, levelPct: 40 }), 'Noch zu wenig Preisdaten'));
    });

    describe('weeks', () => {
        const w = parseWeeks(
            JSON.stringify([
                { period: '2026-W45', km: 0, longKm: 0 },
                { period: '2026-W46', km: 120, longKm: 60 },
            ]),
        );
        it('labels', () =>
            assert.deepEqual(
                w.map(x => x.label),
                ['45', '46'],
            ));
        it('summary only over weeks with data', () =>
            assert.deepEqual(weekSummary(w), { avg: 120, longShare: 0.5, weeksWithData: 1 }));
        it('no data', () => assert.equal(weekSummary(parseWeeks('[]')), null));
    });

    it('priceParts', () => assert.deepEqual(priceParts(1.809), ['1,80', '9']));
    it('boldParts', () =>
        assert.deepEqual(boldParts('a **b** c'), [
            { text: 'a ', bold: false },
            { text: 'b', bold: true },
            { text: ' c', bold: false },
        ]));

    describe('electric car', () => {
        const easee = parseEasee(
            JSON.stringify([
                { period: '2026-W44', sessions: 1, kwh: 37, cost: 13.32 },
                { period: '2026-W45', sessions: 5, kwh: 79.2, cost: 28.5 },
                { period: '2026-W46', sessions: 2, kwh: 54.3, cost: 19.56 },
            ]),
        );
        const ford = parseFordWeeks(
            JSON.stringify([
                { period: '2026-W44', km: 0, kwhPer100: null, kwhCharged: 0, temp: null },
                { period: '2026-W45', km: 0, kwhPer100: null, kwhCharged: 0, temp: null },
                { period: '2026-W46', km: 21, kwhPer100: 19, kwhCharged: 70, temp: 4.8 },
            ]),
        );
        it('charged: home from the wallbox, away only where Ford recorded', () =>
            assert.deepEqual(chargedPeriods(easee, ford, 8), [
                { period: '2026-W44', label: '44', home: 37, away: null },
                { period: '2026-W45', label: '45', home: 79.2, away: null },
                { period: '2026-W46', label: '46', home: 54.3, away: 70 - 54.3 },
            ]));
        it('small differences are charging losses', () => {
            const f = parseFordWeeks(
                JSON.stringify([{ period: '2026-W46', km: 5, kwhPer100: null, kwhCharged: 56, temp: null }]),
            );
            assert.equal(chargedPeriods(easee, f, 8)[2].away, 0);
        });
        it('home price', () => {
            assert.ok(Math.abs((homePrice(162.43, 451.2) ?? 0) - 0.36) < 0.001);
            assert.equal(homePrice(1, 0), null);
        });
        it('month label', () => assert.equal(monthLabel('2026-11'), 'Nov'));
        it('period labels', () => {
            assert.equal(periodLabel('2026-W46'), '46');
            assert.equal(periodLabel('2026-11-14'), 'Sa');
            assert.equal(periodLabel('2026-10'), 'Okt');
        });
        it('cost months from the first session', () =>
            assert.deepEqual(
                costMonths(
                    parseEasee(
                        JSON.stringify([
                            { period: '2026-09', sessions: 0, kwh: 0, cost: 0 },
                            { period: '2026-10', sessions: 11, kwh: 317.7, cost: 114.37 },
                            { period: '2026-11', sessions: 7, kwh: 133.5, cost: 48.06 },
                        ]),
                    ),
                ).map(m => m.period),
                ['2026-10', '2026-11'],
            ));
        it('plug text', () => {
            assert.equal(plugText('CONNECTED', 'PAUSED', 0), 'eingesteckt');
            assert.equal(plugText('CONNECTED', 'CHARGING', 11), 'lädt · 11,0 kW');
            assert.equal(plugText('DISCONNECTED', 'NOT_READY', null), 'nicht eingesteckt');
        });
    });
});
