/*
 * Technical cut of the tank view (proposal 2 "Technik-Schnitt", accepted by Sven 20.11.2026): front cut through
 * tank and cabinet with a little depth, filter (heater in its foot), UV, CO2 reactor + bottle, refill tank,
 * fertiliser bottles, power strip of all Shelly plugs and callouts left/right. Built as SVG text from the
 * live model (same drawing as the preview); the particles on the water path are moved by the view.
 */
import type { Flasche, PlugKey } from '../../lib/becken';

export type Stufe = 'ok' | 'rot' | 'gelb' | 'aus';

export interface Modell {
    lit: boolean;
    flow: boolean;
    heating: boolean;
    sw: Record<PlugKey, boolean>;
    stufe: (k: string) => Stufe;
    text: (k: string) => string;
    valve: boolean;
    water: number | null;
    fan: { running: boolean; level: number };
    pumps: Flasche[];
    pm: boolean;
    lightText: string;
    proxyOk: boolean;
}

export const DX = 18;
export const DY = -12;
const TK = { x: 170, y: 86, w: 330, h: 204 };
const CB = { x: 140, y: 302, w: 438, h: 196 };
export const PIPES: Record<string, string> = {
    intake: 'M190,212 V68 H146 V318 H214 V334',
    toUV: 'M246,466 H258 V412 H272',
    toReactor: 'M362,412 H376 V462 H388',
    back: 'M396,346 V318 H506 V78 H496 V112',
};
export const CO2_PATH = 'M414,327 H410 V392 H406';
const STRIP: Array<[PlugKey, string]> = [
    ['filter', 'Filter'],
    ['heizung', 'Heizung'],
    ['uv', 'UV'],
    ['skimmer', 'Skimmer'],
    ['nachfuell', 'Nachfüllung'],
    ['co2Plug', 'CO₂'],
    ['luefterPlug', 'Lüfter'],
    ['hinter', 'Rückwand'],
];
const ICONS: Record<PlugKey, string> = {
    filter: 'M5 2h6v12H5z M5 5h6 M7 8h2',
    heizung: 'M7 2v8a2.5 2.5 0 1 0 2 0V2z M8 6v6',
    uv: 'M2 9h12 M4 5l1.5 1.5 M8 3v2.5 M12 5l-1.5 1.5',
    skimmer: 'M0.5 5q1.6-1.4 3.2 0 M12.3 5q1.6-1.4 3.2 0 M3.8 3.5h8.4l-2 4.5h-4.4z M6.5 8v6.5h3V8 M6.5 11h3',
    nachfuell: 'M8 2c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z',
    co2Plug: 'M5 12a2 2 0 1 0 .1 0 M10 7.5a1.6 1.6 0 1 0 .1 0 M7 3a1.1 1.1 0 1 0 .1 0',
    luefterPlug: 'M2 8a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M8 8l3-3 M8 8l-3 3 M8 8l3 3 M8 8l-3-3',
    hinter: 'M2.5 3.5h11v8h-11z M5.5 14h5 M8 11.5v2.5',
};
export const LED: Record<Stufe, string> = { ok: '#6fe08a', rot: '#e5484d', gelb: '#f2c14e', aus: '#55555c' };

/**
 * Escapes text of the script for SVG/HTML.
 *
 * @param s text
 */
export const esc = (s: string): string =>
    s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const fmt = (x: number, d = 1): string => x.toFixed(d).replace('.', ',');

function plugOn(m: Modell, k: PlugKey): boolean {
    if (k === 'hinter') {
        return m.sw.hinter && !m.pm;
    }
    return m.sw[k];
}

