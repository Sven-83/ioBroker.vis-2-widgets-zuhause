import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TAB_EVENT, nextPage, requestTab, type TabRequest } from './vis';

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
