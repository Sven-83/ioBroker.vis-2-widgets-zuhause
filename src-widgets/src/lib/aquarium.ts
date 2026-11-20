/*
 * Aquarium tile (spec Claude-Specs/chihiros-aquarium.md, part A / phase 5): pure logic for the tile and the
 * popup "what is going on in the tank?", without React, so it can be tested.
 * The script script.js.vis2.Aquarium writes the states below 0_userdata.0.vis.aquarium; the widget only reads.
 */

export const DEFAULT_BASE = '0_userdata.0.vis.aquarium';

/** States of the script read by the widget (relative to the base) */
export const AQ = {
    laeuft: 'laeuft',
    warnung: 'warnung',
    hinweis: 'hinweis',
    co2: 'co2',
    geraete: 'geraete',
} as const;

export type Stufe = 'ok' | 'rot' | 'gelb' | 'aus';

/** One device row written by the script */
export interface Zeile {
    key: string;
    name: string;
    gruppe: string;
    stufe: Stufe;
    text: string;
}

const STUFEN: readonly Stufe[] = ['ok', 'rot', 'gelb', 'aus'];

/** Group order in the popup: water on the left, the rest on the right */
export const SPALTEN: { links: string[]; rechts: string[] } = {
    links: ['Wasser'],
    rechts: ['Licht', 'Pflege', 'Technik'],
};

/**
 * Reads the JSON list of the script; broken entries are dropped.
 *
 * @param raw value of <base>.geraete
 */
export function parseGeraete(raw: unknown): Zeile[] {
    if (typeof raw !== 'string' || !raw) {
        return [];
    }
    let list: unknown;
    try {
        list = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(list)) {
        return [];
    }
    const out: Zeile[] = [];
    for (const x of list as Array<Record<string, unknown>>) {
        if (!x || typeof x.key !== 'string' || typeof x.name !== 'string') {
            continue;
        }
        const stufe = STUFEN.includes(x.stufe as Stufe) ? (x.stufe as Stufe) : 'aus';
        out.push({
            key: x.key,
            name: x.name,
            gruppe: typeof x.gruppe === 'string' && x.gruppe ? x.gruppe : 'Technik',
            stufe,
            text: typeof x.text === 'string' ? x.text : '',
        });
    }
    return out;
}

export type TileArt = 'ok' | 'rot' | 'gelb' | 'aus' | 'leer';

export interface TileView {
    art: TileArt;
    /** label under the icon */
    label: string;
    /** short text for screen readers / tooltip */
    text: string;
    /** CO2 valve open: blue dot + bubbles */
    co2: boolean;
}

/**
 * Look of the tile. Red (warning) beats yellow (hint); "not running" (a device that must run is off)
 * without a warning is shown as off.
 *
 * @param p values of the script
 * @param p.laeuft <base>.laeuft
 * @param p.warnung <base>.warnung
 * @param p.hinweis <base>.hinweis
 * @param p.co2 <base>.co2
 * @param p.liste parsed device list
 * @param p.label configured name
 */
export function tileView(p: {
    laeuft: unknown;
    warnung: unknown;
    hinweis: unknown;
    co2: unknown;
    liste: Zeile[];
    label: string;
}): TileView {
    const co2 = p.co2 === true;
    const rot = p.liste.filter(z => z.stufe === 'rot');
    if (p.warnung === true || rot.length) {
        const n = rot.length;
        return {
            art: 'rot',
            label: `${p.label} prüfen`,
            text: n ? rot.map(z => `${z.name}: ${z.text}`).join(', ') : 'Störung',
            co2,
        };
    }
    if (p.laeuft === undefined && !p.liste.length) {
        return { art: 'leer', label: p.label, text: 'keine Daten vom Aquarium-Skript', co2 };
    }
    const gelb = p.liste.filter(z => z.stufe === 'gelb');
    if (gelb.length || (typeof p.hinweis === 'string' && p.hinweis)) {
        return {
            art: 'gelb',
            label: p.label,
            text: gelb.length ? gelb.map(z => `${z.name}: ${z.text}`).join(', ') : String(p.hinweis),
            co2,
        };
    }
    if (p.laeuft === false) {
        return { art: 'aus', label: p.label, text: 'Aquarium aus', co2 };
    }
    return { art: 'ok', label: p.label, text: 'Aquarium läuft', co2 };
}

