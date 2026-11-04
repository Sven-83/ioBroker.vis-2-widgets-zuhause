/*
 * VIS-2 widget "Saugroboter": a whole page (1357 × 900, scaled to the widget box) for a Dreame robot
 * (adapter dreamehome). Rooms are chosen on the floor plan, the number shows the order; mode, suction,
 * max suction, water 1–32, mop wash area, route and repeats are taken from the robot and can be changed.
 * Start writes the changed settings first (the robot ignores them inside the start command), then starts.
 * While a job runs the start button becomes pause/stop with the progress per room.
 *
 * Room names and polygons come from the project (field "raeume"), never from this repo.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import {
    M2_MAX,
    M2_MIN,
    MODI,
    ROUTEN,
    SAUGSTUFEN,
    WASSER_MAX,
    WASSER_MIN,
    WASSER_STUFEN,
    aktiveRaeume,
    anzeigen,
    ausRoboter,
    fortschritt,
    labelPos,
    laeuft,
    parseLinien,
    parseRaeume,
    pausiert,
    saugerIds,
    saugt,
    skalaAnteile,
    startBefehl,
    text,
    vorbereiten,
    wasserStufe,
    wischt,
    type Ausstehend,
    type Einstellung,
    type Modus,
    type SaugerIds,
    type SaugerRaum,
} from '../lib/sauger';
import { loadPlanLayers, resolveImage, type PlanLayers } from '../lib/svg';
import { ensureStyles } from '../lib/theme';
import { PREFIX, SET_INFO, motionClass } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const W = 1357;
const H = 900;
/** pause between two writes before the start: the robot answers each setting by MQTT */
const WRITE_GAP_MS = 1500;

