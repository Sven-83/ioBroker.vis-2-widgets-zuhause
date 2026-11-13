import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    ABLAUF_START,
    ablauf,
    aktiveRaeume,
    anzeigen,
    ausRoboter,
    fortschritt,
    imRaum,
    labelPos,
    laeuft,
    modusVonCode,
    parseLinien,
    parseRaeume,
    pausiert,
    reihenfolgeBefehl,
    saugerIds,
    skalaAnteile,
    startBefehl,
    STANDARD,
    vorbereiten,
    WECHSEL_MAX_MS,
    RAUM_HALTE_MS,
    type Kandidat,
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

    it('keeps a "mop after vacuum" job running between the two rounds', () => {
        let r = ablauf(ABLAUF_START, true, 'nachein', 0);
        assert.equal(r.schritt, 'start');
        r = ablauf(r.a, true, 'nachein', 1000);
        assert.equal(r.schritt, 'weiter');
        // 18:00: "done" after the vacuum round
        r = ablauf(r.a, false, 'nachein', 2000);
        assert.equal(r.schritt, 'wechsel');
        r = ablauf(r.a, false, 'nachein', 2000 + 60_000);
        assert.equal(r.schritt, 'wechsel');
        // mop round
        r = ablauf(r.a, true, 'nachein', 3000 + 60_000);
        assert.equal(r.schritt, 'runde2');
        assert.equal(r.a.runde, 2);
        // the real end
        r = ablauf(r.a, false, 'nachein', 9_000_000);
        assert.equal(r.schritt, 'ende');
        assert.deepEqual(r.a, ABLAUF_START);
    });

    it('ends other jobs at once and a pause between the rounds after the limit', () => {
        let r = ablauf(ABLAUF_START, true, 'beides', 0);
        assert.equal(ablauf(r.a, false, 'beides', 1).schritt, 'ende');
        r = ablauf(ABLAUF_START, true, 'nachein', 0);
        r = ablauf(r.a, false, 'nachein', 10);
        assert.equal(ablauf(r.a, false, 'nachein', 10 + WECHSEL_MAX_MS + 1).schritt, 'ende');
        assert.equal(ablauf(ABLAUF_START, false, 'nachein', 5).schritt, 'weiter');
    });

    it('stores the chosen room order first, then the other rooms, without duplicates', () => {
        const cmd = JSON.parse(reihenfolgeBefehl([7, 2], [1, 2, 3, 7, 10, 7]));
        assert.equal(cmd.length, 1);
        assert.equal(cmd[0].piid, 4);
        assert.deepEqual(JSON.parse(cmd[0].value), {
            cleanareaorder: [{ 7: 1 }, { 2: 2 }, { 1: 3 }, { 3: 4 }, { 10: 5 }],
        });
        assert.equal(saugerIds('dreamehome.0.123')?.reihenfolge, 'dreamehome.0.123.control.CleanOrder');
    });

    it('builds the start command with repeats, 5th field always 1 (else only the first room is cleaned)', () => {
        const cmd = JSON.parse(startBefehl([6, 7], { ...STANDARD, saug: 3, wasser: 15, durchgaenge: 2 }));
        assert.deepEqual(cmd[0], { piid: 1, value: 18 });
        assert.deepEqual(JSON.parse(cmd[1].value), {
            selects: [
                [6, 2, 3, 15, 1],
                [7, 2, 3, 15, 1],
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
        const f = (raum: number, zustand: string, bisher: number, k: Kandidat | null = null, t = 0): number =>
            fortschritt(order, raum, zustand, bisher, k, t).fort;
        // first room at once
        assert.equal(f(6, 'Reinigung', -1), 0);
        // next room only after the hold time
        const k = fortschritt(order, 7, 'Reinigung', 0, null, 1000).kandidat;
        assert.deepEqual(k, { idx: 1, seit: 1000 });
        assert.equal(f(7, 'Reinigung', 0, k, 1000 + RAUM_HALTE_MS - 1), 0);
        assert.equal(f(7, 'Reinigung', 0, k, 1000 + RAUM_HALTE_MS), 1);
        // through the hall back: stays
        assert.equal(f(6, 'Reinigung', 1), 1);
        // base room while fetching mops: stays
        assert.equal(f(5, 'Mopp-Reinigung', 1), 1);
        assert.equal(f(3, 'Zurück zum Aufladen', 1), 1);
    });

    it('ignores a short visit of the next room while mopping (2026-11-13)', () => {
        const order = [7, 2];
        const t0 = 0;
        // 08:43 kitchen for under a minute, 08:44 the hall again
        let r = fortschritt(order, 2, 'Wischen', 0, null, t0);
        assert.equal(r.fort, 0);
        r = fortschritt(order, 7, 'Wischen', r.fort, r.kandidat, t0 + 47_000);
        assert.deepEqual(r, { fort: 0, kandidat: null });
        // to the base and back: the candidate stays as it is
        r = fortschritt(order, 2, 'Wischen', 0, null, t0 + 60_000);
        const k = r.kandidat;
        r = fortschritt(order, 4, 'Wischen', 0, k, t0 + 90_000);
        assert.deepEqual(r.kandidat, k);
        r = fortschritt(order, 5, 'Mopp-Reinigung', 0, k, t0 + 100_000);
        assert.deepEqual(r.kandidat, k);
        // kitchen long enough
        r = fortschritt(order, 2, 'Wischen', 0, k, t0 + 60_000 + RAUM_HALTE_MS);
        assert.deepEqual(r, { fort: 1, kandidat: null });
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

    it('shows a written value until the robot confirms it, then follows the robot again', () => {
        const robot = { ...STANDARD, saug: 3 };
        const pend: Record<string, { v: unknown; t: number }> = { saug: { v: 1, t: 1000 } };
        // not confirmed yet: the page shows the new value
        assert.equal(anzeigen(robot, pend as never, 2000).saug, 1);
        assert.ok(pend.saug);
        // robot reports it: entry gone
        assert.equal(anzeigen({ ...robot, saug: 1 }, pend as never, 3000).saug, 1);
        assert.equal(pend.saug, undefined);
        // a later change in the app shows at once
        assert.equal(anzeigen({ ...robot, saug: 2 }, pend as never, 3500).saug, 2);
        // never confirmed: after 10 s the robot's value counts again
        const p2: Record<string, { v: unknown; t: number }> = { wasser: { v: 30, t: 0 } };
        assert.equal(anzeigen(robot, p2 as never, 9000).wasser, 30);
        assert.equal(anzeigen(robot, p2 as never, 10000).wasser, robot.wasser);
    });
});
