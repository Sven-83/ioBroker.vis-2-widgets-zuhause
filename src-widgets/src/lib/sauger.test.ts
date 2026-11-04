import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    aktiveRaeume,
    ausRoboter,
    fortschritt,
    imRaum,
    labelPos,
    laeuft,
    modusVonCode,
    parseLinien,
    parseRaeume,
    pausiert,
    saugerIds,
    skalaAnteile,
    startBefehl,
    STANDARD,
    vorbereiten,
    wasserStufe,
} from './sauger';

const ids = saugerIds('dreamehome.0.123456')!;

describe('sauger', () => {
    it('builds the data points from the device path', () => {
        assert.equal(ids.wasser, 'dreamehome.0.123456.control.WetnessLevel');
        assert.equal(ids.start, 'dreamehome.0.123456.control.StartCustom');
        assert.equal(saugerIds('dreamehome.0.123456.')?.akku, 'dreamehome.0.123456.state.BatteryLevel');
        assert.equal(saugerIds(''), null);
        assert.equal(saugerIds('kein pfad'), null);
    });

    it('maps water levels to the app ranges', () => {
        assert.equal(wasserStufe(1), 'low');
        assert.equal(wasserStufe(5), 'low');
        assert.equal(wasserStufe(6), 'mid');
        assert.equal(wasserStufe(16), 'mid');
        assert.equal(wasserStufe(17), 'high');
        assert.equal(wasserStufe(28), 'ultra');
        // scale segments add up to the 31 steps between 1 and 32
        assert.equal(
            skalaAnteile().reduce((a, b) => a + b, 0),
            31,
        );
    });

    it('reads the cleaning mode in 20 m² form and with any mop wash area', () => {
        assert.equal(modusVonCode(5123), 'nachein');
        assert.equal(modusVonCode(5122), 'saugen');
        assert.equal(modusVonCode(6403), 'nachein'); // 25 m²
        assert.equal(modusVonCode(3841), 'wischen'); // 15 m²
        assert.equal(modusVonCode(null), null);
        assert.equal(modusVonCode('x'), null);
    });

    it('takes the settings from the robot with fallbacks', () => {
        const v: Record<string, unknown> = {
            [ids.modus]: 5123,
            [ids.saug]: 3,
            [ids.max]: 0,
            [ids.wasser]: 15,
            [ids.m2]: 20,
            [ids.route]: 1,
        };
        assert.deepEqual(
            ausRoboter(id => v[id], ids),
            { modus: 'nachein', saug: 3, max: false, wasser: 15, m2: 20, route: 1, durchgaenge: 1 },
        );
        assert.deepEqual(
            ausRoboter(() => undefined, ids),
            STANDARD,
        );
        assert.equal(ausRoboter(id => (id === ids.wasser ? 99 : undefined), ids).wasser, 32);
        assert.equal(ausRoboter(id => (id === ids.route ? 0 : undefined), ids).route, 1);
    });

    it('writes only what differs, mode first, nothing that does not apply', () => {
        const robot = { ...STANDARD, modus: 'nachein' as const, saug: 3, wasser: 15, m2: 20 };
        assert.deepEqual(vorbereiten(robot, robot, ids), []);
        assert.deepEqual(vorbereiten({ ...robot, modus: 'beides', m2: 25, wasser: 20, route: 3 }, robot, ids), [
            { id: ids.modus, value: 5120 },
            { id: ids.m2, value: 25 },
            { id: ids.wasser, value: 20 },
            { id: ids.route, value: 3 },
        ]);
        // vacuum only: water and mop wash area stay as they are
        assert.deepEqual(
            vorbereiten({ ...robot, modus: 'saugen', wasser: 30, m2: 30, saug: 1, max: true }, robot, ids),
            [
                { id: ids.modus, value: 5122 },
                { id: ids.saug, value: 1 },
                { id: ids.max, value: 1 },
            ],
        );
        // mop only: suction stays
        assert.deepEqual(vorbereiten({ ...robot, modus: 'wischen', saug: 0 }, robot, ids), [
            { id: ids.modus, value: 5121 },
        ]);
    });

    it('builds the start command with order and repeats', () => {
        const cmd = JSON.parse(startBefehl([6, 7], { ...STANDARD, saug: 3, wasser: 15, durchgaenge: 2 }));
        assert.deepEqual(cmd[0], { piid: 1, value: 18 });
        assert.deepEqual(JSON.parse(cmd[1].value), {
            selects: [
                [6, 2, 3, 15, 1],
                [7, 2, 3, 15, 2],
            ],
        });
    });

    it('reads the running job', () => {
        assert.deepEqual(aktiveRaeume('[[6,1,3,30,1]]'), [6]);
        assert.deepEqual(aktiveRaeume('[[7,1,3,30,2],[6,1,3,30,1]]'), [6, 7]);
        assert.deepEqual(aktiveRaeume('kaputt'), []);
        assert.deepEqual(aktiveRaeume(null), []);
        assert.equal(laeuft('Segment-Reinigung'), true);
        assert.equal(laeuft('Abgeschlossen'), false);
        assert.equal(laeuft(''), false);
        assert.equal(pausiert('Automatische Reinigung pausiert', '', ''), true);
        assert.equal(pausiert('Segment-Reinigung', 'Reinigung', 'Pausiert'), true);
        assert.equal(pausiert('Segment-Reinigung', 'Reinigung', 'Segment-Reinigung'), false);
    });

    it('moves the progress only forward and only inside a room of the job', () => {
        assert.equal(imRaum('Reinigung'), true);
        assert.equal(imRaum('Wischen'), true);
        assert.equal(imRaum('Mopp-Reinigung'), false);
        assert.equal(imRaum('Zurück zum Aufladen'), false);
        const order = [6, 7, 3];
        assert.equal(fortschritt(order, 6, 'Reinigung', -1), 0);
        assert.equal(fortschritt(order, 7, 'Reinigung', 0), 1);
        // through the hall back: stays
        assert.equal(fortschritt(order, 6, 'Reinigung', 1), 1);
        // base room while fetching mops: stays
        assert.equal(fortschritt(order, 5, 'Mopp-Reinigung', 1), 1);
        assert.equal(fortschritt(order, 3, 'Zurück zum Aufladen', 1), 1);
    });

    it('parses the room list and labels', () => {
        const { raeume, fehler } = parseRaeume(
            JSON.stringify([
                { name: 'Bad', id: 6, flaechen: ['0,0 10,0 10,10 0,10'] },
                { name: 'Flur', id: 7, flaechen: ['0,0 4,0 4,4', 'x'], x: 1, y: 2, klein: true },
                { name: 'kaputt', flaechen: ['0,0 1,0 1,1'] },
            ]),
        );
        assert.equal(raeume.length, 2);
        assert.deepEqual(raeume[1].flaechen, ['0,0 4,0 4,4']);
        assert.equal(fehler.length, 1);
        assert.deepEqual(labelPos(raeume[0]), { x: 5, y: 5 });
        assert.deepEqual(labelPos(raeume[1]), { x: 1, y: 2 });
        assert.deepEqual(parseRaeume('').raeume, []);
        assert.equal(parseRaeume('{').fehler.length, 1);
        assert.deepEqual(parseLinien('[[1,2,3,4],[1,2]]'), [[1, 2, 3, 4]]);
        assert.deepEqual(parseLinien('nix'), []);
    });
});
