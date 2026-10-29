import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ICONS, PICKER_ICONS, STATE_ICONS, iconFor, iconNameFor } from './icons';
import {
    classList,
    dayLabel,
    formatNumber,
    formatValue,
    hasDiag,
    headDate,
    headTime,
    isActive,
    isOn,
    isStale,
    lowBattery,
    noReception,
    notesLine,
    parseJsonArray,
    parseTabs,
    pinKey,
    planDate,
    standShort,
    rowInfo,
    rowsForClasses,
    tapAction,
    tileLook,
    toggleClass,
    weatherIcon,
    type Vertretung,
} from './model';

describe('isOn', () => {
    it('reads booleans, numbers and strings', () => {
        assert.equal(isOn(true), true);
        assert.equal(isOn(false), false);
        assert.equal(isOn(1), true);
        assert.equal(isOn(0), false);
        assert.equal(isOn('true'), true);
        assert.equal(isOn('ON'), true);
        assert.equal(isOn('false'), false);
        assert.equal(isOn(null), false);
        assert.equal(isOn(undefined), false);
    });
});

describe('tile types (hand-over section 4)', () => {
    it('schalter toggles, yellow when on', () => {
        assert.equal(tileLook('schalter', true, false), 'switch-on');
        assert.equal(tileLook('schalter', false, false), 'switch-off');
        assert.equal(tapAction('schalter', true), 'write-false');
        assert.equal(tapAction('schalter', false), 'write-true');
    });
    it('schalter-pin: on directly, off only with PIN', () => {
        assert.equal(tapAction('schalter-pin', false), 'write-true');
        assert.equal(tapAction('schalter-pin', true), 'open-pin');
    });
    it('status-aus: only off, tap while off is ignored', () => {
        assert.equal(tileLook('status-aus', true, false), 'offable-on');
        assert.equal(tileLook('status-aus', false, false), 'status-off');
        assert.equal(tapAction('status-aus', true), 'write-false');
        assert.equal(tapAction('status-aus', false), 'none');
    });
    it('status: no action', () => {
        assert.equal(tileLook('status', true, false), 'status-on');
        assert.equal(tileLook('status', false, false), 'status-off');
        assert.equal(tapAction('status', true), 'none');
    });
    it('status-warnung: window (warn at false) and post (warn at true)', () => {
        // window: true = all closed = green, false = red "Fenster offen"
        assert.equal(tileLook('status-warnung', true, false), 'status-on');
        assert.equal(tileLook('status-warnung', false, false), 'warn');
        // post: true = red "Post da", false = grey
        assert.equal(tileLook('status-warnung', true, true), 'warn');
        assert.equal(tileLook('status-warnung', false, true), 'status-off');
        assert.equal(tapAction('status-warnung', false), 'none');
    });
    it('only active or warning tiles animate', () => {
        assert.equal(isActive('switch-off'), false);
        assert.equal(isActive('status-off'), false);
        assert.equal(isActive('switch-on'), true);
        assert.equal(isActive('warn'), true);
        assert.equal(isActive('offable-on'), true);
    });
});

describe('diagnosis badges', () => {
    it('reception: false, 0, below a set limit', () => {
        assert.equal(noReception(false, 0), true);
        assert.equal(noReception(true, 0), false);
        assert.equal(noReception(0, 0), true);
        assert.equal(noReception(80, 0), false);
        // dBm: negative values are fine with the default limit 0
        assert.equal(noReception(-70, 0), false);
        assert.equal(noReception(-95, -90), true);
        assert.equal(noReception(-70, -90), false);
        assert.equal(noReception(null, 0), false);
        assert.equal(noReception(undefined, 0), false);
        assert.equal(noReception('offline', 0), true);
    });
    it('battery: below 20 % or low-battery flag', () => {
        assert.equal(lowBattery(19, 20), true);
        assert.equal(lowBattery(20, 20), false);
        assert.equal(lowBattery(true, 20), true);
        assert.equal(lowBattery(false, 20), false);
        assert.equal(lowBattery(null, 20), false);
    });
    it('device classes decide which badges exist', () => {
        assert.equal(hasDiag('lampe', 'batterie'), false);
        assert.equal(hasDiag('lampe', 'empfang'), true);
        assert.equal(hasDiag('fensterkontakt', 'batterie'), true);
        assert.equal(hasDiag('keine', 'empfang'), false);
        assert.equal(hasDiag(undefined, 'empfang'), true);
        assert.equal(hasDiag('unbekannt', 'batterie'), false);
    });
    it('stale values', () => {
        const now = 1_000_000_000;
        assert.equal(isStale(now - 11 * 60_000, 10, now), true);
        assert.equal(isStale(now - 9 * 60_000, 10, now), false);
        assert.equal(isStale(now - 99 * 60_000, 0, now), false);
        assert.equal(isStale(undefined, 10, now), false);
    });
});