function strip(m: Modell): string {
    const x0 = 150;
    const y0 = 506;
    const sw = 52;
    const gap = 2.5;
    let h = `<rect x="${x0 - 6}" y="${y0 - 4}" width="${STRIP.length * (sw + gap) + 8}" height="50" rx="10" fill="#e3e0d8"/>`;
    STRIP.forEach(([k, n], i) => {
        const x = x0 + i * (sw + gap);
        const on = plugOn(m, k);
        const st = m.stufe(k);
        const c = st === 'rot' ? '#e5484d' : on ? '#2fbf5a' : '#9a978f';
        h += `<g class="hot" data-k="${k}"><rect x="${x}" y="${y0}" width="${sw}" height="42" rx="7" fill="#f4f2ec" stroke="#cfccc3"/>
      <g transform="translate(${x + sw / 2 - 8} ${y0 + 4})" fill="none" stroke="#3a3b41" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[k]}"/></g>
      <text x="${x + sw / 2}" y="${y0 + 31}" text-anchor="middle" style="font:700 9px var(--zb-font);fill:#2b2b2f">${n}</text>
      <rect x="${x + 8}" y="${y0 + 35}" width="${sw - 16}" height="4" rx="2" fill="${c}" ${on || st === 'rot' ? 'filter="url(#zbGlow2)"' : ''}>${st === 'rot' ? '<animate attributeName="opacity" values="1;.2;1" dur="1s" repeatCount="indefinite"/>' : ''}</rect></g>`;
    });
    return h;
}

/**
 * Back layer (behind the canvas of the living tank).
 *
 * @param m model
 */
