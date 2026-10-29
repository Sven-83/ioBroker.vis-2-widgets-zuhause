import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ICONS } from './icons';
import {
    DEVICE_TYPES,
    blindPosition,
    blindSummary,
    blindWrite,
    deviceGlow,
    deviceOids,
    deviceOn,
    diagnosis,
    longPressPopup,
    maintenanceText,
    parseDevices,
    parseViewBox,
    parseZones,
    pinState,
    pointsBox,
    roomName,
    roomRows,
    securityGroups,
    tapAction,
    zoneOf,
    type PlanDevice,
    type Room,
} from './plan';

const values = (v: Record<string, unknown>) => (oid: string | undefined) => (oid ? v[oid] : undefined);
const dev = (d: Partial<PlanDevice>): PlanDevice => ({
    typ: 'lampe',
    name: '',
    raum: 'bad',
    x: 10,
    y: 20,
    oid: 'a',
    ...d,
});
const rooms: Room[] = [
    { id: 'bad', name: 'Bad', points: '0,0 230,0 230,147 0,147' },
    { id: 'flur', name: 'Flur', points: '230,125 299,125 299,330 266,330 266,574 230,574' },
];

describe('device list', () => {
    it('parses and skips wrong entries', () => {
        const r = parseDevices(
            JSON.stringify([
                { typ: 'lampe', raum: 'bad', x: 168, y: 37, oid: 'l1' },
                { typ: 'kaffee', x: 1, y: 1 },
                { typ: 'lampe', raum: 'bad' },
                'text',
            ]),
        );
        assert.equal(r.devices.length, 1);
        assert.equal(r.errors.length, 3);
        assert.deepEqual(parseDevices('').devices, []);
        assert.match(parseDevices('{kaputt').errors[0], /^JSON/);
        assert.match(parseDevices('{"a":1}').errors[0], /Liste/);
    });
    it('collects all data points', () => {
        assert.deepEqual(deviceOids(dev({ oid: 'a', oidEmpfang: 'e', oidBatterie: '' })), ['a', 'e']);
    });
});

describe('pin states', () => {
    it('lamp and socket', () => {
        assert.equal(pinState(dev({}), values({ a: true }), 'de').look, 'on');
        assert.equal(pinState(dev({}), values({ a: false }), 'de').look, 'off');
        assert.equal(pinState(dev({ typ: 'steckdose' }), values({ a: true }), 'de').animate, true);
    });
    it('dimmer shows the level', () => {
        const d = dev({ typ: 'dimmer', oidHelligkeit: 'h' });
        assert.equal(pinState(d, values({ a: true, h: 30 }), 'de').label, '30 %');
        assert.equal(pinState(d, values({ a: false, h: 30 }), 'de').label, '');
        // dimmer with level only
        const lvl = dev({ typ: 'dimmer', oid: '', oidHelligkeit: 'h' });
        assert.equal(deviceOn(lvl, values({ h: 0 })), false);
        assert.equal(deviceOn(lvl, values({ h: 40 })), true);
    });
    it('blind: open / part / closed, inverted', () => {
        const d = dev({ typ: 'rollo', oid: '', oidPosition: 'p' });
        assert.equal(pinState(d, values({ p: 100 }), 'de').look, 'open');
        assert.equal(pinState(d, values({ p: 40 }), 'de').look, 'part');
        assert.equal(pinState(d, values({ p: 40 }), 'de').shade, 60);
        assert.equal(pinState(d, values({ p: 0 }), 'de').label, 'zu');
        assert.equal(
            blindPosition(dev({ typ: 'rollo', oid: '', oidPosition: 'p', invertieren: true }), values({ p: 0 })),
            100,
        );
        assert.equal(
            pinState(dev({ typ: 'rollo', oidPosition: 'p', oidFaehrt: 'f' }), values({ p: 50, f: true }), 'de').animate,
            true,
        );
    });
    it('contacts: open = warning, inverted contacts', () => {
        assert.equal(pinState(dev({ typ: 'fenster' }), values({ a: true }), 'de').look, 'warn');
        assert.equal(pinState(dev({ typ: 'fenster' }), values({ a: false }), 'de').look, 'ok');
        assert.equal(pinState(dev({ typ: 'fenster' }), values({ a: true }), 'de').icon, 'fenster-offen');
        assert.equal(pinState(dev({ typ: 'tuer', invertieren: true }), values({ a: true }), 'de').look, 'ok');
    });
    it('smoke detector: smoke has priority over siren', () => {
        const d = dev({ typ: 'rauchmelder', oid: '', oidRauch: 'r', oidSirene: 's' });
        assert.equal(pinState(d, values({ r: true, s: true }), 'de').alarmText, 'RAUCH');
        assert.equal(pinState(d, values({ r: false, s: true }), 'de').alarmText, 'ALARM');
        assert.equal(pinState(d, values({ r: false, s: false }), 'de').led, true);
        assert.equal(pinState(d, values({ r: false, s: false }), 'de').look, 'neutral');
    });
    it('detectors and values', () => {
        assert.equal(pinState(dev({ typ: 'glasbruch' }), values({ a: true }), 'de').look, 'alarm');
        assert.equal(pinState(dev({ typ: 'bewegung' }), values({ a: true }), 'de').look, 'active');
        assert.equal(pinState(dev({ typ: 'wasser' }), values({ a: true }), 'de').look, 'water');
        assert.equal(pinState(dev({ typ: 'thermometer' }), values({ a: 21.94 }), 'de').label, '21,9°');
        assert.equal(
            pinState(dev({ typ: 'geraet', icon: 'waschmaschine' }), values({ a: true }), 'de').icon,
            'waschmaschine',
        );
    });
    it('every type icon exists', () => {
        for (const typ of DEVICE_TYPES) {
            for (const on of [true, false]) {
                const s = pinState(dev({ typ, oidPosition: 'a' }), values({ a: on ? 100 : 0 }), 'de');
                assert.ok(ICONS[s.icon], `${typ} ${on} -> ${s.icon}`);
            }
        }
    });
});