export interface Zusammenfassung {
    stufe: 'ok' | 'rot' | 'gelb';
    titel: string;
    /** rows to show on top (red first, then yellow) */
    oben: Zeile[];
    /** water temperature text, '–' when unknown */
    wasser: string;
    /** CO2 valve text */
    co2: string;
    inOrdnung: number;
    gesamt: number;
}

/**
 * Summary line of the popup.
 *
 * @param liste device list
 */
export function zusammenfassung(liste: Zeile[]): Zusammenfassung {
    const rot = liste.filter(z => z.stufe === 'rot');
    const gelb = liste.filter(z => z.stufe === 'gelb');
    const titel = rot.length
        ? `${rot.length} Störung${rot.length > 1 ? 'en' : ''}`
        : gelb.length
          ? `Läuft · ${gelb.length} Hinweis${gelb.length > 1 ? 'e' : ''}`
          : liste.length
            ? 'Alles in Ordnung'
            : 'Keine Daten';
    const doctor = liste.find(z => z.key === 'doctor');
    const wasser = doctor && /°C/.test(doctor.text) && doctor.stufe !== 'gelb' ? doctor.text.split(' –')[0] : '–';
    const ventil = liste.find(z => z.key === 'co2');
    return {
        stufe: rot.length ? 'rot' : gelb.length || !liste.length ? 'gelb' : 'ok',
        titel,
        oben: [...rot, ...gelb],
        wasser,
        co2: !ventil || ventil.stufe === 'gelb' ? '–' : ventil.text.startsWith('offen') ? 'offen' : 'zu',
        inOrdnung: liste.length - rot.length - gelb.length,
        gesamt: liste.length,
    };
}

export interface Gruppe {
    titel: string;
    zeilen: Zeile[];
}

/**
 * Devices in two columns by group; unknown groups go to the right column.
 *
 * @param liste device list
 */
export function spalten(liste: Zeile[]): { links: Gruppe[]; rechts: Gruppe[] } {
    const bekannt = [...SPALTEN.links, ...SPALTEN.rechts];
    const extra = [...new Set(liste.map(z => z.gruppe))].filter(g => !bekannt.includes(g));
    const gruppe = (titel: string): Gruppe => ({ titel, zeilen: liste.filter(z => z.gruppe === titel) });
    const voll = (g: Gruppe): boolean => g.zeilen.length > 0;
    return {
        links: SPALTEN.links.map(gruppe).filter(voll),
        rechts: [...SPALTEN.rechts, ...extra].map(gruppe).filter(voll),
    };
}

export interface MiniBecken {
    /** main lamp / background light on: lamp bar glows, light rays, coloured fish */
    licht: boolean;
    /** water flows (filter running): bubbles may rise */
    fluss: boolean;
}

/**
 * State of the drawn mini tank on the tile (variant B "Mini-Becken", Sven 20.11.2026).
 * Light = the background light runs (it always follows the main lamp), flow = the filter row is ok.
 * No temperature on the tile (Sven 20.11.2026): a temperature outside the limits turns the tile red anyway.
 *
 * @param liste device list of the script
 */
export function miniBecken(liste: Zeile[]): MiniBecken {
    const zeile = (key: string): Zeile | undefined => liste.find(z => z.key === key);
    const filter = zeile('filter');
    return {
        licht: zeile('hinter')?.stufe === 'ok',
        fluss: !filter || filter.stufe === 'ok',
    };
}
