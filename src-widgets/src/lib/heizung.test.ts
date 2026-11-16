import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    alleIds,
    boostRest,
    farbe,
    flaechenPunkte,
    grad,
    kennzahlen,
    kurzeZeit,
    parseHeizRaeume,
    raumArt,
    raumMitte,
    sollAusZeiger,
    sollRaster,
    sollWinkel,
    urlaubIds,
    verschiebe,
    vorheizenAb,
    vorschlagRueckkehr,
    zahl,
    zustand,
} from './heizung';

const CH = 'junghome-bt-mesh.0.thermostats.0006';

describe('heizung', () => {
    describe('parseHeizRaeume', () => {
        it('reads rooms and skips broken entries', () => {
            const { raeume, fehler } = parseHeizRaeume(
                JSON.stringify([
                    { id: 'a', name: 'Raum A', thermostat: `${CH}.`, mitte: [10, 20] },
                    { id: 'b', flaechen: ['b', '0,0 10,0 10,10'], heizkreis: true, decke: true },
                    { id: 'a' },
                    'x',
                    { name: 'ohne id' },
                ]),
            );
            assert.equal(raeume.length, 2);
            assert.equal(raeume[0].thermostat, CH);
            assert.deepEqual(raeume[0].flaechen, ['a']);
            assert.deepEqual(raeume[0].mitte, [10, 20]);
            assert.equal(raeume[1].name, 'b');
            assert.equal(raeume[1].decke, true);
            assert.equal(fehler.length, 3);
        });

        it('accepts a parsed list, an empty field and reports bad JSON', () => {
            assert.equal(parseHeizRaeume([{ id: 'x' }]).raeume.length, 1);
            assert.deepEqual(parseHeizRaeume(''), { raeume: [], fehler: [] });
            assert.equal(parseHeizRaeume('{').fehler.length, 1);
            assert.equal(parseHeizRaeume('{}').fehler.length, 1);
        });
    });

    it('chooses the symbol kind', () => {
        assert.equal(raumArt({ id: 'a', name: 'a', flaechen: [], thermostat: CH }, false), 'jung');
        assert.equal(raumArt({ id: 'a', name: 'a', flaechen: [], heizkreis: true }, false), 'alt');
        assert.equal(raumArt({ id: 'a', name: 'a', flaechen: [] }, true), 'mess');
        assert.equal(raumArt({ id: 'a', name: 'a', flaechen: [] }, false), 'leer');
    });

    it('collects every data point once', () => {
        const ids = alleIds(
            [
                { id: 'a', name: 'a', flaechen: [], thermostat: CH, ist: 'zigbee.0.t' },
                { id: 'b', name: 'b', flaechen: [], ist: 'zigbee.0.t' },
            ],
            'junghome-bt-mesh.0',
        );
        assert.ok(ids.includes(`${CH}.setpoint`));
        assert.ok(ids.includes(`${CH}.vacation`));
        assert.ok(ids.includes('junghome-bt-mesh.0.vacation.active'));
        assert.equal(ids.filter(i => i === 'zigbee.0.t').length, 1);
        assert.equal(urlaubIds('').aktiv, 'junghome-bt-mesh.0.vacation.active');
    });

    it('reads numbers and formats degrees', () => {
        assert.equal(zahl('21.5'), 21.5);
        assert.equal(zahl(null), null);
        assert.equal(zahl(''), null);
        assert.equal(zahl(true), null);
        assert.equal(zahl('x'), null);
        assert.equal(grad(21.25, 'de'), '21,3');
        assert.equal(grad(21.5, 'en'), '21.5');
        assert.equal(grad(null, 'de'), '–');
    });

    it('colours cold blue, 21 °C neutral and warm orange', () => {
        assert.deepEqual(farbe(15), [74, 141, 255]);
        assert.deepEqual(farbe(21), [232, 230, 223]);
        assert.deepEqual(farbe(30), [255, 138, 61]);
        assert.deepEqual(farbe(null), [120, 120, 128]);
        const mid = farbe(22.5);
        assert.ok(mid[0] > 232 && mid[2] < 223);
    });

    it('finds areas and the centre of a room', () => {
        const svg = [{ id: 'b', points: '0,0 100,0 100,50 0,50' }];
        const r = { id: 'b', name: 'b', flaechen: ['b', '100,0 200,0 200,50', 'fehlt'] };
        const f = flaechenPunkte(r, svg);
        assert.equal(f.length, 2);
        const m = raumMitte(r, f);
        assert.deepEqual([m?.x, m?.y], [100, 25]);
        assert.deepEqual(raumMitte({ ...r, mitte: [5, 6] }, f)?.x, 5);
        assert.equal(raumMitte(r, []), null);
    });

    it('computes the key figures', () => {
        const k = kennzahlen([
            { name: 'A', ist: 20, heizt: true, art: 'jung' },
            { name: 'B', ist: 23, heizt: false, art: 'alt' },
            { name: 'C', ist: null, heizt: false, art: 'alt' },
            { name: 'D', ist: 22, heizt: false, art: 'mess' },
        ]);
        assert.equal(k.mittel, 65 / 3);
        assert.equal(k.waermster?.name, 'B');
        assert.equal(k.kuehlster?.name, 'A');
        assert.equal(k.heizen, 1);
        assert.equal(k.jung, 1);
        assert.equal(k.kreise, 3);
        assert.equal(kennzahlen([]).mittel, null);
    });

    it('maps the wheel to setpoints on the device grid', () => {
        assert.equal(sollRaster(20.3), 20.5);
        assert.equal(sollRaster(40), 30);
        assert.equal(sollWinkel(5), 140);
        assert.equal(sollWinkel(30), 400);
        // straight up = middle of the arc = 17.5 °C
        assert.equal(sollAusZeiger(0, -100), 17.5);
        // bottom (dead zone) clamps to the nearer end
        assert.equal(sollAusZeiger(-10, 100), 5);
        assert.equal(sollAusZeiger(100, 1), 26);
        assert.equal(sollAusZeiger(100, 90), 30);
    });

    it('describes the state of a circuit', () => {
        assert.equal(zustand(20, 21, true), 'heizt');
        assert.equal(zustand(21, 21, false), 'erreicht');
        assert.equal(zustand(20, 21, false), 'wartet');
        assert.equal(zustand(null, 21, false), 'unbekannt');
    });

    it('handles return times of the vacation', () => {
        const now = new Date(2026, 10, 16, 12, 30).getTime();
        assert.equal(vorschlagRueckkehr(now), new Date(2026, 10, 23, 18, 0).getTime());
        const r = new Date(2026, 10, 23, 18, 0).getTime();
        assert.equal(verschiebe(r, 1, 0, now), new Date(2026, 10, 24, 18, 0).getTime());
        assert.equal(verschiebe(r, 0, -2, now), new Date(2026, 10, 23, 16, 0).getTime());
        // never earlier than the next full hour plus one
        assert.equal(verschiebe(r, -30, 0, now), new Date(2026, 10, 16, 14, 0).getTime());
        assert.equal(vorheizenAb(r, 24), new Date(2026, 10, 22, 18, 0).getTime());
        assert.equal(kurzeZeit(r, 'de'), 'Mo 23.11. 18:00');
        assert.equal(kurzeZeit(r, 'en'), 'Mon 11/23 18:00');
    });

    it('shows the boost progress', () => {
        const now = 1_000_000;
        assert.deepEqual(boostRest(null, 60, now), { anteil: 0, minuten: 0 });
        assert.deepEqual(boostRest(now + 30 * 60_000, 60, now), { anteil: 0.5, minuten: 30 });
        assert.deepEqual(boostRest(now - 1, 60, now), { anteil: 0, minuten: 0 });
    });
});