export function backSvg(m: Modell): string {
    const { flow } = m;
    let h = `<defs>
    <filter id="zbGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="zbHalo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
    <linearGradient id="zbMet" x1="0" x2="1"><stop offset="0" stop-color="#2c2d32"/><stop offset=".45" stop-color="#52535b"/><stop offset="1" stop-color="#2a2b30"/></linearGradient>
    <linearGradient id="zbBottle" x1="0" x2="1"><stop offset="0" stop-color="#3b3c42"/><stop offset=".4" stop-color="#6a6b74"/><stop offset="1" stop-color="#34353a"/></linearGradient>
    <linearGradient id="zbTeal" x1="0" x2="1"><stop offset="0" stop-color="#1c4652"/><stop offset=".45" stop-color="#3f8ea3"/><stop offset="1" stop-color="#173a44"/></linearGradient>
    <linearGradient id="zbWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f8ff"/><stop offset=".5" stop-color="#bcd8ff"/><stop offset="1" stop-color="#7fa8e0"/></linearGradient>
    <clipPath id="zbHeat"><rect x="192" y="454" width="44" height="16" rx="4"/></clipPath>
  </defs>`;
    const wall = m.sw.hinter && !m.pm;
    h += `<rect x="${TK.x - 14}" y="${TK.y - 22}" width="${TK.w + 46}" height="${TK.h + 20}" rx="12" fill="#bcd8ff" opacity="${wall ? 0.6 : 0}" filter="url(#zbHalo)"/>`;
    h += `<rect x="${TK.x + DX}" y="${TK.y + DY}" width="${TK.w}" height="${TK.h}" fill="${wall ? 'url(#zbWall)' : '#26282d'}" stroke="${wall ? '#e8f2ff' : '#3a3c42'}" ${wall ? 'filter="url(#zbGlow)"' : ''}/>`;
    h += `<ellipse cx="${CB.x + CB.w / 2 + 10}" cy="${CB.y + CB.h + 8}" rx="${CB.w / 2 + 40}" ry="14" fill="rgba(0,0,0,.45)" filter="url(#zbHalo)"/>`;
    h += `<polygon points="${CB.x + CB.w},${CB.y} ${CB.x + CB.w + DX},${CB.y + DY} ${CB.x + CB.w + DX},${CB.y + CB.h + DY} ${CB.x + CB.w},${CB.y + CB.h}" fill="#24252a"/>`;
    h += `<rect x="${CB.x}" y="${CB.y}" width="${CB.w}" height="${CB.h}" fill="#1c1d21"/>`;
    h += `<rect x="${CB.x + 8}" y="${CB.y + 10}" width="${CB.w - 16}" height="${CB.h - 18}" fill="#222328"/>`;
    h += `<polygon points="${CB.x + 8},${CB.y + CB.h - 8} ${CB.x + CB.w - 8},${CB.y + CB.h - 8} ${CB.x + CB.w - 18},${CB.y + CB.h - 22} ${CB.x + 18},${CB.y + CB.h - 22}" fill="#2a2b30"/>`;
    for (const [k, d] of Object.entries(PIPES)) {
        h += `<path d="${d}" fill="none" stroke="#3c3d44" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path data-pipe="${k}" d="${d}" fill="none" stroke="${flow ? 'rgba(95,208,230,.28)' : 'rgba(90,90,98,.5)'}" stroke-width="2.5" stroke-linejoin="round"/>`;
    }
    h += `<g class="hot" data-k="filter"><rect x="182" y="334" width="64" height="146" rx="12" fill="url(#zbMet)" stroke="#5a5b63"/>
    <ellipse cx="214" cy="336" rx="32" ry="6" fill="#5c5d65"/><rect x="200" y="350" width="28" height="4" rx="2" fill="#2a2b30"/>
    <path d="M196 372 h36 M196 384 h36 M196 396 h36" stroke="#2c2d32" stroke-width="2"/>
    <circle cx="214" cy="418" r="11" fill="none" stroke="#2c2d32" stroke-width="2"/>
    <g data-rotor="1" style="transform-origin:214px 418px"><path d="M214 409 v18 M205 418 h18" stroke="${flow ? '#7fe6ff' : '#55555c'}" stroke-width="2"/></g></g>`;
    const heizOn = m.sw.heizung;
    h += `<g class="hot" data-k="heizung"><rect x="188" y="452" width="52" height="20" rx="6" fill="#2a2124" stroke="#5a3a3a"/>
    <g clip-path="url(#zbHeat)"><path d="M178 462 q4 -6 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0" fill="none" stroke="${m.heating ? '#ff7a5a' : heizOn ? '#c4574a' : '#4a4a4a'}" stroke-width="2.4" stroke-linecap="round" ${m.heating ? 'filter="url(#zbGlow)"' : ''}>
      ${heizOn ? `<animateTransform attributeName="transform" type="translate" values="0 0;16 0" dur="${m.heating ? 0.9 : 2.8}s" repeatCount="indefinite"/><animate attributeName="opacity" values="${m.heating ? '1;.65;1' : '.75;.45;.75'}" dur="${m.heating ? 1.2 : 3}s" repeatCount="indefinite"/>` : ''}</path></g></g>`;
    const uvOn = m.sw.uv && flow;
    h += `<g class="hot" data-k="uv"><rect x="272" y="402" width="90" height="20" rx="10" fill="url(#zbMet)" stroke="#5a5b63"/>
    <rect x="282" y="409" width="70" height="6" rx="3" fill="${uvOn ? '#c49bff' : '#3a3a40'}" ${uvOn ? 'filter="url(#zbGlow)"' : ''}>${uvOn ? '<animate attributeName="opacity" values=".6;1;.6" dur="1.2s" repeatCount="indefinite"/>' : ''}</rect>
    ${m.stufe('uv') === 'rot' ? '<rect x="300" y="392" width="34" height="12" rx="4" fill="#e5484d"/><text x="317" y="401" text-anchor="middle" style="font:700 8px var(--zb-font);fill:#fff">STÖRUNG</text>' : ''}</g>`;
    h += `<g class="hot" data-k="co2"><rect x="386" y="346" width="20" height="124" rx="9" fill="url(#zbTeal)" stroke="#3d7f94"/>
    <g data-reactor="1"></g>
    <rect x="420" y="344" width="34" height="138" rx="14" fill="url(#zbBottle)" stroke="#5a5b63"/><rect x="431" y="334" width="12" height="12" fill="#55565e"/>
    <rect x="414" y="318" width="46" height="18" rx="5" fill="#2f3035" stroke="#5a5b63"/><text x="432" y="331" text-anchor="middle" style="font:700 9px var(--zb-font);fill:#e6e3db">CO₂ PRO</text>
    <circle cx="455" cy="327" r="3.2" fill="${m.valve ? '#4aa3ff' : '#55555c'}" ${m.valve ? 'filter="url(#zbGlow)"' : ''}/>
    <path data-pipe="co2" d="${CO2_PATH}" fill="none" stroke="${m.valve ? 'rgba(74,163,255,.55)' : '#444'}" stroke-width="1.6" stroke-dasharray="3 3"/></g>`;
    h += `<g class="hot" data-k="nachfuell"><rect x="476" y="392" width="72" height="92" rx="9" fill="rgba(60,110,130,.35)" stroke="#5a7d8a"/>
    <rect x="480" y="410" width="64" height="70" rx="6" fill="#1f5a70" opacity=".7"/><path d="M482 410 q8 -3 16 0 t16 0 t16 0 t14 0" stroke="#7fc4dc" fill="none" opacity=".6"/>
    <rect x="500" y="382" width="24" height="12" rx="3" fill="#3a3b41" stroke="#5a5b63"/></g>`;
    h += `<g class="hot" data-k="proxy"><rect x="552" y="452" width="20" height="20" rx="4" fill="#2f3035" stroke="#5a5b63"/><path d="M559 457 l6 5 -3 3 v-10 l3 3 -6 5" stroke="${m.proxyOk ? '#4aa3ff' : '#e5484d'}" stroke-width="1.3" fill="none"/></g>`;
    h += `<path d="M360,498 V510" stroke="#55565e" stroke-width="3"/>`;
    h += `<polygon points="${CB.x - 4},${CB.y} ${CB.x + CB.w + 4},${CB.y} ${CB.x + CB.w + 4 + DX},${CB.y + DY} ${CB.x - 4 + DX},${CB.y + DY}" fill="#45464c"/>`;
    h += `<rect x="${CB.x - 4}" y="${CB.y}" width="${CB.w + 8}" height="10" fill="#36373c"/>`;
    h += `<rect x="${CB.x}" y="${CB.y}" width="${CB.w}" height="${CB.h}" fill="none" stroke="#4a4b51" stroke-width="2"/>`;
    h += `<polygon points="${TK.x},${TK.y} ${TK.x + TK.w},${TK.y} ${TK.x + TK.w + DX},${TK.y + DY} ${TK.x + DX},${TK.y + DY}" fill="rgba(170,215,235,.10)" stroke="rgba(210,235,255,.35)"/>`;
    h += `<polygon points="${TK.x + TK.w},${TK.y} ${TK.x + TK.w + DX},${TK.y + DY} ${TK.x + TK.w + DX},${TK.y + TK.h + DY} ${TK.x + TK.w},${TK.y + TK.h}" fill="rgba(60,120,140,.35)" stroke="rgba(210,235,255,.3)"/>`;
    h += `<g class="hot" data-k="dosierpumpe"><rect x="514" y="276" width="66" height="20" rx="5" fill="#2f3035" stroke="#5a5b63"/>`;
    m.pumps.forEach((p, i) => {
        const bx = 519 + i * 20;
        const fr = p.remaining === null ? 0 : Math.max(0, Math.min(1, p.remaining / p.refill));
        h += `<rect x="${bx + 4}" y="210" width="8" height="7" fill="#55565e"/><rect x="${bx}" y="216" width="16" height="58" rx="5" fill="#26272b" stroke="#5a5b63"/>
      <rect x="${bx + 2}" y="${272 - 54 * fr}" width="12" height="${54 * fr}" rx="3" fill="${p.col}" opacity=".85"/>
      <text x="${bx + 8}" y="290" text-anchor="middle" style="font:700 9px var(--zb-font);fill:${p.col}">${p.short}</text>`;
    });
    h += `</g><path d="M527,210 V196 Q527,180 500,176 H488 V100 M547,210 V192 Q547,172 500,170 H492 V100 M567,210 V188 Q567,164 500,164 H496 V100" fill="none" stroke="#8a877f" stroke-opacity=".35" stroke-width="1"/>`;
    return h;
}