describe('diagnosis', () => {
    it('battery badge only for battery devices', () => {
        const v = values({ e: 0, b: 5 });
        assert.deepEqual(diagnosis(dev({ typ: 'lampe', oidEmpfang: 'e', oidBatterie: 'b' }), v), {
            noReception: true,
            lowBattery: false,
        });
        assert.deepEqual(diagnosis(dev({ typ: 'fenster', oidBatterie: 'b' }), v), {
            noReception: false,
            lowBattery: true,
        });
    });
    it('maintenance text', () => {
        const v = values({ e: 0, b: 5 });
        const text = maintenanceText(
            [
                dev({ raum: 'flur', oidEmpfang: 'e' }),
                dev({ typ: 'fenster', raum: 'bad', oidBatterie: 'b' }),
                dev({ typ: 'fenster', raum: 'bad', oidBatterie: 'b' }),
            ],
            v,
            rooms,
        );
        assert.equal(text, 'Wartung: 1 ohne Empfang (Flur) · 2 Batterie schwach (Bad)');
        assert.equal(maintenanceText([dev({})], v, rooms), '');
    });
});

describe('taps', () => {
    it('toggles lights and sockets, write target', () => {
        assert.deepEqual(tapAction(dev({}), values({ a: false })), { kind: 'write', oid: 'a', value: true });
        assert.deepEqual(tapAction(dev({ oidSchreiben: 'w' }), values({ a: true })), {
            kind: 'write',
            oid: 'w',
            value: false,
        });
    });
    it('dimmer without switch data point writes the level', () => {
        assert.deepEqual(tapAction(dev({ typ: 'dimmer', oid: '', oidHelligkeit: 'h' }), values({ h: 30 })), {
            kind: 'write',
            oid: 'h',
            value: 0,
        });
        assert.deepEqual(tapAction(dev({ typ: 'dimmer', oid: '', oidHelligkeit: 'h' }), values({ h: 0 })), {
            kind: 'write',
            oid: 'h',
            value: 100,
        });
    });
    it('blind: open <-> closed, inverted', () => {
        assert.deepEqual(tapAction(dev({ typ: 'rollo', oid: '', oidPosition: 'p' }), values({ p: 40 })), {
            kind: 'write',
            oid: 'p',
            value: 0,
        });
        assert.deepEqual(tapAction(dev({ typ: 'rollo', oid: '', oidPosition: 'p' }), values({ p: 0 })), {
            kind: 'write',
            oid: 'p',
            value: 100,
        });
        assert.deepEqual(
            tapAction(dev({ typ: 'rollo', oid: '', oidPosition: 'p', invertieren: true }), values({ p: 100 })),
            {
                kind: 'write',
                oid: 'p',
                value: 0,
            },
        );
        assert.deepEqual(blindWrite(dev({ typ: 'rollo', oidPosition: 'p', invertieren: true }), 25), {
            oid: 'p',
            value: 75,
        });
    });
    it('garage gate opens and closes, sensors do nothing', () => {
        assert.deepEqual(tapAction(dev({ typ: 'tor' }), values({ a: false })), {
            kind: 'write',
            oid: 'a',
            value: true,
        });
        assert.deepEqual(tapAction(dev({ typ: 'tor', invertieren: true }), values({ a: true })), {
            kind: 'write',
            oid: 'a',
            value: false,
        });
        assert.deepEqual(tapAction(dev({ typ: 'fenster' }), values({ a: true })), { kind: 'none' });
        assert.deepEqual(tapAction(dev({ typ: 'rauchmelder' }), values({})), { kind: 'none' });
    });
    it('long press only for dimmers with level and blinds', () => {
        assert.equal(longPressPopup(dev({ typ: 'dimmer', oidHelligkeit: 'h' })), 'dimmer');
        assert.equal(longPressPopup(dev({ typ: 'dimmer' })), null);
        assert.equal(longPressPopup(dev({ typ: 'rollo' })), 'rollo');
        assert.equal(longPressPopup(dev({ typ: 'lampe' })), null);
    });
});