describe('PIN entry', () => {
    it('collects digits up to the length', () => {
        let s = { entry: '', complete: false };
        for (const k of ['1', '2', '3']) {
            s = pinKey(s.entry, k, 4);
        }
        assert.deepEqual(s, { entry: '123', complete: false });
        s = pinKey(s.entry, '4', 4);
        assert.deepEqual(s, { entry: '1234', complete: true });
        assert.deepEqual(pinKey('1234', '5', 4), { entry: '1234', complete: true });
    });
    it('delete and ignore other keys', () => {
        assert.deepEqual(pinKey('12', 'del', 4), { entry: '1', complete: false });
        assert.deepEqual(pinKey('', 'del', 4), { entry: '', complete: false });
        assert.deepEqual(pinKey('1', 'x', 4), { entry: '1', complete: false });
    });
});

describe('weather', () => {
    it('maps WMO codes to icons', () => {
        assert.equal(weatherIcon(0), 'wetter-sonne');
        assert.equal(weatherIcon(1), 'wetter-sonne');
        assert.equal(weatherIcon(2), 'wetter-teilweise');
        assert.equal(weatherIcon(3), 'wetter-wolke');
        assert.equal(weatherIcon(45), 'wetter-nebel');
        assert.equal(weatherIcon(61), 'wetter-regen');
        assert.equal(weatherIcon(81), 'wetter-regen');
        assert.equal(weatherIcon(73), 'wetter-schnee');
        assert.equal(weatherIcon(86), 'wetter-schnee');
        assert.equal(weatherIcon(95), 'wetter-gewitter');
        assert.equal(weatherIcon('3'), 'wetter-wolke');
        assert.equal(weatherIcon(null), '');
        assert.equal(weatherIcon(''), '');
    });
    it('day labels', () => {
        const wed = new Date(2026, 9, 28); // Wednesday
        assert.equal(dayLabel(0, wed, 'de'), 'HEUTE');
        assert.equal(dayLabel(1, wed, 'de'), 'MORGEN');
        assert.equal(dayLabel(2, wed, 'de'), 'FREITAG');
        assert.equal(dayLabel(4, wed, 'de'), 'SONNTAG');
        assert.equal(dayLabel(2, wed, 'en'), 'FRIDAY');
    });
    it('page head date and clock', () => {
        const d = new Date(2026, 9, 28, 9, 5);
        assert.equal(headDate(d, 'de'), 'Mi, 28.10.26');
        assert.equal(headDate(d, 'en'), 'Wed, 28.10.26');
        assert.equal(headDate(new Date(2027, 0, 3), 'de'), 'So, 03.01.27');
        assert.equal(headTime(d), '09:05');
        assert.equal(headTime(new Date(2026, 9, 28, 23, 59)), '23:59');
    });
    it('page head tabs', () => {
        assert.deepEqual(parseTabs('Wohnung:Licht-Wohnung, Keller : Licht-Keller'), [
            { label: 'Wohnung', view: 'Licht-Wohnung' },
            { label: 'Keller', view: 'Licht-Keller' },
        ]);
        assert.deepEqual(parseTabs('kaputt, :ohne, Garten:'), []);
        assert.deepEqual(parseTabs(undefined), []);
    });
    it('every weather icon exists', () => {
        for (const code of [0, 2, 3, 45, 61, 73, 95]) {
            assert.ok(ICONS[weatherIcon(code)], `icon for ${code}`);
        }
    });
});

describe('values', () => {
    it('formats with decimal comma', () => {
        assert.equal(formatNumber(22.34, 1, 'de'), '22,3');
        assert.equal(formatNumber(-18, 0, 'de'), '-18');
        assert.equal(formatNumber(-0.04, 1, 'de'), '0,0');
        assert.equal(formatNumber(1234.5, 0, 'de'), '1235');
        assert.equal(formatNumber(12345, 0, 'de'), '12.345');
        assert.equal(formatNumber(null, 1, 'de'), '—');
        assert.equal(formatNumber('abc', 1, 'de'), 'abc');
        assert.equal(formatNumber(3.14159, 2, 'en'), '3.14');
    });
    it('adds the unit', () => {
        assert.equal(formatValue(22.3, 1, '°', 'de'), '22,3°');
        assert.equal(formatValue(-450, 0, 'W', 'de'), '-450 W');
        assert.equal(formatValue(87, 0, '%', 'de'), '87 %');
        assert.equal(formatValue(undefined, 0, 'W', 'de'), '— W');
        assert.equal(formatValue(undefined, 1, '°', 'de'), '—°');
    });
});

