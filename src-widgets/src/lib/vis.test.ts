import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    EBENE_EVENT,
    RUECKSPRUNG_AKTIV_EVENT,
    STARTSEITE_EVENT,
    TAB_EVENT,
    meldeEbene,
    nextPage,
    requestStartseite,
    requestTab,
    ruecksprungZentral,
    type EbeneMeldung,
    type StartseiteAnfrage,
    type TabRequest,
} from './vis';

describe('page switch inside a frame', () => {
    it('only the container that shows the source view switches', () => {
        assert.equal(nextPage('Licht-Wohnung', { von: 'Licht-Wohnung', nach: 'Licht-Keller' }), 'Licht-Keller');
        assert.equal(nextPage('Steckdose-Wohnung', { von: 'Licht-Wohnung', nach: 'Licht-Keller' }), null);
        assert.equal(nextPage('Licht-Wohnung', { von: 'Licht-Wohnung', nach: 'Licht-Wohnung' }), null);
        assert.equal(nextPage('Licht-Wohnung', { von: 'Licht-Wohnung', nach: '' }), null);
        assert.equal(nextPage('Licht-Wohnung', undefined), null);
    });

    it('reports whether a container took over', () => {
        const target = new EventTarget();
        (globalThis as unknown as { window: EventTarget }).window = target;
        assert.equal(requestTab({ von: 'a', nach: 'b' }), false);

        const listener = (e: Event): void => {
            const req = (e as CustomEvent<TabRequest>).detail;
            if (nextPage('a', req)) {
                e.preventDefault();
            }
        };
        target.addEventListener(TAB_EVENT, listener);
        assert.equal(requestTab({ von: 'a', nach: 'b' }), true);
        assert.equal(requestTab({ von: 'x', nach: 'b' }), false);
        target.removeEventListener(TAB_EVENT, listener);
    });
});

describe('return after inactivity events', () => {
    it('levels report open and closed with their close function', () => {
        const target = new EventTarget();
        (globalThis as unknown as { window: EventTarget }).window = target;
        assert.equal(meldeEbene('popup', true), false);

        const got: EbeneMeldung[] = [];
        const listener = (e: Event): void => {
            got.push((e as CustomEvent<EbeneMeldung>).detail);
            e.preventDefault();
        };
        target.addEventListener(EBENE_EVENT, listener);
        let closed = false;
        assert.equal(
            meldeEbene('popup', true, () => {
                closed = true;
            }),
            true,
        );
        meldeEbene('popup', false);
        got[0].schliessen?.();
        assert.equal(closed, true);
        assert.deepEqual(
            got.map(g => [g.id, g.offen]),
            [
                ['popup', true],
                ['popup', false],
            ],
        );
        target.removeEventListener(EBENE_EVENT, listener);
    });

    it('asks the tab containers and lets them go back', () => {
        const target = new EventTarget();
        (globalThis as unknown as { window: EventTarget }).window = target;
        let tab = 'Keller';
        const listener = (e: Event): void => {
            if (tab !== 'Wohnung') {
                e.preventDefault();
                if ((e as CustomEvent<StartseiteAnfrage>).detail.zuruecksetzen) {
                    tab = 'Wohnung';
                }
            }
        };
        target.addEventListener(STARTSEITE_EVENT, listener);
        assert.equal(requestStartseite(false), true);
        assert.equal(tab, 'Keller');
        assert.equal(requestStartseite(true), true);
        assert.equal(tab, 'Wohnung');
        assert.equal(requestStartseite(false), false);
        target.removeEventListener(STARTSEITE_EVENT, listener);
    });

    it('tells widgets with an own timer whether the central return is there', () => {
        const target = new EventTarget();
        (globalThis as unknown as { window: EventTarget }).window = target;
        assert.equal(ruecksprungZentral(), false);
        const listener = (e: Event): void => e.preventDefault();
        target.addEventListener(RUECKSPRUNG_AKTIV_EVENT, listener);
        assert.equal(ruecksprungZentral(), true);
        target.removeEventListener(RUECKSPRUNG_AKTIV_EVENT, listener);
    });
});
