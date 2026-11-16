/*
 * VIS-2 widget "Heizung": a whole page (1050 × 575, scaled to the widget box) for the floor heating with
 * JUNG HOME room thermostats (adapter junghome-bt-mesh). Rooms glow from their middle in the colour of their
 * temperature (cold blue, neutral, warm orange); every room gets a round symbol. Tapping a room with a
 * JUNG HOME thermostat opens the setpoint wheel with boost; the header holds the vacation setback.
 *
 * Room names, polygons and data points come from the project (field "raeume"), never from this repo.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import {
    RAD_ENDE,
    RAD_START,
    SOLL_MAX,
    SOLL_MIN,
    alleIds,
    boostRest,
    farbe,
    flaechenPunkte,
    grad,
    kennzahlen,
    kurzeZeit,
    parseHeizRaeume,
    raumArt,
    raumMitte,
    rgba,
    sollAusZeiger,
    sollRaster,
    sollWinkel,
    thermostatIds,
    urlaubIds,
    verschiebe,
    vorheizenAb,
    vorschlagRueckkehr,
    zahl,
    zustand,
    type HeizRaum,
    type RaumArt,
    type RaumWert,
} from '../lib/heizung';
import { isOn } from '../lib/model';
import { loadPlan, loadPlanLayers, resolveImage, type PlanLayers, type PlanSvg } from '../lib/svg';
import { ensureStyles } from '../lib/theme';
import { PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const W = 1050;
const H = 575;
/** drawing area of the plan inside the plan card */
const PLAN_W = 598;
const PLAN_H = 480;
const IDLE_CLOSE_MS = 6000;
const WRITE_DELAY_MS = 700;
/** ticks of the wheel (every 0.5 °C) */
const TICKS = (SOLL_MAX - SOLL_MIN) * 2 + 1;

interface HeizungRxData {
    titel: string;
    svg: string;
    raeume: string;
    instanz: string;
    aussen: string;
    boostMinuten: number;
    animationStufe: string;
    nachtAus: boolean;
}

interface HeizungState extends VisRxWidgetState {
    hzPlan: PlanSvg | null;
    hzLayers: PlanLayers | null;
    hzPlanFehler: string;
    hzTick: number;
    hzScale: number;
    /** room id, 'urlaub' or null */
    hzPopup: string | null;
    /** setpoint shown while the wheel is used (not yet confirmed by the thermostat) */
    hzSoll: number | null;
    /** return time while it is edited in the vacation popup; 0 = without return */
    hzRueckkehr: number | null;
    /** rooms appear one after the other once the plan is there */
    hzDa: boolean;
    /** vacation settings of the adapter instance */
    hzUrlaubSoll: number;
    hzVorheizen: number;
}

// ---------------------------------------------------------------- icons

const FLAMME =
    'M12 21c3.6 0 6-2.6 6-6 0-3.4-2.4-5.2-3.4-8-1 1.8-2 2.6-3.6 2.6 0-1.8 0-3.6-1.8-6.2C8.4 7 6 9.6 6 14.6 6 18.2 8.4 21 12 21z';
const THERMO = 'M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z';
const SONNE = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2';
const KOFFER = 'M4 8h16v11H4z M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8 M4 13h16';

function Ic({ d, size = 18, className }: { d: string; size?: number; className?: string }): React.JSX.Element {
    return (
        <svg
            className={`hz-ic${className ? ` ${className}` : ''}`}
            viewBox="0 0 24 24"
            width={size}
            height={size}
            aria-hidden
        >
            {d.split(' M').map((p, i) => (
                <path
                    key={i}
                    d={i ? `M${p}` : p}
                />
            ))}
        </svg>
    );
}

// ---------------------------------------------------------------- styles

