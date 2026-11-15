import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    applyDraft,
    daysText,
    daysWith,
    emptyPlan,
    endMin,
    fmtHm,
    fromDraft,
    newDraft,
    parsePlan,
    removeEntry,
    serializePlan,
    startMin,
    statusLine,
    sunsetMinutes,
    tileOrder,
    toDraft,
    validOn,
    weekdayIndex,
    windowsOf,
    type Entry,
} from './weihnacht';

const every = (...e: Entry[]): Entry[][] => Array.from({ length: 7 }, () => e.map(x => ({ ...x })));
const SUN = 16 * 60 + 43;

describe('weihnacht', () => {
    describe('parsePlan', () => {
        it('reads the JSON the script confirms', () => {
            const p = parsePlan(
                JSON.stringify({ v: 1, tage: every({ start: '17:00', ende: '18:00' }, { sonne: 15 }) }),
            );
            assert.deepEqual(p.tage[3], [{ start: '17:00', ende: '18:00' }, { sonne: 15 }]);
        });
        it('broken or empty input gives an empty plan', () => {
            for (const raw of ['', '{kaputt', null, 42, '{"tage":[]}']) {
                assert.deepEqual(parsePlan(raw), emptyPlan());
            }
        });
        it('drops broken entries', () => {
            const p = parsePlan({
                v: 1,
                tage: every({ start: '25:00' }, { sonne: 500 }, { start: '07:30', ende: 'x' }),
            });
            assert.deepEqual(p.tage[0], [{ start: '07:30' }]);
        });
        it('round trip', () => {
            const p = parsePlan({ v: 1, tage: every({ start: '17:00' }) });
            assert.deepEqual(parsePlan(serializePlan(p)), p);
        });
    });

    describe('times', () => {
        it('no end -> 23:00', () => assert.equal(endMin({ start: '17:00' }), 23 * 60));
        it('sunset start', () => assert.equal(fmtHm(startMin({ sonne: 15 }, SUN)!), '16:58'));
        it('sunset unknown: no start time', () => assert.equal(startMin({ sonne: 15 }, null), null));
        it('never over midnight', () => {
            assert.equal(validOn({ start: '22:00', ende: '01:00' }, SUN), false);
            assert.equal(validOn({ start: '23:15' }, SUN), false);
            assert.equal(validOn({ start: '17:00', ende: '23:59' }, SUN), true);
            assert.equal(validOn({ sonne: 60, ende: '17:00' }, SUN), false);
        });
        it('overlapping windows merge', () => {
            const w = windowsOf(
                [
                    { start: '17:00', ende: '19:00' },
                    { start: '18:00', ende: '20:00' },
                ],
                SUN,
            );
            assert.deepEqual(w, [{ start: 17 * 60, end: 20 * 60 }]);
        });
        it('weekday Monday 0, Sunday 6', () => {
            assert.equal(weekdayIndex(new Date(2026, 10, 16)), 0);
            assert.equal(weekdayIndex(new Date(2026, 10, 22)), 6);
        });
    });

    describe('drafts', () => {
        it('entry <-> draft', () => {
            for (const e of [
                { start: '17:00' },
                { start: '19:15', ende: '22:00' },
                { sonne: -10 },
                { sonne: 15, ende: '23:30' },
            ]) {
                assert.deepEqual(fromDraft(toDraft(e)), e);
            }
        });
        it('new run time: 17:00, no end', () => assert.deepEqual(fromDraft(newDraft()), { start: '17:00' }));
        it('saving for several days changes identical copies and adds the rest', () => {
            const orig = { start: '17:00', ende: '18:00' };
            const plan = parsePlan({ v: 1, tage: [[orig], [orig], [orig], [], [], [{ start: '10:00' }], []] });
            const draft = { ...toDraft(orig), bis: 18 * 60 + 30 };
            const days = new Set([0, 1, 2, 3, 4]);
            const next = applyDraft(plan, 0, 0, orig, draft, days);
            for (const d of [0, 1, 2, 3, 4]) {
                assert.deepEqual(next.tage[d], [{ start: '17:00', ende: '18:30' }], `day ${d}`);
            }
            assert.deepEqual(next.tage[5], [{ start: '10:00' }]);
            assert.deepEqual(plan.tage[0], [orig], 'old plan unchanged');
        });
        it('preselects the days with the same entry', () => {
            const e = { start: '17:00' };
            const plan = parsePlan({ v: 1, tage: [[e], [e], [], [e], [], [], []] });
            assert.deepEqual([...daysWith(plan, e)], [0, 1, 3]);
        });
        it('remove one entry of one day', () => {
            const plan = parsePlan({ v: 1, tage: every({ start: '17:00' }, { start: '19:00' }) });
            const next = removeEntry(plan, 2, 0);
            assert.deepEqual(next.tage[2], [{ start: '19:00' }]);
            assert.equal(next.tage[1].length, 2);
        });
        it('day texts', () => {
            assert.equal(daysText(new Set([0, 1, 2, 3, 4])), 'Mo–Fr');
            assert.equal(daysText(new Set([5, 6])), 'Sa + So');
            assert.equal(daysText(new Set([0, 1, 2, 3, 4, 5, 6])), 'alle Tage');
            assert.equal(daysText(new Set([2, 0])), 'Mo, Mi');
        });
    });

    describe('sunsetMinutes', () => {
        it('mid November in southern Germany is about 16:40', () => {
            const m = sunsetMinutes(new Date(2026, 10, 16), 48.8, 9.2)!;
            assert.ok(m > 16 * 60 + 30 && m < 16 * 60 + 55, fmtHm(m));
        });
        it('summer time is applied', () => {
            const m = sunsetMinutes(new Date(2026, 5, 21), 48.8, 9.2)!;
            assert.ok(m > 21 * 60 && m < 21 * 60 + 40, fmtHm(m));
        });
    });

    describe('statusLine', () => {
        const now = new Date(2026, 10, 16, 17, 30);
        const plan = parsePlan({ v: 1, tage: every({ start: '17:00', ende: '18:00' }) });
        const base = { on: false, online: true, hand: false, handBis: 0, nachtTimer: false, naechsterStart: 0 };
        const sun = Array.from({ length: 7 }, () => SUN);
        it('running run time', () =>
            assert.equal(statusLine({ ...base, on: true }, plan, now, sun), 'An · Zeitplan bis 18:00'));
        it('manual', () =>
            assert.equal(
                statusLine({ ...base, hand: true, handBis: new Date(2026, 10, 16, 18).getTime() }, plan, now, sun),
                'Aus · Hand bis 18:00',
            ));
        it('night timer', () => {
            const late = new Date(2026, 10, 16, 23, 20);
            const s = { ...base, on: true, hand: true, nachtTimer: true, handBis: late.getTime() + 15 * 60000 };
            assert.equal(statusLine(s, plan, late, sun), 'An · Nacht-Timer noch 15 min');
        });
        it('next start tomorrow', () => {
            const s = { ...base, naechsterStart: new Date(2026, 10, 17, 17).getTime() };
            assert.equal(statusLine(s, plan, new Date(2026, 10, 16, 19), sun), 'Aus · nächste Laufzeit morgen 17:00');
        });
        it('tree out of season', () => {
            assert.equal(statusLine({ ...base, saison: false }, plan, now, sun), 'Aus · außerhalb der Saison');
            assert.equal(statusLine({ ...base, on: true, saison: false }, plan, now, sun), 'An');
        });
        it('offline', () => assert.equal(statusLine({ ...base, online: false }, plan, now, sun), 'nicht erreichbar'));
    });

    describe('tileOrder', () => {
        it('tree only in season', () => {
            assert.deepEqual(tileOrder([true, true, true, true], [true, true, true, false]), [0, 1, 2]);
            assert.deepEqual(tileOrder([true, true, true, true], [false, false, false, true]), [0, 1, 2, 3]);
        });
        it('circuits without a switch are left out', () => {
            assert.deepEqual(tileOrder([true, false, true, false], [true, true, true, true]), [0, 2]);
        });
    });
});
