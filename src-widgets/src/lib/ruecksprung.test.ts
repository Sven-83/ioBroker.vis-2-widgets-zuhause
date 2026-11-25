import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    DEFAULT_LIMIT_S,
    DEFAULT_ZEIT_S,
    istStartHash,
    naechsterSchritt,
    sekunden,
    startHash,
    type RuecksprungConfig,
    type RuecksprungLage,
} from './ruecksprung';

const CFG: RuecksprungConfig = { zeitMs: 120_000, limitMs: 300_000 };

function lage(over: Partial<RuecksprungLage> = {}): RuecksprungLage {
    return {
        now: 0,
        letzteAktivitaet: 0,
        bedienungSeit: null,
        medienLaufen: false,
        ebenen: [],
        aufStartseite: false,
        letzteBewegung: 0,
        gedimmt: false,
        ...over,
    };
}

describe('return after inactivity', () => {
    it('waits until the idle time has passed', () => {
        assert.deepEqual(naechsterSchritt(CFG, lage({ now: 119_999 })), { art: 'warten', inMs: 1 });
        assert.deepEqual(naechsterSchritt(CFG, lage({ now: 120_000 })), { art: 'startseite' });
    });

    it('a touch starts the time again', () => {
        assert.deepEqual(naechsterSchritt(CFG, lage({ now: 150_000, letzteAktivitaet: 100_000 })), {
            art: 'warten',
            inMs: 70_000,
        });
    });

    it('closes the topmost level first, then the next, then shows the start page', () => {
        const base = { now: 200_000 };
        assert.deepEqual(naechsterSchritt(CFG, lage({ ...base, ebenen: ['popup', 'detail'] })), {
            art: 'ebene',
            id: 'detail',
        });
        assert.deepEqual(naechsterSchritt(CFG, lage({ ...base, ebenen: ['popup'] })), { art: 'ebene', id: 'popup' });
        assert.deepEqual(naechsterSchritt(CFG, lage({ ...base, ebenen: [] })), { art: 'startseite' });
    });

    it('a popup on the start page is closed too', () => {
        assert.deepEqual(naechsterSchritt(CFG, lage({ now: 200_000, aufStartseite: true, ebenen: ['aquarium'] })), {
            art: 'ebene',
            id: 'aquarium',
        });
    });

    it('dims on the start page after the idle time, also without a return, once', () => {
        const start = { now: 500_000, aufStartseite: true };
        assert.deepEqual(naechsterSchritt(CFG, lage(start)), { art: 'dimmen' });
        assert.deepEqual(naechsterSchritt(CFG, lage({ ...start, gedimmt: true })), { art: 'warten', inMs: null });
    });

    it('a touch on the start page starts the dim time again', () => {
        assert.deepEqual(
            naechsterSchritt(CFG, lage({ now: 500_000, letzteAktivitaet: 450_000, aufStartseite: true })),
            { art: 'warten', inMs: 70_000 },
        );
    });

    it('after a wake by motion it dims again only after the idle time, a page or popup still closes', () => {
        const bewegt = { now: 500_000, letzteBewegung: 450_000 };
        assert.deepEqual(naechsterSchritt(CFG, lage({ ...bewegt, aufStartseite: true })), {
            art: 'warten',
            inMs: 70_000,
        });
        assert.deepEqual(naechsterSchritt(CFG, lage({ ...bewegt, ebenen: ['popup'] })), { art: 'ebene', id: 'popup' });
        assert.deepEqual(naechsterSchritt(CFG, lage(bewegt)), { art: 'startseite' });
        assert.deepEqual(naechsterSchritt(CFG, lage({ ...bewegt, now: 570_000, aufStartseite: true })), {
            art: 'dimmen',
        });
    });

    it('0 switches the return off', () => {
        assert.deepEqual(naechsterSchritt({ ...CFG, zeitMs: 0 }, lage({ now: 10_000_000, ebenen: ['x'] })), {
            art: 'warten',
            inMs: null,
        });
    });

    it('never while a video or live image plays', () => {
        assert.deepEqual(naechsterSchritt(CFG, lage({ now: 10_000_000, medienLaufen: true })), {
            art: 'warten',
            inMs: null,
        });
    });

    it('a finger down holds the return back, but at most for the safety limit', () => {
        const op = { letzteAktivitaet: 0, bedienungSeit: 0 };
        assert.deepEqual(naechsterSchritt(CFG, lage({ ...op, now: 200_000 })), { art: 'warten', inMs: 100_000 });
        assert.deepEqual(naechsterSchritt(CFG, lage({ ...op, now: 300_000 })), { art: 'startseite' });
    });

    it('a safety limit below the idle time does not shorten it', () => {
        const cfg = { zeitMs: 120_000, limitMs: 30_000 };
        assert.deepEqual(naechsterSchritt(cfg, lage({ now: 60_000, bedienungSeit: 0 })), {
            art: 'warten',
            inMs: 60_000,
        });
    });
});

describe('seconds from a widget field', () => {
    it('empty or invalid gives the default', () => {
        assert.equal(sekunden('', DEFAULT_ZEIT_S, true), 120);
        assert.equal(sekunden(undefined, DEFAULT_ZEIT_S, true), 120);
        assert.equal(sekunden('abc', DEFAULT_ZEIT_S, true), 120);
        assert.equal(sekunden(-5, DEFAULT_ZEIT_S, true), 120);
    });

    it('0 means off only where allowed', () => {
        assert.equal(sekunden(0, DEFAULT_ZEIT_S, true), 0);
        assert.equal(sekunden('0', DEFAULT_ZEIT_S, true), 0);
        assert.equal(sekunden(0, DEFAULT_LIMIT_S, false), 300);
    });

    it('is clamped to 10 … 3600 s', () => {
        assert.equal(sekunden(3, DEFAULT_ZEIT_S, true), 10);
        assert.equal(sekunden(99_999, DEFAULT_ZEIT_S, true), 3600);
        assert.equal(sekunden('90.4', DEFAULT_ZEIT_S, true), 90);
    });
});

describe('Jäger menu path', () => {
    it('builds the hash for the start menu entry', () => {
        assert.equal(startHash('Hauptseite', 'w000001', 'Startseite'), '#Hauptseite/w000001/Startseite');
        assert.equal(startHash('Haupt seite', 'w1', 'Start'), '#Haupt%20seite/w1/Start');
    });

    it('recognises the start page', () => {
        const is = (h: string): boolean => istStartHash(h, 'Hauptseite', 'w000001', 'Startseite');
        assert.equal(is(''), true);
        assert.equal(is('#Hauptseite'), true);
        assert.equal(is('#Hauptseite/w000001/Startseite'), true);
        assert.equal(is('#Hauptseite/w000001'), true);
        assert.equal(is('#Hauptseite/w000001/Licht'), false);
        assert.equal(is('#Klimaanlage'), false);
        assert.equal(is('#Hauptseite/w000001/Start%20seite'), false);
    });
});
