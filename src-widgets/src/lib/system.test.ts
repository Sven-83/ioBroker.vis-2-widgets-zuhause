import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    gruppen,
    type Instanz,
    meterStufe,
    meters,
    parseHost,
    parseListe,
    passt,
    seitText,
    STILL_MS,
    tileView,
    zaehlen,
} from './system';

const NOW = 1_794_688_942_954;

function inst(p: Partial<Instanz> & { id: string }): Instanz {
    return {
        mode: 'daemon',
        en: true,
        alive: true,
        conn: true,
        seit: NOW - 3_600_000,
        rss: 120,
        ver: '1.0.0',
        avail: null,
        eigen: false,
        neu: false,
        fehler: null,
        stufe: 'ok',
        text: 'läuft · verbunden',
        ...p,
    };
}

// shape as written by the watcher on the Pi (14.11.2026, shortened)
const PI_JSON = JSON.stringify({
    ts: NOW,
    liste: [
        {
            id: 'admin.0',
            mode: 'daemon',
            en: true,
            alive: true,
            conn: true,
            seit: 1793569913037,
            rss: 294,
            ver: '8.3.5',
            avail: null,
            eigen: false,
            neu: false,
            fehler: null,
            stufe: 'ok',
            text: 'läuft · verbunden',
        },
        {
            id: 'alarm.0',
            mode: 'daemon',
            en: false,
            alive: false,
            conn: null,
            seit: null,
            rss: null,
            ver: '5.1.2',
            avail: null,
            eigen: false,
            neu: false,
            fehler: null,
            stufe: 'aus',
            text: 'abgeschaltet',
        },
        {
            id: 'backitup.0',
            mode: 'daemon',
            en: true,
            alive: true,
            conn: null,
            seit: 1792442045476,
            rss: 164,
            ver: '3.3.17',
            avail: '4.0.3',
            eigen: false,
            neu: false,
            fehler: null,
            stufe: 'ok',
            text: 'läuft',
        },
        {
            id: 'blink.0',
            mode: 'daemon',
            en: true,
            alive: true,
            conn: true,
            seit: 1794396721758,
            rss: 118,
            ver: '0.1.0',
            avail: null,
            eigen: true,
            neu: false,
            fehler: null,
            stufe: 'ok',
            text: 'läuft · verbunden',
        },
        {
            id: 'broadlink2.0',
            mode: 'daemon',
            en: true,
            alive: true,
            conn: null,
            seit: 1794677189751,
            rss: 110,
            ver: '2.3.0',
            avail: null,
            eigen: false,
            neu: false,
            fehler: { n: 2, letzte: '07:35 Unhandled promise rejection' },
            stufe: 'ok',
            text: 'läuft',
        },
        {
            id: 'vis.0',
            mode: 'once',
            en: true,
            alive: false,
            conn: null,
            seit: null,
            rss: null,
            ver: '1.5.6',
            avail: null,
            eigen: false,
            neu: false,
            fehler: null,
            stufe: 'info',
            text: 'ohne Prozess',
        },
    ],
    ohneInstanz: [{ id: 'socketio', ver: '7.1.3', avail: '9.0.2' }],
});

const PI_HOST =
    '{"name":"raspberrypi-master","ramGesamt":7821,"ramVerfuegbar":3355,"diskGroesse":29350,"diskFrei":17957,"cpu":14.93,"last":1.78,"uptimeS":2246925,"controllerRss":681.45,"swap":{"gesamt":200,"belegt":176}}';

describe('parseListe', () => {
    it('reads the JSON of the watcher', () => {
        const l = parseListe(PI_JSON);
        assert.equal(l.liste.length, 6);
        assert.equal(l.ohneInstanz.length, 1);
        assert.deepEqual(l.liste[4].fehler, { n: 2, letzte: '07:35 Unhandled promise rejection' });
        assert.equal(l.liste[1].conn, null);
    });
    it('survives broken data', () => {
        assert.deepEqual(parseListe('{kaputt'), { ts: 0, liste: [], ohneInstanz: [] });
        assert.deepEqual(parseListe(null).liste, []);
        assert.equal(parseListe({ liste: [{ id: 'x.0', stufe: 'quatsch' }, 7, null] }).liste[0].stufe, 'info');
    });
});

