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
    moppWaesche,
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
    RAUM_ZURUECK_MS,
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

    it('starts the mop round on mop washing when the "done" in between does not come (2026-11-17)', () => {
        // task status stays "segment cleaning" the whole time
        let r = ablauf(ABLAUF_START, true, 'nachein', 0, 'Reinigung', false);
        assert.equal(r.schritt, 'start');
        r = ablauf(r.a, true, 'nachein', 1000, 'Reinigung', true);
        assert.equal(r.schritt, 'weiter');
        // emptying the dust bin alone is no change of round (can happen while vacuuming)
        r = ablauf(r.a, true, 'nachein', 2000, 'Automatische Entleerung', true);
        assert.equal(r.schritt, 'weiter');
        assert.equal(r.a.runde, 1);
        r = ablauf(r.a, true, 'nachein', 3000, 'Mopp-Reinigung', true);
        assert.equal(r.schritt, 'runde2');
        assert.equal(r.a.runde, 2);
        // further washing during the mop round changes nothing
        r = ablauf(r.a, true, 'nachein', 4000, 'Wischmopp reinigen und Wasser nachfüllen', false);
        assert.equal(r.schritt, 'weiter');
        assert.equal(r.a.runde, 2);
        r = ablauf(r.a, false, 'nachein', 5000, 'Mopp-Trocknung', true);
        assert.equal(r.schritt, 'ende');
    });

    it('does not take mop washing before the first room or in other modes as the mop round', () => {
        let r = ablauf(ABLAUF_START, true, 'nachein', 0, 'Mopp-Reinigung', false);
        r = ablauf(r.a, true, 'nachein', 1000, 'Mopp-Reinigung', false);
        assert.equal(r.schritt, 'weiter');
        r = ablauf(ABLAUF_START, true, 'beides', 0, 'Reinigung', true);
        r = ablauf(r.a, true, 'beides', 1000, 'Mopp-Reinigung', true);
        assert.equal(r.schritt, 'weiter');
        assert.equal(r.a.runde, 1);
        assert.equal(moppWaesche('Mopp-Trocknung'), false);
        assert.equal(moppWaesche('Automatische Entleerung'), false);
        assert.equal(moppWaesche('Wischmopp reinigen und Wasser nachfüllen'), true);
    });

    it('does not start with a later room the robot only crosses on the way (2026-11-17)', () => {
        // bath (6) then hall (7); from the base the robot drives through the hall into the bath
        const order = [6, 7];
        let r = fortschritt(order, 5, 'Wischen', -1, null, 0);
        assert.equal(r.fort, -1);
        r = fortschritt(order, 7, 'Wischen', r.fort, r.kandidat, 10_000);
        assert.equal(r.fort, -1);
        assert.deepEqual(r.kandidat, { idx: 1, seit: 10_000 });
        r = fortschritt(order, 6, 'Wischen', r.fort, r.kandidat, 25_000);
        assert.deepEqual(r, { fort: 0, kandidat: null });
        // the hall later counts after the hold time as usual
        r = fortschritt(order, 7, 'Wischen', r.fort, r.kandidat, 300_000);
        assert.equal(r.fort, 0);
        r = fortschritt(order, 7, 'Wischen', r.fort, r.kandidat, 300_000 + RAUM_HALTE_MS);
        assert.equal(r.fort, 1);
        // if the first room is never reached, a later one still counts after the hold time
        r = fortschritt(order, 7, 'Reinigung', -1, null, 0);
        r = fortschritt(order, 7, 'Reinigung', r.fort, r.kandidat, RAUM_HALTE_MS);
        assert.equal(r.fort, 1);
    });

    it('replays the run of 2026-11-17: kitchen and hall in both rounds', () => {
        const order = [2, 7];
        // [minute, task status, state, room] as reported by the adapter
        const log: [number, string, string, number][] = [
            [0, 'Segment-Reinigung', 'Reinigung', 5],
            [1, 'Segment-Reinigung', 'Reinigung', 2],
            [11, 'Segment-Reinigung', 'Reinigung', 5],
            [12, 'Segment-Reinigung', 'Reinigung', 7],
            [22, 'Segment-Reinigung', 'Automatische Entleerung', 5],
            [22.5, 'Segment-Reinigung', 'Mopp-Reinigung', 5],
            [24, 'Segment-Reinigung', 'Wischen', 5],
            [25, 'Segment-Reinigung', 'Wischen', 2],
            [27, 'Segment-Reinigung', 'Wischen', 4],
            [27.5, 'Segment-Reinigung', 'Wischen', 2],
            [33, 'Segment-Reinigung', 'Rückkehr zum Reinigen', 5],
            [34, 'Segment-Reinigung', 'Mopp-Reinigung', 5],
            [36, 'Segment-Reinigung', 'Wischen', 4],
            [36.5, 'Segment-Reinigung', 'Wischen', 2],
            [39, 'Segment-Reinigung', 'Wischen', 7],
            [42, 'Segment-Reinigung', 'Wischen', 2],
            [42.5, 'Segment-Reinigung', 'Wischen', 7],
            [44, 'Segment-Reinigung', 'Wischen', 7],
            [52, 'Abgeschlossen', 'Mopp-Reinigung', 10],
        ];
        let a = ABLAUF_START;
        let fort = -1;
        let k: Kandidat | null = null;
        const seen: [number, number, number][] = [];
        let vorher: [string, number] = ['', 0];
        for (const [min, aufgabe, zustand, raum] of log) {
            const t = min * 60_000;
            // the page checks again with the last values once the hold time of a candidate is over
            if (k && t >= k.seit + RAUM_HALTE_MS) {
                ({ fort, kandidat: k } = fortschritt(order, vorher[1], vorher[0], fort, k, k.seit + RAUM_HALTE_MS));
            }
            const r = ablauf(a, laeuft(aufgabe), 'nachein', t, zustand, fort >= 0);
            a = r.a;
            if (r.schritt === 'runde2' || r.schritt === 'ende') {
                fort = -1;
                k = null;
            }
            if (laeuft(aufgabe) && r.schritt !== 'runde2') {
                ({ fort, kandidat: k } = fortschritt(order, raum, zustand, fort, k, t));
            }
            vorher = [zustand, raum];
            seen.push([min, a.runde, fort]);
        }
        const at = (m: number): [number, number] => {
            const s = seen.find(([min]) => min === m)!;
            return [s[1], s[2]];
        };
        assert.deepEqual(at(1), [1, 0]); // vacuum kitchen
        assert.deepEqual(at(22), [1, 1]); // vacuum hall was reached
        assert.deepEqual(at(22.5), [2, -1]); // mops are washed: mop round
        assert.deepEqual(at(25), [2, 0]); // mop kitchen (before: still "hall")
        assert.deepEqual(at(36.5), [2, 0]); // short trips do not count
        assert.deepEqual(at(44), [2, 1]); // mop hall
        assert.deepEqual(at(52), [1, -1]); // done
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
        assert.deepEqual(r, { fort: 0, kandidat: { idx: 1, seit: t0, zurueck: t0 + 47_000 } });
        // the hall for longer: the candidate goes
        r = fortschritt(order, 7, 'Wischen', r.fort, r.kandidat, t0 + 47_000 + RAUM_ZURUECK_MS);
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

    it('keeps the next room while the adapter flips back on the border for seconds (2026-11-18)', () => {
        // mop round dining room (4) then kitchen (2), times in seconds after 07:52:24
        const order = [4, 2];
        const s = (sek: number): number => sek * 1000;
        // [second, state, room]; 07:59:50 is a guess: the change time jumped at 07:59:57 with the kitchen kept
        const log: [number, string, number][] = [
            [0, 'Wischen', 4],
            [378, 'Wischen', 2], // 07:58:42
            [446, 'Wischen', 4], // ~07:59:50
            [453, 'Wischen', 2], // 07:59:57
            [573, 'Wischen', 4], // 08:01:57 for 12 s
            [585, 'Wischen', 2], // 08:02:09
            [645, 'Rückkehr zum Reinigen', 2], // 08:03:09
        ];
        let fort = -1;
        let k: Kandidat | null = null;
        let vorher: [string, number] = ['', 0];
        let ab = -1;
        for (const [sek, zustand, raum] of log) {
            // the page checks again with the last values once a timer of the candidate is over
            if (k) {
                const bis = k.zurueck === undefined ? k.seit + RAUM_HALTE_MS : k.zurueck + RAUM_ZURUECK_MS;
                if (s(sek) >= bis) {
                    ({ fort, kandidat: k } = fortschritt(order, vorher[1], vorher[0], fort, k, bis));
                    if (fort === 1 && ab < 0) {
                        ab = bis / 1000;
                    }
                }
            }
            ({ fort, kandidat: k } = fortschritt(order, raum, zustand, fort, k, s(sek)));
            if (fort === 1 && ab < 0) {
                ab = sek;
            }
            vorher = [zustand, raum];
        }
        assert.equal(fort, 1);
        // kitchen two minutes after it was reached (08:00:42), not only at 08:06 after washing the mops
        assert.equal(ab, 378 + RAUM_HALTE_MS / 1000);
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