describe('glow and zones', () => {
    it('light glow grows with brightness', () => {
        const d = dev({ typ: 'dimmer', oidHelligkeit: 'h' });
        const low = deviceGlow(d, values({ a: true, h: 10 }), 717);
        const high = deviceGlow(d, values({ a: true, h: 100 }), 717);
        assert.ok(low && high && high.r > low.r && high.stops[0][1] > low.stops[0][1]);
        assert.equal(deviceGlow(d, values({ a: false, h: 100 }), 717), null);
        // radius of a full lamp: 280 px of 884 -> about 227 units of 717
        assert.equal(Math.round(deviceGlow(dev({}), values({ a: true }), 717)!.r), 227);
    });
    it('open window tints red, closed blind gives no daylight', () => {
        assert.equal(deviceGlow(dev({ typ: 'fenster' }), values({ a: true }), 717)?.rgb, '229,72,77');
        assert.equal(deviceGlow(dev({ typ: 'rollo', oidPosition: 'p' }), values({ p: 0 }), 717), null);
        assert.equal(deviceGlow(dev({ typ: 'steckdose' }), values({ a: true }), 717), null);
    });
    it('zones', () => {
        const zones = parseZones('[{"id":"offen","raeume":["eingang","flur"]},{"id":"x"}]');
        assert.equal(zones.length, 1);
        assert.equal(zoneOf('flur', zones), 'offen');
        assert.equal(zoneOf('bad', zones), 'bad');
        assert.deepEqual(parseZones('kaputt'), []);
    });
    it('svg helpers', () => {
        assert.deepEqual(parseViewBox('-6 -6 717 594'), { x: -6, y: -6, w: 717, h: 594 });
        assert.equal(parseViewBox('0 0 0 10'), null);
        assert.deepEqual(pointsBox(rooms[1].points), { x: 230, y: 125, w: 69, h: 449 });
        assert.equal(roomName('flur', rooms), 'Flur');
        assert.equal(roomName('garage', rooms), 'Garage');
    });
});

describe('side panel', () => {
    it('rooms with lamps on', () => {
        const rows = roomRows(
            [
                dev({ raum: 'flur', oid: 'x' }),
                dev({ raum: 'bad', oid: 'y' }),
                dev({ raum: 'bad', oid: 'z' }),
                dev({ typ: 'steckdose', raum: 'bad' }),
            ],
            values({ y: true }),
            rooms,
            ['lampe', 'dimmer'],
        );
        assert.deepEqual(
            rows.map(r => [r.name, r.on, r.total]),
            [
                ['Bad', 1, 2],
                ['Flur', 0, 1],
            ],
        );
    });
    it('blind summary', () => {
        const ds = [10, 0, 100, 100].map((_, i) => dev({ typ: 'rollo', oid: '', oidPosition: `p${i}` }));
        assert.deepEqual(blindSummary(ds, values({ p0: 10, p1: 0, p2: 100, p3: 100 })), {
            open: 2,
            part: 1,
            closed: 1,
        });
    });
    it('security groups', () => {
        const g = securityGroups(
            [dev({ typ: 'fenster', oid: 'f' }), dev({ typ: 'tuer', oid: 't' }), dev({ typ: 'rauchmelder', oid: 'r' })],
            values({ f: true }),
        );
        assert.deepEqual(
            g.map(x => [x.key, x.total, x.active.length]),
            [
                ['kontakte', 2, 1],
                ['rauch', 1, 0],
            ],
        );
    });
});
