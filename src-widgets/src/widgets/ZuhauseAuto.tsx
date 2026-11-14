/*
 * VIS-2 widget "Auto": detail page of one car for the adapter ioBroker.mobility (1050 × 575, scaled to the box).
 * Layout decided 13.11.2026 (sketch v3), the same frame for both cars:
 * - head: back to the start page, name, model, data time, warnings in words
 * - top row: level ring with values | condition (car from above with tyres, status list) | fuel stations
 * - bottom: evaluation over the full width
 * Fuel car (this file, first): price history 7 days of both stations, average price per hour ("Wann tanken?"),
 * km per week with the share of long trips. The electric car follows.
 * Names of stations and the car come from the adapter states; nothing private is in the code.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { CountUp, WARN_PATH } from '../components/Fahrzeug';
import { WallboxRow, ensureWallboxStyles } from '../components/Wallbox';
import {
    DAY_MS,
    WEEK_MS,
    bar,
    boldParts,
    chargedPeriods,
    costMonths,
    homePrice,
    monthLabel,
    parseEasee,
    parseFordWeeks,
    plugText,
    closedSpans,
    dropWanted,
    combineProfiles,
    dateTime,
    fuelTip,
    hourBars,
    lowest,
    modelLine,
    parseProfile,
    parseSeries,
    parseWeeks,
    periodLabel,
    priceParts,
    priceRange,
    refill,
    stepPath,
    town,
    weekSummary,
    xOf,
    yOf,
    type EaseePeriod,
    type FordWeek,
    type PricePoint,
    type Scale,
} from '../lib/autoseite';
import {
    WARN_SYMBOL,
    clock,
    driveOf,
    fullAt,
    isPluggedIn,
    lastSessionKwh,
    num,
    parseWarnings,
    text,
    wallboxPhase,
    warningText,
    type WallboxPhase,
    type Warning,
} from '../lib/fahrzeuge';
import type { Snapshot } from '../lib/watch';
import { formatNumber } from '../lib/model';
import { ensureStyles, fonts } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass, requestTab } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const W = 1050;
const H = 575;
const STYLE_ID = 'zh-auto-styles';
const FUEL = '#e8a33d';
const FUEL_2 = '#b9c3d6';

const CAR_DP = [
    'name',
    'model',
    'engineType',
    'lastUpdate',
    'fuelLevel',
    'fuelRange',
    'soc',
    'evRange',
    'odometer',
    'battery12v',
    'battery12vVoltage',
    'oilLife',
    'outsideTemp',
    'alarm',
    'locked',
    'doorsClosed',
    'windowsClosed',
    'tires.frontLeft',
    'tires.frontRight',
    'tires.rearLeft',
    'tires.rearRight',
    'warnings',
    'tankCapacity',
    'history.weeks',
    'evMaxRange',
    'energyRemaining',
    'batteryCapacity',
    'batteryTemp',
    'timeToFull',
    'plugStatus',
    'chargeStatus',
    'chargePower',
    'history.energyConsumption',
    'history.days',
    'history.months',
] as const;
type CarDp = (typeof CAR_DP)[number];

const STATION_DP = [
    'name',
    'address',
    'e10',
    'open',
    'rating',
    'lastUpdate',
    'hourProfile',
    'history7d',
    'min7d',
    'max7d',
    'avg7d',
] as const;
type StationDp = (typeof STATION_DP)[number];

const CHARGER_DP = [
    'name',
    'online',
    'opMode',
    'carConnected',
    'charging',
    'power',
    'sessionEnergy',
    'reasonText',
    'charge',
    'lifetimeEnergy',
    'history.lastSession',
] as const;
type ChargerDp = (typeof CHARGER_DP)[number];

const EASEE_DP = [
    'history.days',
    'history.weeks',
    'history.months',
    'history.yearCost',
    'history.yearEnergy',
    'history.lastSession',
] as const;
type EaseeDp = (typeof EASEE_DP)[number];

const EV = '#6fe08a';
const AWAY = '#4aa3ff';
const COLD = '#7fb6ff';

const WHEELS = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const;

const CSS = `
.za{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;font-family:${fonts.text};color:var(--text,#ece9e1)}
.za *{box-sizing:border-box}
.za-karte{position:absolute;background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);border-radius:var(--radius-card,18px);padding:12px 14px}
.za-titel{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
.za-titel .r{margin-left:auto;font-size:11px;color:var(--text-2,#a3a19a);font-weight:500;white-space:nowrap}
.za-kopf{position:absolute;left:16px;right:16px;top:12px;height:44px;display:flex;align-items:center;gap:12px}
.za-zurueck{height:40px;padding:0 14px 0 10px;border-radius:12px;background:var(--sw-off-bg,#333338);border:1px solid var(--sw-off-bd,#44444a);color:var(--sw-off-fg,#cfccc3);font:600 13px ${fonts.text};display:flex;align-items:center;gap:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.za-zurueck:active{transform:scale(.97)}
.za-kopf h1{font-size:22px;font-weight:700;display:flex;align-items:center;gap:8px;margin:0;white-space:nowrap}
.za-kopf h1 i{width:10px;height:10px;border-radius:50%}
.za-modell{font-size:12px;color:var(--text-2,#a3a19a);white-space:nowrap}
.za-meldungen{margin-left:auto;display:flex;gap:6px;min-width:0;overflow:hidden}
.za-meldung{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px 0 6px;border-radius:10px;border:1px solid;font-size:12px;font-weight:600;white-space:nowrap}
.za-meldung svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:none}
.za-meldung.critical{color:var(--warn-fg,#ffb3b3);background:var(--warn-bg,#3a1d1f);border-color:var(--warn-bd,#e5484d);animation:za-rotpuls 1.6s ease-in-out infinite}
.za-meldung.warning{color:#ffd98a;background:#3a3014;border-color:#8f7330}
.za-meldung.info{color:#b9b7b0;background:#333338;border-color:#44444a}
.za-meldung.ok{color:var(--st-on-fg,#9fe0b2);background:var(--st-on-bg,#183323);border-color:var(--st-on-bd,#3f8f57)}
@keyframes za-rotpuls{50%{box-shadow:0 0 0 3px rgba(229,72,77,.25)}}
.za-tank{left:16px;top:66px;width:400px;height:176px;display:flex;gap:16px;align-items:center}
.za-ring{position:relative;width:142px;height:142px;flex:none}
.za-ring>svg{width:142px;height:142px;transform:rotate(-90deg)}
.za-ring .bahn{fill:none;stroke:#3a3a40;stroke-width:11}
.za-ring .fuell{fill:none;stroke-width:11;stroke-linecap:round;transition:stroke-dasharray 1.6s cubic-bezier(.2,.8,.2,1),stroke .4s}
.za-ring .mitte{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.za-ring .pz{font-family:${fonts.numbers};font-weight:600;font-size:36px;line-height:1}
.za-ring .pz small{font-size:18px}
.za-ring .sub{font-size:11px;color:var(--text-2,#a3a19a);margin-top:2px}
.za-tropfen{position:absolute;left:64px;top:-6px;width:14px;height:18px;opacity:0;animation:za-tropf 3.2s ease-in 1.6s infinite}
@keyframes za-tropf{0%{transform:translateY(0);opacity:0}10%{opacity:1}40%{transform:translateY(34px);opacity:0}100%{opacity:0}}
.za-werte{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
.za-werte>div{font-size:10.5px;color:var(--text-2,#a3a19a);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.za-werte b{display:block;font-family:${fonts.numbers};font-weight:600;font-size:22px;line-height:1.1;color:var(--text,#ece9e1);text-transform:none;letter-spacing:0}
.za-werte b small{font-size:13px;color:var(--text-2,#a3a19a)}
.za-werte b.gelb{color:#ffd98a}
.za-werte b.rot{color:var(--warn-fg,#ffb3b3)}
.za-zustand{left:428px;top:66px;width:300px;height:176px;display:flex;gap:12px}
.za-mini{position:relative;width:118px;height:150px;flex:none}
.za-mini svg{position:absolute;left:34px;top:6px;width:50px;height:138px;overflow:visible}
.za-mini .rumpf{fill:#323238;stroke:#5a5a62;stroke-width:2.5;stroke-dasharray:1;stroke-dashoffset:1;animation:za-ziehen 1.4s ease forwards}
.za-mini .glas{fill:#262629;stroke:#4a4a52;stroke-width:1.5}
.za-mini .rad{fill:#1d1d20;stroke:#5a5a62;stroke-width:1.5}
.za-mini .rad.rot{stroke:var(--warn-bd,#e5484d)}
.za-mini .schloss{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.za-rd{position:absolute;font-family:${fonts.numbers};font-weight:600;font-size:14px;color:var(--st-on-fg,#9fe0b2)}
.za-rd.rot{color:var(--warn-fg,#ffb3b3)}
.za-rd.gelb{color:#ffd98a}
@keyframes za-ziehen{to{stroke-dashoffset:0}}
.za-status{flex:1;display:grid;gap:4px;align-content:start}
.za-st{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-2,#a3a19a);opacity:0;transform:translateX(8px);animation:za-rein .4s forwards}
.za-st b{margin-left:auto;font-weight:600}
.za-st i{width:8px;height:8px;border-radius:50%;flex:none}
.za-st.ok i{background:var(--st-led,#6fe08a)}.za-st.ok b{color:var(--st-on-fg,#9fe0b2)}
.za-st.gelb i{background:var(--sw-on,#f2c14e)}.za-st.gelb b{color:#ffd98a}
.za-st.rot i{background:var(--warn-bd,#e5484d)}.za-st.rot b{color:var(--warn-fg,#ffb3b3)}
.za-st.grau i{background:#55555c}.za-st.grau b{color:var(--text-2,#a3a19a)}
@keyframes za-rein{to{opacity:1;transform:none}}
.za-tanken{left:740px;top:66px;width:294px;height:176px}
.za-ts{display:flex;align-items:center;gap:9px;margin-top:7px;padding:5px 8px;border-radius:11px;border:1px solid var(--border,#36363b);transition:all .4s}
.za-ts.best{background:var(--st-on-bg,#183323);border-color:var(--st-on-bd,#3f8f57);animation:za-bestpuls 2.4s ease-in-out infinite}
@keyframes za-bestpuls{50%{box-shadow:0 0 0 3px rgba(111,224,138,.15)}}
.za-ts .logo{width:30px;height:30px;border-radius:8px;background:#3a3a40;display:flex;align-items:center;justify-content:center;flex:none;color:var(--text-2,#a3a19a)}
.za-ts.best .logo{background:#21482f;color:var(--st-led,#6fe08a)}
.za-ts .logo svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.za-ts .txt{flex:1;min-width:0}
.za-ts .txt b{font-size:12.5px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.za-ts .txt span{font-size:10.5px;color:var(--text-2,#a3a19a);white-space:nowrap}
.za-ts .preis{text-align:right}
.za-ts .preis b{font-family:${fonts.numbers};font-weight:600;font-size:21px;line-height:1;display:block}
.za-ts .preis b sup{font-size:12px;vertical-align:top}
.za-ts .preis span{font-size:9.5px;font-weight:700;border-radius:5px;padding:1px 5px;border:1px solid;display:inline-block;margin-top:2px}
.za-r-cheap{color:var(--st-on-fg,#9fe0b2);border-color:var(--st-on-bd,#3f8f57);background:var(--st-on-bg,#183323)}
.za-r-normal,.za-r-unknown{color:#cfccc3;border-color:#55555c;background:#333338}
.za-r-expensive{color:var(--warn-fg,#ffb3b3);border-color:var(--warn-bd,#e5484d);background:var(--warn-bg,#3a1d1f)}
.za-r-zu{color:#8a8890;border-color:#44444a;background:#2f2f34}
.za-tipp{margin-top:8px;font-size:11px;white-space:nowrap;color:var(--text-2,#a3a19a);display:flex;gap:6px;align-items:center;overflow:hidden}
.za-tipp b{color:var(--text,#ece9e1)}
.za-tipp svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;flex:none}
.za-auswertung{left:16px;top:254px;width:1018px;height:305px}
.za-echt{font-size:9.5px;color:var(--st-on-fg,#9fe0b2);border:1px solid var(--st-on-bd,#3f8f57);border-radius:4px;padding:0 5px;font-weight:600}
.za-sammelt{font-size:9.5px;color:#ffd98a;border:1px dashed #8f7330;border-radius:4px;padding:0 5px;font-weight:600}
.za-drei{display:grid;grid-template-columns:1.5fr 1.1fr .8fr;gap:16px;margin-top:10px;height:250px}
.za-feld{border:1px solid var(--border,#36363b);border-radius:12px;padding:10px 12px;position:relative;overflow:hidden;min-width:0}
.za-feld h3{font-size:12.5px;font-weight:600;display:flex;gap:8px;align-items:center;margin:0;white-space:nowrap}
.za-feld h3 .r{margin-left:auto;font-size:10.5px;color:var(--text-2,#a3a19a);font-weight:500}
.za-gross{font-family:${fonts.numbers};font-weight:600;font-size:24px;line-height:1;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.za-gross small{font-family:${fonts.text};font-size:12px;color:var(--text-2,#a3a19a);font-weight:500}
.za-leer{display:flex;align-items:center;justify-content:center;height:150px;color:var(--text-2,#a3a19a);font-size:12px;text-align:center;line-height:1.5}
.za-verlauf{height:150px;margin-top:8px;position:relative}
.za-verlauf svg{width:100%;height:100%;overflow:visible}
.za-verlauf .l1{fill:none;stroke:${FUEL};stroke-width:1.8;stroke-linejoin:round}
.za-verlauf .l2{fill:none;stroke:${FUEL_2};stroke-width:1.3;stroke-linejoin:round;opacity:.8}
.za-verlauf .zieh{stroke-dasharray:1;stroke-dashoffset:1;animation:za-ziehen 2.4s .3s ease forwards}
.za-verlauf .nacht{fill:#252528}
.za-verlauf .gitter{stroke:#3a3a40;stroke-width:1;stroke-dasharray:2 4}
.za-verlauf text{font:9.5px ${fonts.text};fill:var(--text-2,#a3a19a)}
.za-verlauf .tief{fill:var(--st-led,#6fe08a)}
.za-verlauf .tief-ring{fill:none;stroke:var(--st-led,#6fe08a);stroke-width:1.5;animation:za-welle 2s ease-out 2.6s infinite;transform-box:fill-box;transform-origin:center;opacity:0}
@keyframes za-welle{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.4);opacity:0}}
.za-leg{display:flex;gap:12px;font-size:10.5px;color:var(--text-2,#a3a19a);margin-top:6px;white-space:nowrap}
.za-leg i{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}
.za-stunden{display:flex;align-items:flex-end;gap:3px;height:126px;margin-top:10px;padding-bottom:16px}
.za-stunden .h{flex:1;position:relative;height:100%;display:flex;align-items:flex-end}
.za-stunden .h>div{width:100%;border-radius:3px 3px 0 0;background:#55555c;transition:height .9s cubic-bezier(.2,.8,.2,1)}
.za-stunden .h.gut>div{background:var(--st-led,#6fe08a)}
.za-stunden .h.teuer>div{background:var(--warn-bd,#e5484d);opacity:.75}
.za-stunden .h label{position:absolute;bottom:-15px;left:-4px;right:-4px;text-align:center;font-size:9px;color:var(--text-2,#a3a19a)}
.za-stunden .h.jetzt::after{content:'';position:absolute;left:50%;top:-8px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--sw-on,#f2c14e);animation:za-rotpuls 1.6s infinite}
.za-km{display:flex;align-items:flex-end;gap:8px;height:118px;margin-top:12px;padding-bottom:16px}
.za-km .w{flex:1;position:relative;height:100%;display:flex;flex-direction:column-reverse}
.za-km .w>div{transition:height 1s cubic-bezier(.2,.8,.2,1)}
.za-km .w .k{background:${FUEL};opacity:.55;border-radius:0 0 3px 3px}
.za-km .w .lang{background:${FUEL};border-radius:3px 3px 0 0}
.za-km .w label{position:absolute;bottom:-15px;left:0;right:0;text-align:center;font-size:9.5px;color:var(--text-2,#a3a19a)}
.za-laden{left:740px;top:66px;width:294px;height:176px;display:flex;flex-direction:column}
.za-laden .zf-wb{margin-top:8px}
.za-letzte{margin-top:auto;border-top:1px solid var(--border,#36363b);padding-top:7px;display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-2,#a3a19a)}
.za-letzte b{color:var(--text,#ece9e1);font-family:${fonts.numbers};font-weight:600;font-size:13px}
.za-ring .glanz{fill:none;stroke:rgba(255,255,255,.5);stroke-width:3;stroke-linecap:round;stroke-dasharray:10 367;animation:za-glanz 2.4s linear infinite}
@keyframes za-glanz{to{stroke-dashoffset:-377}}
.za-balken{display:flex;align-items:flex-end;gap:8px;height:128px;margin-top:12px;padding-bottom:16px}
.za-balken .w{flex:1;position:relative;height:100%;display:flex;flex-direction:column-reverse}
.za-balken .w>div{transition:height 1s cubic-bezier(.2,.8,.2,1)}
.za-balken .w .home{background:${EV};border-radius:0 0 3px 3px;opacity:.9}
.za-balken .w .away{background:${AWAY};border-radius:3px 3px 0 0}
.za-balken .w .home:last-child{border-radius:3px}
.za-balken .w label{position:absolute;bottom:-15px;left:0;right:0;text-align:center;font-size:9.5px;color:var(--text-2,#a3a19a)}
.za-kurven{height:140px;margin-top:10px;position:relative}
.za-kurven svg{width:100%;height:100%;overflow:visible}
.za-kurven .k1{fill:none;stroke:${EV};stroke-width:2;stroke-linejoin:round}
.za-kurven .k2{fill:none;stroke:${COLD};stroke-width:1.5;stroke-dasharray:3 4}
.za-kurven .fl{fill:rgba(111,224,138,.12)}
.za-kurven text{font:9.5px ${fonts.text};fill:var(--text-2,#a3a19a)}
.za-monate{display:flex;align-items:flex-end;gap:10px;height:118px;margin-top:22px;padding-bottom:16px}
.za-monate .m{flex:1;position:relative;height:100%;display:flex;align-items:flex-end}
.za-monate .m>div{width:100%;border-radius:4px 4px 0 0;background:#4c9a63;transition:height 1s cubic-bezier(.2,.8,.2,1)}
.za-monate .m.jetzt>div{background:repeating-linear-gradient(135deg,${EV} 0 6px,#4c9a63 6px 12px)}
.za-monate .m label{position:absolute;bottom:-15px;left:0;right:0;text-align:center;font-size:9.5px;color:var(--text-2,#a3a19a)}
.za-monate .m span{position:absolute;top:-16px;left:-4px;right:-4px;text-align:center;font-size:9.5px;color:var(--text-2,#a3a19a);white-space:nowrap}
.za-zaehler{display:flex;align-items:center;gap:8px;border-top:1px solid var(--border,#36363b);margin-top:4px;padding-top:7px;font-size:11px;color:var(--text-2,#a3a19a)}
.za-zaehler b{margin-left:auto;color:var(--text,#ece9e1);font-family:${fonts.numbers};font-weight:600;font-size:13px;white-space:nowrap}
.za-reiter{display:flex;gap:6px;margin-left:12px}
.za-reiter button{height:28px;padding:0 12px;border-radius:9px;border:1px solid var(--sw-off-bd,#44444a);background:transparent;color:var(--text-2,#a3a19a);font:600 12px ${fonts.text};cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.za-reiter button.an{background:var(--sw-off-bg,#333338);color:var(--text,#ece9e1);border-color:#5a5a62}
.za-monate .m.leer>div{background:#3a3a40}
.za.zh-dezent *{animation-duration:6s!important}
.za.za-still *{animation:none!important;transition:none!important}
.za.za-still .za-st{opacity:1;transform:none}
.za.za-still .rumpf,.za.za-still .zieh{stroke-dashoffset:0}
@media (prefers-reduced-motion:reduce){.za *{animation:none!important;transition:none!important}.za .za-st{opacity:1;transform:none}.za .rumpf,.za .zieh{stroke-dashoffset:0}}
`;

function ensureAutoStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

interface AutoRxData {
    instanz: string;
    fahrzeug: number;
    tankstelle1: number;
    tankstelle2: number;
    wallbox1: number;
    wallbox2: number;
    zurueck: string;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
}

type Tab = 'woche' | 'monat';

const TABS: { id: Tab; label: string }[] = [
    { id: 'woche', label: 'Woche' },
    { id: 'monat', label: 'Monat' },
];

interface AutoState extends VisRxWidgetState {
    zaScale: number;
    zaNow: number;
    /** false until the first frame, so rings and bars grow from 0 */
    zaShown: boolean;
    /** time range of the evaluation of the electric car */
    zaTab: Tab;
}