function callouts(m: Modell): string {
    const pumpDays = m.pumps.filter(p => p.days !== null).map(p => `${p.days} T`);
    type C = [string, string, string, number, number, number?];
    const Lft: C[] = [
        ['luefter', 'Lüfter', m.fan.running ? `Stufe ${m.fan.level}` : m.text('luefter') || 'aus', 198, 85],
        ['skimmer', 'Skimmer', m.text('skimmer'), 268, 127],
        ['hinter', 'Rückwand', m.pm ? 'aus (Pflege)' : m.sw.hinter ? 'leuchtet' : 'aus', 176, 176],
        ['filter', 'Filter', m.text('filter'), 182, 372],
        ['heizung', 'Heizung', m.text('heizung'), 188, 462],
        ['uv', 'UV-Klärer', m.text('uv'), 296, 422, 440],
    ];
    const Rgt: C[] = [
        ['lampe', 'Lampe', m.lightText, 494, 62],
        ['doctor', 'Doctor', m.water === null ? m.text('doctor') : `${fmt(m.water)} °C · Fische`, 472, 88],
        ['dosierpumpe', 'Dünger', pumpDays.length ? `${pumpDays.join(' · ')} Rest` : m.text('dosierpumpe'), 578, 240],
        ['proxy', 'Bluetooth', m.proxyOk ? 'alle 5 Geräte' : m.text('proxy'), 572, 462],
        ['co2', 'CO₂', m.text('co2'), 460, 327],
        ['nachfuell', 'Nachfüllung', m.text('nachfuell'), 548, 430],
    ];
    let h = '';
    const draw = (list: C[], left: boolean): void => {
        let y = 20;
        const items = list
            .map(([k, n, v, ax, ay, via]) => ({ k, n, v, ax, ay: via ?? ay, dy: ay, via, ly: 0 }))
            .sort((a, b) => a.ay - b.ay);
        items.forEach(i => {
            i.ly = Math.max(y, i.ay - 19);
            y = i.ly + 44;
        });
        for (let j = items.length - 1, lim = 530; j >= 0; j--) {
            items[j].ly = Math.min(items[j].ly, lim);
            lim = items[j].ly - 44;
        }
        items.forEach(i => {
            const w = 128;
            const lx = left ? 8 : 598;
            const ex = left ? lx + w : lx;
            const st = m.stufe(i.k);
            const v = i.v.length > 22 ? `${i.v.slice(0, 21)}…` : i.v;
            const d = `M${i.ax},${i.dy}${i.via !== undefined ? ` V${i.via}` : ''} L${left ? ex + 12 : ex - 12},${i.ly + 19} L${ex},${i.ly + 19}`;
            const tick =
                i.k === 'proxy' && st === 'ok'
                    ? '<tspan fill="#6fe08a" font-weight="700" font-size="13"> ✓</tspan>'
                    : '';
            h += `<path class="lead-halo" d="${d}"/><path class="lead" d="${d}"/><circle cx="${i.ax}" cy="${i.dy}" r="2.6" fill="#ece9e1" stroke="#0a0a0e" stroke-width="1"/>
        <g class="co ${st === 'rot' ? 'rot' : ''}" data-k="${i.k}"><rect class="bg" x="${lx}" y="${i.ly}" width="${w}" height="38" rx="10"/>
        <circle cx="${lx + 13}" cy="${i.ly + 13}" r="4" fill="${LED[st]}"/><text x="${lx + 23}" y="${i.ly + 17}">${i.n}</text><text class="v" x="${lx + 10}" y="${i.ly + 32}">${esc(v)}${tick}</text></g>`;
        });
    };
    draw(Lft, true);
    draw(Rgt, false);
    return h;
}