describe('tileView', () => {
    const liste = parseListe(PI_JSON);
    it('green with update badge, updates never colour the tile', () => {
        const t = tileView({
            ampel: 0,
            kurztext: '32/32 laufen',
            updates: 10,
            letztePruefung: NOW - 60_000,
            liste,
            now: NOW,
        });
        assert.deepEqual(t, { art: 'ok', text: '32/32 laufen', updates: 10, arbeit: false });
    });
    it('red when the watcher reports a failure', () => {
        assert.equal(
            tileView({ ampel: 2, kurztext: '1 Ausfall', updates: 0, letztePruefung: NOW, liste, now: NOW }).art,
            'rot',
        );
    });
    it('yellow with spinner while a restart runs', () => {
        const busy = { ...liste, liste: [inst({ id: 'tuya.0', stufe: 'gelb', text: 'Neustart 1/3 …' })] };
        const t = tileView({ ampel: 1, kurztext: 'repariert', updates: 0, letztePruefung: NOW, liste: busy, now: NOW });
        assert.equal(t.art, 'gelb');
        assert.equal(t.arbeit, true);
        assert.equal(t.text, 'repariert …');
    });
    it('watcher silent for more than 10 minutes', () => {
        const t = tileView({
            ampel: 0,
            kurztext: 'x',
            updates: 3,
            letztePruefung: NOW - STILL_MS - 1,
            liste,
            now: NOW,
        });
        assert.equal(t.art, 'steht');
        assert.equal(t.updates, 0);
    });
    it('no data yet', () => {
        assert.equal(
            tileView({ ampel: null, kurztext: null, updates: null, letztePruefung: null, liste, now: NOW }).art,
            'leer',
        );
    });
});

describe('popup list', () => {
    const l = parseListe(PI_JSON);
    it('counts per filter, updates include adapters without instance', () => {
        assert.deepEqual(zaehlen(l), { alle: 6, prob: 0, upd: 2, fehler: 2, eigen: 1 });
    });
    it('groups in the order problems, running, without process, off', () => {
        const withProblem = { ...l, liste: [...l.liste, inst({ id: 'tuya.0', stufe: 'rot', conn: false })] };
        assert.deepEqual(
            gruppen(withProblem, 'alle').map(g => [g.titel, g.zeilen.length]),
            [
                ['Braucht Aufmerksamkeit', 1],
                ['Läuft', 4],
                ['Ohne eigenen Prozess', 1],
                ['Abgeschaltet – wird nicht überwacht', 1],
            ],
        );
        assert.deepEqual(
            gruppen(l, 'eigen').map(g => g.zeilen.map(x => x.id)),
            [['blink.0']],
        );
    });
    it('filter', () => {
        assert.equal(passt(inst({ id: 'a.0', avail: '2.0.0' }), 'upd'), true);
        assert.equal(passt(inst({ id: 'a.0', stufe: 'gelb' }), 'prob'), true);
        assert.equal(passt(inst({ id: 'a.0' }), 'fehler'), false);
    });
    it('seitText', () => {
        assert.equal(seitText(null, NOW), '—');
        assert.equal(seitText(NOW - 10_000, NOW), '1 min');
        assert.equal(seitText(NOW - 2 * 3_600_000, NOW), '2 h');
        assert.equal(seitText(NOW - 26 * 3_600_000, NOW), '1 Tag');
        assert.equal(seitText(1793569913037, NOW), '13 Tage');
    });
});

describe('meters', () => {
    it('memory, SD card and processor from the Pi values', () => {
        const m = meters(parseHost(PI_HOST));
        assert.deepEqual(
            m.map(x => [x.titel, x.prozent]),
            [
                ['Arbeitsspeicher', 57],
                ['Speicherkarte', 39],
                ['Prozessor', 15],
            ],
        );
        assert.equal(m[0].hinweis, 'Swap 88 %');
        assert.equal(m[1].unten, '11,1 von 28,7 GB · 17,5 GB frei');
        assert.equal(m[2].unten, 'Last 1,78 · Pi läuft seit 26 Tagen');
    });
    it('leaves out what is missing', () => {
        assert.deepEqual(
            meters(parseHost('{"cpu":5}')).map(x => x.titel),
            ['Prozessor'],
        );
        assert.deepEqual(meters(parseHost('kaputt')), []);
    });
    it('colour levels', () => {
        assert.equal(meterStufe(79), '');
        assert.equal(meterStufe(80), 'gelb');
        assert.equal(meterStufe(90), 'rot');
    });
});
