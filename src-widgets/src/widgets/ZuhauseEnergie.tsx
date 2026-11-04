/*
 * VIS-2 widget "Energie" for the BK215 balcony storage (adapter bk215, Sunlit / SunEnergyXT cloud).
 * Two layouts:
 * - "seite": a whole page (1357 × 900, scaled to the widget box) with the live flow
 *   Solar → Akku → Wechselrichter → Haus ↔ Netz, battery with modules and today's level curve incl.
 *   full/empty estimate, solar inputs with forecast, and the chart Heute / Woche / Monat / Seit 1.1. / Immer
 *   with self-sufficiency, self-use and savings.
 * - "kachel": the energy card of the start page (Netz, Solar, Akku), warns when the cloud is gone or
 *   the battery is empty; a tap opens the energy page (inside a ZuhauseSeiten frame when there is one).
 *
 * The bk215 data points are not attribute fields, the widget subscribes them itself (StateWatcher).
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import {
    ZEITRAEUME,
    ZEITRAUM_TEXT,
    achse,
    akkuProjektion,
    balkenListe,
    fluss,
    hinweis,
    historyPunkte,
    parseBuckets,
    parseKurve,
    parseModule,
    parseMppt,
    prognose,
    prognoseUrl,
    summe,
    tagBucket,
    uhrzeit,
    type Balken,
    type Prognose,
    type Punkt,
    type Statistik,
    type Zeitraum,
} from '../lib/energie';
import { formatNumber } from '../lib/model';
import { ensureStyles, fonts, v } from '../lib/theme';
import { PREFIX, SET_INFO, motionClass, requestTab } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const W = 1357;
const H = 900;
/** series colors, validated on the dark card (dataviz validator, all pairs) */
const C = { solar: '#c98500', netz: '#3987e5', akku: '#199e70', haus: '#a3a19a' } as const;
const HISTORY_MS = 5 * 60_000;
const PROGNOSE_MS = 60 * 60_000;

interface EnergieRxData {
    darstellung: string;
    geraet: string;
    oidNetz: string;
    historie: string;
    strompreis: number;
    minSoc: number;
    prognose: boolean;
    klickView: string;
    zurueck: string;
    /** minutes without touch until the page returns by itself (0 = never) */
    autoZurueck: number;
    animationStufe: string;
    nachtAus: boolean;
}

interface EnergieState extends VisRxWidgetState {
    zeTab: Zeitraum;
    zeHover: number | null;
    zeNetzHeute: Punkt[];
    zeSocHeute: Punkt[];
    zePrognose: Prognose | null;
    zeScale: number;
    zeTick: number;
}

const LIVE = [
    'live.soc',
    'live.batteryW',
    'live.solarW',
    'live.inverterW',
    'live.meterW',
    'live.homeW',
    'live.fullAt',
    'live.emptyAt',
    'live.mppt',
    'live.moduleSoc',
    'live.minSoc',
    'live.batteryStatus',
    'today.curve',
    'today.solarKwh',
    'stats.days',
    'stats.daysPrev',
    'stats.months',
    'stats.years',
    'info.connection',
    'info.lastSync',
] as const;
type LiveKey = (typeof LIVE)[number];

// ---------------------------------------------------------------- formatting

