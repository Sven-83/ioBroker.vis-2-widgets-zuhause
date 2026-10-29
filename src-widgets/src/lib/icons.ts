/*
 * Icon register "zuhause": 24 grid, stroke 1.7, round ends, fill none, stroke currentColor.
 * ICONS: name -> SVG path · STATE_ICONS: tile -> icon per state (on = true, off = false).
 * Source: icons-zuhause/icons.js of the design hand-over, plus weather and UI icons in the same style.
 */
export const ICONS: Record<string, string> = {
    bewegung: 'M12 4.5a1.5 1.5 0 1 0 .01 0 M10 21l1.5-6-2-2 1-5 3 3h3 M9 8l-3 2v3 M13.5 15l2 6',
    'bewegung-aktiv':
        'M12 4.5a1.5 1.5 0 1 0 .01 0 M10 21l1.5-6-2-2 1-5 3 3h3 M9 8l-3 2v3 M13.5 15l2 6 M19 4a6 6 0 0 1 0 6 M21.5 2.5a9 9 0 0 1 0 9',
    wasser: 'M12 3c-3 4.5-5 7.5-5 10a5 5 0 0 0 10 0c0-2.5-2-5.5-5-10z',
    'wasser-alarm':
        'M12 3c-3 4.5-5 7.5-5 10a5 5 0 0 0 10 0c0-2.5-2-5.5-5-10z M2 20c2-1.5 3-1.5 5 0s3 1.5 5 0 3-1.5 5 0 3 1.5 5 0',
    heizung: 'M3 20c2-1.5 3-1.5 5 0s3 1.5 5 0 3-1.5 5 0 3 1.5 3 1 M9 4v8 M15 4v8 M12 3v10',
    'heizung-an':
        'M3 20c2-1.5 3-1.5 5 0s3 1.5 5 0 3-1.5 5 0 3 1.5 3 1 M9 12c-1.2-1.6 1.2-2.4 0-4s1.2-2.4 0-4 M15 12c-1.2-1.6 1.2-2.4 0-4s1.2-2.4 0-4 M12 13c-1.2-1.6 1.2-2.4 0-4s1.2-2.4 0-4',
    sirene: 'M7 18v-6a5 5 0 0 1 10 0v6 M5 18h14v3H5z M12 9v4',
    'sirene-an':
        'M7 18v-6a5 5 0 0 1 10 0v6 M5 18h14v3H5z M12 9v4 M12 1.5v2 M4.5 4.5l1.4 1.4 M19.5 4.5l-1.4 1.4 M2 11h2 M20 11h2',
    steckdose: 'M5 5h14v14H5z M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M10.5 11v2 M13.5 11v2',
    jalousie: 'M4 3h16v3H4z M5 6v15 M19 6v15 M5 9h14 M5 12h14 M5 15h14 M5 18h14',
    'jalousie-offen': 'M4 3h16v3H4z M5 6v15 M19 6v15 M5 9h14',
    rauchmelder: 'M4 9a8 3 0 1 0 16 0a8 3 0 1 0-16 0 M4 9v3a8 3 0 0 0 16 0V9 M12 9h.01',
    'rauchmelder-alarm':
        'M4 6a8 3 0 1 0 16 0a8 3 0 1 0-16 0 M4 6v3a8 3 0 0 0 16 0V6 M8.5 15c-1 1.5 1 2.5 0 4 M12 15c-1 1.5 1 2.5 0 4 M15.5 15c-1 1.5 1 2.5 0 4',
    glasbruch: 'M4 4h16v16H4z M15.5 7.5a1.5 1.5 0 1 0 .01 0',
    'glasbruch-alarm': 'M4 4h16v16H4z M12 4l-2 5 3 3-2.5 4 1.5 4 M10 9l-4 1 M13 12l4-1',
    'wlan-aus': 'M2 8.5a15 15 0 0 1 20 0 M5 12a10 10 0 0 1 14 0 M8.5 15.5a5 5 0 0 1 7 0 M12 19h.01 M3 3l18 18',
    'batterie-schwach': 'M3 7h15v10H3z M18 10h2.5v4H18 M6 10v4',
    fenster: 'M4 4h16v16H4z M4 9h16 M12 9v11',
    licht: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
    garten: 'M12 21V11 M9 21h6 M8 6h8l-1.5 5h-5z M12 3v3 M3 21c0-3 1.5-5 4-5.5 M21 21c0-3-1.5-5-4-5.5',
    alarm: 'M9 17v-4a3 3 0 0 1 6 0v4z M12 4v2 M6 7l1.4 1.4 M18 7l-1.4 1.4 M4 13h2 M18 13h2 M7 20h10',
    kamera: 'M3 7h12v10H3z M15 10.5l6-3.5v10l-6-3.5z M7 10.5h2',
    post: 'M3 6h18v13H3z M3 9h18 M11 13h2',
    tv: 'M3 5h18v12H3z M8 21h8 M12 17v4',
    baum: 'M15 3l5 7h-2.5l3.5 6h-12l3.5-6H10z M15 16v4 M13 20h4 M3 3h3v4H3z M4.5 7v4c0 2 1 3 3 3h2',
    haustuer: 'M6 3h12v18H6z M15 12h.5',
    garage: 'M3 10l9-6 9 6v11H3z M6 21v-9h12v9 M6 15h12 M6 18h12',
    backofen: 'M3 5h18v14H3z M5 8h11v8H5z M18.5 9v.5 M18.5 12v.5 M18.5 15v.5',
    spuelmaschine: 'M5 3h14v18H5z M5 7h14 M8 5h1 M15 5h1 M8 11h8 M8 14h8 M8 17h8',
    waschmaschine:
        'M5 3h14v18H5z M5 7h14 M8 5h1 M7 14a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M10 14a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    trockner: 'M5 3h14v18H5z M5 7h14 M8 5h1 M8 14a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M10.5 13c1 1 2 1 3 0',
    aquarium:
        'M3 6h18v14H3z M3 9h18 M7 15c1.5-2 4-2 5.5 0-1.5 2-4 2-5.5 0z M12.5 15l2.5-1.8v3.6z M17 20v-5 M18.5 20v-3',
    kuehlschrank: 'M6 3h12v18H6z M6 10h12 M9 6v2 M9 13v3',
    gefrierschrank: 'M12 3v18 M4.2 7.5l15.6 9 M4.2 16.5l15.6-9',
    energie: 'M13 3L5 14h6l-1 7 8-11h-6z',
    thermometer: 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z M12 9v7',
    schule: 'M2 9l10-5 10 5-10 5z M6 11v5c3 2 9 2 12 0v-5',
    wohnmobil: 'M2 17V8a2 2 0 0 1 2-2h11l5 5v6z M2 13h18 M6 9h4 M7 19a2 2 0 1 0 0.01 0 M16 19a2 2 0 1 0 0.01 0',
    'power-badge': 'M12 3v8 M6.5 6.5a8 8 0 1 0 11 0',
    'schloss-badge': 'M5 11h14v11H5z M8 11V8a4 4 0 0 1 8 0v3h-2V8a2 2 0 0 0-4 0v3z',
    'wetter-sonne':
        'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
    'wetter-wolke': 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z',
    'wetter-nebel': 'M4 8h16 M6 12h12 M4 16h16',
    'fenster-offen': 'M4 4h16v16H4z M4 9h16 M12 9v11 M12 20l6-2.5V11l-6-2',
    'haustuer-offen': 'M6 3h12v18H6z M6 3l7 2.5v17L6 21z M11 13h.5',
    'garage-offen': 'M3 10l9-6 9 6v11H3z M6 21v-9h12v9 M6 14.5h12',
    'licht-an':
        'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z M12 .8v1.2 M4.2 4l.9.9 M19.8 4l-.9.9 M1.5 10H3 M21 10h1.5',
    'garten-an':
        'M12 21V11 M9 21h6 M8 6h8l-1.5 5h-5z M12 3v3 M3 21c0-3 1.5-5 4-5.5 M21 21c0-3-1.5-5-4-5.5 M4.5 5.5l1.6 1 M19.5 5.5l-1.6 1 M4.5 9.5h1.8 M17.7 9.5h1.8',
    'alarm-aus': 'M9 17v-4a3 3 0 0 1 6 0v4z M12 4v2 M6 7l1.4 1.4 M18 7l-1.4 1.4 M4 13h2 M18 13h2 M7 20h10 M3 3l18 18',
    'kamera-aus': 'M3 7h12v10H3z M15 10.5l6-3.5v10l-6-3.5z M7 10.5h2 M3 3l18 18',
    'post-da': 'M3 6h18v13H3z M3 9h18 M7 11.5h10v5.5H7z M7 11.5l5 3 5-3',
    'tv-aus': 'M3 5h18v12H3z M8 21h8 M12 17v4 M3 3l18 18',
    'baum-an':
        'M15 3l5 7h-2.5l3.5 6h-12l3.5-6H10z M15 16v4 M13 20h4 M3 3h3v4H3z M4.5 7v4c0 2 1 3 3 3h2 M13 9h.5 M17 12h.5 M15 14h.5',

    // additions in the same style (weather codes of open-meteo, header, card)
    'wetter-teilweise':
        'M9 4v1.5 M3.5 9H5 M4.9 4.9l1 1 M13.1 4.9l-1 1 M6.2 10.5a3 3 0 0 1 5.6-3.3 M8 19h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8.2 13 3 3 0 0 0 8 19z',
    'wetter-regen': 'M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z M9 18v2 M12 18v2 M15 18v2',
    'wetter-schnee':
        'M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z M9 19h.01 M12 20.5h.01 M15 19h.01 M10.5 22h.01 M13.5 22h.01',
    'wetter-gewitter': 'M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z M13 15l-2.5 3.5h3L11 22',
    kalender: 'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4',
    uhr: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 7v5l3 2',
    schloss: 'M6 11h12v10H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3 M12 15v2',
};

