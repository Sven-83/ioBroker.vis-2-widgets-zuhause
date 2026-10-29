import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { invertValue, invertedIds, isInverted, readValue, realId, writeTarget } from './oid';
import { deviceOn, diagnosis, parseDevices, tapAction } from './plan';
import { StateWatcher, type Socket } from './watch';

describe('inverted ids ("!")', () => {
    it('recognises the prefix and strips it', () => {
        assert.equal(isInverted('!hm-rpc.0.X.0.UNREACH'), true);
        assert.equal(isInverted(' ! zigbee.0.a.contact'), true);
        assert.equal(isInverted('hm-rpc.0.X.1.STATE'), false);
        assert.equal(isInverted(undefined), false);
        assert.equal(realId(' ! zigbee.0.a.contact '), 'zigbee.0.a.contact');
        assert.equal(realId('hm-rpc.0.X.1.STATE'), 'hm-rpc.0.X.1.STATE');
        assert.deepEqual(invertedIds(['a', '!b', undefined, '', '!c']), ['!b', '!c']);
    });

    it('reads the opposite, unknown stays unknown', () => {
        assert.equal(invertValue(true), false);
        assert.equal(invertValue(false), true);
        assert.equal(invertValue(0), true);
        assert.equal(invertValue(2), false);
        assert.equal(invertValue('false'), true);
        assert.equal(invertValue(null), null);
        assert.equal(invertValue(undefined), undefined);
        assert.equal(readValue('!x', true), false);
        assert.equal(readValue('x', true), true);
    });

    it('writes the opposite to the real id', () => {
        assert.deepEqual(writeTarget('!x', true), { id: 'x', value: false });
        assert.deepEqual(writeTarget('!x', 0), { id: 'x', value: 1 });
        assert.deepEqual(writeTarget('!x', 1), { id: 'x', value: 0 });
        assert.deepEqual(writeTarget('x', true), { id: 'x', value: true });
    });
});

describe('watcher with "!" ids', () => {
    const states: Record<string, ioBroker.State> = {
        'hm.UNREACH': { val: true, ack: true, ts: 1 } as ioBroker.State,
        'zb.contact': { val: true, ack: true, ts: 2 } as ioBroker.State,
    };
    const subscribed: string[][] = [];
    const socket: Socket = {
        subscribeState: ids => {
            subscribed.push(ids);
            return Promise.resolve();
        },
        unsubscribeState: () => undefined,
        getStates: ids => Promise.resolve(Object.fromEntries(ids.map(id => [id, states[id]]))),
    };

    it('subscribes the real id and inverts on reading', async () => {
        const w = new StateWatcher(socket, () => undefined);
        await w.watch(['!hm.UNREACH', '!zb.contact', 'zb.contact']);
        assert.deepEqual(subscribed.at(-1), ['hm.UNREACH', 'zb.contact']);
        assert.equal(w.val('!hm.UNREACH'), false);
        assert.equal(w.val('!zb.contact'), false);
        assert.equal(w.val('zb.contact'), true);
        assert.equal(w.snapshot('!zb.contact')?.ts, 2);
    });

    it('floor plan: UNREACH true = no reception badge, Zigbee contact closed = window closed', async () => {
        const w = new StateWatcher(socket, () => undefined);
        const { devices } = parseDevices([
            { typ: 'fenster', raum: 'r', x: 0, y: 0, oid: '!zb.contact', oidEmpfang: '!hm.UNREACH' },
        ]);
        await w.watch(['!zb.contact', '!hm.UNREACH']);
        assert.equal(deviceOn(devices[0], w.val), false);
        assert.equal(diagnosis(devices[0], w.val).noReception, true);
        states['hm.UNREACH'] = { val: false, ack: true, ts: 3 } as ioBroker.State;
        const w2 = new StateWatcher(socket, () => undefined);
        await w2.watch(['!hm.UNREACH']);
        assert.equal(diagnosis(devices[0], w2.val).noReception, false);
    });

    it('a switch with "!" toggles to the right raw value', () => {
        const { devices } = parseDevices([{ typ: 'lampe', raum: 'r', x: 0, y: 0, oid: '!sw' }]);
        // raw true = off when inverted -> tap switches on -> raw false is written
        const a = tapAction(devices[0], id => readValue(id, true));
        assert.equal(a.kind, 'write');
        if (a.kind === 'write') {
            assert.deepEqual(writeTarget(a.oid, a.value), { id: 'sw', value: false });
        }
    });
});