function watt(w: number, lang: string): string {
    const a = Math.abs(w);
    return a >= 1000 ? `${formatNumber(w / 1000, 2, lang)} kW` : `${formatNumber(Math.round(w), 0, lang)} W`;
}
function kwh(x: number, lang: string): string {
    return `${formatNumber(x, x >= 100 ? 0 : 1, lang)} kWh`;
}
function prozent(x: number | null, lang: string): string {
    return x === null ? '—' : `${formatNumber(x * 100, 0, lang)} %`;
}
function euro(x: number, lang: string): string {
    return `${formatNumber(x, 2, lang)} €`;
}
const hhmm = (min: number): string =>
    `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- icons (24 grid)

const ICON: Record<string, string> = {
    solar: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    akku: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M10 2.5h4"/><path d="M9 15h6M9 11h6"/>',
    wr: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7 10.5c1.2-2 2.6-2 3.8 0s2.6 2 3.8 0"/><path d="M7.5 15h3M13.5 15h3"/>',
    haus: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    netz: '<path d="M12 3l-4 18M12 3l4 18M8.8 8h6.4M7.6 13.5h8.8M6.5 19h11"/>',
    zurueck: '<path d="M15 5l-7 7 7 7"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 7 18z"/>',
    warn: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/>',
    blitz: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
};

function Ic({ d, size = 24, color }: { d: string; size?: number; color?: string }): React.JSX.Element {
    return (
        <svg
            className="ze-ic"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            style={color ? { color } : undefined}
            aria-hidden="true"
            // static markup of this file only
            dangerouslySetInnerHTML={{ __html: d }}
        />
    );
}

// ---------------------------------------------------------------- styles

const STYLE_ID = 'zh-energie-styles';
const NUM = "'Zuhause Barlow Condensed','Barlow Condensed',system-ui,sans-serif";
const CSS = `
.ze{width:${W}px;height:${H}px;padding:24px;box-sizing:border-box;display:grid;grid-template-columns:520px 1fr 1fr;grid-template-rows:56px 300px 1fr;gap:16px;font-family:'Zuhause Barlow',Barlow,system-ui,sans-serif;color:var(--text,#ece9e1);transform-origin:top left;user-select:none;-webkit-tap-highlight-color:transparent}
.ze *{box-sizing:border-box}
.ze-ic{display:block;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.ze-kopf{grid-column:1/-1;display:flex;align-items:center;gap:16px}
.ze-kopf h1{margin:0;font-size:30px;font-weight:600;letter-spacing:.01em}
.ze-zur{display:flex;align-items:center;justify-content:center;width:48px;height:48px;padding:0;border-radius:24px;border:1px solid var(--sw-off-bd,#44444a);background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);font:600 16px 'Zuhause Barlow',Barlow,system-ui,sans-serif;cursor:pointer}
.ze-pill{display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:20px;background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);color:var(--text-2,#a3a19a);font-size:15px;white-space:nowrap}
.ze-pill b{color:var(--text,#ece9e1);font:600 18px ${NUM}}
.ze-pill.warn{background:var(--warn-bg,#3a1d1f);border-color:var(--warn-bd,#e5484d);color:var(--warn-fg,#ffb3b3)}
.ze-card{background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);border-radius:var(--radius-card,18px);padding:16px 18px;min-width:0;min-height:0;position:relative;overflow:hidden}
.ze-h{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:.1em;color:var(--text-2,#a3a19a);text-transform:uppercase}
.ze-h span{flex:1}
.ze-big{font:600 46px/1 ${NUM};margin-top:8px;white-space:nowrap}
.ze-big small{font-size:22px;color:var(--text-2,#a3a19a);margin-left:4px}
.ze-sub{font-size:15px;color:var(--text-2,#a3a19a);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ze-sub b{color:var(--text,#ece9e1);font-weight:600}
.ze-mods{display:flex;gap:6px;margin-top:12px}
.ze-mod{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;font-size:12px;white-space:nowrap;color:var(--text-2,#a3a19a)}
.ze-mod i{display:block;height:8px;border-radius:4px;background:var(--sw-off-bg,#333338);overflow:hidden}
.ze-mod i>b{display:block;height:100%;border-radius:4px;background:${C.akku}}
.ze-rows{display:flex;flex-direction:column;gap:5px;margin-top:14px}
.ze-row{display:grid;grid-template-columns:140px 1fr 64px;align-items:center;column-gap:10px;font-size:14px;height:20px}
.ze-row span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-2,#a3a19a)}
.ze-row b{font:600 17px ${NUM};text-align:right}
.ze-row i{display:block;height:6px;border-radius:3px;background:var(--sw-off-bg,#333338);overflow:hidden}
.ze-row i>em{display:block;height:100%;border-radius:3px;background:${C.solar}}
.ze-chart{grid-column:1/-1;display:grid;grid-template-columns:1fr 300px;grid-template-rows:44px 1fr;column-gap:24px;row-gap:8px}
.ze-tabs{display:flex;gap:6px;align-items:center}
.ze-tab{height:40px;padding:0 18px;border-radius:20px;border:1px solid var(--sw-off-bd,#44444a);background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);font:600 16px 'Zuhause Barlow',Barlow,system-ui,sans-serif;cursor:pointer}
.ze-tab.an{background:var(--sw-on,#f2c14e);border-color:var(--sw-on,#f2c14e);color:var(--sw-on-fg,#2a2108)}
.ze-leg{display:flex;gap:16px;align-items:center;justify-content:flex-end;font-size:13px;color:var(--text-2,#a3a19a)}
.ze-leg span{display:flex;align-items:center;gap:6px}
.ze-leg i{display:block;width:12px;height:12px;border-radius:3px}
.ze-leg i.l{height:3px;border-radius:2px}
.ze-plot{position:relative;min-height:0}
.ze-plot svg{display:block;width:100%;height:100%;overflow:visible;touch-action:none}
.ze-ax{font:500 13px ${NUM};fill:var(--text-2,#a3a19a)}
.ze-grid{stroke:var(--border,#36363b);stroke-width:1}
.ze-tip{position:absolute;pointer-events:none;background:#1a1a1c;border:1px solid var(--border,#36363b);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--text-2,#a3a19a);white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.45);z-index:2}
.ze-tip b{color:var(--text,#ece9e1);font-weight:600}
.ze-tip div{display:flex;align-items:center;gap:6px;margin-top:3px}
.ze-tip i{display:block;width:9px;height:9px;border-radius:2px}
.ze-sum{grid-row:1/3;grid-column:2;display:flex;flex-direction:column;gap:10px;padding-left:24px;border-left:1px solid var(--border,#36363b)}
.ze-sum h2{margin:0;font-size:13px;font-weight:600;letter-spacing:.1em;color:var(--text-2,#a3a19a);text-transform:uppercase}
.ze-kv{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:15px;color:var(--text-2,#a3a19a)}
.ze-kv b{font:600 22px ${NUM};color:var(--text,#ece9e1)}
.ze-kv.gross b{font-size:30px}
.ze-meter{height:8px;border-radius:4px;background:var(--sw-off-bg,#333338);overflow:hidden;display:flex;gap:2px}
.ze-meter>i{display:block;height:100%}
.ze-hinweis{font-size:12px;color:var(--text-2,#a3a19a);margin-top:auto;line-height:1.35}
.ze-kf{flex:1 1 24px;min-width:18px;height:3px;margin-top:30px;border-radius:2px;background:var(--border,#36363b);position:relative}
.ze-kf i{position:absolute;top:50%;left:0;width:7px;height:7px;margin-top:-3.5px;border-radius:50%;box-shadow:0 0 6px currentColor;animation:ze-kf-run 2s linear infinite}
.ze-kf.rev i{animation-direction:reverse}
@keyframes ze-kf-run{from{left:0}to{left:calc(100% - 7px)}}
.zh-still .ze-kf i{animation:none;opacity:0}
@media (prefers-reduced-motion:reduce){.ze-kf i{animation:none;opacity:0}}
.ze-fl{font:500 13px 'Zuhause Barlow',Barlow,system-ui,sans-serif;fill:var(--text-2,#a3a19a)}
@keyframes ze-move{from{offset-distance:0%}to{offset-distance:100%}}
.ze-dot{animation:ze-move var(--ze-t,2.4s) linear infinite}
.zh-still .ze-dot{animation:none;opacity:0}
@media (prefers-reduced-motion:reduce){.ze-dot{animation:none;opacity:0}}
`;

function ensureEnergieStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

// ---------------------------------------------------------------- widget

export default class ZuhauseEnergie extends (window.visRxWidget as typeof VisRxWidget)<EnergieRxData, EnergieState> {
    private watcher?: StateWatcher;
    private box = React.createRef<HTMLDivElement>();
    private zeResize?: ResizeObserver;
    private timers: ReturnType<typeof setInterval>[] = [];
    private alive = true;
    private letzteAktion = Date.now();
    private wisch: { x: number; y: number; t: number } | null = null;
    private prognoseTs = 0;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            zeTab: 'heute',
            zeHover: null,
            zeNetzHeute: [],
            zeSocHeute: [],
            zePrognose: null,
            zeScale: 1,
            zeTick: 0,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseEnergie',
            ...SET_INFO,
            visName: 'ZuhauseEnergie',
            visWidgetLabel: 'energie_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'darstellung',
                            type: 'select',
                            label: 'layout',
                            options: [
                                { value: 'seite', label: 'energie_page' },
                                { value: 'kachel', label: 'energie_card' },
                            ],
                            default: 'seite',
                        },
                        {
                            name: 'geraet',
                            type: 'text',
                            label: 'energie_instance',
                            tooltip: 'energie_instance_tip',
                            default: 'bk215.0',
                        },
                        {
                            name: 'oidNetz',
                            type: 'id',
                            label: 'energie_grid',
                            tooltip: 'energie_grid_tip',
                        },
                        {
                            name: 'historie',
                            type: 'text',
                            label: 'energie_history',
                            tooltip: 'energie_history_tip',
                            default: 'history.0',
                        },
                        {
                            name: 'strompreis',
                            type: 'number',
                            label: 'energie_price',
                            tooltip: 'energie_price_tip',
                            default: 0,
                            step: 0.01,
                        },
                        { name: 'minSoc', type: 'number', label: 'energie_minsoc', default: 0, min: 0, max: 50 },
                        {
                            name: 'prognose',
                            type: 'checkbox',
                            label: 'energie_forecast',
                            tooltip: 'energie_forecast_tip',
                            default: true,
                        },
                        {
                            name: 'klickView',
                            type: 'select-views',
                            label: 'click_view',
                            multiple: false,
                            hidden: 'data.darstellung !== "kachel"',
                        },
                        {
                            name: 'zurueck',
                            type: 'select-views',
                            label: 'energie_back',
                            multiple: false,
                            hidden: 'data.darstellung === "kachel"',
                        },
                        {
                            name: 'autoZurueck',
                            type: 'number',
                            label: 'energie_auto_back',
                            default: 2,
                            min: 0,
                            max: 60,
                            hidden: 'data.darstellung === "kachel"',
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
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-werte.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseEnergie.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        ensureEnergieStyles();
        this.watcher = new StateWatcher(this.props.context.socket, () => this.alive && this.forceUpdate());
        if (this.box.current && typeof ResizeObserver !== 'undefined') {
            this.zeResize = new ResizeObserver(() => this.measure());
            this.zeResize.observe(this.box.current);
        }
        this.measure();
        this.sync();
        this.timers.push(
            setInterval(() => {
                void this.loadHistory();
                void this.loadPrognose();
            }, HISTORY_MS),
            // clock for "vor x min", the projection and the hint
            setInterval(() => this.alive && this.setState({ zeTick: Date.now() }), 60_000),
            setInterval(() => this.autoZurueck(), 5_000),
        );
    }

    componentWillUnmount(): void {
        this.alive = false;
        this.watcher?.stop();
        this.zeResize?.disconnect();
        this.timers.forEach(t => clearInterval(t));
        super.componentWillUnmount();
    }

    onRxDataChanged(): void {
        this.sync();
    }

    private base(): string {
        return (this.state.rxData.geraet || 'bk215.0').replace(/\.$/, '');
    }

    private id(k: LiveKey): string {
        return `${this.base()}.${k}`;
    }

    private val(k: LiveKey): unknown {
        return this.watcher?.val(this.id(k));
    }

    private seite(): boolean {
        return this.state.rxData.darstellung !== 'kachel';
    }

    private sync(): void {
        const ids: string[] = LIVE.map(k => this.id(k));
        if (this.state.rxData.oidNetz) {
            ids.push(this.state.rxData.oidNetz);
        }
        void this.watcher?.watch(ids).then(() => {
            void this.loadHistory();
            void this.loadPrognose();
        });
    }

    private measure(): void {
        const el = this.box.current;
        if (!el || !this.seite()) {
            return;
        }
        const s = Math.min(el.clientWidth / W, el.clientHeight / H);
        if (s > 0 && Number.isFinite(s) && Math.abs(s - this.state.zeScale) > 0.001) {
            this.setState({ zeScale: s });
        }
    }

    private statistik(): Statistik {
        return {
            days: parseBuckets(this.val('stats.days')),
            daysPrev: parseBuckets(this.val('stats.daysPrev')),
            months: parseBuckets(this.val('stats.months')),
            years: parseBuckets(this.val('stats.years')),
        };
    }

    /** Today's grid power and battery level from the history adapter (5-minute averages) */
    private async loadHistory(): Promise<void> {
        if (!this.seite()) {
            return;
        }
        const socket = this.props.context.socket as unknown as {
            getHistory?: (id: string, o: ioBroker.GetHistoryOptions) => Promise<unknown>;
        };
        if (typeof socket.getHistory !== 'function') {
            return;
        }
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const opts: ioBroker.GetHistoryOptions = {
            instance: this.state.rxData.historie || 'history.0',
            start,
            end: now.getTime(),
            aggregate: 'average',
            step: 5 * 60_000,
            ignoreNull: true,
        };
        const read = async (id: string): Promise<Punkt[]> => {
            try {
                return historyPunkte(await socket.getHistory!(id, opts), now);
            } catch {
                return [];
            }
        };
        const netzId = this.state.rxData.oidNetz || this.id('live.meterW');
        const [netz, soc] = await Promise.all([read(netzId), read(this.id('live.soc'))]);
        if (this.alive) {
            this.setState({ zeNetzHeute: netz, zeSocHeute: soc });
        }
    }

    /** Solar forecast of open-meteo for the position of the ioBroker system, at most once an hour */
    private async loadPrognose(): Promise<void> {
        if (!this.state.rxData.prognose || Date.now() - this.prognoseTs < PROGNOSE_MS - 5000) {
            return;
        }
        const s = this.statistik();
        if (!s.days.length) {
            return;
        }
        this.prognoseTs = Date.now();
        try {
            const cfg = await this.props.context.socket.getCompactSystemConfig();
            const lat = Number(cfg?.common?.latitude);
            const lon = Number(cfg?.common?.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
                return;
            }
            const res = await fetch(prognoseUrl(lat, lon));
            if (!res.ok) {
                return;
            }
            const p = prognose(await res.json(), new Date(), s);
            if (this.alive) {
                this.setState({ zePrognose: p });
            }
        } catch {
            // no forecast without internet, the page works without it
        }
    }

    /** back to the start page after some minutes without touch, only while the page is on screen */
    private autoZurueck(): void {
        const d = this.state.rxData;
        // not set yet in widgets created before this field: 2 minutes
        const raw: unknown = d.autoZurueck;
        const min = raw === undefined || raw === null || raw === '' ? 2 : Number(raw);
        const el = this.box.current;
        const sichtbar =
            !!el && el.getClientRects().length > 0 && (typeof document === 'undefined' || !document.hidden);
        if (!this.seite() || !d.zurueck || this.props.editMode || !(min > 0) || !sichtbar) {
            // hidden pages start counting again when they come back
            this.letzteAktion = Date.now();
            return;
        }
        if (Date.now() - this.letzteAktion >= min * 60_000) {
            this.letzteAktion = Date.now();
            this.go(d.zurueck);
        }
    }

    private beruehrt = (e: React.PointerEvent): void => {
        this.letzteAktion = Date.now();
        this.wisch = { x: e.clientX, y: e.clientY, t: Date.now() };
    };

    /** swipe to the right (finger moves left → right) goes back */
    private losgelassen = (e: React.PointerEvent): void => {
        const w = this.wisch;
        this.wisch = null;
        this.letzteAktion = Date.now();
        if (!w || !this.state.rxData.zurueck) {
            return;
        }
        const dx = e.clientX - w.x;
        const dy = Math.abs(e.clientY - w.y);
        if (dx > 120 && dy < dx * 0.5 && Date.now() - w.t < 900) {
            this.go(this.state.rxData.zurueck);
        }
    };

    private go(view: string): void {
        if (!view || this.props.editMode) {
            return;
        }
        if (!requestTab({ von: this.props.view, nach: view })) {
            this.props.context.changeView(view);
        }
    }

    // ---------------------------------------------------------------- render

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        return this.seite() ? this.renderSeite() : this.renderKachel();
    }

    private live(): ReturnType<typeof fluss> {
        return fluss({
            solarW: this.val('live.solarW'),
            akkuW: this.val('live.batteryW'),
            wrW: this.val('live.inverterW'),
            netzW: this.state.rxData.oidNetz ? this.watcher?.val(this.state.rxData.oidNetz) : this.val('live.meterW'),
            hausW: this.val('live.homeW'),
        });
    }

    /** discharge limit: the widget field when set, else the value from the app (live.minSoc), else 10 % */
    private minSoc(): number {
        const feld = Number(this.state.rxData.minSoc);
        if (feld > 0) {
            return feld;
        }
        const app = Number(this.val('live.minSoc'));
        return app > 0 ? app : 10;
    }

    private hinweis(): ReturnType<typeof hinweis> {
        return hinweis(
            {
                verbunden: this.val('info.connection'),
                lastSync: this.val('info.lastSync'),
                soc: this.val('live.soc'),
                minSoc: this.minSoc(),
            },
            Date.now(),
        );
    }

    /** today as one bar (cloud day statistics) */
    private heute(now: Date): Balken {
        const b = tagBucket(now, now, this.statistik());
        const anlage = b ? Math.min(b.anlage, b.verbrauch) : 0;
        return {
            label: '',
            titel: '',
            ertrag: b?.ertrag ?? 0,
            verbrauch: b?.verbrauch ?? 0,
            anlage,
            netz: b ? Math.max(0, b.verbrauch - anlage) : 0,
            earnings: b?.earnings ?? 0,
            leer: !b,
            jetzt: true,
        };
    }

    private renderKachel(): React.JSX.Element {
        const lang = ZuhauseEnergie.getLanguage();
        const f = this.live();
        const h = this.props.editMode ? null : this.hinweis();
        const clickable = !!this.state.rxData.klickView && !this.props.editMode;
        // only a lost cloud turns the card red; a battery at its limit is normal every night
        const warn = h?.art === 'cloud';
        // the head line only speaks up when the cloud is gone
        const fuss = warn ? h.text : '';
        const solarHeute = Number(this.val('today.solarKwh'));
        const socRaw = this.val('live.soc');
        const socN = Number(socRaw);
        const hatSoc = socRaw !== undefined && socRaw !== null && socRaw !== '' && Number.isFinite(socN);
        const minSoc = this.minSoc();
        const akkuSub =
            f.akkuW > 20
                ? `lädt ${watt(f.akkuW, lang)}`
                : f.akkuW < -20
                  ? `gibt ${watt(-f.akkuW, lang)}`
                  : hatSoc && socN <= minSoc
                    ? `an Grenze ${formatNumber(minSoc, 0, lang)} %`
                    : 'Ruhe';
        // stream between two values; netz: + import flows right → left (into the house)
        const strom = (w: number, c: string, netz = false): React.JSX.Element => {
            const on = Math.abs(w) > 5;
            // slow and calm: 7 s at 50 W … 3.5 s from about 2 kW
            const t = Math.max(3.5, 7 - Math.log10(Math.max(Math.abs(w), 50) / 50) * 2.2);
            return (
                <span
                    className={`ze-kf${netz && w > 0 ? ' rev' : ''}`}
                    style={{ background: on ? `${c}55` : undefined }}
                >
                    {on
                        ? [0, 1].map(k => (
                              <i
                                  key={k}
                                  style={{
                                      background: c,
                                      color: c,
                                      animationDuration: `${t}s`,
                                      animationDelay: `${(-t * k) / 2}s`,
                                  }}
                              />
                          ))
                        : null}
                </span>
            );
        };
        const item = (label: string, text: string, color?: string, sub?: string, bar?: number): React.JSX.Element => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '0 1 auto' }}>
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: v('text-2'),
                    }}
                >
                    {color ? (
                        <i style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'block' }} />
                    ) : null}
                    {label}
                </span>
                <span
                    style={{
                        fontFamily: fonts.numbers,
                        fontSize: 24,
                        fontWeight: 600,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {text}
                </span>
                {bar !== undefined ? (
                    <i
                        style={{
                            display: 'block',
                            position: 'relative',
                            height: 4,
                            borderRadius: 2,
                            marginTop: 1,
                            background: v('sw-off-bg'),
                            overflow: 'hidden',
                        }}
                    >
                        <b
                            style={{
                                display: 'block',
                                height: '100%',
                                width: `${Math.max(0, Math.min(100, bar))}%`,
                                borderRadius: 2,
                                background: C.akku,
                            }}
                        />
                    </i>
                ) : null}
                {sub ? (
                    <span
                        style={{
                            fontSize: 11,
                            color: v('text-2'),
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {sub}
                    </span>
                ) : null}
            </div>
        );
        return (
            <section
                ref={this.box}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => this.go(this.state.rxData.klickView) : undefined}
                onKeyDown={
                    clickable
                        ? e => (e.key === 'Enter' || e.key === ' ') && this.go(this.state.rxData.klickView)
                        : undefined
                }
                className={[
                    'zh-btn',
                    warn ? 'zh-a-warn' : '',
                    motionClass(this.state.rxData.animationStufe, this.state.rxData.nachtAus, new Date()),
                ].join(' ')}
                style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    background: warn ? v('warn-bg') : v('card'),
                    border: `1px solid ${warn ? v('warn-bd') : v('border')}`,
                    borderRadius: v('radius-card'),
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    fontFamily: fonts.text,
                    color: v('text'),
                    overflow: 'hidden',
                    cursor: clickable ? 'pointer' : 'default',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Ic
                        d={ICON.blitz}
                        size={16}
                        color={warn ? 'var(--warn-fg,#ffb3b3)' : 'var(--sw-on,#f2c14e)'}
                    />
                    <span style={{ fontSize: 11, letterSpacing: '0.1em', fontWeight: 600, color: v('text-2') }}>
                        ENERGIE
                    </span>
                    <span
                        style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 5,
                            fontSize: 11.5,
                            color: warn ? v('warn-fg') : v('text-2'),
                            fontWeight: warn ? 600 : 400,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                        }}
                    >
                        {warn ? (
                            <Ic
                                d={ICON.cloud}
                                size={14}
                            />
                        ) : null}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{fuss}</span>
                    </span>
                    {this.state.rxData.klickView ? <span style={{ fontSize: 16, color: v('text-2') }}>›</span> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1 }}>
                    {item(
                        'SOLAR',
                        watt(f.solarW, lang),
                        C.solar,
                        Number.isFinite(solarHeute) ? `heute ${kwh(solarHeute, lang)}` : undefined,
                    )}
                    {strom(f.solarW, C.solar)}
                    {item(
                        'AKKU',
                        hatSoc ? `${formatNumber(socN, 0, lang)} %` : '—',
                        C.akku,
                        akkuSub,
                        hatSoc ? socN : undefined,
                    )}
                    {strom(f.wrW, C.akku)}
                    {item('WECHSELR.', watt(f.wrW, lang), C.akku, f.wrW > 5 ? 'ins Haus' : 'aus')}
                    {strom(f.wrW, C.akku)}
                    {item('VERBRAUCH', watt(f.hausW, lang), C.haus, 'Haus')}
                    {strom(f.netzW, C.netz, true)}
                    {item(
                        f.netzW < 0 ? 'EINSPEISUNG' : 'NETZ',
                        watt(Math.abs(f.netzW), lang),
                        C.netz,
                        f.netzW < -5 ? 'ins Netz' : f.netzW > 5 ? 'Bezug' : 'ausgeglichen',
                    )}
                </div>
            </section>
        );
    }

    private renderSeite(): React.JSX.Element {
        const d = this.state.rxData;
        const lang = ZuhauseEnergie.getLanguage();
        const now = new Date();
        const levelClass = motionClass(d.animationStufe, d.nachtAus, now);
        const f = this.live();
        const h = this.props.editMode ? null : this.hinweis();
        const sync = Number(this.val('info.lastSync')) || 0;
        const p = this.state.zePrognose;
        return (
            <div
                ref={this.box}
                className={levelClass}
                style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
                onPointerDownCapture={this.beruehrt}
                onPointerUpCapture={this.losgelassen}
                onPointerCancelCapture={() => (this.wisch = null)}
            >
                <div
                    className="ze"
                    style={{ transform: `scale(${this.state.zeScale})` }}
                >
                    <header className="ze-kopf">
                        {d.zurueck ? (
                            <button
                                type="button"
                                className="ze-zur zh-btn"
                                aria-label="Zurück"
                                title="Zurück"
                                onClick={() => this.go(d.zurueck)}
                            >
                                <Ic
                                    d={ICON.zurueck}
                                    size={24}
                                />
                            </button>
                        ) : null}
                        <h1>Energie</h1>
                        <div style={{ flex: 1 }} />
                        {p ? (
                            <div className="ze-pill">
                                <Ic
                                    d={ICON.solar}
                                    size={20}
                                    color={C.solar}
                                />
                                Prognose heute <b>{kwh(p.heute, lang)}</b> · morgen <b>{kwh(p.morgen, lang)}</b>
                            </div>
                        ) : null}
                        <div className={`ze-pill${h?.art === 'cloud' ? ' warn' : ''}`}>
                            <Ic
                                d={h ? (h.art === 'cloud' ? ICON.cloud : ICON.warn) : ICON.cloud}
                                size={20}
                            />
                            {h ? h.text : sync ? `Cloud · Stand ${uhrzeit(sync, now).replace('morgen ', '')}` : 'Cloud'}
                        </div>
                    </header>
                    {this.renderFluss(f, lang)}
                    {this.renderAkku(f, lang, now)}
                    {this.renderSolar(f, lang)}
                    {this.renderChart(lang, now)}
                </div>
            </div>
        );
    }

    private renderFluss(f: ReturnType<typeof fluss>, lang: string): React.JSX.Element {
        const socNum = Number(this.val('live.soc'));
        const soc = Number.isFinite(socNum) ? Math.max(0, Math.min(100, socNum)) : null;
        const module = parseModule(this.val('live.moduleSoc'));
        const uid = String(this.props.id ?? 'x').replace(/[^\w-]/g, '');
        const an = (w: number): boolean => w > 5;
        const grau = '#8a887f';
        const einspeisung = f.netzW < 0;
        const netzW = Math.abs(f.netzW);
        const akkuW = f.akkuW;

        // drawing: ground, house with roof, solar panels on the left roof slope, battery stack and
        // inverter inside, grid pole on the right; the wires carry the moving dots
        const boden = 236;
        const haus = { l: 128, r: 352, o: 116 };
        const first = { x: 240, y: 34 };
        const traufeL = { x: 114, y: 126 };
        const winkel = (Math.atan2(first.y - traufeL.y, first.x - traufeL.x) * 180) / Math.PI;
        const stapel = { l: 150, r: 198, o: 158, u: 230 };
        const mods = module.length ? module : soc !== null ? [{ module: 1, name: 'Akku', soc }] : [];
        const mh = mods.length ? (stapel.u - stapel.o - (mods.length - 1) * 3) / mods.length : 0;
        const wr = { l: 214, r: 242, o: 176, u: 198 };
        const mast = { x: 432, o: 82 };

        // [path, power, color, dots]
        const leitungen: [string, number, string, number][] = [
            [`M140 112L140 ${stapel.o + 8}Q140 ${stapel.o + 14} ${stapel.l} ${stapel.o + 14}`, f.solarW, C.solar, 2],
            [`M${stapel.r} 187L${wr.l} 187`, f.wrW, C.akku, 1],
            [`M${wr.r} 187L266 187`, f.wrW, C.akku, 1],
            [
                einspeisung
                    ? `M${haus.r} 146Q392 146 ${mast.x - 14} ${mast.o + 10}`
                    : `M${mast.x - 14} ${mast.o + 10}Q392 146 ${haus.r} 146`,
                netzW,
                C.netz,
                2,
            ],
        ];
        const text = (
            x: number,
            y: number,
            wert: string,
            name: string,
            anchor: 'start' | 'middle' | 'end' = 'middle',
            gross = 20,
        ): React.JSX.Element => (
            <>
                <text
                    x={x}
                    y={y}
                    textAnchor={anchor}
                    style={{ font: `600 ${gross}px ${NUM}`, fill: 'var(--text,#ece9e1)' }}
                >
                    {wert}
                </text>
                <text
                    x={x}
                    y={y + 16}
                    textAnchor={anchor}
                    className="ze-fl"
                >
                    {name}
                </text>
            </>
        );
        const strich = 'var(--sw-off-bd,#44444a)';
        return (
            <div className="ze-card ze-flow">
                <div className="ze-h">
                    <span>Jetzt</span>
                </div>
                <svg
                    viewBox="0 0 480 250"
                    width={480}
                    height={250}
                    style={{ display: 'block', marginTop: 4, overflow: 'visible' }}
                >
                    <defs>
                        <filter
                            id={`ze-glow-${uid}`}
                            x="-50%"
                            y="-50%"
                            width="200%"
                            height="200%"
                        >
                            <feGaussianBlur stdDeviation="4" />
                        </filter>
                        <linearGradient
                            id={`ze-licht-${uid}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="#f2c14e"
                                stopOpacity={0.5}
                            />
                            <stop
                                offset="100%"
                                stopColor="#f2c14e"
                                stopOpacity={0.15}
                            />
                        </linearGradient>
                    </defs>

                    {/* ground */}
                    <line
                        x1={20}
                        x2={470}
                        y1={boden}
                        y2={boden}
                        stroke={strich}
                        strokeWidth={2}
                        strokeLinecap="round"
                    />

                    {/* sun */}
                    <g
                        transform={`translate(${52 - 20} ${44 - 20}) scale(${40 / 24})`}
                        style={{ color: an(f.solarW) ? C.solar : grau }}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        // static markup of this file only
                        dangerouslySetInnerHTML={{ __html: ICON.solar }}
                    />
                    {text(52, 98, watt(f.solarW, lang), 'Solar')}

                    {/* house: walls and roof */}
                    <path
                        d={`M${haus.l} ${boden}L${haus.l} ${haus.o}L${first.x} ${first.y}L${haus.r} ${haus.o}L${haus.r} ${boden}Z`}
                        fill="var(--sw-off-bg,#333338)"
                        fillOpacity={0.55}
                    />
                    <path
                        d={`M${haus.l} ${haus.o}L${haus.l} ${boden}L${haus.r} ${boden}L${haus.r} ${haus.o}`}
                        fill="none"
                        stroke={an(f.hausW) ? '#cfccc3' : strich}
                        strokeWidth={2}
                        strokeLinejoin="round"
                    />
                    <path
                        d={`M${traufeL.x} ${traufeL.y}L${first.x} ${first.y}L${480 - traufeL.x} ${traufeL.y}`}
                        fill="none"
                        stroke={an(f.hausW) ? '#cfccc3' : strich}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    {/* solar panels on the left roof slope */}
                    <g transform={`translate(${traufeL.x + 22} ${traufeL.y - 16}) rotate(${winkel})`}>
                        {[0, 1, 2].map(i => (
                            <g key={i}>
                                <rect
                                    x={i * 35}
                                    y={-17}
                                    width={32}
                                    height={14}
                                    rx={2}
                                    fill={an(f.solarW) ? C.solar : 'var(--sw-off-bg,#333338)'}
                                    fillOpacity={an(f.solarW) ? 0.35 : 1}
                                    stroke={an(f.solarW) ? C.solar : strich}
                                    strokeWidth={1.5}
                                />
                                <line
                                    x1={i * 35 + 16}
                                    x2={i * 35 + 16}
                                    y1={-17}
                                    y2={-3}
                                    stroke={an(f.solarW) ? C.solar : strich}
                                    strokeWidth={1}
                                />
                            </g>
                        ))}
                    </g>
                    {/* window with light while the house uses power */}
                    <rect
                        x={288}
                        y={136}
                        width={40}
                        height={28}
                        rx={3}
                        fill={an(f.hausW) ? `url(#ze-licht-${uid})` : 'none'}
                        stroke={an(f.hausW) ? '#cfccc3' : strich}
                        strokeWidth={1.5}
                    />
                    <line
                        x1={308}
                        x2={308}
                        y1={136}
                        y2={164}
                        stroke={an(f.hausW) ? '#cfccc3' : strich}
                        strokeWidth={1.5}
                    />
                    {text(308, 196, watt(f.hausW, lang), 'Haus', 'middle', 26)}

                    {/* grid pole */}
                    <line
                        x1={mast.x}
                        x2={mast.x}
                        y1={mast.o}
                        y2={boden}
                        stroke={an(netzW) ? C.netz : strich}
                        strokeWidth={3}
                        strokeLinecap="round"
                    />
                    <line
                        x1={mast.x - 20}
                        x2={mast.x + 20}
                        y1={mast.o + 8}
                        y2={mast.o + 8}
                        stroke={an(netzW) ? C.netz : strich}
                        strokeWidth={3}
                        strokeLinecap="round"
                    />
                    {text(mast.x, mast.o - 24, watt(netzW, lang), einspeisung ? 'Einspeisung' : 'Netz')}

                    {/* wires with moving dots */}
                    {leitungen.map(([path, w, c, n], i) => {
                        const on = an(w);
                        // faster dots with more power: 3 s at 50 W … 0.9 s at 2 kW
                        const t = Math.max(0.9, 3 - Math.log10(Math.max(w, 50) / 50) * 1.3);
                        return (
                            <g key={i}>
                                {on ? (
                                    <path
                                        d={path}
                                        stroke={c}
                                        strokeOpacity={0.4}
                                        strokeWidth={8}
                                        fill="none"
                                        strokeLinecap="round"
                                        filter={`url(#ze-glow-${uid})`}
                                    />
                                ) : null}
                                <path
                                    d={path}
                                    stroke={on ? c : strich}
                                    strokeOpacity={on ? 0.7 : 1}
                                    strokeWidth={on ? 3 : 2}
                                    strokeDasharray={on ? undefined : '3 5'}
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                {on
                                    ? Array.from({ length: n }, (_, k) => (
                                          <circle
                                              key={k}
                                              r={3.5}
                                              className="ze-dot"
                                              style={
                                                  {
                                                      fill: c,
                                                      stroke: '#fff',
                                                      strokeOpacity: 0.6,
                                                      strokeWidth: 1,
                                                      offsetPath: `path('${path}')`,
                                                      '--ze-t': `${t}s`,
                                                      animationDelay: `${(-t * k) / n}s`,
                                                  } as React.CSSProperties
                                              }
                                          />
                                      ))
                                    : null}
                            </g>
                        );
                    })}

                    {/* battery stack: one block per module, filled by its own level */}
                    {mods.map((m, i) => {
                        const y = stapel.o + i * (mh + 3);
                        const breite = stapel.r - stapel.l - 6;
                        return (
                            <g key={m.module}>
                                <rect
                                    x={stapel.l}
                                    y={y}
                                    width={stapel.r - stapel.l}
                                    height={mh}
                                    rx={4}
                                    fill="var(--card,#2b2b2f)"
                                    stroke={an(Math.abs(akkuW)) ? C.akku : strich}
                                    strokeWidth={1.5}
                                />
                                <rect
                                    x={stapel.l + 3}
                                    y={y + 3}
                                    width={Math.max(0, (breite * Math.max(0, Math.min(100, m.soc))) / 100)}
                                    height={Math.max(0, mh - 6)}
                                    rx={2}
                                    fill={C.akku}
                                    fillOpacity={0.75}
                                >
                                    <title>{`${m.name}: ${m.soc} %`}</title>
                                </rect>
                            </g>
                        );
                    })}
                    <text
                        x={(stapel.l + stapel.r) / 2}
                        y={stapel.o - 22}
                        textAnchor="middle"
                        style={{ font: `600 20px ${NUM}`, fill: 'var(--text,#ece9e1)' }}
                    >
                        {soc !== null ? `${formatNumber(soc, 0, lang)} %` : '–'}
                    </text>
                    <text
                        x={(stapel.l + stapel.r) / 2}
                        y={stapel.o - 7}
                        textAnchor="middle"
                        className="ze-fl"
                    >
                        {an(akkuW) ? `+${watt(akkuW, lang)}` : an(-akkuW) ? `−${watt(-akkuW, lang)}` : 'Akku'}
                    </text>

                    {/* inverter */}
                    <rect
                        x={wr.l}
                        y={wr.o}
                        width={wr.r - wr.l}
                        height={wr.u - wr.o}
                        rx={4}
                        fill="var(--card,#2b2b2f)"
                        stroke={an(f.wrW) ? C.akku : strich}
                        strokeWidth={1.5}
                    />
                    <path
                        d={`M${wr.l + 6} ${wr.o + 14}q4 -7 8 0t8 0`}
                        fill="none"
                        stroke={an(f.wrW) ? C.akku : grau}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                    />
                    <text
                        x={(wr.l + wr.r) / 2}
                        y={wr.u + 16}
                        textAnchor="middle"
                        style={{ font: `600 15px ${NUM}`, fill: 'var(--text,#ece9e1)' }}
                    >
                        {watt(f.wrW, lang)}
                    </text>
                    <text
                        x={(wr.l + wr.r) / 2}
                        y={wr.u + 28}
                        textAnchor="middle"
                        className="ze-fl"
                        style={{ fontSize: 11 }}
                    >
                        WR
                    </text>
                </svg>
            </div>
        );
    }

    private renderAkku(f: ReturnType<typeof fluss>, lang: string, now: Date): React.JSX.Element {
        const socRaw = this.val('live.soc');
        const soc = socRaw === null || socRaw === undefined || socRaw === '' ? null : Number(socRaw);
        const fullAt = Number(this.val('live.fullAt')) || null;
        const emptyAt = Number(this.val('live.emptyAt')) || null;
        const minSoc = this.minSoc();
        const module = parseModule(this.val('live.moduleSoc'));
        const status =
            f.akkuW > 20
                ? `lädt mit ${watt(f.akkuW, lang)}`
                : f.akkuW < -20
                  ? `entlädt mit ${watt(-f.akkuW, lang)}`
                  : 'Ruhe';
        const eta = fullAt ? `voll ${uhrzeit(fullAt, now)}` : emptyAt ? `leer ${uhrzeit(emptyAt, now)}` : '';

        // today's level curve with the projection (one axis: %)
        const cw = 340;
        const ch = 74;
        const x = (min: number): number => (min / 1440) * cw;
        const y = (s: number): number => ch - (Math.max(0, Math.min(100, s)) / 100) * ch;
        const pts = this.state.zeSocHeute;
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const proj = akkuProjektion(soc, fullAt, emptyAt, minSoc, now);
        const line = pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.min).toFixed(1)} ${y(q.w).toFixed(1)}`).join('');
        return (
            <div className="ze-card">
                <div className="ze-h">
                    <Ic
                        d={ICON.akku}
                        size={18}
                        color={C.akku}
                    />
                    <span>Akku</span>
                    {this.val('live.batteryStatus') ? String(this.val('live.batteryStatus')) : ''}
                </div>
                <div className="ze-big">
                    {soc === null ? '—' : formatNumber(soc, 0, lang)}
                    <small>%</small>
                </div>
                <div className="ze-sub">
                    <b>{status}</b>
                    {eta ? ` · ${eta}` : ''}
                </div>
                {module.length ? (
                    <div className="ze-mods">
                        {module.map(m => (
                            <div
                                key={m.module}
                                className="ze-mod"
                                title={`${m.name}: ${m.soc} %`}
                            >
                                <i>
                                    <b style={{ width: `${Math.max(0, Math.min(100, m.soc))}%` }} />
                                </i>
                                {m.name} · {formatNumber(m.soc, 0, lang)} %
                            </div>
                        ))}
                    </div>
                ) : null}
                <svg
                    viewBox={`0 -4 ${cw} ${ch + 22}`}
                    width={cw}
                    height={ch + 22}
                    style={{ display: 'block', marginTop: 22, overflow: 'visible' }}
                    aria-label="Ladestand heute"
                >
                    {[0, 50, 100].map(s => (
                        <line
                            key={s}
                            className="ze-grid"
                            x1={0}
                            x2={cw}
                            y1={y(s)}
                            y2={y(s)}
                            strokeDasharray={s === 50 ? '2 4' : undefined}
                        />
                    ))}
                    <line
                        x1={0}
                        x2={cw}
                        y1={y(minSoc)}
                        y2={y(minSoc)}
                        stroke="var(--warn-bd,#e5484d)"
                        strokeOpacity={0.5}
                        strokeDasharray="3 4"
                    />
                    <text
                        className="ze-ax"
                        x={0}
                        y={y(minSoc) + 13}
                        textAnchor="start"
                    >
                        min {formatNumber(minSoc, 0, lang)} %
                    </text>
                    {line ? (
                        <path
                            d={line}
                            fill="none"
                            stroke={C.akku}
                            strokeWidth={2}
                            strokeLinejoin="round"
                        />
                    ) : null}
                    {proj && soc !== null ? (
                        <>
                            <path
                                d={`M${x(nowMin)} ${y(soc)}L${x(proj.bis.min)} ${y(proj.bis.w)}`}
                                fill="none"
                                stroke={C.akku}
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                opacity={0.8}
                            />
                            {proj.bis.min < 1440 ? (
                                <circle
                                    cx={x(proj.bis.min)}
                                    cy={y(proj.bis.w)}
                                    r={4}
                                    fill={C.akku}
                                    stroke="var(--card,#2b2b2f)"
                                    strokeWidth={2}
                                />
                            ) : null}
                        </>
                    ) : null}
                    {soc !== null ? (
                        <circle
                            cx={x(nowMin)}
                            cy={y(soc)}
                            r={4.5}
                            fill={C.akku}
                            stroke="var(--card,#2b2b2f)"
                            strokeWidth={2}
                        />
                    ) : null}
                    {[0, 6, 12, 18, 24].map(hh => (
                        <text
                            key={hh}
                            className="ze-ax"
                            x={x(hh * 60)}
                            y={ch + 16}
                            textAnchor={hh === 0 ? 'start' : hh === 24 ? 'end' : 'middle'}
                        >
                            {hh}
                        </text>
                    ))}
                    <text
                        className="ze-ax"
                        x={0}
                        y={y(100) - 4}
                        textAnchor="start"
                    >
                        100 %
                    </text>
                </svg>
            </div>
        );
    }

    private renderSolar(f: ReturnType<typeof fluss>, lang: string): React.JSX.Element {
        const mppt = parseMppt(this.val('live.mppt'));
        const max = Math.max(1, ...mppt.map(m => m.w));
        const heute = Number(this.val('today.solarKwh'));
        const p = this.state.zePrognose;
        return (
            <div className="ze-card">
                <div className="ze-h">
                    <Ic
                        d={ICON.solar}
                        size={18}
                        color={C.solar}
                    />
                    <span>Solar</span>
                </div>
                <div className="ze-big">{watt(f.solarW, lang)}</div>
                <div className="ze-sub">
                    heute <b>{Number.isFinite(heute) ? kwh(heute, lang) : '—'}</b>
                    {p ? ` von ca. ${kwh(p.heute, lang)}` : ''}
                </div>
                <div className="ze-rows">
                    {mppt.slice(0, 5).map((m, i) => (
                        <div
                            key={i}
                            className="ze-row"
                        >
                            <span>{m.name || `Eingang ${i + 1}`}</span>
                            <i>
                                <em style={{ width: `${(m.w / max) * 100}%` }} />
                            </i>
                            <b>{watt(m.w, lang)}</b>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------- chart

    private renderChart(lang: string, now: Date): React.JSX.Element {
        const tab = this.state.zeTab;
        const s = this.statistik();
        const preis = Number(this.state.rxData.strompreis) || 0;
        const liste = tab === 'heute' ? [this.heute(now)] : balkenListe(tab, s, now);
        const t = summe(liste, preis);
        const legend =
            tab === 'heute'
                ? [
                      { c: C.solar, l: 'Solar', line: true },
                      { c: C.haus, l: 'Verbrauch', line: true },
                      { c: C.netz, l: 'Netz', line: true },
                  ]
                : [
                      { c: C.solar, l: 'Solar / Akku', line: false },
                      { c: C.netz, l: 'Netzbezug', line: false },
                  ];
        return (
            <div className="ze-card ze-chart">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div
                        className="ze-tabs"
                        role="tablist"
                    >
                        {ZEITRAEUME.map(z => (
                            <button
                                key={z}
                                type="button"
                                role="tab"
                                aria-selected={tab === z}
                                className={`ze-tab zh-btn${tab === z ? ' an' : ''}`}
                                onClick={() => this.setState({ zeTab: z, zeHover: null })}
                            >
                                {ZEITRAUM_TEXT[z]}
                            </button>
                        ))}
                    </div>
                    <div
                        className="ze-leg"
                        style={{ flex: 1 }}
                    >
                        {legend.map(x => (
                            <span key={x.l}>
                                <i
                                    className={x.line ? 'l' : undefined}
                                    style={{ background: x.c }}
                                />
                                {x.l}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="ze-plot">
                    {tab === 'heute' ? this.renderHeute(lang, now) : this.renderBalken(liste, lang)}
                </div>
                <aside className="ze-sum">
                    <h2>{tab === 'heute' ? 'Heute' : ZEITRAUM_TEXT[tab]}</h2>
                    <div className="ze-kv gross">
                        Solarertrag <b>{kwh(t.ertrag, lang)}</b>
                    </div>
                    <div className="ze-kv">
                        Verbrauch <b>{kwh(t.verbrauch, lang)}</b>
                    </div>
                    <div className="ze-kv">
                        davon Netz <b>{kwh(t.netz, lang)}</b>
                    </div>
                    <div
                        className="ze-meter"
                        aria-hidden="true"
                    >
                        <i style={{ width: `${(t.autarkie ?? 0) * 100}%`, background: C.solar }} />
                        <i style={{ flex: 1, background: C.netz }} />
                    </div>
                    <div className="ze-kv">
                        Autarkie <b>{prozent(t.autarkie, lang)}</b>
                    </div>
                    <div className="ze-kv">
                        Eigenverbrauch <b>{prozent(t.eigenverbrauch, lang)}</b>
                    </div>
                    <div className="ze-kv">
                        Ersparnis <b>{euro(t.ersparnis, lang)}</b>
                    </div>
                    {t.netzkosten !== null ? (
                        <div className="ze-kv">
                            Netzkosten <b>{euro(t.netzkosten, lang)}</b>
                        </div>
                    ) : null}
                    <div className="ze-hinweis">
                        {preis > 0
                            ? `Strompreis ${formatNumber(preis, Math.round(preis * 100) === preis * 100 ? 2 : 4, lang)} €/kWh`
                            : 'Ersparnis laut Sunlit-App · Strompreis im Widget eintragen für eigene Rechnung'}
                    </div>
                </aside>
            </div>
        );
    }

    private renderBalken(liste: Balken[], lang: string): React.JSX.Element {
        const PW = 949;
        const PH = 376;
        const left = 56;
        const bottom = 26;
        const iw = PW - left;
        const ih = PH - bottom;
        const ax = achse(Math.max(0, ...liste.map(b => b.verbrauch)));
        const y = (val: number): number => ih - (val / ax.max) * ih;
        const slot = iw / Math.max(1, liste.length);
        const bw = Math.max(6, Math.min(56, slot * 0.62));
        const hover = this.state.zeHover;
        const ticks: number[] = [];
        for (let v0 = 0; v0 <= ax.max + 1e-9; v0 += ax.step) {
            ticks.push(v0);
        }
        const every = liste.length > 20 ? 3 : 1;
        const sel = hover !== null ? liste[hover] : undefined;
        const r = 4;
        // bar with a rounded top end only, anchored at the baseline
        const bar = (x0: number, y0: number, w: number, hgt: number, round: boolean): string => {
            if (hgt <= 0) {
                return '';
            }
            const rr = round ? Math.min(r, hgt, w / 2) : 0;
            return `M${x0} ${y0 + hgt}V${y0 + rr}Q${x0} ${y0} ${x0 + rr} ${y0}H${x0 + w - rr}Q${x0 + w} ${y0} ${x0 + w} ${y0 + rr}V${y0 + hgt}Z`;
        };
        return (
            <>
                <svg
                    viewBox={`0 0 ${PW} ${PH}`}
                    onPointerLeave={() => this.setState({ zeHover: null })}
                >
                    {ticks.map(tv => (
                        <g key={tv}>
                            <line
                                className="ze-grid"
                                x1={left}
                                x2={PW}
                                y1={y(tv)}
                                y2={y(tv)}
                            />
                            <text
                                className="ze-ax"
                                x={left - 8}
                                y={y(tv) + 4}
                                textAnchor="end"
                            >
                                {formatNumber(tv, ax.step < 1 ? 1 : 0, lang)}
                                {tv > 0 && tv >= ax.max - 1e-9 ? ' kWh' : ''}
                            </text>
                        </g>
                    ))}
                    {liste.map((b, i) => {
                        const cx = left + slot * i + slot / 2;
                        const x0 = cx - bw / 2;
                        const hA = (b.anlage / ax.max) * ih;
                        const hN = (b.netz / ax.max) * ih;
                        const gap = hA > 0 && hN > 0 ? 2 : 0;
                        const dim = hover !== null && hover !== i;
                        return (
                            <g
                                key={i}
                                opacity={dim ? 0.45 : 1}
                            >
                                {b.leer ? (
                                    <rect
                                        x={x0}
                                        y={ih - 2}
                                        width={bw}
                                        height={2}
                                        rx={1}
                                        fill="var(--border,#36363b)"
                                    />
                                ) : (
                                    <>
                                        <path
                                            d={bar(x0, ih - hA, bw, hA, hN <= 0)}
                                            fill={C.solar}
                                        />
                                        <path
                                            d={bar(
                                                x0,
                                                ih - hA - gap - Math.max(0, hN - gap),
                                                bw,
                                                Math.max(0, hN - gap),
                                                true,
                                            )}
                                            fill={C.netz}
                                        />
                                    </>
                                )}
                                {i % every === 0 || b.jetzt ? (
                                    <text
                                        className="ze-ax"
                                        x={cx}
                                        y={PH - 6}
                                        textAnchor="middle"
                                        style={b.jetzt ? { fill: 'var(--text,#ece9e1)', fontWeight: 600 } : undefined}
                                    >
                                        {b.label}
                                    </text>
                                ) : null}
                                {/* hit target: the whole slot, bigger than the bar */}
                                <rect
                                    x={left + slot * i}
                                    y={0}
                                    width={slot}
                                    height={PH}
                                    fill="transparent"
                                    onPointerEnter={() => this.setState({ zeHover: i })}
                                    onPointerDown={() => this.setState({ zeHover: hover === i ? null : i })}
                                />
                            </g>
                        );
                    })}
                </svg>
                {sel && hover !== null && !sel.leer ? (
                    <div
                        className="ze-tip"
                        style={{
                            left: `${((left + slot * hover + slot / 2) / PW) * 100}%`,
                            top: 0,
                            transform: `translateX(${hover > liste.length / 2 ? '-105%' : '5%'})`,
                        }}
                    >
                        <b>{sel.titel}</b>
                        <div>
                            Solarertrag <b>{kwh(sel.ertrag, lang)}</b>
                        </div>
                        <div>
                            <i style={{ background: C.solar }} />
                            Solar / Akku <b>{kwh(sel.anlage, lang)}</b>
                        </div>
                        <div>
                            <i style={{ background: C.netz }} />
                            Netzbezug <b>{kwh(sel.netz, lang)}</b>
                        </div>
                        <div>
                            Verbrauch <b>{kwh(sel.verbrauch, lang)}</b>
                        </div>
                    </div>
                ) : null}
            </>
        );
    }

    private renderHeute(lang: string, now: Date): React.JSX.Element {
        const PW = 949;
        const PH = 376;
        const left = 52;
        const bottom = 26;
        const iw = PW - left;
        const ih = PH - bottom;
        const kurve = parseKurve(this.val('today.curve'));
        const netz = this.state.zeNetzHeute.map(q => ({ min: q.min, w: Math.max(0, q.w) }));
        const series = [
            { key: 'solar', c: C.solar, l: 'Solar', pts: kurve.solar },
            { key: 'haus', c: C.haus, l: 'Verbrauch', pts: kurve.haus },
            { key: 'netz', c: C.netz, l: 'Netz', pts: netz },
        ];
        const ax = achse(Math.max(100, ...series.flatMap(s0 => s0.pts.map(q => q.w))));
        const x = (min: number): number => left + (min / 1440) * iw;
        const y = (w: number): number => ih - (Math.max(0, w) / ax.max) * ih;
        const path = (pts: Punkt[]): string =>
            pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.min).toFixed(1)} ${y(q.w).toFixed(1)}`).join('');
        const ticks: number[] = [];
        for (let v0 = 0; v0 <= ax.max + 1e-9; v0 += ax.step) {
            ticks.push(v0);
        }
        const hover = this.state.zeHover;
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const near = (pts: Punkt[], m: number): Punkt | undefined => {
            let best: Punkt | undefined;
            for (const q of pts) {
                if (Math.abs(q.min - m) <= 12 && (!best || Math.abs(q.min - m) < Math.abs(best.min - m))) {
                    best = q;
                }
            }
            return best;
        };
        const pick = (e: React.PointerEvent<SVGSVGElement>): void => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * PW;
            const m = Math.round(((px - left) / iw) * 1440);
            this.setState({ zeHover: m >= 0 && m <= nowMin ? m : null });
        };
        const leer = series.every(s0 => !s0.pts.length);
        return (
            <>
                <svg
                    viewBox={`0 0 ${PW} ${PH}`}
                    onPointerMove={pick}
                    onPointerDown={pick}
                    onPointerLeave={() => this.setState({ zeHover: null })}
                >
                    {ticks.map(tv => (
                        <g key={tv}>
                            <line
                                className="ze-grid"
                                x1={left}
                                x2={PW}
                                y1={y(tv)}
                                y2={y(tv)}
                            />
                            <text
                                className="ze-ax"
                                x={left - 8}
                                y={y(tv) + 4}
                                textAnchor="end"
                            >
                                {tv >= 1000
                                    ? `${formatNumber(tv / 1000, tv % 1000 ? 1 : 0, lang)} k`
                                    : formatNumber(tv, 0, lang)}
                                {tv > 0 && tv >= ax.max - 1e-9 ? (tv >= 1000 ? 'W' : ' W') : ''}
                            </text>
                        </g>
                    ))}
                    {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(hh => (
                        <text
                            key={hh}
                            className="ze-ax"
                            x={x(hh * 60)}
                            y={PH - 6}
                            textAnchor={hh === 0 ? 'start' : hh === 24 ? 'end' : 'middle'}
                        >
                            {`${hh}:00`}
                        </text>
                    ))}
                    {kurve.solar.length ? (
                        <path
                            d={`${path(kurve.solar)}L${x(kurve.solar[kurve.solar.length - 1].min)} ${ih}L${x(kurve.solar[0].min)} ${ih}Z`}
                            fill={C.solar}
                            opacity={0.18}
                        />
                    ) : null}
                    {series.map(s0 =>
                        s0.pts.length ? (
                            <path
                                key={s0.key}
                                d={path(s0.pts)}
                                fill="none"
                                stroke={s0.c}
                                strokeWidth={2}
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                            />
                        ) : null,
                    )}
                    <line
                        x1={x(nowMin)}
                        x2={x(nowMin)}
                        y1={0}
                        y2={ih}
                        stroke="var(--text-2,#a3a19a)"
                        strokeOpacity={0.35}
                        strokeDasharray="3 4"
                    />
                    {hover !== null ? (
                        <>
                            <line
                                x1={x(hover)}
                                x2={x(hover)}
                                y1={0}
                                y2={ih}
                                stroke="var(--text,#ece9e1)"
                                strokeOpacity={0.6}
                            />
                            {series.map(s0 => {
                                const q = near(s0.pts, hover);
                                return q ? (
                                    <circle
                                        key={s0.key}
                                        cx={x(q.min)}
                                        cy={y(q.w)}
                                        r={4.5}
                                        fill={s0.c}
                                        stroke="var(--card,#2b2b2f)"
                                        strokeWidth={2}
                                    />
                                ) : null;
                            })}
                        </>
                    ) : null}
                    {leer ? (
                        <text
                            x={left + iw / 2}
                            y={ih / 2}
                            textAnchor="middle"
                            style={{
                                font: "500 16px 'Zuhause Barlow',Barlow,system-ui,sans-serif",
                                fill: 'var(--text-2,#a3a19a)',
                            }}
                        >
                            Noch keine Verlaufsdaten für heute
                        </text>
                    ) : null}
                </svg>
                {hover !== null ? (
                    <div
                        className="ze-tip"
                        style={{
                            left: `${(x(hover) / PW) * 100}%`,
                            top: 0,
                            transform: `translateX(${hover > 720 ? '-108%' : '8%'})`,
                        }}
                    >
                        <b>{hhmm(hover)} Uhr</b>
                        {series.map(s0 => {
                            const q = near(s0.pts, hover);
                            return (
                                <div key={s0.key}>
                                    <i style={{ background: s0.c }} />
                                    {s0.l} <b>{q ? watt(q.w, lang) : '—'}</b>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </>
        );
    }
}
