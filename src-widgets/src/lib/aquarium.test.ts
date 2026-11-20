import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { miniBecken, parseGeraete, spalten, tileView, type Zeile, zusammenfassung } from './aquarium';

// written by script.js.vis2.Aquarium on 18.11.2026 22:16
const ECHT =
    '[{"key":"filter","name":"Filter","gruppe":"Wasser","stufe":"ok","text":"läuft · 8 W"},{"key":"heizung","name":"Heizung","gruppe":"Wasser","stufe":"ok","text":"an · heizt gerade nicht"},{"key":"uv","name":"UV-Klärer","gruppe":"Wasser","stufe":"ok","text":"läuft · 11 W"},{"key":"co2","name":"CO₂-Ventil","gruppe":"Wasser","stufe":"ok","text":"offen"},{"key":"co2Plug","name":"CO₂-Steckdose","gruppe":"Wasser","stufe":"ok","text":"läuft · 3 W"},{"key":"skimmer","name":"Skimmer","gruppe":"Wasser","stufe":"ok","text":"läuft · 5 W"},{"key":"nachfuell","name":"Nachfüllautomatik","gruppe":"Wasser","stufe":"ok","text":"bereit"},{"key":"doctor","name":"Wasser (Doctor)","gruppe":"Wasser","stufe":"ok","text":"21,1 °C"},{"key":"lampe","name":"Lampe","gruppe":"Licht","stufe":"ok","text":"aus nach Zeitplan · 11-12, 14-20"},{"key":"hinter","name":"Hintergrundlicht","gruppe":"Licht","stufe":"aus","text":"aus"},{"key":"dosierpumpe","name":"Dünger","gruppe":"Pflege","stufe":"ok","text":"GH Boost 90 T · NPK 45 T"},{"key":"luefter","name":"Lüfter","gruppe":"Technik","stufe":"aus","text":"aus"},{"key":"luefterPlug","name":"Lüfter-Steckdose","gruppe":"Technik","stufe":"ok","text":"an"},{"key":"proxy","name":"Bluetooth-Proxy","gruppe":"Technik","stufe":"ok","text":"verbunden"}]';

const mit = (list: Zeile[], key: string, ch: Partial<Zeile>): Zeile[] =>
    list.map(z => (z.key === key ? { ...z, ...ch } : z));

describe('aquarium', () => {
    const liste = parseGeraete(ECHT);

    it('parses the list of the script and drops broken entries', () => {
        assert.equal(liste.length, 14);
        assert.deepEqual(liste[0], {
            key: 'filter',
            name: 'Filter',
            gruppe: 'Wasser',
            stufe: 'ok',
            text: 'läuft · 8 W',
        });
        assert.deepEqual(parseGeraete('{x'), []);
        assert.deepEqual(parseGeraete(undefined), []);
        assert.deepEqual(parseGeraete('{"a":1}'), []);
        assert.deepEqual(parseGeraete('[null,{"key":1},{"key":"a","name":"A","stufe":"komisch"}]'), [
            { key: 'a', name: 'A', gruppe: 'Technik', stufe: 'aus', text: '' },
        ]);
    });

    it('tile: ok, red beats yellow, off, no data', () => {
        const base = { laeuft: true, warnung: false, hinweis: '', co2: true, liste, label: 'Aquarium' };
        assert.deepEqual(tileView(base), { art: 'ok', label: 'Aquarium', text: 'Aquarium läuft', co2: true });
        const gelb = mit(liste, 'dosierpumpe', { stufe: 'gelb', text: 'NPK reicht noch 5 Tage (50 ml)' });
        assert.equal(tileView({ ...base, liste: gelb, hinweis: 'x' }).art, 'gelb');
        const rot = mit(gelb, 'filter', { stufe: 'rot', text: 'an, aber ohne Strom' });
        const v = tileView({ ...base, liste: rot, warnung: true });
        assert.equal(v.art, 'rot');
        assert.equal(v.label, 'Aquarium prüfen');
        assert.equal(v.text, 'Filter: an, aber ohne Strom');
        assert.equal(tileView({ ...base, laeuft: false }).art, 'aus');
        assert.equal(tileView({ ...base, laeuft: undefined, liste: [] }).art, 'leer');
        assert.equal(tileView({ ...base, co2: false }).co2, false);
    });

    it('summary of the popup', () => {
        const s = zusammenfassung(liste);
        assert.equal(s.titel, 'Alles in Ordnung');
        assert.equal(s.stufe, 'ok');
        assert.equal(s.wasser, '21,1 °C');
        assert.equal(s.co2, 'offen');
        assert.equal(s.inOrdnung, 14);
        assert.equal(s.gesamt, 14);
        const rot = mit(mit(liste, 'filter', { stufe: 'rot', text: 'an, aber ohne Strom' }), 'co2', {
            stufe: 'rot',
            text: 'offen, aber der Filter steht',
        });
        const r = zusammenfassung(mit(rot, 'doctor', { stufe: 'gelb', text: 'nicht erreichbar' }));
        assert.equal(r.titel, '2 Störungen');
        assert.equal(r.stufe, 'rot');
        assert.deepEqual(
            r.oben.map(z => z.key),
            ['filter', 'co2', 'doctor'],
        );
        assert.equal(r.wasser, '–');
        assert.equal(r.co2, 'offen');
        assert.equal(r.inOrdnung, 11);
        const warm = zusammenfassung(mit(liste, 'doctor', { stufe: 'rot', text: '28,6 °C – zu warm (20–28 °C)' }));
        assert.equal(warm.wasser, '28,6 °C');
        assert.equal(warm.titel, '1 Störung');
        assert.equal(zusammenfassung(mit(liste, 'co2', { stufe: 'aus', text: 'zu' })).co2, 'zu');
        assert.equal(zusammenfassung([]).titel, 'Keine Daten');
    });

    it('columns by group, unknown groups on the right', () => {
        const s = spalten([...liste, { key: 'x', name: 'Neu', gruppe: 'Sonstiges', stufe: 'ok', text: '' }]);
        assert.deepEqual(
            s.links.map(g => [g.titel, g.zeilen.length]),
            [['Wasser', 8]],
        );
        assert.deepEqual(
            s.rechts.map(g => [g.titel, g.zeilen.length]),
            [
                ['Licht', 2],
                ['Pflege', 1],
                ['Technik', 3],
                ['Sonstiges', 1],
            ],
        );
    });

    it('mini tank: light from the background light, flow from the filter', () => {
        assert.deepEqual(miniBecken(liste), { licht: false, fluss: true });
        const tag = mit(liste, 'hinter', { stufe: 'ok', text: 'an · folgt der Lampe' });
        assert.equal(miniBecken(tag).licht, true);
        const steht = mit(tag, 'filter', { stufe: 'rot', text: 'an, aber ohne Strom' });
        assert.equal(miniBecken(steht).fluss, false);
        assert.deepEqual(miniBecken([]), { licht: false, fluss: true });
    });
});
