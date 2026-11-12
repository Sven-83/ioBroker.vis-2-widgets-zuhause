import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    anordnen,
    kachelZustand,
    kantenText,
    kartenName,
    laufzeit,
    parseGeraete,
    parseTopologie,
    tempo,
    type NetzKante,
    type NetzKnoten,
    type NetzTopologie,
} from './netz';

const knoten = (id: string, uplinkId = '', extra: Partial<NetzKnoten> = {}): NetzKnoten => ({
    id,
    name: id,
    model: 'M',
    role: 'accessPoint',
    virtual: false,
    state: 'ok',
    uplinkId,
    causeId: '',
    updatable: false,
    ...extra,
});
const topo = (nodes: NetzKnoten[]): NetzTopologie => ({ rootId: 'gw', nodes, edges: [] });
const kante = (extra: Partial<NetzKante> = {}): NetzKante => ({
    from: 'a',
    to: 'b',
    type: 'wired',
    speed: 1000,
    signal: null,
    degraded: false,
    port: null,
    ...extra,
});

describe('netz', () => {
    describe('parseTopologie', () => {
        it('reads the adapter JSON', () => {
            const t = parseTopologie(
                JSON.stringify({
                    rootId: 'gw',
                    nodes: [{ id: 'gw', name: 'Konsole', role: 'gateway', state: 'ok', uplinkId: '' }],
                    edges: [{ from: 'gw', to: 'x', type: 'wired', speed: 1000, port: 3 }],
                }),
            );
            assert.equal(t?.nodes[0].name, 'Konsole');
            assert.equal(t?.edges[0].port, 3);
            assert.equal(t?.edges[0].signal, null);
        });
        it('treats an unknown state as ok', () => {
            const t = parseTopologie(JSON.stringify({ rootId: '', nodes: [{ id: 'a', state: 'weird' }] }));
            assert.equal(t?.nodes[0].state, 'ok');
        });
        for (const v of ['', 'kaputt', null, 42, '{"nodes":5}']) {
            it(`gives null for ${String(v)}`, () => assert.equal(parseTopologie(v), null));
        }
    });

    describe('parseGeraete', () => {
        it('reads uptime, firmware and clients', () => {
            const m = parseGeraete(JSON.stringify([{ id: 'a', uptime: 3600, firmware: '1.2', clients: 4 }]));
            assert.deepEqual(m.get('a'), { id: 'a', uptime: 3600, firmware: '1.2', clients: 4 });
        });
        it('gives an empty map for broken data', () => assert.equal(parseGeraete('x').size, 0));
    });

    describe('kachelZustand', () => {
        const ok = topo([knoten('gw', '', { role: 'gateway' }), knoten('a', 'gw')]);
        it('is ok when all run', () => assert.equal(kachelZustand('ok', ok, true), 'ok'));
        it('has no data when stale, missing or without console', () => {
            assert.equal(kachelZustand('stale', ok, true), 'keineDaten');
            assert.equal(kachelZustand('ok', null, true), 'keineDaten');
            assert.equal(kachelZustand('ok', ok, false), 'keineDaten');
        });
        it('shows a failure before everything else', () => {
            const t = topo([
                knoten('gw'),
                knoten('a', 'gw', { state: 'offline', updatable: true }),
                knoten('b', 'a', { state: 'busy' }),
            ]);
            assert.equal(kachelZustand('offline', t, true), 'gestoert');
        });
        it('shows a running update before slow links', () => {
            const t = topo([
                knoten('gw'),
                knoten('a', 'gw', { state: 'busy' }),
                knoten('b', 'gw', { state: 'degraded' }),
            ]);
            assert.equal(kachelZustand('degraded', t, true), 'updateLaeuft');
        });
        it('shows slow links before an available update', () => {
            const t = topo([knoten('gw'), knoten('a', 'gw', { state: 'degraded', updatable: true })]);
            assert.equal(kachelZustand('degraded', t, true), 'langsam');
        });
        it('shows an available update', () => {
            const t = topo([knoten('gw'), knoten('a', 'gw', { updatable: true })]);
            assert.equal(kachelZustand('ok', t, true), 'update');
        });
        it('ignores the placeholder of a section that is not UniFi', () => {
            const t = topo([knoten('gw'), knoten('p', 'gw', { virtual: true, state: 'offline' })]);
            assert.equal(kachelZustand('ok', t, true), 'ok');
        });
    });

    describe('anordnen', () => {
        it('puts a parent centred above its children', () => {
            const { pos, ohneWeg } = anordnen(
                topo([knoten('gw'), knoten('sw', 'gw'), knoten('a', 'sw'), knoten('b', 'sw')]),
            );
            assert.deepEqual(ohneWeg, []);
            assert.ok(pos.gw.y < pos.sw.y && pos.sw.y < pos.a.y);
            assert.equal(pos.sw.x, (pos.a.x + pos.b.x) / 2);
        });
        it('never puts two cards on the same place and keeps them inside', () => {
            const nodes = [
                knoten('gw'),
                knoten('a', 'gw'),
                knoten('b', 'gw'),
                knoten('c', 'a'),
                knoten('d', 'a'),
                knoten('e', 'b'),
            ];
            const { pos, breite, hoehe } = anordnen(topo(nodes));
            assert.equal(new Set(Object.values(pos).map(p => `${p.x}/${p.y}`)).size, nodes.length);
            for (const p of Object.values(pos)) {
                assert.ok(p.x - 66 >= 0 && p.x + 66 <= breite && p.y + 27 <= hoehe);
            }
        });
        it('puts devices without a way to the console in a row below, also in a loop', () => {
            const { pos, ohneWeg } = anordnen(topo([knoten('gw'), knoten('a', 'b'), knoten('b', 'a')]));
            assert.deepEqual(ohneWeg.sort(), ['a', 'b']);
            assert.ok(pos.a.y > pos.gw.y);
        });
        it('copes with no data', () => assert.deepEqual(anordnen(null).ohneWeg, []));
    });

    describe('texts', () => {
        it('writes speeds short', () => {
            assert.equal(tempo(1000), '1 G');
            assert.equal(tempo(2500), '2.5 G');
            assert.equal(tempo(100), '100 M');
            assert.equal(tempo(null), '');
        });
        it('labels links', () => {
            assert.equal(kantenText(kante({ port: 3 }), knoten('b')), 'Port 3 · 1 G');
            assert.equal(kantenText(kante({ type: 'wireless', signal: -62 }), knoten('b')), 'Mesh · -62 dBm');
            assert.equal(kantenText(kante({ port: 4 }), knoten('b', '', { virtual: true })), 'Port 4');
        });
        it('names cards', () => {
            assert.equal(kartenName(knoten('x', '', { name: 'Switch Flur', role: 'switch' })), 'Flur');
            assert.equal(kartenName(knoten('x', '', { virtual: true, name: '' })), 'Nicht UniFi');
            assert.equal(kartenName(knoten('x', '', { virtual: true, name: 'Powerline' })), 'Powerline');
        });
        it('writes the uptime', () => {
            assert.equal(laufzeit(13 * 86400 + 16 * 3600), '13 T 16 h');
            assert.equal(laufzeit(5 * 3600), '5 h');
            assert.equal(laufzeit(null), '–');
        });
    });
});