describe('school list', () => {
    const rows: Vertretung[] = [
        { klasse: '5a', stunde: '1-2', fach: 'D', lehrer: 'Wö', vertreter: '', raum: '', text: '', entfall: true },
        { klasse: '07b', stunde: '3', fach: 'M', lehrer: 'Ab', vertreter: 'Cd', raum: 'R12', text: '', entfall: false },
        {
            klasse: '5a, 5b',
            stunde: '6',
            fach: 'Mu',
            lehrer: 'Pa',
            vertreter: '',
            raum: '',
            text: 'Aufgaben',
            entfall: false,
        },
    ];
    it('filters by class, tolerant to leading zeros and lists', () => {
        assert.equal(rowsForClasses(rows, ['5a']).length, 2);
        assert.equal(rowsForClasses(rows, ['7b']).length, 1);
        assert.equal(rowsForClasses(rows, []).length, 0);
    });
    it('row info', () => {
        assert.equal(rowInfo(rows[0], 'de'), 'fällt aus');
        assert.equal(rowInfo(rows[1], 'de'), 'Cd · R12');
        assert.equal(rowInfo(rows[2], 'de'), 'Aufgaben');
    });
    it('class chips', () => {
        assert.deepEqual(classList('5a, 7b;10c\n'), ['5a', '7b', '10c']);
        assert.deepEqual(toggleClass(['5a'], '7b', ['5a', '7b']), ['5a', '7b']);
        assert.deepEqual(toggleClass(['7b', '5a'], '5a', ['5a', '7b']), ['7b']);
        assert.deepEqual(toggleClass(['7b'], '5a', ['5a', '7b']), ['5a', '7b']);
    });
    it('json parsing never throws', () => {
        assert.deepEqual(parseJsonArray('[1,2]'), [1, 2]);
        assert.deepEqual(parseJsonArray('{"a":1}'), []);
        assert.deepEqual(parseJsonArray('kaputt'), []);
        assert.deepEqual(parseJsonArray(null), []);
    });
    it('plan date and time of the plan', () => {
        assert.equal(planDate('23.10.2026 Freitag, Woche A'), 'Fr 23.10.');
        assert.equal(planDate('3.11.2026 Dienstag'), 'Di 03.11.');
        assert.equal(planDate('ohne Datum'), 'ohne Datum');
        assert.equal(planDate(''), '');
        const now = new Date(2026, 9, 28, 14, 0);
        assert.equal(standShort('28.10.2026 13:34', now), '13:34');
        assert.equal(standShort('27.10.2026 18:02', now), '27.10. 18:02');
        assert.equal(standShort('kaputt', now), 'kaputt');
    });
    it('notes line', () => {
        const h = [{ k: 'Abwesende Klassen', v: '10a' }, { v: '10b' }, { v: '10c' }, { v: '10d' }];
        assert.equal(notesLine(h, 2), 'Abwesende Klassen 10a · 10b · +2 weitere');
        assert.equal(notesLine(h.slice(0, 1), 2), 'Abwesende Klassen 10a');
    });
});

describe('icons', () => {
    it('state icons switch shape', () => {
        assert.equal(iconNameFor('fenster', false), 'fenster-offen');
        assert.equal(iconNameFor('licht', true), 'licht-an');
        assert.equal(iconNameFor('backofen', true), 'backofen');
        assert.equal(iconFor('gibtsnicht', true), '');
    });
    it('every state variant exists', () => {
        for (const [name, s] of Object.entries(STATE_ICONS)) {
            assert.ok(ICONS[s.on], `${name}.on`);
            assert.ok(ICONS[s.off], `${name}.off`);
        }
    });
    it('picker offers base icons only', () => {
        assert.ok(PICKER_ICONS.includes('fenster'));
        assert.ok(PICKER_ICONS.includes('backofen'));
        assert.ok(!PICKER_ICONS.includes('fenster-offen'));
        assert.ok(!PICKER_ICONS.includes('licht-an'));
        assert.ok(!PICKER_ICONS.includes('power-badge'));
        // jalousie is its own "on" variant and must stay
        assert.ok(PICKER_ICONS.includes('jalousie'));
    });
});