const NUM = "'Zuhause Barlow Condensed','Barlow Semi Condensed','Barlow Condensed',system-ui,sans-serif";
const STYLE_ID = 'zh-heizung-styles';
const CSS = `
.hz{position:relative;width:${W}px;height:${H}px;font-family:'Zuhause Barlow',Barlow,system-ui,sans-serif;color:var(--text,#ece9e1);transform-origin:top left;user-select:none;-webkit-tap-highlight-color:transparent;overflow:hidden}
.hz *{box-sizing:border-box}
.hz button{font-family:inherit;touch-action:manipulation;cursor:pointer}
.hz-ic{display:block;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:none}
.hz-kopf{position:absolute;left:18px;right:18px;top:12px;height:40px;display:flex;align-items:center;gap:12px}
.hz-kopf h1{margin:0;font-size:22px;font-weight:700}
.hz-chips{margin-left:auto;display:flex;gap:6px}
.hz-chip{display:flex;align-items:center;gap:7px;height:32px;padding:0 12px;border-radius:10px;border:1px solid var(--sw-off-bd,#44444a);background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);font-size:12.5px;font-weight:600;white-space:nowrap}
.hz-chip b{font-family:${NUM};font-size:16px;color:var(--text,#ece9e1)}
.hz-chip.heiss{background:#3a2614;border-color:#ff8a3d;color:#ffc08a}
.hz-chip.urlaub{background:#16263a;border-color:#4a8dff;color:#a9cbff}
button.hz-chip:active{transform:scale(.97)}
.hz-feld{position:absolute;left:16px;top:62px;width:1018px;height:500px;background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);border-radius:var(--radius-card,18px);overflow:hidden}
.hz-plan{position:absolute;left:309px;top:10px;width:${PLAN_W}px;height:${PLAN_H}px}
.hz-plan>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.hz-raum{cursor:pointer}
.hz-schein{transition:opacity 1.6s ease}
.hz-schein stop{transition:stop-color 1.6s ease}
.hz-rand{fill:none;stroke:transparent;stroke-width:3;transition:stroke .3s}
.hz-rand.sel{stroke:var(--sw-on,#f2c14e)}
.hz-deko{pointer-events:none}
.hz-sym{position:absolute;transform:translate(-50%,-50%) scale(.6);opacity:0;transition:transform .6s cubic-bezier(.2,1.4,.4,1),opacity .5s;cursor:pointer;text-align:center;background:none;border:0;padding:0;color:inherit}
.hz-sym.da{transform:translate(-50%,-50%) scale(1);opacity:1}
.hz-kreis{position:relative;margin:0 auto;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 35%,rgba(255,255,255,.10),rgba(0,0,0,.25));border:1.5px solid rgba(255,255,255,.18);box-shadow:0 6px 18px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12)}
.hz-t{font-family:${NUM};font-weight:600;line-height:1;color:#fff}
.hz-s{font-weight:600;margin-top:2px}
.hz-n{margin-top:5px;font-size:11.5px;font-weight:600;color:rgba(236,233,225,.85);text-shadow:0 1px 3px rgba(0,0,0,.6);white-space:nowrap}
.hz-sym.jung .hz-kreis{width:96px;height:96px}
.hz-sym.jung .hz-t{font-size:28px;margin-top:2px}
.hz-sym.jung .hz-t small{font-size:15px}
.hz-sym.jung .hz-s{font-size:11px;color:rgba(236,233,225,.75)}
.hz-bogen{position:absolute;inset:-7px;width:calc(100% + 14px);height:calc(100% + 14px);overflow:visible}
.hz-sym.alt .hz-kreis{width:88px;height:88px;border-style:dashed;border-color:rgba(255,255,255,.22)}
.hz-sym.alt .hz-t{font-size:25px;margin-top:2px}
.hz-sym.alt .hz-t small{font-size:14px}
.hz-sym.alt .hz-s{font-size:10px;color:rgba(236,233,225,.55);letter-spacing:.3px}
.hz-sym.alt .hz-ic{opacity:.55}
.hz-sym.mess .hz-kreis{width:58px;height:58px}
.hz-sym.mess .hz-t{font-size:21px;margin-top:1px}
.hz-sym.mess .hz-ic{opacity:.75}
.hz-sym.leer .hz-kreis{width:44px;height:44px;border-style:dashed;border-color:rgba(255,255,255,.14);background:rgba(0,0,0,.12);box-shadow:none;color:#7a7872}
.hz-sym.klein .hz-kreis{width:60px;height:60px}
.hz-sym.klein .hz-t{font-size:18px}
.hz-sym.klein .hz-t small{font-size:11px}
.hz-sym.klein .hz-s{display:none}
.hz-sym.heizt .hz-kreis{border-color:#ff8a3d;color:#ffc08a;animation:hz-puls 2.2s ease-out infinite}
.hz-sym.heizt .hz-flamme path{animation:hz-flacker .45s ease-in-out infinite alternate;transform-origin:50% 90%}
.hz-sym.sel .hz-kreis{border-color:var(--sw-on,#f2c14e)}
.hz-sym .hz-urlaubpunkt{position:absolute;top:-2px;right:-2px;width:22px;height:22px;border-radius:50%;background:#16263a;border:1.5px solid #4a8dff;color:#a9cbff;display:flex;align-items:center;justify-content:center}
@keyframes hz-puls{0%{box-shadow:0 0 0 0 rgba(255,138,61,.55),0 6px 18px rgba(0,0,0,.35)}100%{box-shadow:0 0 0 18px rgba(255,138,61,0),0 6px 18px rgba(0,0,0,.35)}}
@keyframes hz-flacker{to{transform:scale(1.1,.9)}}
.hz-spalte{position:absolute;left:18px;top:18px;width:180px;display:flex;flex-direction:column;gap:10px}
.hz-kz{background:#25252a;border:1px solid var(--border,#36363b);border-radius:14px;padding:10px 12px}
.hz-kz span{display:block;font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-2,#a3a19a)}
.hz-kz b{font-family:${NUM};font-size:26px;font-weight:600}
.hz-kz b small{font-size:14px;color:var(--text-2,#a3a19a);font-weight:500}
.hz-kz.urlaub{background:#16263a;border-color:#2f5a96}
.hz-kz.urlaub b{font-size:19px}
.hz-legende{position:absolute;right:18px;bottom:14px;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-2,#a3a19a)}
.hz-legende i{width:110px;height:7px;border-radius:4px;background:linear-gradient(90deg,#4a8dff,#e8e6df,#ff8a3d)}
.hz-hinweis{position:absolute;left:18px;bottom:14px;font-size:11.5px;color:var(--text-2,#a3a19a);max-width:520px}
.hz-schleier{position:absolute;inset:0;background:rgba(12,12,14,.5);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:10;animation:hz-ein .25s ease}
@keyframes hz-ein{from{opacity:0}}
.hz-popup{width:400px;background:linear-gradient(165deg,#323237,#28282c);border:1px solid #3c3c42;border-radius:22px;padding:16px 20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.55);animation:hz-auf .3s cubic-bezier(.2,1.2,.4,1)}
@keyframes hz-auf{from{transform:translateY(14px) scale(.96)}}
.hz-pkopf{display:flex;align-items:center;gap:10px}
.hz-pkopf h2{margin:0;font-size:20px;font-weight:700}
.hz-pkopf span{font-size:11.5px;color:var(--text-2,#a3a19a)}
.hz-x{margin-left:auto;width:34px;height:34px;border-radius:10px;background:#3a3a40;border:1px solid #4a4a50;display:flex;align-items:center;justify-content:center;color:#ddd;font-size:15px}
.hz-reihe{display:flex;align-items:center;justify-content:space-between;margin-top:2px}
.hz-rad{position:relative;width:260px;height:260px;margin:6px auto 0;touch-action:none;cursor:grab}
.hz-rad svg{position:absolute;inset:0;overflow:visible}
.hz-mitte{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.hz-gross{font-family:${NUM};font-size:72px;font-weight:500;line-height:.9;transition:color .4s}
.hz-gross small{font-size:28px;vertical-align:top;position:relative;top:8px}
.hz-unter{font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:var(--text-2,#a3a19a);margin-top:4px}
.hz-jetzt{margin-top:9px;font-size:13px;color:var(--text-2,#a3a19a)}
.hz-jetzt b{font-family:${NUM};font-size:17px;color:var(--text,#ece9e1);font-weight:600}
.hz-pm{width:48px;height:48px;border-radius:50%;background:#3a3a40;border:1px solid #4a4a50;color:var(--text,#ece9e1);font:600 24px 'Zuhause Barlow',Barlow,sans-serif;display:flex;align-items:center;justify-content:center}
.hz-pm:active{transform:scale(.94)}
.hz-zust{font-size:12.5px;font-weight:600;color:var(--text-2,#a3a19a);text-align:center}
.hz-zust.heiss{color:#ff8a3d}
.hz-boost{position:relative;width:100%;margin-top:12px;height:54px;border-radius:27px;border:1px solid rgba(255,138,61,.4);background:rgba(255,138,61,.07);color:#ffc08a;display:flex;align-items:center;gap:12px;padding:0 8px;overflow:hidden;text-align:left}
.hz-boost .fl{width:38px;height:38px;border-radius:50%;background:rgba(255,138,61,.15);display:flex;align-items:center;justify-content:center;flex:none}
.hz-boost .t1{font-size:15px;font-weight:700;color:#ffd3ad}
.hz-boost .t2{font-size:11.5px;color:rgba(255,192,138,.75)}
.hz-boost .zeit{margin-left:auto;margin-right:10px;font-family:${NUM};font-size:22px;font-weight:600;color:#ffd3ad}
.hz-boost .bal{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.16);transition:width 1s linear;pointer-events:none}
.hz-boost.an{background:linear-gradient(90deg,#ff8a3d,#ff5e3a);border-color:#ff8a3d;box-shadow:0 0 26px rgba(255,110,50,.4)}
.hz-boost.an .t1,.hz-boost.an .zeit{color:#250c00}
.hz-boost.an .t2{color:rgba(37,12,0,.7)}
.hz-boost.an .fl{background:rgba(0,0,0,.18)}
.hz-boost.an .fl path{animation:hz-flacker .45s ease-in-out infinite alternate;transform-origin:50% 90%}
.hz-band{margin-top:10px;border-radius:14px;border:1px solid #2f5a96;background:#16263a;color:#a9cbff;font-size:12.5px;padding:9px 12px;display:flex;align-items:center;gap:10px}
.hz-band button{margin-left:auto;height:34px;padding:0 12px;border-radius:10px;border:1px solid #4a8dff;background:#1f3a5e;color:#d6e6ff;font-size:12.5px;font-weight:600;white-space:nowrap}
.hz-nur{text-align:center;padding:20px 0 8px}
.hz-nur .hz-gross{font-size:76px}
.hz-nur p{margin:12px 0 0;font-size:12.5px;color:var(--text-2,#a3a19a);line-height:1.5}
.hz-uzeile{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.hz-uzeile .lbl{font-size:13px;color:var(--text-2,#a3a19a)}
.hz-seg{display:inline-flex;border:1px solid var(--sw-off-bd,#44444a);border-radius:12px;overflow:hidden}
.hz-seg button{height:38px;padding:0 14px;border:0;background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);font-size:13px;font-weight:600}
.hz-seg button+button{border-left:1px solid var(--sw-off-bd,#44444a)}
.hz-seg button.an{background:#4a8dff;color:#06162b}
.hz-stepper{display:inline-flex;align-items:center;border:1px solid var(--sw-off-bd,#44444a);border-radius:12px;overflow:hidden}
.hz-stepper button{width:44px;height:40px;border:0;background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);font:600 22px ${NUM}}
.hz-stepper output{min-width:96px;text-align:center;font:600 20px ${NUM}}
.hz-info{margin-top:12px;font-size:12.5px;color:var(--text-2,#a3a19a);line-height:1.5}
.hz-info b{color:var(--text,#ece9e1);font-weight:600}
.hz-knopf{width:100%;margin-top:14px;height:52px;border-radius:16px;border:1px solid #4a8dff;background:linear-gradient(180deg,#4a8dff,#2f6fd6);color:#fff;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px}
.hz-knopf.aus{border-color:var(--sw-off-bd,#44444a);background:var(--sw-off-bg,#333338);color:var(--text,#ece9e1)}
.hz-knopf:active{transform:scale(.98)}
.hz-fehler{position:absolute;left:18px;right:18px;bottom:40px;font-size:12px;color:var(--text-2,#a3a19a);background:rgba(0,0,0,.35);border-radius:8px;padding:6px 10px}
.zh-dezent .hz *{animation-duration:6s!important}
.zh-still .hz *{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){.hz *{animation:none!important}}
`;

function ensureHeizungStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

/** values of one room for rendering */
interface RaumSicht {
    r: HeizRaum;
    art: RaumArt;
    ist: number | null;
    soll: number | null;
    heizt: boolean;
    boostAn: boolean;
    boostBis: number | null;
    imUrlaub: boolean;
    flaechen: string[];
    mitte: { x: number; y: number; radius: number } | null;
}

export default class ZuhauseHeizung extends (window.visRxWidget as typeof VisRxWidget)<HeizungRxData, HeizungState> {
    private watcher?: StateWatcher;
    private box = React.createRef<HTMLDivElement>();
    private rad = React.createRef<HTMLDivElement>();
    private hzResize?: ResizeObserver;
    private planUrl = '';
    private alive = true;
    private idleTimer?: ReturnType<typeof setTimeout>;
    private writeTimer?: ReturnType<typeof setTimeout>;
    private clockTimer?: ReturnType<typeof setInterval>;
    private daTimer?: ReturnType<typeof setTimeout>;
    private startTimer?: ReturnType<typeof setTimeout>;
    private drag = false;
    /** setpoint of the wheel set synchronously, so quick taps on −/+ add up before React renders */
    private entwurf: number | null = null;
    private instanzGelesen = '';

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            hzPlan: null,
            hzLayers: null,
            hzPlanFehler: '',
            hzTick: 0,
            hzScale: 1,
            hzPopup: null,
            hzSoll: null,
            hzRueckkehr: null,
            hzDa: false,
            hzUrlaubSoll: 17,
            hzVorheizen: 24,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseHeizung',
            ...SET_INFO,
            visName: 'ZuhauseHeizung',
            visWidgetLabel: 'heizung_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'titel', type: 'text', label: 'title', default: 'Heizung' },
                        { name: 'svg', type: 'image', label: 'plan_svg', tooltip: 'heizung_svg_tip' },
                        { name: 'raeume', type: 'json', label: 'heizung_rooms', tooltip: 'heizung_rooms_tip' },
                        {
                            name: 'instanz',
                            type: 'text',
                            label: 'heizung_instance',
                            tooltip: 'heizung_instance_tip',
                            default: 'junghome-bt-mesh.0',
                        },
                        { name: 'aussen', type: 'id', label: 'heizung_outside', tooltip: 'heizung_outside_tip' },
                        {
                            name: 'boostMinuten',
                            type: 'number',
                            label: 'heizung_boost_minutes',
                            default: 60,
                            min: 1,
                            max: 240,
                        },
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
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-heizung.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseHeizung.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        ensureHeizungStyles();
        this.watcher = new StateWatcher(this.props.context.socket, this.onValues);
        if (this.box.current && typeof ResizeObserver !== 'undefined') {
            this.hzResize = new ResizeObserver(() => this.measure());
            this.hzResize.observe(this.box.current);
        }
        this.measure();
        this.sync();
        // boost countdown
        this.clockTimer = setInterval(() => this.alive && this.setState({ hzTick: this.state.hzTick + 1 }), 15_000);
    }

    componentWillUnmount(): void {
        this.alive = false;
        this.watcher?.stop();
        this.hzResize?.disconnect();
        for (const t of [this.idleTimer, this.writeTimer, this.daTimer, this.startTimer]) {
            if (t) {
                clearTimeout(t);
            }
        }
        if (this.clockTimer) {
            clearInterval(this.clockTimer);
        }
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
        if (s > 0 && Number.isFinite(s) && Math.abs(s - this.state.hzScale) > 0.001) {
            this.setState({ hzScale: s });
        }
    }

    /** JSON fields raw from the project (VIS-2 replaces "{…}" in text attributes as a binding) */
    private rawField(name: 'raeume'): unknown {
        const views = this.props.context.views as unknown as Record<
            string,
            { widgets?: Record<string, { data?: Record<string, unknown> }> } | undefined
        >;
        const raw = views[this.props.view]?.widgets?.[this.props.id]?.data?.[name];
        return raw !== undefined ? raw : this.state.rxData[name];
    }

    private instanz(): string {
        return (this.state.rxData.instanz || 'junghome-bt-mesh.0').trim().replace(/\.$/, '');
    }

    private sync(): void {
        const { raeume } = parseHeizRaeume(this.rawField('raeume'));
        const aussen = this.state.rxData.aussen;
        void this.watcher?.watch([...alleIds(raeume, this.instanz()), ...(aussen ? [aussen] : [])]);
        void this.leseInstanz();
        const path = this.state.rxData.svg;
        const url = path ? resolveImage(path, this.props.context.projectName) : '';
        if (url === this.planUrl) {
            return;
        }
        this.planUrl = url;
        if (!url) {
            this.setState({ hzPlan: null, hzLayers: null, hzPlanFehler: '' });
            return;
        }
        Promise.all([loadPlan(url), loadPlanLayers(url)])
            .then(([plan, layers]) => {
                if (!this.alive || this.planUrl !== url) {
                    return;
                }
                this.setState({ hzPlan: plan, hzLayers: layers, hzPlanFehler: '', hzDa: false });
                if (this.daTimer) {
                    clearTimeout(this.daTimer);
                }
                this.daTimer = setTimeout(() => this.alive && this.setState({ hzDa: true }), 120);
            })
            .catch((e: Error) => {
                if (this.alive && this.planUrl === url) {
                    this.setState({ hzPlan: null, hzLayers: null, hzPlanFehler: e.message });
                }
            });
    }

    /** vacation setpoint and pre-heating hours from the instance settings (falls back to 17 °C / 24 h) */
    private async leseInstanz(): Promise<void> {
        const inst = this.instanz();
        if (inst === this.instanzGelesen) {
            return;
        }
        this.instanzGelesen = inst;
        try {
            const socket = this.props.context.socket as unknown as {
                getObject(id: string): Promise<{ native?: Record<string, unknown> } | null | undefined>;
            };
            const obj = await socket.getObject(`system.adapter.${inst}`);
            const soll = zahl(obj?.native?.vacationSetpoint);
            const std = zahl(obj?.native?.vacationPreheatHours);
            if (this.alive) {
                this.setState({ hzUrlaubSoll: soll ?? 17, hzVorheizen: std ?? 24 });
            }
        } catch {
            // keep the defaults
        }
    }

    private onValues = (): void => {
        if (!this.alive) {
            return;
        }
        // the wheel value is dropped once the thermostat confirmed it
        const offen = this.state.hzPopup;
        if (offen && this.state.hzSoll !== null && !this.drag && !this.writeTimer) {
            const r = this.raeume().find(x => x.id === offen);
            if (r?.thermostat) {
                const s = this.watcher?.snapshot(thermostatIds(r.thermostat).soll);
                if (s?.ack && zahl(s.val) === this.state.hzSoll) {
                    this.entwurf = null;
                    this.setState({ hzSoll: null, hzTick: this.state.hzTick + 1 });
                    return;
                }
            }
        }
        this.setState({ hzTick: this.state.hzTick + 1 });
    };

    private val = (id: string | undefined): unknown => (id ? this.watcher?.val(id) : undefined);

    private raeume(): HeizRaum[] {
        return parseHeizRaeume(this.rawField('raeume')).raeume;
    }

    private set(id: string, value: ioBroker.StateValue): void {
        if (!this.props.editMode && id) {
            this.props.context.setValue(id, value);
        }
    }

    private sicht(r: HeizRaum): RaumSicht {
        const t = r.thermostat ? thermostatIds(r.thermostat) : null;
        const ist = zahl(this.val(r.ist || t?.ist));
        const plan = this.state.hzPlan;
        const flaechen = plan ? flaechenPunkte(r, plan.rooms) : [];
        const boostBis = t ? zahl(this.val(t.boostBis)) : null;
        return {
            r,
            art: raumArt(r, ist !== null),
            ist,
            soll: t ? zahl(this.val(t.soll)) : null,
            heizt: t ? isOn(this.val(t.heizt)) : false,
            boostAn: t ? isOn(this.val(t.boost)) : false,
            boostBis: boostBis && boostBis > 0 ? boostBis : null,
            imUrlaub: t ? isOn(this.val(t.urlaub)) : false,
            flaechen,
            mitte: raumMitte(r, flaechen),
        };
    }

    // ---------------------------------------------------------------- popups

    private oeffne(id: string): void {
        if (this.props.editMode) {
            return;
        }
        const ids = urlaubIds(this.instanz());
        const rueckkehr = zahl(this.val(ids.rueckkehr));
        this.entwurf = null;
        this.setState({
            hzPopup: id,
            hzSoll: null,
            hzRueckkehr:
                id === 'urlaub'
                    ? isOn(this.val(ids.aktiv))
                        ? (rueckkehr ?? 0)
                        : vorschlagRueckkehr(Date.now())
                    : null,
        });
        this.zuNach(id === 'urlaub' ? 20_000 : IDLE_CLOSE_MS);
    }

    private schliesse = (): void => {
        if (this.writeTimer) {
            // write a pending setpoint right away
            clearTimeout(this.writeTimer);
            this.writeTimer = undefined;
            this.schreibeSoll();
        }
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
        this.entwurf = null;
        this.setState({ hzPopup: null, hzSoll: null, hzRueckkehr: null });
    };

    private zuNach(ms: number): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        this.idleTimer = setTimeout(() => {
            this.idleTimer = undefined;
            if (this.drag) {
                this.zuNach(ms);
                return;
            }
            this.schliesse();
        }, ms);
    }

    /** new setpoint from wheel or −/+; written after a short pause so dragging sends one command */
    private aendereSoll(t: number): void {
        const soll = sollRaster(t);
        this.entwurf = soll;
        if (soll !== this.state.hzSoll) {
            this.setState({ hzSoll: soll });
        }
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
        }
        this.writeTimer = setTimeout(() => {
            this.writeTimer = undefined;
            if (!this.drag) {
                this.schreibeSoll();
            }
        }, WRITE_DELAY_MS);
        this.zuNach(IDLE_CLOSE_MS);
    }

    private schreibeSoll(): void {
        const r = this.raeume().find(x => x.id === this.state.hzPopup);
        const soll = this.entwurf ?? this.state.hzSoll;
        if (!r?.thermostat || soll === null) {
            return;
        }
        const ids = thermostatIds(r.thermostat);
        if (zahl(this.val(ids.soll)) !== soll) {
            this.set(ids.soll, soll);
        }
    }

    private radZeiger(e: React.PointerEvent<HTMLDivElement>): void {
        const b = e.currentTarget.getBoundingClientRect();
        // the page may be scaled: work in the unscaled wheel coordinates
        const s = b.width / 260 || 1;
        this.aendereSoll(sollAusZeiger((e.clientX - b.left) / s - 130, (e.clientY - b.top) / s - 130));
    }

    private starteUrlaub(rueckkehr: number): void {
        const ids = urlaubIds(this.instanz());
        this.set(ids.rueckkehr, rueckkehr);
        // the adapter takes one vacation command after the other: switch on once the return is stored
        const t0 = Date.now();
        const warte = (): void => {
            const s = this.watcher?.snapshot(ids.rueckkehr);
            if ((s?.ack && zahl(s.val) === rueckkehr) || Date.now() - t0 > 4000) {
                this.set(ids.aktiv, true);
                return;
            }
            this.startTimer = setTimeout(warte, 150);
        };
        this.startTimer = setTimeout(warte, 150);
        this.schliesse();
    }

    // ---------------------------------------------------------------- render: plan

    private renderPlan(sichten: RaumSicht[], motion: boolean): React.JSX.Element | null {
        const plan = this.state.hzPlan;
        const layers = this.state.hzLayers;
        if (!plan || !layers) {
            return null;
        }
        const vb = layers.viewBox;
        const wid = String(this.props.id);
        const sc = Math.min(PLAN_W / vb.w, PLAN_H / vb.h);
        const ox = (PLAN_W - vb.w * sc) / 2;
        const oy = (PLAN_H - vb.h * sc) / 2;
        const offen = this.state.hzPopup;
        const da = this.state.hzDa || !motion;
        // appearance order: top left to bottom right
        const reihe = [...sichten]
            .filter(s => s.mitte)
            .sort((a, b) => a.mitte!.y + a.mitte!.x * 0.3 - (b.mitte!.y + b.mitte!.x * 0.3))
            .map(s => s.r.id);
        const delay = (id: string): string => (motion ? `${150 + reihe.indexOf(id) * 90}ms` : '0ms');
        return (
            <div className="hz-plan">
                <svg
                    viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <defs>
                        {sichten.map(s =>
                            s.mitte ? (
                                <React.Fragment key={s.r.id}>
                                    <clipPath id={`${wid}-hc-${s.r.id}`}>
                                        {s.flaechen.map(f => (
                                            <polygon
                                                key={f}
                                                points={f}
                                            />
                                        ))}
                                    </clipPath>
                                    <radialGradient
                                        id={`${wid}-hg-${s.r.id}`}
                                        gradientUnits="userSpaceOnUse"
                                        cx={s.mitte.x}
                                        cy={s.mitte.y}
                                        r={s.mitte.radius}
                                    >
                                        {ZuhauseHeizung.stopps(s)}
                                    </radialGradient>
                                </React.Fragment>
                            ) : null,
                        )}
                    </defs>
                    {/* the plan's own background and fills are left out: card colour outside, own fill per room */}
                    <rect
                        x={vb.x}
                        y={vb.y}
                        width={vb.w}
                        height={vb.h}
                        style={{ fill: 'var(--card,#2b2b2f)' }}
                    />
                    {sichten.map(s =>
                        s.mitte ? (
                            <g
                                key={s.r.id}
                                className="hz-raum"
                                onClick={() => this.oeffne(s.r.id)}
                            >
                                {s.flaechen.map(f => (
                                    <polygon
                                        key={f}
                                        points={f}
                                        fill="#232327"
                                    />
                                ))}
                                <rect
                                    className="hz-schein"
                                    x={vb.x}
                                    y={vb.y}
                                    width={vb.w}
                                    height={vb.h}
                                    fill={`url(#${wid}-hg-${s.r.id})`}
                                    clipPath={`url(#${wid}-hc-${s.r.id})`}
                                    style={{ opacity: da ? 1 : 0, transitionDelay: delay(s.r.id) }}
                                />
                                {s.flaechen.map(f => (
                                    <polygon
                                        key={`r${f}`}
                                        className={`hz-rand${offen === s.r.id ? ' sel' : ''}`}
                                        points={f}
                                    />
                                ))}
                            </g>
                        ) : null,
                    )}
                    {/* walls, windows, doors on top */}
                    <g
                        className="hz-deko"
                        dangerouslySetInnerHTML={{ __html: layers.above }}
                    />
                </svg>
                {sichten.map(s =>
                    s.mitte ? (
                        <button
                            key={s.r.id}
                            type="button"
                            className={[
                                'hz-sym',
                                s.art,
                                s.r.klein ? 'klein' : '',
                                s.heizt ? 'heizt' : '',
                                offen === s.r.id ? 'sel' : '',
                                da ? 'da' : '',
                            ].join(' ')}
                            style={{
                                left: ox + (s.mitte.x - vb.x) * sc,
                                top: oy + (s.mitte.y - vb.y) * sc,
                                transitionDelay: delay(s.r.id),
                            }}
                            aria-label={`${s.r.name} ${grad(s.ist, 'de')} Grad`}
                            onClick={() => this.oeffne(s.r.id)}
                        >
                            {ZuhauseHeizung.renderSymbol(s)}
                        </button>
                    ) : null,
                )}
            </div>
        );
    }

    /** gradient stops of the room glow (stronger while the circuit heats) */
    private static stopps(s: RaumSicht): React.JSX.Element[] {
        if (s.ist === null) {
            return [
                <stop
                    key="0"
                    offset={0}
                    stopColor="rgba(255,255,255,.03)"
                />,
                <stop
                    key="1"
                    offset={0.55}
                    stopColor="rgba(255,255,255,.015)"
                />,
                <stop
                    key="2"
                    offset={1}
                    stopColor="rgba(255,255,255,0)"
                />,
            ];
        }
        const c = farbe(s.ist);
        const k = s.heizt ? 1.25 : 1;
        return [
            <stop
                key="0"
                offset={0}
                stopColor={rgba(c, 0.42 * k)}
            />,
            <stop
                key="1"
                offset={0.55}
                stopColor={rgba(c, 0.2 * k)}
            />,
            <stop
                key="2"
                offset={1}
                stopColor={rgba(c, 0.07)}
            />,
        ];
    }

    private static renderSymbol(s: RaumSicht): React.JSX.Element {
        const c = farbe(s.ist);
        const istText =
            s.ist === null ? (
                '–'
            ) : (
                <>
                    {grad(s.ist, 'de')}
                    <small>°</small>
                </>
            );
        if (s.art === 'jung') {
            const soll = s.soll ?? SOLL_MIN;
            const f = Math.max(0, Math.min(1, (soll - SOLL_MIN) / (SOLL_MAX - SOLL_MIN)));
            const L = 2 * Math.PI * 55;
            const an = 0.75 * L;
            return (
                <>
                    <div
                        className="hz-kreis"
                        style={{ color: rgba(c, 1) }}
                    >
                        <svg
                            className="hz-bogen"
                            viewBox="0 0 124 124"
                        >
                            <circle
                                cx={62}
                                cy={62}
                                r={55}
                                fill="none"
                                stroke="rgba(255,255,255,.08)"
                                strokeWidth={4}
                                strokeDasharray={`${an} ${L}`}
                                transform="rotate(135 62 62)"
                                strokeLinecap="round"
                            />
                            <circle
                                cx={62}
                                cy={62}
                                r={55}
                                fill="none"
                                stroke={rgba(farbe(s.soll), 1)}
                                strokeWidth={4}
                                strokeDasharray={`${an * f} ${L}`}
                                transform="rotate(135 62 62)"
                                strokeLinecap="round"
                                style={{ transition: 'stroke-dasharray .9s ease' }}
                            />
                        </svg>
                        <Ic
                            d={FLAMME}
                            size={22}
                            className="hz-flamme"
                        />
                        <div className="hz-t">{istText}</div>
                        <div className="hz-s">
                            Soll {grad(s.soll, 'de')}°{s.boostAn ? ' · Boost' : ''}
                        </div>
                        {s.imUrlaub ? (
                            <span className="hz-urlaubpunkt">
                                <Ic
                                    d={KOFFER}
                                    size={13}
                                />
                            </span>
                        ) : null}
                    </div>
                    <div className="hz-n">{s.r.name}</div>
                </>
            );
        }
        if (s.art === 'alt') {
            return (
                <>
                    <div
                        className="hz-kreis"
                        style={{ color: s.ist === null ? '#8a8882' : rgba(c, 1) }}
                    >
                        <Ic
                            d={FLAMME}
                            size={s.r.klein ? 14 : 22}
                        />
                        <div
                            className="hz-t"
                            style={{ color: s.ist === null ? '#8a8882' : '#fff' }}
                        >
                            {istText}
                        </div>
                        <div className="hz-s">LS 990 · folgt</div>
                    </div>
                    <div className="hz-n">{s.r.name}</div>
                </>
            );
        }
        if (s.art === 'mess') {
            return (
                <>
                    <div
                        className="hz-kreis"
                        style={{ color: rgba(c, 1) }}
                    >
                        <Ic
                            d={THERMO}
                            size={16}
                        />
                        <div className="hz-t">{istText}</div>
                    </div>
                    <div className="hz-n">{s.r.name}</div>
                </>
            );
        }
        return (
            <>
                <div className="hz-kreis">
                    <Ic
                        d={THERMO}
                        size={16}
                    />
                </div>
                <div
                    className="hz-n"
                    style={{ color: '#8a8882' }}
                >
                    {s.r.name}
                </div>
            </>
        );
    }

    // ---------------------------------------------------------------- render: room popup

    private renderRaumPopup(s: RaumSicht, urlaubAktiv: boolean): React.JSX.Element {
        const kopf = (unter: string): React.JSX.Element => (
            <div className="hz-pkopf">
                <h2>{s.r.name}</h2>
                <span>{unter}</span>
                <button
                    type="button"
                    className="hz-x"
                    aria-label="Schließen"
                    onClick={this.schliesse}
                >
                    ✕
                </button>
            </div>
        );
        if (s.art !== 'jung' || !s.r.thermostat) {
            const quelle = s.r.quelle
                ? `gemessen vom ${s.r.quelle}${s.r.decke ? ' an der Decke – vorläufig, zeigt eher zu warm' : ''}`
                : 'gemessen';
            return (
                <div className="hz-popup">
                    {kopf(s.art === 'alt' ? 'Thermostat noch nicht angebunden' : 'nur Anzeige')}
                    <div className="hz-nur">
                        <div
                            className="hz-gross"
                            style={{ color: s.ist === null ? '#6a6862' : rgba(farbe(s.ist), 1) }}
                        >
                            {s.ist === null ? (
                                '–'
                            ) : (
                                <>
                                    {grad(s.ist, 'de')}
                                    <small style={{ fontSize: 30 }}>°</small>
                                </>
                            )}
                        </div>
                        <p>
                            {s.ist === null ? 'In diesem Raum misst noch kein Sensor.' : quelle}
                            <br />
                            {s.art === 'alt'
                                ? 'Thermostat: noch das alte JUNG LS 990 – einstellbar nach dem Tausch auf JUNG HOME.'
                                : 'In diesem Raum gibt es keinen eigenen Heizkreis.'}
                        </p>
                    </div>
                </div>
            );
        }
        const ids = thermostatIds(s.r.thermostat);
        const soll = this.state.hzSoll ?? s.soll ?? 20;
        const farbeSoll = farbe(soll);
        const C = 130;
        const RR = 112;
        const pos = (a: number, rr = RR): [number, number] => [
            C + rr * Math.cos((a * Math.PI) / 180),
            C + rr * Math.sin((a * Math.PI) / 180),
        ];
        const [px, py] = pos(sollWinkel(soll));
        const istWinkel = sollWinkel(s.ist ?? SOLL_MIN);
        const [ix, iy] = pos(istWinkel, RR + 15);
        const z = zustand(s.ist, soll, s.heizt);
        const zText = {
            heizt: 'Fußboden heizt',
            erreicht: 'Ziel erreicht · Kreis ruht',
            wartet: 'wartet',
            unbekannt: '',
        }[z];
        const minuten = Number(this.state.rxData.boostMinuten) || 60;
        const rest = boostRest(s.boostBis, minuten, Date.now());
        const step = (d: number): void => this.aendereSoll((this.entwurf ?? soll) + d);
        return (
            <div className="hz-popup">
                {kopf('Fußbodenkreis · JUNG')}
                <div className="hz-reihe">
                    <button
                        type="button"
                        className="hz-pm"
                        aria-label="kälter"
                        onClick={() => step(-0.5)}
                    >
                        −
                    </button>
                    <div
                        ref={this.rad}
                        className="hz-rad"
                        onPointerDown={e => {
                            this.drag = true;
                            e.currentTarget.setPointerCapture(e.pointerId);
                            this.radZeiger(e);
                        }}
                        onPointerMove={e => this.drag && this.radZeiger(e)}
                        onPointerUp={() => {
                            this.drag = false;
                            this.aendereSoll(soll);
                        }}
                        onPointerCancel={() => {
                            this.drag = false;
                        }}
                    >
                        <svg viewBox="0 0 260 260">
                            <defs>
                                <filter
                                    id={`${String(this.props.id)}-gl`}
                                    x="-50%"
                                    y="-50%"
                                    width="200%"
                                    height="200%"
                                >
                                    <feGaussianBlur
                                        stdDeviation="3.5"
                                        result="b"
                                    />
                                    <feMerge>
                                        <feMergeNode in="b" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>
                            {Array.from({ length: TICKS }, (_, i) => {
                                const t = SOLL_MIN + i / 2;
                                const [x, y] = pos(RAD_START + (i / (TICKS - 1)) * (RAD_ENDE - RAD_START));
                                const an = t <= soll + 1e-6;
                                return (
                                    <circle
                                        key={i}
                                        cx={x}
                                        cy={y}
                                        r={an ? 3.4 : 2.5}
                                        fill={an ? rgba(farbe(t), 1) : '#3a3a40'}
                                    />
                                );
                            })}
                            {s.ist !== null ? (
                                <line
                                    x1={0}
                                    y1={-8}
                                    x2={0}
                                    y2={8}
                                    stroke="#ece9e1"
                                    strokeWidth={2.5}
                                    strokeLinecap="round"
                                    transform={`translate(${ix} ${iy}) rotate(${istWinkel + 90})`}
                                />
                            ) : null}
                            <circle
                                cx={px}
                                cy={py}
                                r={11}
                                fill={rgba(farbeSoll, 1)}
                                filter={`url(#${String(this.props.id)}-gl)`}
                            />
                            <circle
                                cx={px}
                                cy={py}
                                r={4.5}
                                fill="#fff"
                            />
                        </svg>
                        <div className="hz-mitte">
                            <div
                                className="hz-gross"
                                style={{ color: rgba(farbeSoll, 1) }}
                            >
                                {grad(soll, 'de')}
                                <small>°</small>
                            </div>
                            <div className="hz-unter">Soll</div>
                            <div className="hz-jetzt">
                                jetzt <b>{grad(s.ist, 'de')}°</b>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="hz-pm"
                        aria-label="wärmer"
                        onClick={() => step(0.5)}
                    >
                        +
                    </button>
                </div>
                <div className={`hz-zust${z === 'heizt' ? ' heiss' : ''}`}>
                    {this.state.hzSoll !== null && this.state.hzSoll !== s.soll ? 'wird gesendet …' : zText}
                </div>
                {urlaubAktiv ? (
                    s.imUrlaub ? (
                        <div className="hz-band">
                            <Ic
                                d={KOFFER}
                                size={18}
                            />
                            <span>Im Urlaub abgesenkt. Verstellen nimmt den Raum aus der Absenkung.</span>
                        </div>
                    ) : (
                        <div className="hz-band">
                            <Ic
                                d={KOFFER}
                                size={18}
                            />
                            <span>Nicht in der Urlaubsabsenkung</span>
                            <button
                                type="button"
                                onClick={() => {
                                    this.set(ids.urlaub, true);
                                    this.zuNach(IDLE_CLOSE_MS);
                                }}
                            >
                                ↩ Zurück in die Absenkung
                            </button>
                        </div>
                    )
                ) : null}
                <button
                    type="button"
                    className={`hz-boost${s.boostAn ? ' an' : ''}`}
                    onClick={() => {
                        this.set(ids.boost, !s.boostAn);
                        this.entwurf = null;
                        this.setState({ hzSoll: null });
                        if (this.idleTimer) {
                            clearTimeout(this.idleTimer);
                            this.idleTimer = undefined;
                        }
                    }}
                >
                    <span
                        className="bal"
                        style={{ width: `${Math.round(rest.anteil * 100)}%` }}
                    />
                    <span className="fl">
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            aria-hidden
                        >
                            <path
                                d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 2-2 3-4 3 0-2 0-4-2-7-1 4-4 7-4 12 0 4 3 8 7 8z"
                                fill="#ff8a3d"
                            />
                            <path
                                d="M12 22c2 0 3.5-1.5 3.5-3.5S14 15 13 13c-.5 1.5-1.5 2-2.5 2 0 1.5-1 2-1 3.5S10 22 12 22z"
                                fill="#ffd36b"
                            />
                        </svg>
                    </span>
                    <span>
                        <span className="t1">Boost</span>
                        <br />
                        <span className="t2">
                            {s.boostAn ? 'läuft · danach zurück' : `${minuten} min volle Wärme, danach zurück`}
                        </span>
                    </span>
                    <span className="zeit">{s.boostAn && rest.minuten ? `${rest.minuten} min` : ''}</span>
                </button>
            </div>
        );
    }

    // ---------------------------------------------------------------- render: vacation popup

    private renderUrlaubPopup(aktiv: boolean, rueckkehrJetzt: number | null, abgesenkt: number): React.JSX.Element {
        const ids = urlaubIds(this.instanz());
        const entwurf = this.state.hzRueckkehr ?? 0;
        const mitEnde = entwurf > 0;
        const now = Date.now();
        const vorheizen = this.state.hzVorheizen;
        const zuSpaet = mitEnde && vorheizenAb(entwurf, vorheizen) <= now;
        const schiebe = (tage: number, stunden: number): void => {
            this.setState({ hzRueckkehr: verschiebe(entwurf || vorschlagRueckkehr(now), tage, stunden, now) });
            this.zuNach(20_000);
        };
        const p = (n: number): string => String(n).padStart(2, '0');
        const d = new Date(entwurf || now);
        const geaendert = aktiv && entwurf !== (rueckkehrJetzt ?? 0);
        return (
            <div className="hz-popup">
                <div className="hz-pkopf">
                    <h2>Urlaubsabsenkung</h2>
                    <span>
                        {aktiv ? `läuft · ${abgesenkt} ${abgesenkt === 1 ? 'Raum' : 'Räume'} abgesenkt` : 'aus'}
                    </span>
                    <button
                        type="button"
                        className="hz-x"
                        aria-label="Schließen"
                        onClick={this.schliesse}
                    >
                        ✕
                    </button>
                </div>
                <div className="hz-info">
                    Alle angebundenen Räume gehen auf <b>{grad(this.state.hzUrlaubSoll, 'de')} °C</b>.{' '}
                    {vorheizen > 0
                        ? `${vorheizen} h vor der Rückkehr kommen die alten Sollwerte zurück.`
                        : 'Zur Rückkehr kommen die alten Sollwerte zurück.'}
                </div>
                <div className="hz-uzeile">
                    <span className="lbl">Rückkehr</span>
                    <div className="hz-seg">
                        <button
                            type="button"
                            className={mitEnde ? 'an' : ''}
                            onClick={() => schiebe(0, 0)}
                        >
                            mit Datum
                        </button>
                        <button
                            type="button"
                            className={mitEnde ? '' : 'an'}
                            onClick={() => this.setState({ hzRueckkehr: 0 })}
                        >
                            ohne Ende
                        </button>
                    </div>
                </div>
                {mitEnde ? (
                    <>
                        <div className="hz-uzeile">
                            <span className="lbl">Tag</span>
                            <div className="hz-stepper">
                                <button
                                    type="button"
                                    aria-label="einen Tag früher"
                                    onClick={() => schiebe(-1, 0)}
                                >
                                    −
                                </button>
                                <output>{kurzeZeit(entwurf, 'de').slice(0, -6)}</output>
                                <button
                                    type="button"
                                    aria-label="einen Tag später"
                                    onClick={() => schiebe(1, 0)}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                        <div className="hz-uzeile">
                            <span className="lbl">Uhrzeit</span>
                            <div className="hz-stepper">
                                <button
                                    type="button"
                                    aria-label="eine Stunde früher"
                                    onClick={() => schiebe(0, -1)}
                                >
                                    −
                                </button>
                                <output>
                                    {p(d.getHours())}:{p(d.getMinutes())}
                                </output>
                                <button
                                    type="button"
                                    aria-label="eine Stunde später"
                                    onClick={() => schiebe(0, 1)}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                        <div className="hz-info">
                            {zuSpaet ? (
                                'Die Rückkehr ist näher als die Vorheizzeit – bitte später wählen.'
                            ) : (
                                <>
                                    Vorheizen ab <b>{kurzeZeit(vorheizenAb(entwurf, vorheizen), 'de')}</b>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="hz-info">
                        Die Absenkung läuft, bis du sie beendest (hier oder „Urlaub aus“ in Telegram).
                    </div>
                )}
                {aktiv ? (
                    <>
                        {geaendert ? (
                            <button
                                type="button"
                                className="hz-knopf"
                                disabled={zuSpaet}
                                onClick={() => {
                                    this.set(ids.rueckkehr, entwurf);
                                    this.schliesse();
                                }}
                            >
                                Rückkehr speichern
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="hz-knopf aus"
                            onClick={() => {
                                this.set(ids.aktiv, false);
                                this.schliesse();
                            }}
                        >
                            Urlaub beenden
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        className="hz-knopf"
                        disabled={zuSpaet}
                        onClick={() => this.starteUrlaub(entwurf)}
                    >
                        <Ic
                            d={KOFFER}
                            size={20}
                        />
                        Urlaub starten
                    </button>
                )}
            </div>
        );
    }

    // ---------------------------------------------------------------- render: page

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date());
        const motion = motionAllowed(levelClass);
        const { raeume, fehler } = parseHeizRaeume(this.rawField('raeume'));
        const sichten = raeume.map(r => this.sicht(r));
        const werte: RaumWert[] = sichten.map(s => ({ name: s.r.name, ist: s.ist, heizt: s.heizt, art: s.art }));
        const k = kennzahlen(werte);
        const uIds = urlaubIds(this.instanz());
        const urlaubAktiv = isOn(this.val(uIds.aktiv));
        const rueckkehr = zahl(this.val(uIds.rueckkehr));
        const vorheizen = zahl(this.val(uIds.vorheizen));
        const abgesenkt = zahl(this.val(uIds.raeume)) ?? 0;
        const aussen = zahl(this.val(d.aussen));
        const offen = this.state.hzPopup;
        const offenSicht = offen && offen !== 'urlaub' ? sichten.find(s => s.r.id === offen) : undefined;

        let hinweis = '';
        if (!d.svg) {
            hinweis = 'Grundriss-SVG im Editor wählen';
        } else if (this.state.hzPlanFehler) {
            hinweis = `Plan: ${this.state.hzPlanFehler}`;
        } else if (!raeume.length) {
            hinweis = 'Räume (JSON) im Editor eintragen';
        } else if (fehler.length && this.props.editMode) {
            hinweis = fehler.slice(0, 3).join(' · ');
        }

        return (
            <div
                ref={this.box}
                className={levelClass}
                style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
            >
                <div
                    className="hz"
                    style={{ transform: `scale(${this.state.hzScale})` }}
                >
                    <header className="hz-kopf">
                        <h1>{d.titel || 'Heizung'}</h1>
                        <div className="hz-chips">
                            <div className={`hz-chip${k.heizen ? ' heiss' : ''}`}>
                                <Ic
                                    d={FLAMME}
                                    size={16}
                                />
                                {k.heizen
                                    ? `${k.heizen} ${k.heizen === 1 ? 'Kreis heizt' : 'Kreise heizen'}`
                                    : 'kein Kreis heizt'}
                            </div>
                            {d.aussen ? (
                                <div className="hz-chip">
                                    <Ic
                                        d={SONNE}
                                        size={16}
                                    />
                                    außen <b>{grad(aussen, 'de')}°</b>
                                </div>
                            ) : null}
                            <button
                                type="button"
                                className={`hz-chip${urlaubAktiv ? ' urlaub' : ''}`}
                                onClick={() => this.oeffne('urlaub')}
                            >
                                <Ic
                                    d={KOFFER}
                                    size={16}
                                />
                                {urlaubAktiv
                                    ? rueckkehr
                                        ? `Urlaub bis ${kurzeZeit(rueckkehr, 'de')}`
                                        : 'Urlaub läuft'
                                    : 'Urlaub'}
                            </button>
                        </div>
                    </header>
                    <div className="hz-feld">
                        <div className="hz-spalte">
                            <div className="hz-kz">
                                <span>Innen Ø</span>
                                <b>
                                    {grad(k.mittel, 'de')}
                                    <small>°</small>
                                </b>
                            </div>
                            <div className="hz-kz">
                                <span>Wärmster</span>
                                <b>
                                    {grad(k.waermster?.ist ?? null, 'de')}
                                    <small>° {k.waermster?.name ?? ''}</small>
                                </b>
                            </div>
                            <div className="hz-kz">
                                <span>Kühlster</span>
                                <b>
                                    {grad(k.kuehlster?.ist ?? null, 'de')}
                                    <small>° {k.kuehlster?.name ?? ''}</small>
                                </b>
                            </div>
                            <div className="hz-kz">
                                <span>JUNG angebunden</span>
                                <b>
                                    {k.jung}
                                    <small> von {k.kreise} Thermostaten</small>
                                </b>
                            </div>
                            {urlaubAktiv ? (
                                <div className="hz-kz urlaub">
                                    <span>Urlaub · {grad(this.state.hzUrlaubSoll, 'de')} °C</span>
                                    <b>
                                        {vorheizen ? (
                                            <>
                                                <small>vorheizen ab </small>
                                                {kurzeZeit(vorheizen, 'de')}
                                            </>
                                        ) : (
                                            <small>ohne Rückkehrdatum</small>
                                        )}
                                    </b>
                                </div>
                            ) : null}
                        </div>
                        {this.renderPlan(sichten, motion)}
                        <div className="hz-legende">
                            <span>kühl</span>
                            <i />
                            <span>warm</span>
                        </div>
                        <div className="hz-hinweis">Raum antippen öffnet das Einstellrad</div>
                        {hinweis ? <div className="hz-fehler">{hinweis}</div> : null}
                    </div>
                    {offen && !this.props.editMode ? (
                        <div
                            className="hz-schleier"
                            onPointerDown={e => {
                                if (e.target === e.currentTarget) {
                                    this.schliesse();
                                }
                            }}
                        >
                            {offen === 'urlaub'
                                ? this.renderUrlaubPopup(urlaubAktiv, rueckkehr, abgesenkt)
                                : offenSicht
                                  ? this.renderRaumPopup(offenSicht, urlaubAktiv)
                                  : null}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }
}
