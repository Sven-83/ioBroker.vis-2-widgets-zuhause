import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    COMMAND_TIMEOUT_MS,
    driveOf,
    fullAt,
    isPluggedIn,
    lastSessionKwh,
    parseWarnings,
    pendingResult,
    price,
    standText,
    visibleWarnings,
    wallboxPhase,
    wallboxText,
    warningText,
} from './fahrzeuge';

describe('fahrzeuge', () => {
    describe('driveOf', () => {
        it('BEV is electric', () => assert.equal(driveOf('BEV'), 'ev'));
        it('HEV fills up', () => assert.equal(driveOf('HEV'), 'fuel'));
        it('unknown fills up', () => assert.equal(driveOf(null), 'fuel'));
    });

    describe('isPluggedIn', () => {
        it('CONNECTED', () => assert.equal(isPluggedIn('CONNECTED'), true));
        it('DISCONNECTED', () => assert.equal(isPluggedIn('DISCONNECTED'), false));
        it('missing', () => assert.equal(isPluggedIn(null), false));
    });

    describe('fullAt', () => {
        const t0 = 1_000_000_000_000;
        it('adds the minutes to the Ford time', () => assert.equal(fullAt(174, t0, t0), t0 + 174 * 60_000));
        it('past = null', () => assert.equal(fullAt(10, t0, t0 + 11 * 60_000), null));
        it('null minutes', () => assert.equal(fullAt(null, t0, t0), null));
    });

    describe('parseWarnings', () => {
        it('reads a real value of the fuel car', () =>
            assert.deepEqual(parseWarnings('[{"key":"battery12v","level":"warning","value":36,"unit":"%"}]'), [
                { key: 'battery12v', level: 'warning', value: 36, unit: '%' },
            ]));
        it('sorts worst first, keeps order inside a level', () =>
            assert.deepEqual(
                parseWarnings(
                    JSON.stringify([
                        { key: 'frost', level: 'info' },
                        { key: 'fuel', level: 'warning' },
                        { key: 'window', level: 'critical' },
                        { key: 'unlocked', level: 'critical' },
                    ]),
                ).map(w => w.key),
                ['window', 'unlocked', 'fuel', 'frost'],
            ));
        it('drops unknown keys and broken JSON', () => {
            assert.deepEqual(parseWarnings('[{"key":"x","level":"critical"},{"key":"oil","level":"bad"}]'), []);
            assert.deepEqual(parseWarnings('{'), []);
            assert.deepEqual(parseWarnings(null), []);
        });
    });

    describe('warningText', () => {
        it('with value', () =>
            assert.equal(
                warningText({ key: 'battery12v', level: 'warning', value: 30, unit: '%' }),
                '12-V-Batterie schwach: 30 %',
            ));
        it('with wheel and bar', () =>
            assert.equal(
                warningText({ key: 'tyre', level: 'critical', wheel: 'rearLeft', value: 1.9, unit: 'bar' }),
                'Reifendruck hinten links: 1,9 bar',
            ));
    });

    it('visibleWarnings: max 3, then +n', () => {
        const list = parseWarnings(
            JSON.stringify(['tyre', 'fuel', 'oil', 'battery12v'].map(key => ({ key, level: 'warning' }))),
        );
        const v = visibleWarnings(list);
        assert.equal(v.shown.length, 3);
        assert.equal(v.more, 1);
    });

    describe('wallboxPhase', () => {
        const c = { online: true, carConnected: false, charging: false };
        it('real wallbox: awaiting authentication = bereit', () =>
            assert.equal(wallboxPhase({ ...c, opMode: 7, carConnected: true }), 'bereit'));
        it('disconnected = frei', () => assert.equal(wallboxPhase({ ...c, opMode: 1 }), 'frei'));
        it('charging', () => assert.equal(wallboxPhase({ ...c, opMode: 3 }), 'laedt'));
        it('completed = bereit', () => assert.equal(wallboxPhase({ ...c, opMode: 4 }), 'bereit'));
        it('offline', () => assert.equal(wallboxPhase({ ...c, online: false, opMode: 3 }), 'offline'));
        it('error', () => assert.equal(wallboxPhase({ ...c, opMode: 5 }), 'fehler'));
        it('without op mode from the flags', () => {
            assert.equal(wallboxPhase({ ...c, opMode: null, carConnected: true }), 'bereit');
            assert.equal(wallboxPhase({ ...c, opMode: null }), 'frei');
        });
    });

    describe('pendingResult', () => {
        const since = 5_000;
        it('start confirmed', () =>
            assert.equal(pendingResult({ wanted: true, since }, 'laedt', undefined, since + 1), 'done'));
        it('stop confirmed', () =>
            assert.equal(pendingResult({ wanted: false, since }, 'bereit', undefined, since + 1), 'done'));
        it('still waiting while the adapter echoes the request', () =>
            assert.equal(
                pendingResult({ wanted: true, since }, 'bereit', { val: true, ack: true, ts: since + 10 }, since + 20),
                'wait',
            ));
        it('refused: charge written back', () =>
            assert.equal(
                pendingResult({ wanted: true, since }, 'bereit', { val: false, ack: true, ts: since + 10 }, since + 20),
                'rejected',
            ));
        it('an old charge value does not count as refusal', () =>
            assert.equal(
                pendingResult({ wanted: true, since }, 'bereit', { val: false, ack: true, ts: since - 1 }, since + 20),
                'wait',
            ));
        it('timeout', () =>
            assert.equal(
                pendingResult({ wanted: true, since }, 'bereit', undefined, since + COMMAND_TIMEOUT_MS),
                'timeout',
            ));
    });

    it('lastSessionKwh', () => {
        assert.equal(lastSessionKwh('{"start":1,"end":2,"kwh":24.81,"cost":8.93}'), 24.81);
        assert.equal(lastSessionKwh(null), null);
        assert.equal(lastSessionKwh('x'), null);
    });

    describe('wallboxText', () => {
        const base = { opMode: 1, power: 0, sessionEnergy: 0, reasonText: '', lastKwh: null, car: '' };
        it('frei with last session', () =>
            assert.equal(wallboxText({ ...base, phase: 'frei', lastKwh: 24.81 }), 'frei · zuletzt 24,8 kWh'));
        it('frei without', () => assert.equal(wallboxText({ ...base, phase: 'frei' }), 'frei · kein Auto'));
        it('car named', () =>
            assert.equal(wallboxText({ ...base, phase: 'bereit', opMode: 7, car: 'E-Auto' }), 'E-Auto steckt'));
        it('unknown car', () => assert.equal(wallboxText({ ...base, phase: 'bereit', opMode: 7 }), 'Auto steckt'));
        it('charging', () =>
            assert.equal(
                wallboxText({ ...base, phase: 'laedt', power: 11, sessionEnergy: 3.24 }),
                '11,0 kW · 3,2 kWh',
            ));
        it('waiting', () => assert.equal(wallboxText({ ...base, phase: 'warte' }), 'warte auf Wallbox …'));
    });

    it('standText', () => {
        const t = new Date(2026, 10, 13, 17, 54).getTime();
        assert.equal(standText(t, true, null), 'Ford 17:54 · Wallbox live');
        assert.equal(standText(null, false, t), 'Wallbox 17:54');
    });

    it('price', () => {
        assert.equal(price(1.829), '1,829 €');
        assert.equal(price(null), '—');
    });
});