// ---------------------------------------------------------------- small parts

const PUMP =
    'M5 20.5V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15.5 M3.5 20.5h12 M7 8h5 M14 10.5h2a1 1 0 0 1 1 1v5a1.5 1.5 0 0 0 3 0V9l-3-3';

function Meldung({ w, lang }: { w: Warning; lang: string }): React.JSX.Element {
    return (
        <div className={`za-meldung ${w.level}`}>
            <svg viewBox="0 0 24 24">
                <path d={WARN_PATH[WARN_SYMBOL[w.key]]} />
            </svg>
            {warningText(w, lang)}
        </div>
    );
}

function Bold({ s }: { s: string }): React.JSX.Element {
    return (
        <>
            {boldParts(s).map((p, i) =>
                p.bold ? <b key={i}>{p.text}</b> : <React.Fragment key={i}>{p.text}</React.Fragment>,
            )}
        </>
    );
}

type Light = 'ok' | 'gelb' | 'rot' | 'grau';

interface StatusRow {
    label: string;
    value: string;
    light: Light;
}

function slotOf(value: unknown, fallback: number): number {
    const n = Math.round(Number(value ?? fallback));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------- widget

export default class ZuhauseAuto extends (window.visRxWidget as typeof VisRxWidget)<AutoRxData, AutoState> {
    private watcher?: StateWatcher;
    private box = React.createRef<HTMLDivElement>();
    private zaResize?: ResizeObserver;
    private timers: ReturnType<typeof setInterval>[] = [];
    private alive = true;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zaScale: 1, zaNow: Date.now(), zaShown: false, zaTab: 'woche' };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseAuto',
            ...SET_INFO,
            visName: 'ZuhauseAuto',
            visWidgetLabel: 'auto_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'instanz',
                            type: 'text',
                            label: 'fahrzeuge_instance',
                            tooltip: 'fahrzeuge_instance_tip',
                            default: 'mobility.0',
                        },
                        { name: 'fahrzeug', type: 'number', label: 'auto_car', default: 1, min: 1, max: 9 },
                        { name: 'tankstelle1', type: 'number', label: 'auto_station1', default: 1, min: 0, max: 9 },
                        { name: 'tankstelle2', type: 'number', label: 'auto_station2', default: 2, min: 0, max: 9 },
                        { name: 'wallbox1', type: 'number', label: 'fahrzeuge_wb1', default: 1, min: 0, max: 9 },
                        { name: 'wallbox2', type: 'number', label: 'fahrzeuge_wb2', default: 2, min: 0, max: 9 },
                        { name: 'zurueck', type: 'views', label: 'auto_back' },
                    ],
                },
                { name: 'motion', label: 'group_animation', fields: MOTION_FIELDS },
            ],
            visDefaultStyle: { width: W, height: H },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-werte.png',
        };
    }

    // Do not delete: VIS-2 reads the widget configuration through the instance
    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseAuto.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        ensureAutoStyles();
        ensureWallboxStyles();
        this.watcher = new StateWatcher(
            this.props.context.socket,
            () => this.alive && this.setState({ zaNow: Date.now() }),
        );
        this.watch();
        if (this.box.current && typeof ResizeObserver !== 'undefined') {
            this.zaResize = new ResizeObserver(() => this.measure());
            this.zaResize.observe(this.box.current);
        }
        this.measure();
        // the "now" marker of the hour bars and the night mode
        this.timers.push(setInterval(() => this.alive && this.setState({ zaNow: Date.now() }), 60_000));
        requestAnimationFrame(() => this.alive && this.setState({ zaShown: true }));
    }

    onRxDataChanged(): void {
        this.watch();
    }

    componentWillUnmount(): void {
        this.alive = false;
        this.timers.forEach(t => clearInterval(t));
        this.zaResize?.disconnect();
        this.watcher?.stop();
        super.componentWillUnmount();
    }

    private measure(): void {
        const el = this.box.current;
        if (!el) {
            return;
        }
        const s = Math.min(el.clientWidth / W, el.clientHeight / H);
        if (s > 0 && Number.isFinite(s) && Math.abs(s - this.state.zaScale) > 0.001) {
            this.setState({ zaScale: s });
        }
    }

    // ---------------------------------------------------------------- data

    private get inst(): string {
        return (this.state.rxData.instanz || 'mobility.0').trim().replace(/\.$/, '');
    }

    private get car(): number {
        return slotOf(this.state.rxData.fahrzeug, 1) || 1;
    }

    private stations(): number[] {
        const d = this.state.rxData;
        return [slotOf(d.tankstelle1, 1), slotOf(d.tankstelle2, 2)].filter(Boolean);
    }

    private boxes(): number[] {
        const d = this.state.rxData;
        return [slotOf(d.wallbox1, 1), slotOf(d.wallbox2, 2)].filter(Boolean);
    }

    private c(n: number, dp: ChargerDp): unknown {
        return this.watcher?.val(`${this.inst}.easee.charger${n}.${dp}`);
    }

    private cSnap(n: number, dp: ChargerDp): Snapshot | undefined {
        return this.watcher?.snapshot(`${this.inst}.easee.charger${n}.${dp}`);
    }

    private e(dp: EaseeDp): unknown {
        return this.watcher?.val(`${this.inst}.easee.${dp}`);
    }

    private v(dp: CarDp): unknown {
        return this.watcher?.val(`${this.inst}.ford.vehicle${this.car}.${dp}`);
    }

    private s(n: number, dp: StationDp): unknown {
        return this.watcher?.val(`${this.inst}.fuel.station${n}.${dp}`);
    }

    private watch(): void {
        const ids = [
            ...CAR_DP.map(dp => `${this.inst}.ford.vehicle${this.car}.${dp}`),
            ...this.stations().flatMap(n => STATION_DP.map(dp => `${this.inst}.fuel.station${n}.${dp}`)),
            ...this.boxes().flatMap(n => CHARGER_DP.map(dp => `${this.inst}.easee.charger${n}.${dp}`)),
            ...EASEE_DP.map(dp => `${this.inst}.easee.${dp}`),
        ];
        void this.watcher?.watch(ids);
    }

    private back = (): void => {
        const view = this.state.rxData.zurueck;
        if (!view || this.props.editMode) {
            return;
        }
        if (!requestTab({ von: this.props.view, nach: view })) {
            this.props.context.changeView(view);
        }
    };

    // ---------------------------------------------------------------- render: head

    private renderHead(name: string, color: string, warnings: Warning[], lang: string): React.JSX.Element {
        const ts = num(this.v('lastUpdate'));
        const model = modelLine(this.v('model'), this.v('engineType'));
        const line = [model, ts !== null ? `Stand ${dateTime(ts)}` : ''].filter(Boolean).join(' · ');
        return (
            <div className="za-kopf">
                {this.state.rxData.zurueck ? (
                    <button
                        type="button"
                        className="za-zurueck"
                        onClick={this.back}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width={16}
                            height={16}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            aria-hidden
                        >
                            <path d="M15 5l-7 7 7 7" />
                        </svg>
                        Startseite
                    </button>
                ) : null}
                <h1>
                    <i style={{ background: color }} />
                    {name}
                </h1>
                <span className="za-modell">{line}</span>
                <div className="za-meldungen">
                    {warnings.length ? (
                        warnings.slice(0, 3).map((w, i) => (
                            <Meldung
                                key={`${w.key}-${i}`}
                                w={w}
                                lang={lang}
                            />
                        ))
                    ) : (
                        <div className="za-meldung ok">alles in Ordnung</div>
                    )}
                    {warnings.length > 3 ? <div className="za-meldung info">+{warnings.length - 3}</div> : null}
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------- render: level card

    private renderLevel(
        level: number | null,
        cheapest: number | null,
        warnings: Warning[],
        lang: string,
        motion: boolean,
        bestRating: string,
    ): React.JSX.Element {
        const range = num(this.v('fuelRange'));
        const tank = num(this.v('tankCapacity'));
        const fill = refill(level, tank, cheapest);
        const oil = num(this.v('oilLife'));
        const v12 = num(this.v('battery12v'));
        const v12V = num(this.v('battery12vVoltage'));
        const km = num(this.v('odometer'));
        const temp = num(this.v('outsideTemp'));
        const levelOf = (key: string): string => {
            const w = warnings.find(x => x.key === key);
            return w ? (w.level === 'critical' ? 'rot' : 'gelb') : '';
        };
        const r = 60;
        const circ = 2 * Math.PI * r;
        const pct = level === null ? 0 : Math.max(0, Math.min(100, level));
        const fuelWarn = levelOf('fuel');
        return (
            <div className="za-karte za-tank">
                <div className="za-ring">
                    <svg viewBox="0 0 142 142">
                        <circle
                            className="bahn"
                            cx={71}
                            cy={71}
                            r={r}
                        />
                        <circle
                            className="fuell"
                            cx={71}
                            cy={71}
                            r={r}
                            stroke={fuelWarn === 'rot' || fuelWarn === 'gelb' ? 'var(--warn-bd,#e5484d)' : FUEL}
                            strokeDasharray={`${this.state.zaShown || !motion ? (circ * pct) / 100 : 0} 1000`}
                        />
                    </svg>
                    {motion && dropWanted(level, !!fuelWarn, bestRating) ? (
                        <svg
                            className="za-tropfen"
                            viewBox="0 0 14 18"
                            aria-hidden
                        >
                            <path
                                d="M7 1C4 6 2 9 2 12a5 5 0 0 0 10 0c0-3-2-6-5-11z"
                                fill={FUEL}
                            />
                        </svg>
                    ) : null}
                    <div className="mitte">
                        <div className="pz">
                            {level === null ? (
                                '—'
                            ) : (
                                <CountUp
                                    value={Math.round(level)}
                                    animate={motion}
                                />
                            )}
                            <small>{' %'}</small>
                        </div>
                        <div className="sub">Tank</div>
                    </div>
                </div>
                <div className="za-werte">
                    <div>
                        Reichweite
                        <b>
                            {range === null ? '—' : formatNumber(range, 0, lang)} <small>km</small>
                        </b>
                    </div>
                    <div>
                        Volltanken
                        <b>
                            {fill ? (
                                <>
                                    ≈ {formatNumber(fill.litres, 0, lang)}{' '}
                                    <small>
                                        l{fill.euro !== null ? ` · ${formatNumber(fill.euro, 0, lang)} €` : ''}
                                    </small>
                                </>
                            ) : (
                                <small>Tankgröße fehlt</small>
                            )}
                        </b>
                    </div>
                    <div>
                        Öl
                        <b className={levelOf('oil')}>
                            {oil === null ? '—' : formatNumber(oil, 0, lang)} <small>%</small>
                        </b>
                    </div>
                    <div>
                        12-V-Batterie
                        <b className={levelOf('battery12v')}>
                            {v12 === null ? '—' : formatNumber(v12, 0, lang)}{' '}
                            <small>%{v12V !== null ? ` · ${formatNumber(v12V, 1, lang)} V` : ''}</small>
                        </b>
                    </div>
                    <div>
                        km-Stand<b>{km === null ? '—' : formatNumber(km, 0, lang)}</b>
                    </div>
                    <div>
                        Außen
                        <b>
                            {temp === null ? '—' : formatNumber(temp, 0, lang)} <small>°C</small>
                        </b>
                    </div>
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------- render: condition

    private renderCondition(warnings: Warning[], lang: string): React.JSX.Element {
        const has = (key: string, wheel?: string): Warning | undefined =>
            warnings.find(w => w.key === key && (!wheel || w.wheel === wheel));
        const tyres = WHEELS.map(wheel => ({
            wheel,
            bar: bar(this.v(`tires.${wheel}`)),
            cls: has('tyre', wheel) ? 'rot' : has('tyreLoss', wheel) ? 'gelb' : '',
        }));
        const locked = this.v('locked');
        const doors = this.v('doorsClosed');
        const windows = this.v('windowsClosed');
        const alarm = text(this.v('alarm')).toUpperCase();
        const oil = num(this.v('oilLife'));
        const v12 = num(this.v('battery12v'));
        const lightOf = (w: Warning | undefined, fallback: Light = 'ok'): Light =>
            w ? (w.level === 'critical' ? 'rot' : w.level === 'warning' ? 'gelb' : 'grau') : fallback;
        const rows: StatusRow[] = [
            {
                label: 'Schloss',
                value: locked === true ? 'zu' : locked === false ? 'offen' : '—',
                light: locked === false ? lightOf(has('unlocked'), 'gelb') : locked === true ? 'ok' : 'grau',
            },
            {
                label: 'Türen, Klappen',
                value: doors === true ? 'zu' : doors === false ? 'offen' : '—',
                light: doors === false ? 'rot' : doors === true ? 'ok' : 'grau',
            },
        ];
        if (windows === true || windows === false) {
            rows.push({ label: 'Fenster', value: windows ? 'zu' : 'offen', light: windows ? 'ok' : 'rot' });
        }
        const tyreWarn = has('tyre') ?? has('tyreLoss');
        rows.push(
            { label: 'Reifen', value: tyreWarn ? 'prüfen' : 'normal', light: lightOf(tyreWarn) },
            // the electric car has no oil
            ...(oil === null
                ? []
                : [{ label: 'Öl', value: `${formatNumber(oil, 0, lang)} %`, light: lightOf(has('oil')) }]),
            {
                label: '12 V',
                value: v12 === null ? '—' : `${formatNumber(v12, 0, lang)} %`,
                light: v12 === null ? 'grau' : lightOf(has('battery12v')),
            },
            {
                label: 'Alarm',
                value: has('alarm') ? 'ausgelöst' : alarm === 'ARMED' || alarm === 'SET' ? 'scharf' : 'aus',
                light: has('alarm') ? 'rot' : 'ok',
            },
        );
        const lockColor = locked === false ? 'var(--warn-bd,#e5484d)' : 'var(--st-led,#6fe08a)';
        const pos: Record<string, React.CSSProperties> = {
            frontLeft: { left: 0, top: 22 },
            frontRight: { right: 0, top: 22 },
            rearLeft: { left: 0, top: 100 },
            rearRight: { right: 0, top: 100 },
        };
        const rad = (wheel: string): string => (tyres.find(t => t.wheel === wheel)?.cls === 'rot' ? 'rad rot' : 'rad');
        return (
            <div className="za-karte za-zustand">
                <div className="za-mini">
                    <svg viewBox="0 0 50 138">
                        <path
                            className="rumpf"
                            pathLength={1}
                            d="M14 2h22q12 0 13 13v108q-1 13-13 13H14Q2 136 1 123V15Q2 2 14 2z"
                        />
                        <rect
                            className={rad('frontLeft')}
                            x={-4}
                            y={22}
                            width={5}
                            height={20}
                            rx={2}
                        />
                        <rect
                            className={rad('frontRight')}
                            x={49}
                            y={22}
                            width={5}
                            height={20}
                            rx={2}
                        />
                        <rect
                            className={rad('rearLeft')}
                            x={-4}
                            y={98}
                            width={5}
                            height={20}
                            rx={2}
                        />
                        <rect
                            className={rad('rearRight')}
                            x={49}
                            y={98}
                            width={5}
                            height={20}
                            rx={2}
                        />
                        <path
                            className="glas"
                            d="M9 40q16-9 32 0l-3 14q-13-5-26 0z"
                        />
                        <path
                            className="glas"
                            d="M11 108q14 6 28 0l2 12q-16 6-32 0z"
                        />
                        <circle
                            cx={25}
                            cy={74}
                            r={9}
                            fill={locked === false ? 'var(--warn-bg,#3a1d1f)' : 'var(--st-on-bg,#183323)'}
                            stroke={locked === false ? 'var(--warn-bd,#e5484d)' : 'var(--st-on-bd,#3f8f57)'}
                            strokeWidth={1.2}
                        />
                        <path
                            className="schloss"
                            stroke={lockColor}
                            d={
                                locked === false
                                    ? 'M20.5 73h9v6h-9z M22.5 73v-2a2.5 2.5 0 0 1 4.8-1'
                                    : 'M20.5 73h9v6h-9z M22.5 73v-2a2.5 2.5 0 0 1 5 0v2'
                            }
                        />
                    </svg>
                    {tyres.map(t => (
                        <span
                            key={t.wheel}
                            className={`za-rd ${t.cls}`}
                            style={pos[t.wheel]}
                        >
                            {t.bar === null ? '—' : formatNumber(t.bar, 2, lang)}
                        </span>
                    ))}
                </div>
                <div className="za-status">
                    <div
                        className="za-titel"
                        style={{ marginBottom: 6 }}
                    >
                        Zustand <span className="r">Reifen in bar</span>
                    </div>
                    {rows.map((row, i) => (
                        <div
                            key={row.label}
                            className={`za-st ${row.light}`}
                            style={{ animationDelay: `${0.3 + i * 0.1}s` }}
                        >
                            <i />
                            {row.label}
                            <b>{row.value}</b>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------- render: fuel stations

    private renderStations(bars: ReturnType<typeof hourBars>, level: number | null, lang: string): React.JSX.Element {
        const list = this.stations().map(n => {
            const open = this.s(n, 'open') === true;
            const price = num(this.s(n, 'e10'));
            return {
                n,
                name: text(this.s(n, 'name')) || `Tankstelle ${n}`,
                town: town(this.s(n, 'address')),
                open,
                price,
                rating: open ? text(this.s(n, 'rating')) || 'unknown' : 'zu',
            };
        });
        // open stations by price first, closed ones after
        list.sort((a, b) => Number(b.open) - Number(a.open) || (a.price ?? 99) - (b.price ?? 99));
        const best = list.find(s => s.open && s.price !== null);
        const anyOpen = list.some(s => s.open);
        const last = Math.max(0, ...list.map(s => num(this.s(s.n, 'lastUpdate')) ?? 0));
        const head = !list.length
            ? ''
            : anyOpen
              ? last
                  ? `offen · ${dateTime(last).slice(-5)}`
                  : 'offen'
              : list.length > 1
                ? 'beide geschlossen'
                : 'geschlossen';
        const ratingText: Record<string, string> = {
            cheap: 'günstig',
            normal: 'normal',
            expensive: 'teuer',
            unknown: 'noch offen',
            zu: 'geschlossen',
        };
        const tip = fuelTip({
            bars,
            rating: best ? text(this.s(best.n, 'rating')) : '',
            hour: new Date(this.state.zaNow).getHours(),
            levelPct: level,
        });
        return (
            <div className="za-karte za-tanken">
                <div className="za-titel">
                    Tanken · Super E10 <span className="r">{head}</span>
                </div>
                {list.map(st => {
                    const isBest = st === best && st.rating !== 'expensive';
                    const [main, tenth] = st.price === null ? ['—', ''] : priceParts(st.price, lang);
                    return (
                        <div
                            key={st.n}
                            className={`za-ts${isBest ? ' best' : ''}`}
                        >
                            <div className="logo">
                                <svg viewBox="0 0 24 24">
                                    <path d={PUMP} />
                                </svg>
                            </div>
                            <div className="txt">
                                <b>
                                    {isBest ? '▼ ' : ''}
                                    {st.name}
                                </b>
                                <span>
                                    {st.town}
                                    {!st.open && st.price !== null ? `${st.town ? ' · ' : ''}zuletzt` : ''}
                                </span>
                            </div>
                            <div className="preis">
                                <b>
                                    {main}
                                    {tenth ? <sup>{tenth}</sup> : null} €
                                </b>
                                <span className={`za-r-${st.rating}`}>{ratingText[st.rating] ?? st.rating}</span>
                            </div>
                        </div>
                    );
                })}
                <div className="za-tipp">
                    <svg viewBox="0 0 24 24">
                        <circle
                            cx={12}
                            cy={12}
                            r={8.5}
                        />
                        <path d="M12 7.5V12l3 2" />
                    </svg>
                    <span>
                        <Bold s={tip} />
                    </span>
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------- render: evaluation

    private renderPriceChart(lang: string): React.JSX.Element {
        const stations = this.stations();
        const series: PricePoint[][] = stations.map(n => parseSeries(this.s(n, 'history7d')));
        const names = stations.map(n => text(this.s(n, 'name')) || `Tankstelle ${n}`);
        const t1 = this.state.zaNow;
        const t0 = t1 - WEEK_MS;
        const range = priceRange(series);
        const cw = 560;
        const ch = 132;
        const head = (
            <h3>
                Preisverlauf 7 Tage <span className="za-echt">echt</span>
                <span className="r">E10 · {stations.length > 1 ? 'beide Tankstellen' : 'Tankstelle'}</span>
            </h3>
        );
        if (!range) {
            return (
                <div className="za-feld">
                    {head}
                    <div className="za-leer">Noch keine Preise aufgezeichnet.</div>
                </div>
            );
        }
        const sc: Scale = { t0, t1, pMin: range.min, pMax: range.max, width: cw - 30, height: ch };
        const mins = stations.map(n => num(this.s(n, 'min7d'))).filter((x): x is number => x !== null);
        const maxs = stations.map(n => num(this.s(n, 'max7d'))).filter((x): x is number => x !== null);
        const avgs = stations.map(n => num(this.s(n, 'avg7d'))).filter((x): x is number => x !== null);
        const lo = mins.length ? Math.min(...mins) : range.min;
        const hi = maxs.length ? Math.max(...maxs) : range.max;
        const avg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
        const grid: number[] = [];
        for (let p = Math.ceil(range.min * 10) / 10; p <= range.max + 1e-9; p += 0.1) {
            grid.push(Math.round(p * 100) / 100);
        }
        const nights = closedSpans(series[0] ?? [], t0, t1);
        const low = lowest(series, t0);
        const days: { x: number; label: string }[] = [];
        const names7 = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
        for (let d = new Date(t0); d.getTime() <= t1 + DAY_MS; d = new Date(d.getTime() + DAY_MS)) {
            const m = new Date(d);
            m.setHours(12, 0, 0, 0);
            if (m.getTime() >= t0 && m.getTime() <= t1) {
                days.push({ x: xOf(sc, m.getTime()), label: names7[m.getDay()] });
            }
        }
        return (
            <div className="za-feld">
                {head}
                <div className="za-gross">
                    {formatNumber(lo, 3, lang)} – {formatNumber(hi, 3, lang)} €{' '}
                    <small>
                        {avg !== null ? `· Schnitt ${formatNumber(avg, 2, lang)} €` : ''}
                        {avg !== null && hi - lo >= 0.05 ? ` · Spitze bis +${formatNumber(hi - lo, 2, lang)} €` : ''}
                    </small>
                </div>
                <div className="za-verlauf">
                    <svg
                        viewBox={`0 0 ${cw} 150`}
                        preserveAspectRatio="none"
                        role="img"
                        aria-label={`Preisverlauf 7 Tage, ${formatNumber(lo, 3, lang)} bis ${formatNumber(hi, 3, lang)} Euro`}
                    >
                        {nights.map(([a, b]) => (
                            <rect
                                key={a}
                                className="nacht"
                                x={xOf(sc, a)}
                                y={0}
                                width={Math.max(0, xOf(sc, b) - xOf(sc, a))}
                                height={ch}
                            />
                        ))}
                        {grid.map(p => (
                            <React.Fragment key={p}>
                                <line
                                    className="gitter"
                                    x1={0}
                                    x2={cw - 30}
                                    y1={yOf(sc, p)}
                                    y2={yOf(sc, p)}
                                />
                                <text
                                    x={cw - 26}
                                    y={yOf(sc, p) + 3}
                                >
                                    {formatNumber(p, 2, lang)}
                                </text>
                            </React.Fragment>
                        ))}
                        {[...series]
                            .map((pts, i) => ({ pts, i }))
                            .reverse()
                            .map(({ pts, i }) => (
                                <path
                                    key={i}
                                    className={`${i === 0 ? 'l1' : 'l2'} zieh`}
                                    pathLength={1}
                                    d={stepPath(pts, sc)}
                                />
                            ))}
                        {days.map(d => (
                            <text
                                key={d.x}
                                x={d.x - 6}
                                y={ch + 14}
                            >
                                {d.label}
                            </text>
                        ))}
                        {low ? (
                            <>
                                <circle
                                    className="tief-ring"
                                    cx={xOf(sc, low.t)}
                                    cy={yOf(sc, low.p)}
                                    r={5}
                                />
                                <circle
                                    className="tief"
                                    cx={xOf(sc, low.t)}
                                    cy={yOf(sc, low.p)}
                                    r={3.5}
                                />
                            </>
                        ) : null}
                    </svg>
                </div>
                <div className="za-leg">
                    {names.map((nm, i) => (
                        <span key={nm + i}>
                            <i style={{ background: i === 0 ? FUEL : FUEL_2 }} />
                            {nm}
                        </span>
                    ))}
                    <span>
                        <i style={{ background: '#1f1f22', height: 8 }} />
                        geschlossen
                    </span>
                    <span style={{ color: 'var(--st-on-fg,#9fe0b2)' }}>● tiefster Preis</span>
                </div>
            </div>
        );
    }

    private renderHours(bars: ReturnType<typeof hourBars>, lang: string, motion: boolean): React.JSX.Element {
        const nowH = new Date(this.state.zaNow).getHours();
        const best = bars.length ? bars.reduce((a, b) => (b.price < a.price ? b : a)) : null;
        const worst = bars.length ? bars.reduce((a, b) => (b.price > a.price ? b : a)) : null;
        return (
            <div className="za-feld">
                <h3>
                    Wann tanken? <span className="za-echt">echt</span>
                    <span className="r">Ø nach Uhrzeit, 7 Tage</span>
                </h3>
                {best && worst ? (
                    <>
                        <div className="za-gross">
                            {best.hour} Uhr{' '}
                            <small>
                                Ø {formatNumber(best.price, 3, lang)} € · teuerste Stunde Ø{' '}
                                {formatNumber(worst.price, 3, lang)} €
                            </small>
                        </div>
                        <div className="za-stunden">
                            {bars.map((b, i) => (
                                <div
                                    key={b.hour}
                                    className={`h ${b.cls === 'normal' ? '' : b.cls}${b.hour === nowH ? ' jetzt' : ''}`}
                                    title={`${b.hour} Uhr: Ø ${formatNumber(b.price, 3, lang)} €`}
                                >
                                    <div
                                        style={{
                                            height: `${this.state.zaShown || !motion ? b.height : 0}%`,
                                            transitionDelay: motion ? `${0.5 + i * 0.05}s` : undefined,
                                        }}
                                    />
                                    <label>{b.hour}</label>
                                </div>
                            ))}
                        </div>
                        <div className="za-leg">
                            <span>
                                <i style={{ background: 'var(--st-led,#6fe08a)' }} />
                                günstig
                            </span>
                            <span>
                                <i style={{ background: '#55555c' }} />
                                normal
                            </span>
                            <span>
                                <i style={{ background: 'var(--warn-bd,#e5484d)' }} />
                                teuer
                            </span>
                            <span>
                                <i
                                    style={{
                                        background: 'var(--sw-on,#f2c14e)',
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                    }}
                                />
                                jetzt
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="za-leer">Noch zu wenig Preisdaten (mindestens 1 Tag).</div>
                )}
            </div>
        );
    }

    private renderKm(lang: string, motion: boolean): React.JSX.Element {
        const weeks = parseWeeks(this.v('history.weeks'));
        const sum = weekSummary(weeks);
        const max = Math.max(50, ...weeks.map(w => w.km));
        const collecting = !sum || sum.weeksWithData < 2;
        return (
            <div className="za-feld">
                <h3>
                    Gefahren{' '}
                    {collecting ? (
                        <span className="za-sammelt">sammelt noch</span>
                    ) : (
                        <span className="za-echt">echt</span>
                    )}
                    <span className="r">km/Woche</span>
                </h3>
                {sum ? (
                    <div className="za-gross">
                        {formatNumber(sum.avg, 0, lang)}{' '}
                        <small>km Ø · Langstrecke {formatNumber(sum.longShare * 100, 0, lang)} %</small>
                    </div>
                ) : (
                    <div className="za-gross">
                        — <small>km Ø</small>
                    </div>
                )}
                <div className="za-km">
                    {weeks.map((w, i) => {
                        const long = Math.min(w.longKm, w.km);
                        const grow = this.state.zaShown || !motion;
                        const delay = motion ? `${0.7 + i * 0.06}s` : undefined;
                        return (
                            <div
                                key={w.label}
                                className="w"
                                title={`KW ${w.label}: ${formatNumber(w.km, 0, lang)} km, davon ${formatNumber(long, 0, lang)} km Langstrecke`}
                            >
                                <div
                                    className="k"
                                    style={{
                                        height: `${grow ? ((w.km - long) / max) * 100 : 0}%`,
                                        transitionDelay: delay,
                                    }}
                                />
                                <div
                                    className="lang"
                                    style={{ height: `${grow ? (long / max) * 100 : 0}%`, transitionDelay: delay }}
                                />
                                <label>{w.label}</label>
                            </div>
                        );
                    })}
                </div>
                <div className="za-leg">
                    <span>
                        <i style={{ background: FUEL, opacity: 0.55 }} />
                        kurz
                    </span>
                    <span>
                        <i style={{ background: FUEL }} />
                        &gt; 50 km
                    </span>
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------- render: electric car

    private phase(n: number): WallboxPhase {
        return wallboxPhase({
            online: this.c(n, 'online'),
            opMode: this.c(n, 'opMode'),
            carConnected: this.c(n, 'carConnected'),
            charging: this.c(n, 'charging'),
        });
    }

    private renderBattery(motion: boolean, warnings: Warning[], lang: string): React.JSX.Element {
        const soc = num(this.v('soc'));
        const range = num(this.v('evRange'));
        const max = num(this.v('evMaxRange'));
        const kwh = num(this.v('energyRemaining'));
        const cap = num(this.v('batteryCapacity'));
        const temp = num(this.v('batteryTemp'));
        const km = num(this.v('odometer'));
        const charging = text(this.v('chargeStatus')).toUpperCase() === 'CHARGING';
        const full = charging ? fullAt(this.v('timeToFull'), this.v('lastUpdate'), this.state.zaNow) : null;
        const power = num(this.v('chargePower'));
        const low = warnings.find(w => w.key === 'battery');
        const r = 60;
        const circ = 2 * Math.PI * r;
        const pct = soc === null ? 0 : Math.max(0, Math.min(100, soc));
        const sub = plugText(this.v('plugStatus'), this.v('chargeStatus'), power, lang) || 'Akku';
        return (
            <div className="za-karte za-tank">
                <div className="za-ring">
                    <svg viewBox="0 0 142 142">
                        <circle
                            className="bahn"
                            cx={71}
                            cy={71}
                            r={r}
                        />
                        <circle
                            className="fuell"
                            cx={71}
                            cy={71}
                            r={r}
                            stroke={low ? 'var(--warn-bd,#e5484d)' : EV}
                            strokeDasharray={`${this.state.zaShown || !motion ? (circ * pct) / 100 : 0} 1000`}
                        />
                        {charging && motion ? (
                            <circle
                                className="glanz"
                                cx={71}
                                cy={71}
                                r={r}
                            />
                        ) : null}
                    </svg>
                    <div className="mitte">
                        <div className="pz">
                            {soc === null ? (
                                '—'
                            ) : (
                                <CountUp
                                    value={Math.round(soc)}
                                    animate={motion}
                                />
                            )}
                            <small>{'\u2009%'}</small>
                        </div>
                        <div className="sub">{sub}</div>
                    </div>
                </div>
                <div className="za-werte">
                    <div>
                        Reichweite
                        <b>
                            {range === null ? '—' : formatNumber(range, 0, lang)} <small>km</small>
                        </b>
                    </div>
                    <div>
                        bei 100 %
                        <b>
                            {max === null ? '—' : formatNumber(max, 0, lang)} <small>km</small>
                        </b>
                    </div>
                    <div>
                        im Akku
                        <b>
                            {kwh === null ? '—' : formatNumber(kwh, 1, lang)}{' '}
                            <small>{cap !== null ? `/ ${formatNumber(cap, 1, lang)} kWh` : 'kWh'}</small>
                        </b>
                    </div>
                    <div>
                        voll ca.<b>{full !== null ? clock(full) : '—'}</b>
                    </div>
                    <div>
                        Akku
                        <b>
                            {temp === null ? '—' : formatNumber(temp, 1, lang)} <small>°C</small>
                        </b>
                    </div>
                    <div>
                        km-Stand<b>{km === null ? '—' : formatNumber(km, 0, lang)}</b>
                    </div>
                </div>
            </div>
        );
    }

    private renderCharging(lang: string): React.JSX.Element {
        const boxes = this.boxes();
        const phases = new Map(boxes.map(n => [n, this.phase(n)]));
        const occupied = boxes.filter(n => phases.get(n) === 'bereit' || phases.get(n) === 'laedt');
        // Easee does not know the car: this car's name only when Ford says it is plugged in and one wallbox has a car
        const me = isPluggedIn(this.v('plugStatus')) ? text(this.v('name')) : '';
        const price = homePrice(this.e('history.yearCost'), this.e('history.yearEnergy'));
        let last: { kwh: number | null; cost: number | null } | null = null;
        try {
            const raw = this.e('history.lastSession');
            const o: unknown = typeof raw === 'string' && raw ? JSON.parse(raw) : null;
            if (o && typeof o === 'object') {
                const r = o as Record<string, unknown>;
                last = { kwh: num(r.kwh), cost: num(r.cost) };
            }
        } catch {
            last = null;
        }
        return (
            <div className="za-karte za-laden">
                <div className="za-titel">
                    Laden zu Hause
                    {price !== null ? <span className="r">{formatNumber(price, 2, lang)} €/kWh</span> : null}
                </div>
                {boxes.map(n => (
                    <WallboxRow
                        key={n}
                        n={n}
                        name={text(this.c(n, 'name')) || `Wallbox ${n}`}
                        phase={phases.get(n) ?? 'frei'}
                        info={{
                            opMode: this.c(n, 'opMode'),
                            power: this.c(n, 'power'),
                            sessionEnergy: this.c(n, 'sessionEnergy'),
                            reasonText: this.c(n, 'reasonText'),
                            lastKwh: lastSessionKwh(this.c(n, 'history.lastSession')),
                            car: me && occupied.length === 1 && occupied[0] === n ? me : '',
                        }}
                        charge={this.cSnap(n, 'charge')}
                        editMode={!!this.props.editMode}
                        lang={lang}
                        onSend={wanted => this.props.context.setValue(`${this.inst}.easee.charger${n}.charge`, wanted)}
                    />
                ))}
                <div className="za-letzte">
                    <span>Letzte Ladung</span>
                    <b>
                        {last?.kwh !== null && last?.kwh !== undefined
                            ? `${formatNumber(last.kwh, 1, lang)} kWh${last.cost !== null ? ` · ${formatNumber(last.cost, 2, lang)} €` : ''}`
                            : '—'}
                    </b>
                </div>
            </div>
        );
    }

    /** Wallbox and Ford values of the chosen time range */
    private periods(tab: Tab): { easee: EaseePeriod[]; ford: FordWeek[]; current: string } {
        const now = new Date(this.state.zaNow);
        const p2 = (n: number): string => String(n).padStart(2, '0');
        if (tab === 'woche') {
            return {
                easee: parseEasee(this.e('history.days')).slice(-7),
                ford: parseFordWeeks(this.v('history.days')),
                current: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`,
            };
        }
        return {
            easee: costMonths(parseEasee(this.e('history.months')), 12),
            ford: parseFordWeeks(this.v('history.months')),
            current: `${now.getFullYear()}-${p2(now.getMonth() + 1)}`,
        };
    }

    private renderTabs(): React.JSX.Element {
        return (
            <div
                className="za-reiter"
                role="tablist"
            >
                {TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={this.state.zaTab === t.id}
                        className={this.state.zaTab === t.id ? 'an' : ''}
                        onClick={() => this.setState({ zaTab: t.id })}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
        );
    }

    private renderCharged(tab: Tab, lang: string, motion: boolean): React.JSX.Element {
        const { easee, ford } = this.periods(tab);
        const list = chargedPeriods(easee, ford, easee.length);
        const home = list.reduce((a, w) => a + w.home, 0);
        const away = list.reduce((a, w) => a + (w.away ?? 0), 0);
        const awayKnown = list.some(w => w.away !== null);
        const max = Math.max(tab === 'woche' ? 10 : 50, ...list.map(w => w.home + (w.away ?? 0)));
        const grow = this.state.zaShown || !motion;
        const range = tab === 'woche' ? 'in 7 Tagen' : list.length ? `seit ${monthLabel(list[0].period)}` : '';
        return (
            <div className="za-feld">
                <h3>
                    Geladen <span className="za-echt">echt</span>
                    <span className="r">kWh pro {tab === 'woche' ? 'Tag' : 'Monat'}</span>
                </h3>
                <div className="za-gross">
                    {formatNumber(home + away, 0, lang)}{' '}
                    <small>
                        kWh {range}
                        {awayKnown ? ` · ${formatNumber(away, 0, lang)} davon unterwegs` : ''}
                    </small>
                </div>
                {list.length ? (
                    <div className="za-balken">
                        {list.map((w, i) => {
                            const delay = motion ? `${0.2 + i * 0.05}s` : undefined;
                            return (
                                <div
                                    key={w.period}
                                    className="w"
                                    title={`${w.label}: ${formatNumber(w.home, 1, lang)} kWh zu Hause${w.away !== null ? `, ${formatNumber(w.away, 1, lang)} kWh unterwegs` : ''}`}
                                >
                                    <div
                                        className="home"
                                        style={{
                                            height: `${grow ? (w.home / max) * 100 : 0}%`,
                                            transitionDelay: delay,
                                        }}
                                    />
                                    {w.away ? (
                                        <div
                                            className="away"
                                            style={{
                                                height: `${grow ? (w.away / max) * 100 : 0}%`,
                                                transitionDelay: delay,
                                            }}
                                        />
                                    ) : null}
                                    <label>{w.label}</label>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="za-leer">Noch keine Ladevorgänge.</div>
                )}
                <div className="za-leg">
                    <span>
                        <i style={{ background: EV }} />
                        zu Hause (Wallbox)
                    </span>
                    <span>
                        <i style={{ background: AWAY }} />
                        unterwegs{awayKnown ? '' : ' (sammelt noch)'}
                    </span>
                </div>
            </div>
        );
    }

    private renderConsumption(tab: Tab, lang: string): React.JSX.Element {
        const { ford } = this.periods(tab);
        const points = ford.slice(tab === 'woche' ? -7 : -12).filter(w => w.kwhPer100 !== null);
        const avg = num(this.v('history.energyConsumption'));
        const last = points[points.length - 1];
        const cw = 300;
        const ch = 112;
        const enough = points.length >= 2;
        let chart: React.JSX.Element | null = null;
        if (enough) {
            const values = points.map(w => w.kwhPer100 as number);
            const lo = Math.floor(Math.min(...values) - 1);
            const hi = Math.ceil(Math.max(...values) + 1);
            const temps = points.map(w => w.temp).filter((t): t is number => t !== null);
            const tLo = temps.length ? Math.min(...temps) - 2 : 0;
            const tHi = temps.length ? Math.max(...temps) + 2 : 1;
            const x = (i: number): number => (i / (points.length - 1)) * cw;
            const y = (v: number): number => ch - ((v - lo) / (hi - lo)) * ch;
            const yt = (t: number): number => ch - ((t - tLo) / (tHi - tLo)) * ch;
            const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
            const tLine = points
                .map((w, i) => (w.temp === null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yt(w.temp).toFixed(1)}`))
                .join('');
            chart = (
                <svg
                    viewBox={`0 0 ${cw} 130`}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Verbrauch und Außentemperatur"
                >
                    <path
                        className="fl"
                        d={`${line}L${cw} ${ch}L0 ${ch}z`}
                    />
                    <path
                        key={tab}
                        className="k1 zieh"
                        pathLength={1}
                        d={line}
                    />
                    {tLine ? (
                        <path
                            className="k2"
                            d={tLine}
                        />
                    ) : null}
                    {points.map((w, i) => (
                        <text
                            key={w.period}
                            x={Math.max(0, Math.min(cw - 18, x(i) - 8))}
                            y={128}
                        >
                            {periodLabel(w.period)}
                        </text>
                    ))}
                </svg>
            );
        }
        return (
            <div className="za-feld">
                <h3>
                    Verbrauch{' '}
                    {enough ? <span className="za-echt">echt</span> : <span className="za-sammelt">sammelt noch</span>}
                    <span className="r">kWh/100 km · Außentemperatur</span>
                </h3>
                <div className="za-gross">
                    {avg !== null ? formatNumber(avg, 1, lang) : last ? formatNumber(last.kwhPer100, 1, lang) : '—'}{' '}
                    <small>
                        kWh/100 km {avg !== null ? 'Ø 4 Wochen' : ''}
                        {last?.temp !== null && last?.temp !== undefined
                            ? ` · bei ${formatNumber(last.temp, 0, lang)} °C`
                            : ''}
                    </small>
                </div>
                <div className="za-kurven">
                    {chart ?? (
                        <div
                            className="za-leer"
                            style={{ height: 130 }}
                        >
                            Die Kurve erscheint ab {tab === 'woche' ? 'dem zweiten Tag' : 'dem zweiten Monat'} mit
                            mindestens 20 km.
                            <br />
                            Ford liefert keine Vergangenheit, gesammelt wird seit dem Einbau.
                        </div>
                    )}
                </div>
                <div className="za-leg">
                    <span>
                        <i style={{ background: EV }} />
                        Verbrauch
                    </span>
                    <span>
                        <i style={{ background: COLD }} />
                        Außentemperatur (gestrichelt)
                    </span>
                </div>
            </div>
        );
    }

    private renderCost(tab: Tab, lang: string, motion: boolean): React.JSX.Element {
        const { easee, current } = this.periods(tab);
        const price = homePrice(this.e('history.yearCost'), this.e('history.yearEnergy'));
        const per100 = num(this.v('history.energyConsumption'));
        const sum = easee.reduce((a, m) => a + m.cost, 0);
        const cur = easee.find(m => m.period === current);
        const max = Math.max(1, ...easee.map(m => m.cost));
        const total = this.boxes().reduce((a, n) => a + (num(this.c(n, 'lifetimeEnergy')) ?? 0), 0);
        const grow = this.state.zaShown || !motion;
        return (
            <div className="za-feld">
                <h3>
                    Ladekosten zu Hause <span className="za-echt">echt</span>
                    <span className="r">pro {tab === 'woche' ? 'Tag' : 'Monat'}</span>
                </h3>
                <div className="za-gross">
                    {formatNumber(tab === 'woche' ? sum : (cur?.cost ?? 0), 2, lang)} €{' '}
                    <small>
                        {tab === 'woche' ? 'in 7 Tagen' : `${monthLabel(current)}. bisher`}
                        {price !== null && per100 !== null
                            ? ` · ${formatNumber(price * per100, 2, lang)} €/100 km`
                            : ''}
                    </small>
                </div>
                {easee.length ? (
                    <div className="za-monate">
                        {easee.map((m, i) => (
                            <div
                                key={m.period}
                                className={`m${m.period === current ? ' jetzt' : ''}${m.cost ? '' : ' leer'}`}
                                title={`${periodLabel(m.period)}: ${formatNumber(m.kwh, 1, lang)} kWh, ${formatNumber(m.cost, 2, lang)} €`}
                            >
                                <span>{m.cost ? `${formatNumber(m.cost, 0, lang)} €` : ''}</span>
                                <div
                                    style={{
                                        height: `${grow ? Math.max(3, (m.cost / max) * 100) : 0}%`,
                                        transitionDelay: motion ? `${0.3 + i * 0.06}s` : undefined,
                                    }}
                                />
                                <label>{periodLabel(m.period)}</label>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="za-leer">Noch keine Ladevorgänge.</div>
                )}
                {total > 0 ? (
                    <div className="za-zaehler">
                        Wallbox gesamt
                        <b>
                            {formatNumber(total, 0, lang)} kWh
                            {price !== null ? ` · ${formatNumber(total * price, 0, lang)} €` : ''}
                        </b>
                    </div>
                ) : null}
            </div>
        );
    }

    // ---------------------------------------------------------------- render

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const lang = ZuhauseAuto.getLanguage();
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date(this.state.zaNow));
        const motion = motionAllowed(levelClass) && d.animation !== 'keine';
        const drive = driveOf(this.v('engineType'));
        const name = text(this.v('name')) || `Fahrzeug ${this.car}`;
        const warnings = parseWarnings(this.v('warnings'));
        const level = num(this.v('fuelLevel'));
        const stations = this.stations();
        const prices = stations
            .filter(n => this.s(n, 'open') === true)
            .map(n => num(this.s(n, 'e10')))
            .filter((x): x is number => x !== null);
        const lastPrices = stations.map(n => num(this.s(n, 'e10'))).filter((x): x is number => x !== null);
        const cheapest = prices.length ? Math.min(...prices) : lastPrices.length ? Math.min(...lastPrices) : null;
        const bestOpen = stations
            .filter(n => this.s(n, 'open') === true && num(this.s(n, 'e10')) !== null)
            .sort((a, b) => (num(this.s(a, 'e10')) ?? 99) - (num(this.s(b, 'e10')) ?? 99))[0];
        const bestRating = bestOpen !== undefined ? text(this.s(bestOpen, 'rating')) : '';
        const bars = hourBars(combineProfiles(stations.map(n => parseProfile(this.s(n, 'hourProfile')))));

        return (
            <div
                ref={this.box}
                style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
            >
                <div
                    className={['za', levelClass, motion ? '' : 'za-still'].filter(Boolean).join(' ')}
                    style={{ transform: `scale(${this.state.zaScale})` }}
                >
                    {this.renderHead(name, drive === 'ev' ? '#6fe08a' : FUEL, warnings, lang)}
                    {drive === 'ev' ? (
                        <>
                            {this.renderBattery(motion, warnings, lang)}
                            {this.renderCondition(warnings, lang)}
                            {this.renderCharging(lang)}
                            <div className="za-karte za-auswertung">
                                <div className="za-titel">
                                    Auswertung
                                    {this.renderTabs()}
                                </div>
                                <div
                                    className="za-drei"
                                    style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 8 }}
                                >
                                    {this.renderCharged(this.state.zaTab, lang, motion)}
                                    {this.renderConsumption(this.state.zaTab, lang)}
                                    {this.renderCost(this.state.zaTab, lang, motion)}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {this.renderLevel(level, cheapest, warnings, lang, motion, bestRating)}
                            {this.renderCondition(warnings, lang)}
                            {this.renderStations(bars, level, lang)}
                            <div className="za-karte za-auswertung">
                                <div className="za-titel">Auswertung</div>
                                <div className="za-drei">
                                    {this.renderPriceChart(lang)}
                                    {this.renderHours(bars, lang, motion)}
                                    {this.renderKm(lang, motion)}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }
}