/**
 * Front layer (on top of the canvas): glass, lamp, skimmer, Doctor, fan, refill line, power strip, callouts.
 *
 * @param m model
 */
export function frontSvg(m: Modell): string {
    const { lit } = m;
    let h = `<defs><filter id="zbGlow2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <linearGradient id="zbSpill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2c14e" stop-opacity=".35"/><stop offset="1" stop-color="#f2c14e" stop-opacity="0"/></linearGradient>
    <linearGradient id="zbSk" x1="0" x2="1"><stop offset="0" stop-color="#2e3036"/><stop offset=".5" stop-color="#5b5e67"/><stop offset="1" stop-color="#2c2e33"/></linearGradient></defs>`;
    if (lit) {
        h += `<polygon points="182,64 488,64 500,150 170,150" fill="url(#zbSpill)"/>`;
    }
    h += `<rect x="${TK.x}" y="${TK.y}" width="${TK.w}" height="${TK.h}" fill="none" stroke="rgba(210,235,255,.6)" stroke-width="2"/>`;
    h += `<rect x="${TK.x + 4}" y="${TK.y + 6}" width="3" height="${TK.h - 30}" fill="rgba(255,255,255,.08)"/>`;
    const sk = m.sw.skimmer && m.stufe('skimmer') !== 'rot';
    h += `<g class="hot" data-k="skimmer">
    <rect x="268" y="98" width="8" height="32" rx="2" fill="url(#zbSk)" stroke="#8a8d96" stroke-width=".8"/>
    <path d="M269.5 104 h5 M269.5 108 h5 M269.5 112 h5" stroke="#22242a" stroke-width="1.2"/>
    <rect x="266" y="129" width="12" height="5" rx="1.5" fill="#4a4c54" stroke="#8a8d96" stroke-width=".8"/>
    <path d="M262 88.5 h20 l-4 10 h-12 z" fill="url(#zbSk)" stroke="#9a9da6" stroke-width="1"/>
    <ellipse cx="272" cy="89" rx="10" ry="2.2" fill="${sk ? '#9fdcef' : '#55575e'}" stroke="#9a9da6" stroke-width=".8"/>
    ${
        sk
            ? `<g fill="none" stroke="#e8f8ff" stroke-width="1.8" stroke-linecap="round">${[0, 1]
                  .map(
                      i =>
                          `<path d="M${240 + i * 6} 87.5 q3 -2 6 0"><animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="${i * 0.9}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="-8 0;12 0" dur="1.8s" begin="${i * 0.9}s" repeatCount="indefinite"/></path><path d="M${292 - i * 6} 87.5 q3 -2 6 0"><animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="${i * 0.9}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="8 0;-12 0" dur="1.8s" begin="${i * 0.9}s" repeatCount="indefinite"/></path>`,
                  )
                  .join('')}</g><g fill="#e8f8ff">${[0, 1, 2, 3, 4, 5]
                  .map(
                      i =>
                          `<circle r="1.7"><animateMotion dur="2.4s" begin="${i * 0.4}s" repeatCount="indefinite" path="${i % 2 ? 'M300,88 Q285,87 272,92 L272,128' : 'M244,88 Q259,87 272,92 L272,128'}"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.8;1" dur="2.4s" begin="${i * 0.4}s" repeatCount="indefinite"/></circle>`,
                  )
                  .join('')}</g>`
            : ''
    }</g>`;
    const w = m.water ?? 16;
    const lvl = 126 - 24 * Math.max(0, Math.min(1, (w - 16) / 16));
    h += `<g class="hot" data-k="doctor"><rect x="436" y="76" width="36" height="22" rx="5" fill="#3a3c43" stroke="#9aa3ab" stroke-width="1.4"/><text x="454" y="91" text-anchor="middle" style="font:700 11px var(--zb-font);letter-spacing:.06em;fill:#f2f0ea">DOC</text>
    <rect x="451" y="99" width="7" height="31" rx="3.5" fill="rgba(230,240,245,.35)" stroke="#e6edf0" stroke-width="1.1"/><rect x="453" y="${lvl}" width="3" height="${130 - lvl}" rx="1.5" fill="#e5484d"/><circle cx="454.5" cy="133" r="4.5" fill="#e5484d" stroke="#e6edf0" stroke-width="1.1"/>
    <rect x="463" y="107" width="40" height="18" rx="6" fill="rgba(20,24,28,.75)" stroke="rgba(255,255,255,.18)"/><text x="483" y="120" text-anchor="middle" style="font:600 13px var(--zb-num);fill:#fff">${m.water === null ? '–' : `${fmt(m.water)} °C`}</text></g>`;
    const run = m.fan.running;
    h += `<g class="hot" data-k="luefter"><rect x="196" y="74" width="42" height="22" rx="5" fill="#2f3035" stroke="${run ? '#6fe08a' : '#8a8d96'}"/>
    <circle cx="217" cy="85" r="9" fill="#1f2024" stroke="#6a6d76"/>
    <g data-fan="1" style="transform-origin:217px 85px"><path d="M217 85 c-1 -4 1 -7 3 -7 c0 3 -1 5 -3 7z M217 85 c4 -1 7 1 7 3 c-3 0 -5 -1 -7 -3z M217 85 c1 4 -1 7 -3 7 c0 -3 1 -5 3 -7z M217 85 c-4 1 -7 -1 -7 -3 c3 0 5 1 7 3z" fill="${run ? '#6fe08a' : '#6b6b70'}"/></g>
    <circle cx="217" cy="85" r="1.6" fill="#8a8d96"/>
    ${run ? [0, 1, 2].map(i => `<path d="M${207 + i * 10} 98 q-3 6 0 12 t0 12" fill="none" stroke="#bfe0ff" stroke-width="1.4" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;.8;0" dur="1.6s" begin="${i * 0.4}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 -4;0 6" dur="1.6s" begin="${i * 0.4}s" repeatCount="indefinite"/></path>`).join('') : ''}</g>`;
    h += `<g class="hot" data-k="lampe"><path d="M182 86 V62 M488 86 V62" stroke="#6a6b73" stroke-width="2.5"/>
    <polygon points="172,46 498,46 ${498 + DX * 0.7},${46 + DY * 0.7} ${172 + DX * 0.7},${46 + DY * 0.7}" fill="#4a4b52"/>
    <rect x="172" y="46" width="326" height="16" rx="5" fill="#2d2e33" stroke="${lit ? '#f2c14e' : '#6a6b73'}" stroke-width="1.5"/>
    <text x="180" y="57" style="font:700 9px var(--zb-font);letter-spacing:.08em;fill:#c4c4cc">WRGB II PRO 90</text>
    <rect x="178" y="59" width="314" height="5" rx="2.5" fill="${lit ? '#f2c14e' : '#4a4b52'}" ${lit ? 'filter="url(#zbGlow2)"' : ''}/>
    ${Array.from({ length: 26 }, (_, i) => `<circle cx="${186 + i * 12}" cy="61.5" r="1.4" fill="${lit ? '#fff6d8' : '#5a5b62'}"/>`).join('')}</g>`;
    const refill = 'M512,382 V346 H588 V72 H414 V112';
    h += `<path d="${refill}" fill="none" stroke="#1a1b1f" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>
    <path d="${refill}" fill="none" stroke="#c7b3e6" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" opacity=".95"/>
    <path d="${refill}" fill="none" stroke="#e4d9f2" stroke-width="1.2" stroke-dasharray="2 14" stroke-linecap="round"/>
    <path d="M414,113 l-5,-8 h10z" fill="#c7b3e6" stroke="#1a1b1f" stroke-width=".8"/><path d="M414 117 c4.5 6 6 9 6 12 a6 6 0 0 1 -12 0 c0 -3 1.5 -6 6 -12z" fill="#d9c8f2" stroke="#fff" stroke-width="1.3" filter="url(#zbGlow2)"/>`;
    h += `<path d="M190,212 V84" stroke="rgba(215,232,240,.35)" stroke-width="7" stroke-linecap="round"/><path d="M190,212 V84" stroke="rgba(255,255,255,.35)" stroke-width="1"/>
    <rect x="185" y="204" width="10" height="18" rx="3" fill="rgba(60,64,70,.85)" stroke="rgba(220,230,235,.5)"/><path d="M186.5 208 h7 M186.5 212 h7 M186.5 216 h7" stroke="rgba(200,210,215,.55)" stroke-width="1"/>`;
    h += strip(m);
    h += callouts(m);
    h += `<g data-parts="1"></g>`;
    return h;
}