interface SaugerRxData {
    titel: string;
    geraet: string;
    svg: string;
    raeume: string;
    linien: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface SaugerState extends VisRxWidgetState {
    zsWahl: number[];
    zsDurch: number;
    zsPlan: PlanLayers | null;
    zsPlanFehler: string;
    zsVorbereitung: string;
    zsFort: number;
    zsTick: number;
    zsScale: number;
}

// ---------------------------------------------------------------- icons (24 grid, stroke 1.7)

function fan(cx: number, cy: number, r: number): string {
    const e = (a: number): string =>
        `<ellipse cx="${cx}" cy="${cy - r * 0.52}" rx="${r * 0.3}" ry="${r * 0.5}" transform="rotate(${a} ${cx} ${cy})"/>`;
    return `<g class="zs-fan" style="transform-origin:${cx}px ${cy}px">${e(0)}${e(120)}${e(240)}</g><circle cx="${cx}" cy="${cy}" r="${r * 0.16}" fill="currentColor"/>`;
}
const DROP = (x: number, y: number, s: number): string =>
    `<path class="zs-drop" d="M${x} ${y}c-${1.5 * s} ${2 * s}-${2.4 * s} ${3.2 * s}-${2.4 * s} ${4.4 * s}a${2.4 * s} ${2.4 * s} 0 0 0 ${4.8 * s} 0c0-${1.2 * s}-${0.9 * s}-${2.4 * s}-${2.4 * s}-${4.4 * s}z"/>`;
const PAD = '<g class="zs-pad"><rect x="4" y="16" width="16" height="4" rx="2"/></g>';

const ICON: Record<string, string> = {
    saugen: fan(12, 12, 8.5),
    wischen: `${DROP(12, 3.5, 1)}<g class="zs-pad"><rect x="5" y="15" width="14" height="4.5" rx="2.2"/><path d="M8 17.2h8"/></g>`,
    beides: `${fan(8, 8.5, 5.5)}${DROP(17, 5, 0.7)}${PAD}`,
    nachein: `${fan(6.5, 8, 5)}<path d="M11.5 8h3.5m-1.5-1.8L15.4 8l-1.9 1.8"/>${DROP(19, 4.5, 0.65)}${PAD}`,
    bolt: '<path class="zs-bolt" d="M13.5 3L6 13.5h5.2L10 21l7.5-10.5h-5.2z"/>',
    play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    quadrat: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    akku: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><rect x="5" y="9" width="12" height="6" rx="1" fill="currentColor" stroke="none"/>',
    robo: '<g class="zs-robo"><circle cx="12" cy="12" r="9"/><path d="M5.6 15.6a8 8 0 0 0 12.8 0"/><g class="zs-lid"><circle cx="12" cy="8.6" r="2.3"/><path d="M12 6.3v1"/></g></g>',
    basis: '<circle cx="12" cy="13" r="8"/><path d="M6.4 16.2a7 7 0 0 0 11.2 0"/><path class="zs-chg" d="M12.6 6.5l-2.4 3.6h2.6l-2.2 3.4"/><path d="M4 22h16"/>',
};
function saugIcon(n: number): string {
    let w = '';
    for (let i = 0; i < n; i++) {
        w += `<path class="zs-wind" style="animation-delay:${i * 0.25}s" d="M18.5 ${8 + i * 2.7}h3"/>`;
    }
    return fan(10, 12, 7.5) + w;
}
const ROUTE_PFAD: Record<number, string> = {
    1: 'M6 7h12v3.3H6v3.4h12V17H6',
    2: 'M6 6.5h12v2.2H6v2.2h12v2.2H6v2.2h12v2.2H6',
    3: 'M6 7h12v3.3H6v3.4h12V17H6M6 17V7h3.3v10h3.4V7H16v10',
    4: 'M6 8h12v8H6',
};
const routeIcon = (k: number): string =>
    `<rect x="3" y="3" width="18" height="18" rx="3" opacity=".45"/><path class="zs-route" pathLength="120" d="${ROUTE_PFAD[k]}"/>`;

function Ic({ d, size = 32, style }: { d: string; size?: number; style?: React.CSSProperties }): React.JSX.Element {
    return (
        <svg
            className="zs-ic"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            style={style}
            aria-hidden="true"
            // static markup of this file only
            dangerouslySetInnerHTML={{ __html: d }}
        />
    );
}

const MODUS_TEXT: Record<Modus, string> = {
    saugen: 'Saugen',
    wischen: 'Wischen',
    beides: 'Saugen und Wischen',
    nachein: 'Wischen nach Saugen',
};
const SAUG_TEXT = ['Leise', 'Standard', 'Intensiv', 'Max'];
const ROUTE_TEXT: Record<number, string> = { 1: 'Standard', 2: 'Intensiv', 3: 'Tief', 4: 'Schnell' };
const STUFE_TEXT: Record<string, string> = { low: 'Niedrig', mid: 'Mittel', high: 'Hoch', ultra: 'Ultra' };

// ---------------------------------------------------------------- styles

const STYLE_ID = 'zh-sauger-styles';
const CSS = `
.zs{width:${W}px;height:${H}px;padding:24px;box-sizing:border-box;display:grid;grid-template-columns:600px 1fr;grid-template-rows:64px 1fr 84px;gap:16px;font-family:'Zuhause Barlow',Barlow,system-ui,sans-serif;color:var(--text,#ece9e1);transform-origin:top left;user-select:none;-webkit-tap-highlight-color:transparent}
.zs *{box-sizing:border-box}
.zs button{font-family:inherit;touch-action:manipulation}
.zs-ic{display:block;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.zs-kopf{grid-column:1/3;display:flex;align-items:center;gap:16px}
.zs-kopf h1{margin:0;font-size:26px;font-weight:600}
.zs-status{display:flex;align-items:center;gap:10px;padding:8px 16px 8px 10px;border-radius:999px;background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);font-size:15px}
.zs-status.an{background:var(--st-on-bg,#183323);border-color:var(--st-on-bd,#3f8f57);color:var(--st-on-fg,#9fe0b2)}
.zs-akku{display:flex;align-items:center;gap:6px;color:var(--text-2,#a3a19a);font-size:15px}
.zs-akku b{font-family:'Zuhause Barlow Condensed','Barlow Condensed',system-ui,sans-serif;font-size:22px;color:var(--text,#ece9e1);font-weight:600}
.zs-karte{background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);border-radius:var(--radius-card,18px);padding:14px 16px;display:flex;flex-direction:column;gap:10px;min-height:0;transition:opacity .2s}
.zs-karte.aus,.zs-gesperrt{opacity:.4;pointer-events:none}
.zs-karte h2{margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:10px}
.zs-wert{margin-left:auto;font-weight:500;color:var(--text-2,#a3a19a);font-size:14px}
.zs-rechts{display:flex;flex-direction:column;gap:12px;min-height:0}
.zs-plan{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
.zs-plan>svg{width:100%;height:100%}
.zs-raum{cursor:pointer}
.zs-raum polygon{fill:#303036;transition:fill .18s}
.zs-raum.an polygon{fill:var(--sw-on,#f2c14e)}
.zs-raum.putzt polygon{animation:zs-puls 1.4s ease-in-out infinite}
.zs-txt{font-size:17px;font-weight:500;fill:var(--text,#ece9e1);text-anchor:middle;dominant-baseline:middle;pointer-events:none}
.zs-txt.klein{font-size:13px}
.zs-txt.an{fill:var(--sw-on-fg,#2a2108);font-weight:600}
.zs-nr circle{fill:var(--sw-on-fg,#2a2108);stroke:var(--sw-on,#f2c14e);stroke-width:2.5}
.zs-nr text{font-family:'Zuhause Barlow Condensed','Barlow Condensed',system-ui,sans-serif;font-size:20px;font-weight:600;fill:var(--sw-on,#f2c14e);text-anchor:middle;dominant-baseline:central}
.zs-nr,.zs-deko{pointer-events:none}
.zs-kacheln{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.zs-zeile{display:flex;align-items:center;gap:10px}
.zs-zeile .lbl{font-size:14px;color:var(--text-2,#a3a19a);flex:1}
.zs-trenn{height:1px;background:var(--border,#36363b);margin:2px 0}
.zs-seg{display:inline-flex;border:1px solid var(--sw-off-bd,#44444a);border-radius:12px;overflow:hidden}
.zs-seg button{width:56px;height:40px;border:0;background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);font:600 18px 'Zuhause Barlow Condensed','Barlow Condensed',system-ui,sans-serif;cursor:pointer}
.zs-seg button+button{border-left:1px solid var(--sw-off-bd,#44444a)}
.zs-seg button.an{background:var(--sw-on,#f2c14e);color:var(--sw-on-fg,#2a2108)}
.zs-wahl{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.zs-opt{height:88px;border-radius:var(--radius-tile,14px);border:1px solid var(--sw-off-bd,#44444a);background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:14px;font-weight:500;cursor:pointer;padding:0 4px}
.zs-opt.an{background:var(--sw-on,#f2c14e);border-color:var(--sw-on,#f2c14e);color:var(--sw-on-fg,#2a2108)}
.zs-opt:active,.zs-go:active,.zs-stopp:active,.zs-neben:active{transform:scale(.98)}
.zs-schalter{margin-left:auto;display:inline-flex;align-items:center;gap:10px;font-size:14px;font-weight:500;color:var(--text-2,#a3a19a);cursor:pointer;background:none;border:0;padding:0}
.zs-bahn{width:46px;height:26px;border-radius:13px;background:var(--sw-off-bg,#333338);border:1px solid var(--sw-off-bd,#44444a);position:relative}
.zs-bahn::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:var(--sw-off-fg,#cfccc3);transition:transform .15s}
.zs-schalter.an{color:var(--text,#ece9e1)}
.zs-schalter.an .zs-bahn{background:var(--sw-on,#f2c14e);border-color:var(--sw-on,#f2c14e)}
.zs-schalter.an .zs-bahn::after{transform:translateX(20px);background:var(--sw-on-fg,#2a2108)}
.zs-regler{position:relative;padding-top:4px}
.zs-skala,.zs-spur{display:flex}
.zs-skala{margin-bottom:8px}
.zs-skala span{font-size:13px;color:var(--text-2,#a3a19a);text-align:center;line-height:1.15}
.zs-skala span small{display:block;font:500 11px 'Zuhause Barlow Condensed','Barlow Condensed',system-ui,sans-serif;color:#777570}
.zs-skala span.an{color:var(--text,#ece9e1);font-weight:600}
.zs-skala span.an small{color:#8fc4ff}
.zs-spur{height:24px;border-radius:12px;border:1.5px solid #5b5b63;background:#1e1e21;padding:2px;gap:3px;box-shadow:inset 0 2px 4px rgba(0,0,0,.45)}
.zs-spur i{display:block;border-radius:4px}
.zs-spur i:first-child{border-radius:9px 4px 4px 9px}
.zs-spur i:last-child{border-radius:4px 9px 9px 4px}
.zs-fuell{position:absolute;left:3.5px;height:19px;border-radius:9px 0 0 9px;background:linear-gradient(180deg,#6db7ff,#2f7fd6);box-shadow:inset 0 1px 0 rgba(255,255,255,.35);pointer-events:none}
.zs-knauf{position:absolute;width:44px;height:44px;margin-left:-22px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#dcd9d1);border:4px solid #4aa3ff;box-shadow:0 3px 10px rgba(0,0,0,.55),0 0 0 4px rgba(74,163,255,.18);display:flex;align-items:center;justify-content:center;font:600 19px 'Zuhause Barlow Condensed','Barlow Condensed',system-ui,sans-serif;color:#1d3f66;pointer-events:none}
.zs-range{position:absolute;left:0;right:0;width:100%;height:44px;margin:0;opacity:0;cursor:pointer;-webkit-appearance:none;appearance:none}
.zs-range::-webkit-slider-thumb{-webkit-appearance:none;width:44px;height:44px}
.zs-range::-webkit-slider-runnable-track{height:44px}
.zs-range::-moz-range-thumb{width:44px;height:44px;border:0}
.zs-stepper{display:inline-flex;align-items:center;border:1px solid var(--sw-off-bd,#44444a);border-radius:12px;overflow:hidden}
.zs-stepper button{width:44px;height:40px;border:0;background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);font:600 22px 'Zuhause Barlow Condensed','Barlow Condensed',system-ui,sans-serif;cursor:pointer}
.zs-stepper button:disabled{opacity:.35}
.zs-stepper output{min-width:84px;text-align:center;font:600 20px 'Zuhause Barlow Condensed','Barlow Condensed',system-ui,sans-serif}
.zs-leiste{grid-column:1/3;display:flex;align-items:center;gap:16px;background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);border-radius:var(--radius-card,18px);padding:12px 12px 12px 22px}
.zs-zus{flex:1;font-size:15px;color:var(--text-2,#a3a19a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zs-zus b{color:var(--text,#ece9e1);font-weight:600}
.zs-fort{display:flex;gap:6px}
.zs-fort i{width:34px;height:8px;border-radius:4px;background:var(--sw-off-bg,#333338);border:1px solid var(--sw-off-bd,#44444a)}
.zs-fort i.fertig{background:var(--st-on-bd,#3f8f57);border-color:var(--st-on-bd,#3f8f57)}
.zs-fort i.jetzt{background:var(--st-led,#6fe08a);border-color:var(--st-led,#6fe08a);animation:zs-puls 1.4s ease-in-out infinite}
.zs-go,.zs-stopp{position:relative;overflow:hidden;height:64px;padding:0 26px 0 10px;border-radius:18px;color:#fff;display:inline-flex;align-items:center;gap:14px;cursor:pointer;text-align:left}
.zs-go{min-width:340px;border:1px solid #5cc27e;background:linear-gradient(180deg,#4db36f,#2e8049);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 8px 22px rgba(63,143,87,.38)}
.zs-stopp{min-width:240px;border:1px solid #f06a6e;background:linear-gradient(180deg,#e5484d,#a92a2f);box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 8px 22px rgba(229,72,77,.32)}
.zs-kreis{width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.25);flex:none}
.zs-go .zs-kreis{color:#2e8049}
.zs-go .zs-kreis svg{margin-left:3px}
.zs-stopp .zs-kreis{color:#c0353a}
.zs-btxt{display:flex;flex-direction:column;line-height:1.2;min-width:0}
.zs-btxt b{font-size:19px;font-weight:600}
.zs-btxt small{font-size:13px;opacity:.88;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.zs-go::after{content:'';position:absolute;top:0;bottom:0;width:60px;left:-80px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);transform:skewX(-20deg);animation:zs-glanz 4.5s ease-in-out infinite}
.zs-go:disabled{background:var(--sw-off-bg,#333338);border-color:var(--sw-off-bd,#44444a);color:#77777d;box-shadow:none;cursor:default}
.zs-go:disabled::after{display:none}
.zs-go:disabled .zs-kreis{background:#3d3d43;color:#77777d;box-shadow:none}
.zs-neben{height:64px;min-width:150px;border-radius:18px;border:1px solid var(--sw-off-bd,#44444a);background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);font-size:17px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:10px;cursor:pointer}
.zs-neben.weiter{background:linear-gradient(180deg,#4db36f,#2e8049);border-color:#5cc27e;color:#fff}
.zs-hinweis{color:var(--text-2,#a3a19a);font-size:14px;padding:12px;text-align:center}
@keyframes zs-spin{to{transform:rotate(360deg)}}
@keyframes zs-tropf{0%{transform:translateY(-3px);opacity:0}30%{opacity:1}100%{transform:translateY(4px);opacity:0}}
@keyframes zs-wisch{0%,100%{transform:translateX(-2px)}50%{transform:translateX(2px)}}
@keyframes zs-zieh{to{stroke-dashoffset:0}}
@keyframes zs-blitz{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes zs-wind{0%{transform:translateX(-3px);opacity:0}40%{opacity:1}100%{transform:translateX(3px);opacity:0}}
@keyframes zs-fahr{0%,100%{transform:translateX(-2px) rotate(-4deg)}50%{transform:translateX(2px) rotate(4deg)}}
@keyframes zs-puls{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes zs-glanz{0%,70%{transform:translateX(0) skewX(-20deg)}100%{transform:translateX(500px) skewX(-20deg)}}
.zs-fan{transform-box:view-box}
.zs-opt.an .zs-fan,.zs-status.an .zs-fan{animation:zs-spin var(--spd,1.4s) linear infinite}
.zs-opt.an .zs-drop{animation:zs-tropf 1.3s ease-in infinite}
.zs-opt.an .zs-pad{animation:zs-wisch 1.3s ease-in-out infinite}
.zs-opt.an .zs-wind{animation:zs-wind 1s ease-out infinite}
.zs-route{stroke-dasharray:120;stroke-dashoffset:0}
.zs-opt.an .zs-route{stroke-dashoffset:120;animation:zs-zieh 2.6s linear infinite}
.zs-schalter.an .zs-bolt{animation:zs-blitz 1.2s ease-in-out infinite}
.zs-status.an .zs-robo{transform-box:fill-box;transform-origin:center;animation:zs-fahr 1.6s ease-in-out infinite}
.zs-status .zs-chg{animation:zs-blitz 1.8s ease-in-out infinite}
.zh-dezent .zs *{animation-duration:6s!important}
.zh-still .zs *,.zh-still .zs::after,.zh-still .zs *::after{animation:none!important}
@media (prefers-reduced-motion:reduce){.zs *,.zs *::after{animation:none!important}}
`;

function ensureSaugerStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

const wait = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

export default class ZuhauseSauger extends (window.visRxWidget as typeof VisRxWidget)<SaugerRxData, SaugerState> {
    private watcher?: StateWatcher;
    private box = React.createRef<HTMLDivElement>();
    private zsResize?: ResizeObserver;
    private planUrl = '';
    private alive = true;
    private stepTimer?: ReturnType<typeof setTimeout>;
    /** order of the job this page started (the robot's list is used after a reload) */
    private job: number[] = [];
    /** written, not yet reported back by the robot */
    private pend: Ausstehend = {};
    /** writes go out one after the other (mode and mop wash area share one property) */
    private queue: Promise<void> = Promise.resolve();
    private debounce = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            zsWahl: [],
            zsDurch: 1,
            zsPlan: null,
            zsPlanFehler: '',
            zsVorbereitung: '',
            zsFort: -1,
            zsTick: 0,
            zsScale: 1,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseSauger',
            ...SET_INFO,
            visName: 'ZuhauseSauger',
            visWidgetLabel: 'sauger_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'titel', type: 'text', label: 'title', default: 'Saugroboter' },
                        { name: 'geraet', type: 'text', label: 'sauger_device', tooltip: 'sauger_device_tip' },
                        { name: 'svg', type: 'image', label: 'plan_svg', tooltip: 'sauger_svg_tip' },
                        { name: 'raeume', type: 'json', label: 'sauger_rooms', tooltip: 'sauger_rooms_tip' },
                        { name: 'linien', type: 'json', label: 'sauger_lines', tooltip: 'sauger_lines_tip' },
                        {
                            name: 'animationStufe',
                            type: 'select',
                            label: 'animation_level',
                            options: [
                                { value: 'voll', label: 'level_full' },
                                { value: 'dezent', label: 'level_subtle' },
                                { value: 'aus', label: 'level_off' },
                            ],
                            default: 'voll',
                        },
                        { name: 'nachtAus', type: 'checkbox', label: 'night_off', default: false },
                    ],
                },
            ],
            visDefaultStyle: { width: W, height: H },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-sauger.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseSauger.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        ensureSaugerStyles();
        this.watcher = new StateWatcher(this.props.context.socket, this.onValues);
        if (this.box.current && typeof ResizeObserver !== 'undefined') {
            this.zsResize = new ResizeObserver(() => this.measure());
            this.zsResize.observe(this.box.current);
        }
        this.measure();
        this.sync();
    }

    componentWillUnmount(): void {
        this.alive = false;
        this.watcher?.stop();
        this.zsResize?.disconnect();
        if (this.stepTimer) {
            clearTimeout(this.stepTimer);
        }
        this.debounce.forEach(t => clearTimeout(t));
        super.componentWillUnmount();
    }

    onRxDataChanged(): void {
        this.sync();
    }

    private measure(): void {
        const el = this.box.current;
        if (!el) {
            return;
        }
        const s = Math.min(el.clientWidth / W, el.clientHeight / H);
        if (s > 0 && Number.isFinite(s) && Math.abs(s - this.state.zsScale) > 0.001) {
            this.setState({ zsScale: s });
        }
    }

    /** JSON fields raw from the project (VIS-2 replaces "{…}" in text attributes as a binding) */
    private rawField(name: 'raeume' | 'linien'): unknown {
        const views = this.props.context.views as unknown as Record<
            string,
            { widgets?: Record<string, { data?: Record<string, unknown> }> } | undefined
        >;
        const raw = views[this.props.view]?.widgets?.[this.props.id]?.data?.[name];
        return raw !== undefined ? raw : this.state.rxData[name];
    }

    private ids(): SaugerIds | null {
        return saugerIds(this.state.rxData.geraet);
    }

    private sync(): void {
        const ids = this.ids();
        void this.watcher?.watch(ids ? Object.values(ids) : []);
        const path = this.state.rxData.svg;
        const url = path ? resolveImage(path, this.props.context.projectName) : '';
        if (url === this.planUrl) {
            return;
        }
        this.planUrl = url;
        if (!url) {
            this.setState({ zsPlan: null, zsPlanFehler: '' });
            return;
        }
        loadPlanLayers(url)
            .then(plan => this.alive && this.planUrl === url && this.setState({ zsPlan: plan, zsPlanFehler: '' }))
            .catch(
                (e: Error) =>
                    this.alive && this.planUrl === url && this.setState({ zsPlan: null, zsPlanFehler: e.message }),
            );
    }

    private onValues = (): void => {
        if (!this.alive) {
            return;
        }
        const ids = this.ids();
        const val = this.val;
        if (ids) {
            const running = laeuft(val(ids.aufgabe));
            if (!running && this.state.zsFort !== -1 && !this.state.zsVorbereitung) {
                this.job = [];
                this.setState({ zsFort: -1 });
            } else if (running) {
                const order = this.reihenfolge(ids);
                const f = fortschritt(order, val(ids.raumJetzt), val(ids.zustand), this.state.zsFort);
                if (f !== this.state.zsFort) {
                    this.setState({ zsFort: f });
                }
            }
        }
        this.setState(s => ({ zsTick: s.zsTick + 1 }));
    };

    private val = (id: string): unknown => this.watcher?.val(id);

    private reihenfolge(ids: SaugerIds): number[] {
        const robot = aktiveRaeume(this.val(ids.aktiveRaeume));
        return this.job.length ? this.job : robot;
    }

    private einst(ids: SaugerIds): Einstellung {
        return { ...anzeigen(ausRoboter(this.val, ids), this.pend, Date.now()), durchgaenge: this.state.zsDurch };
    }

    /**
     * A change goes to the robot at once (slider and stepper after a short pause). Until the robot reports
     * the new value the page shows it; afterwards the page follows the robot again, also changes in the app.
     */
    private aendern(ids: SaugerIds, f: (e: Einstellung) => Partial<Einstellung>, delayMs = 0): void {
        if (this.props.editMode) {
            return;
        }
        const e = this.einst(ids);
        const patch = f(e);
        const now = Date.now();
        for (const [k, v] of Object.entries(patch) as [keyof Einstellung, Einstellung[keyof Einstellung]][]) {
            this.pend[k] = { v, t: now };
        }
        this.setState(st => ({ zsTick: st.zsTick + 1 }));
        for (const w of vorbereiten({ ...e, ...patch }, e, ids)) {
            const go = (): void => this.enqueue(w.id, w.value, Object.keys(patch) as (keyof Einstellung)[]);
            const old = this.debounce.get(w.id);
            if (old) {
                clearTimeout(old);
            }
            if (delayMs) {
                this.debounce.set(
                    w.id,
                    setTimeout(() => {
                        this.debounce.delete(w.id);
                        go();
                    }, delayMs),
                );
            } else {
                go();
            }
        }
    }

    private enqueue(id: string, value: number | string, keys: (keyof Einstellung)[]): void {
        this.queue = this.queue.then(async () => {
            if (!this.alive) {
                return;
            }
            // the wait for the robot's answer starts when the value really goes out
            for (const k of keys) {
                if (this.pend[k]) {
                    this.pend[k].t = Date.now();
                }
            }
            this.set(id, value);
            await wait(WRITE_GAP_MS);
        });
    }

    private toggleRaum(id: number): void {
        if (this.props.editMode) {
            return;
        }
        const w = this.state.zsWahl;
        this.setState({ zsWahl: w.includes(id) ? w.filter(x => x !== id) : [...w, id] });
    }

    private set(id: string, value: unknown): void {
        if (!this.props.editMode) {
            this.props.context.setValue(id, value as ioBroker.StateValue);
        }
    }

    private async starten(ids: SaugerIds): Promise<void> {
        const wunsch = { ...this.einst(ids), durchgaenge: this.state.zsDurch };
        const raeume = [...this.state.zsWahl];
        if (!raeume.length || this.props.editMode) {
            return;
        }
        // pending slider/stepper changes first, then whatever still differs
        for (const [id, t] of this.debounce) {
            clearTimeout(t);
            this.debounce.delete(id);
        }
        this.setState({ zsVorbereitung: 'Einstellungen werden übertragen …', zsFort: -1 });
        await this.queue;
        const writes = vorbereiten(wunsch, ausRoboter(this.val, ids), ids);
        this.job = raeume;
        this.setState({
            zsVorbereitung: writes.length ? 'Einstellungen werden übertragen …' : 'Startet …',
            zsFort: -1,
        });
        for (const w of writes) {
            this.set(w.id, w.value);
            await wait(WRITE_GAP_MS);
            if (!this.alive) {
                return;
            }
        }
        this.set(ids.start, startBefehl(raeume, wunsch));
        // until the robot reports the job; the settings now follow the robot again
        this.setState({ zsWahl: [], zsVorbereitung: 'Startet …' });
        this.stepTimer = setTimeout(() => this.alive && this.setState({ zsVorbereitung: '' }), 8000);
    }

    private stoppen(ids: SaugerIds): void {
        this.set(ids.stopp, true);
        this.stepTimer = setTimeout(() => this.set(ids.basis, true), WRITE_GAP_MS);
    }

    // ---------------------------------------------------------------- render

    private renderPlan(
        raeume: SaugerRaum[],
        wahl: number[],
        jetzt: number | null,
        gesperrt: boolean,
    ): React.JSX.Element {
        const plan = this.state.zsPlan;
        const linien = parseLinien(this.rawField('linien'));
        if (!plan) {
            // without a plan: room tiles
            return (
                <div className="zs-kacheln">
                    {raeume.map(r => {
                        const pos = wahl.indexOf(r.id);
                        return (
                            <button
                                key={r.id}
                                type="button"
                                className={`zs-opt${pos >= 0 ? ' an' : ''}`}
                                style={{ height: 'auto', fontSize: 15 }}
                                onClick={() => !gesperrt && this.toggleRaum(r.id)}
                            >
                                {pos >= 0 ? `${pos + 1} · ` : ''}
                                {r.name}
                            </button>
                        );
                    })}
                    {this.state.zsPlanFehler ? <div className="zs-hinweis">Plan: {this.state.zsPlanFehler}</div> : null}
                </div>
            );
        }
        const vb = plan.viewBox;
        return (
            <svg
                viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                preserveAspectRatio="xMidYMid meet"
            >
                {/* plan background and room fills (sanitized markup of the project file) */}
                <g dangerouslySetInnerHTML={{ __html: plan.below }} />
                {raeume.map(r => (
                    <g
                        key={r.id}
                        className={['zs-raum', wahl.includes(r.id) ? 'an' : '', jetzt === r.id ? 'putzt' : ''].join(
                            ' ',
                        )}
                        onClick={() => !gesperrt && this.toggleRaum(r.id)}
                    >
                        {r.flaechen.map(f => (
                            <polygon
                                key={f}
                                points={f}
                            />
                        ))}
                    </g>
                ))}
                <g
                    className="zs-deko"
                    dangerouslySetInnerHTML={{ __html: plan.above }}
                />
                <g className="zs-deko">
                    {linien.map(([x1, y1, x2, y2]) => (
                        <line
                            key={`${x1},${y1},${x2},${y2}`}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="#55555c"
                            strokeWidth={2}
                            strokeDasharray="7 7"
                        />
                    ))}
                </g>
                {raeume.map(r => {
                    const { x, y } = labelPos(r);
                    const pos = wahl.indexOf(r.id);
                    const k = !!r.klein;
                    const ny = y - (k ? 8 : 12);
                    return (
                        <g key={r.id}>
                            <text
                                className={`zs-txt${k ? ' klein' : ''}${pos >= 0 ? ' an' : ''}`}
                                x={x}
                                y={y + (k ? 16 : 22)}
                            >
                                {r.name}
                            </text>
                            {pos >= 0 ? (
                                <g className="zs-nr">
                                    <circle
                                        cx={x}
                                        cy={ny}
                                        r={k ? 14 : 18}
                                    />
                                    <text
                                        x={x}
                                        y={ny}
                                    >
                                        {pos + 1}
                                    </text>
                                </g>
                            ) : null}
                        </g>
                    );
                })}
            </svg>
        );
    }

    private renderWasser(ids: SaugerIds, e: Einstellung): React.JSX.Element {
        const anteile = skalaAnteile();
        const f = (e.wasser - WASSER_MIN) / (WASSER_MAX - WASSER_MIN);
        const x = `calc(22px + (100% - 44px) * ${f})`;
        const stufe = wasserStufe(e.wasser);
        // track: top padding 4 + scale ~34 + 8; middle of the 24 px track
        const top = 4 + 34 + 8 + 12;
        return (
            <div className="zs-regler">
                <div className="zs-skala">
                    {WASSER_STUFEN.map((s, i) => (
                        <span
                            key={s.key}
                            className={s.key === stufe ? 'an' : ''}
                            style={{ flex: `${anteile[i]} ${anteile[i]} ${i === 0 || i === 3 ? 22 : 0}px`, height: 34 }}
                        >
                            {STUFE_TEXT[s.key]}
                            <small>
                                {s.von}–{s.bis}
                            </small>
                        </span>
                    ))}
                </div>
                <div className="zs-spur">
                    {WASSER_STUFEN.map((s, i) => (
                        <i
                            key={s.key}
                            style={{
                                flex: `${anteile[i]} ${anteile[i]} ${i === 0 || i === 3 ? 22 : 0}px`,
                                background: `rgba(74,163,255,${[0.14, 0.22, 0.32, 0.44][i]})`,
                            }}
                        />
                    ))}
                </div>
                <div
                    className="zs-fuell"
                    style={{ top: top - 9.5, width: `calc(${x} - 3.5px)` }}
                />
                <div
                    className="zs-knauf"
                    style={{ top: top - 22, left: x }}
                >
                    {e.wasser}
                </div>
                <input
                    type="range"
                    className="zs-range"
                    min={WASSER_MIN}
                    max={WASSER_MAX}
                    step={1}
                    value={e.wasser}
                    aria-label="Wasserintensität"
                    style={{ top: top - 22 }}
                    onChange={ev => this.aendern(ids, () => ({ wasser: Number(ev.target.value) }), 700)}
                />
            </div>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const ids = this.ids();
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date());
        const { raeume, fehler } = parseRaeume(this.rawField('raeume'));
        if (!ids) {
            return (
                <div
                    ref={this.box}
                    className="zs-hinweis"
                    style={{ width: '100%', height: '100%' }}
                >
                    Saugroboter: Gerätepfad eintragen, z. B. dreamehome.0.&lt;Geräte-ID&gt;
                </div>
            );
        }
        const val = this.val;
        const e = this.einst(ids);
        const running = laeuft(val(ids.aufgabe)) || !!this.state.zsVorbereitung;
        const paused = pausiert(val(ids.aufgabe), val(ids.zustand), val(ids.status));
        const order = this.reihenfolge(ids);
        const fort = this.state.zsFort;
        const jetzt = running && fort >= 0 ? order[fort] : null;
        const name = (id: number): string => raeume.find(r => r.id === id)?.name ?? `Raum ${id}`;
        const wahl = this.state.zsWahl;
        const zustand = text(val(ids.zustand));
        const status = text(val(ids.status));
        const akku = Number(val(ids.akku));
        const statusText = this.state.zsVorbereitung || [zustand, status].filter(Boolean).join(' · ') || '–';

        const opt = (
            an: boolean,
            onClick: () => void,
            icon: string,
            text: string,
            key: string,
            spd?: number,
        ): React.JSX.Element => (
            <button
                key={key}
                type="button"
                className={`zs-opt${an ? ' an' : ''}`}
                aria-pressed={an}
                style={spd ? ({ '--spd': `${spd}s` } as React.CSSProperties) : undefined}
                onClick={onClick}
            >
                <Ic d={icon} />
                {text}
            </button>
        );

        const zus: React.ReactNode = running ? (
            paused ? (
                <>
                    <b>Pausiert</b> · {zustand}
                </>
            ) : (
                <>
                    <b>{this.state.zsVorbereitung || zustand || 'Läuft'}</b>
                    {order.length && jetzt !== null ? ` · ${name(jetzt)} · Raum ${fort + 1} von ${order.length}` : ''}
                </>
            )
        ) : wahl.length ? (
            [
                MODUS_TEXT[e.modus],
                saugt(e.modus) ? SAUG_TEXT[e.saug] + (e.max ? ' + Max' : '') : '',
                wischt(e.modus) ? `Wasser ${e.wasser} (${STUFE_TEXT[wasserStufe(e.wasser)]}) · alle ${e.m2} m²` : '',
                `Route ${ROUTE_TEXT[e.route]}`,
                this.state.zsDurch > 1 ? `${this.state.zsDurch} Durchgänge` : '',
            ]
                .filter(Boolean)
                .join(' · ')
        ) : (
            'Kein Raum gewählt – Räume im Plan antippen, die Zahl zeigt die Reihenfolge'
        );

        return (
            <div
                ref={this.box}
                className={levelClass}
                style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
            >
                <div
                    className="zs"
                    style={{ transform: `scale(${this.state.zsScale})` }}
                >
                    <header className="zs-kopf">
                        <h1>{d.titel || 'Saugroboter'}</h1>
                        <div className={`zs-status${running && !paused ? ' an' : ''}`}>
                            <Ic
                                d={running ? ICON.robo : ICON.basis}
                                size={26}
                            />
                            <span>{statusText}</span>
                        </div>
                        {Number.isFinite(akku) ? (
                            <div className="zs-akku">
                                <Ic
                                    d={ICON.akku}
                                    size={24}
                                />
                                <b>{akku}</b> %
                            </div>
                        ) : null}
                    </header>

                    <section
                        className="zs-karte"
                        style={{ flex: 1 }}
                    >
                        <h2>
                            Räume
                            <span className="zs-wert">
                                {running
                                    ? `${order.length} im Auftrag`
                                    : wahl.length
                                      ? `${wahl.length} gewählt`
                                      : 'im Plan antippen · Zahl = Reihenfolge'}
                            </span>
                        </h2>
                        <div className="zs-plan">{this.renderPlan(raeume, running ? order : wahl, jetzt, running)}</div>
                        {fehler.length ? <div className="zs-hinweis">{fehler.join(' · ')}</div> : null}
                        <div className="zs-trenn" />
                        <div className={`zs-zeile${running ? ' zs-gesperrt' : ''}`}>
                            <span className="lbl">Durchgänge</span>
                            <div className="zs-seg">
                                {[1, 2, 3].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        className={this.state.zsDurch === n ? 'an' : ''}
                                        onClick={() => this.setState({ zsDurch: n })}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className={`zs-rechts${running ? ' zs-gesperrt' : ''}`}>
                        <div className="zs-karte">
                            <h2>Reinigungsmodus</h2>
                            <div className="zs-wahl">
                                {MODI.map(m =>
                                    opt(
                                        e.modus === m,
                                        () => this.aendern(ids, () => ({ modus: m })),
                                        ICON[m],
                                        MODUS_TEXT[m],
                                        m,
                                    ),
                                )}
                            </div>
                        </div>
                        <div className={`zs-karte${saugt(e.modus) ? '' : ' aus'}`}>
                            <h2>
                                Absaugleistung
                                <button
                                    type="button"
                                    className={`zs-schalter${e.max ? ' an' : ''}`}
                                    aria-pressed={e.max}
                                    onClick={() => this.aendern(ids, x => ({ max: !x.max }))}
                                >
                                    <Ic
                                        d={ICON.bolt}
                                        size={20}
                                    />
                                    Max-Saugleistung
                                    <span className="zs-bahn" />
                                </button>
                            </h2>
                            <div className="zs-wahl">
                                {SAUGSTUFEN.map(n =>
                                    opt(
                                        e.saug === n,
                                        () => this.aendern(ids, () => ({ saug: n })),
                                        saugIcon(n + 1),
                                        SAUG_TEXT[n],
                                        `s${n}`,
                                        [2.4, 1.4, 0.8, 0.45][n],
                                    ),
                                )}
                            </div>
                        </div>
                        <div className={`zs-karte${wischt(e.modus) ? '' : ' aus'}`}>
                            <h2>
                                Wasserintensität
                                <span className="zs-wert">
                                    {e.wasser} · {STUFE_TEXT[wasserStufe(e.wasser)]}
                                </span>
                            </h2>
                            {this.renderWasser(ids, e)}
                            <div className="zs-trenn" />
                            <div className="zs-zeile">
                                <span className="lbl">Mopps waschen alle</span>
                                <div className="zs-stepper">
                                    <button
                                        type="button"
                                        disabled={e.m2 <= M2_MIN}
                                        onClick={() =>
                                            this.aendern(ids, x => ({ m2: Math.max(M2_MIN, x.m2 - 1) }), 900)
                                        }
                                    >
                                        –
                                    </button>
                                    <output>{e.m2} m²</output>
                                    <button
                                        type="button"
                                        disabled={e.m2 >= M2_MAX}
                                        onClick={() =>
                                            this.aendern(ids, x => ({ m2: Math.min(M2_MAX, x.m2 + 1) }), 900)
                                        }
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="zs-karte">
                            <h2>Route</h2>
                            <div className="zs-wahl">
                                {ROUTEN.map(r =>
                                    opt(
                                        e.route === r,
                                        () => this.aendern(ids, () => ({ route: r })),
                                        routeIcon(r),
                                        ROUTE_TEXT[r],
                                        `r${r}`,
                                    ),
                                )}
                            </div>
                        </div>
                    </section>

                    <footer className="zs-leiste">
                        <div className="zs-zus">{zus}</div>
                        {running ? (
                            <>
                                {order.length ? (
                                    <div className="zs-fort">
                                        {order.map((id, i) => (
                                            <i
                                                key={id}
                                                className={i < fort ? 'fertig' : i === fort ? 'jetzt' : ''}
                                            />
                                        ))}
                                    </div>
                                ) : null}
                                <button
                                    type="button"
                                    className={`zs-neben${paused ? ' weiter' : ''}`}
                                    disabled={!!this.state.zsVorbereitung}
                                    onClick={() => this.set(paused ? ids.weiter : ids.pause, true)}
                                >
                                    <Ic
                                        d={paused ? ICON.play : ICON.pause}
                                        size={22}
                                    />
                                    {paused ? 'Fortsetzen' : 'Pause'}
                                </button>
                                <button
                                    type="button"
                                    className="zs-stopp"
                                    onClick={() => this.stoppen(ids)}
                                >
                                    <span className="zs-kreis">
                                        <Ic
                                            d={ICON.quadrat}
                                            size={18}
                                        />
                                    </span>
                                    <span className="zs-btxt">
                                        <b>Stopp</b>
                                        <small>und zurück zur Basis</small>
                                    </span>
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="zs-go"
                                disabled={!wahl.length || this.props.editMode}
                                onClick={() => void this.starten(ids)}
                            >
                                <span className="zs-kreis">
                                    <Ic
                                        d={ICON.play}
                                        size={22}
                                    />
                                </span>
                                <span className="zs-btxt">
                                    <b>Reinigung starten</b>
                                    <small>
                                        {wahl.length
                                            ? `${wahl.length} ${wahl.length === 1 ? 'Raum' : 'Räume'} · ${wahl.map(name).join(' → ')}`
                                            : 'erst Räume im Plan antippen'}
                                    </small>
                                </span>
                            </button>
                        )}
                    </footer>
                </div>
            </div>
        );
    }
}