export const STATE_ICONS: Record<string, { on: string; off: string }> = {
    bewegung: { on: 'bewegung-aktiv', off: 'bewegung' },
    wasser: { on: 'wasser-alarm', off: 'wasser' },
    heizung: { on: 'heizung-an', off: 'heizung' },
    sirene: { on: 'sirene-an', off: 'sirene' },
    jalousie: { on: 'jalousie', off: 'jalousie-offen' },
    rauchmelder: { on: 'rauchmelder-alarm', off: 'rauchmelder' },
    glasbruch: { on: 'glasbruch-alarm', off: 'glasbruch' },
    fenster: { on: 'fenster', off: 'fenster-offen' },
    haustuer: { on: 'haustuer', off: 'haustuer-offen' },
    garage: { on: 'garage-offen', off: 'garage' },
    licht: { on: 'licht-an', off: 'licht' },
    garten: { on: 'garten-an', off: 'garten' },
    alarm: { on: 'alarm', off: 'alarm-aus' },
    kamera: { on: 'kamera', off: 'kamera-aus' },
    post: { on: 'post-da', off: 'post' },
    tv: { on: 'tv', off: 'tv-aus' },
    baum: { on: 'baum-an', off: 'baum' },
};

/** Names that only exist as the on/off variant of another icon */
const VARIANTS = new Set(
    Object.entries(STATE_ICONS).flatMap(([name, s]) => [s.on, s.off].filter(variant => variant !== name)),
);

/** Icons offered in the icon picker of the editor (state variants are chosen automatically) */
export const PICKER_ICONS: string[] = Object.keys(ICONS).filter(
    name => !VARIANTS.has(name) && !name.endsWith('-badge') && name !== 'wlan-aus' && name !== 'batterie-schwach',
);

/** Icon name for a value: the state variant if the icon has one, else the icon itself */
export function iconNameFor(name: string, on: boolean): string {
    const s = STATE_ICONS[name];
    const key = s ? (on ? s.on : s.off) : name;
    return ICONS[key] ? key : name;
}

/** SVG path for a value */
export function iconFor(name: string, on: boolean): string {
    return ICONS[iconNameFor(name, on)] || ICONS[name] || '';
}
