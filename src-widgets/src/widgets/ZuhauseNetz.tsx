/*
 * VIS-2 widget "Netzwerk" for the adapter unifi-map. Two layouts, like the energy widget:
 * - "kachel": tile 88 × 88 of the start page (sketched UDR, its ring shows the state; "U" when an update is
 *   available). A tap opens the network page (inside a ZuhauseSeiten frame when there is one).
 * - "seite": a whole page (1357 × 900, scaled to the widget box) with the map from the console downwards.
 *   A tap on a device shows its details. Back by the arrow, a swipe to the right or after some minutes.
 * Reads only. The data points are not attribute fields, the widget subscribes them itself (StateWatcher).
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { Scaled } from '../components/Scaled';
import { TILE_BASE, Tile } from '../components/Tile';
import {
    KACHEL_STATUS,
    KACHEL_TEXT,
    KARTE,
    anordnen,
    kachelZustand,
    kantenText,
    kartenName,
    kuerzen,
    laufzeit,
    parseGeraete,
    parseTopologie,
    tempo,
    type KachelZustand,
    type NetzKnoten,
    type NetzTopologie,
} from '../lib/netz';
import { ensureStyles, fonts } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass, requestTab } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const W = 1357;
const H = 900;
const DEFAULT_INSTANCE = 'unifi-map.0';
const SHOWN = ['summary.state', 'summary.json', 'topology.json', 'info.connection'] as const;

interface NetzRxData {
    darstellung: string;
    instanz: string;
    label: string;
    klickView: string;
    zurueck: string;
    /** minutes without touch until the page returns by itself (0 = never) */
    autoZurueck: number;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface NetzState extends VisRxWidgetState {
    znScale: number;
    znAuswahl: string;
    znTick: number;
}

// ---------------------------------------------------------------- icons (24 grid, stroke 1.7)

const UDR = 'M8.5 2.5h7a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z M10.5 17.5h3';
const ICON: Record<string, string> = {
    gateway: `${UDR} M9.5 9a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0`,
    switch: 'M2.5 8h19v8h-19z M6 12h.01 M9 12h.01 M12 12h.01 M15 12h.01 M18 12h.5',
    accessPoint: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0 M12 12h.01',
    unknownSwitch: 'M9 2.5v4 M15 2.5v4 M6.5 6.5h11v4.5a5.5 5.5 0 0 1-11 0z M12 16.5v5 M13 8.5l-2 2.7h2.6l-1.8 2.6',
};
const ZURUECK = 'M15 5l-7 7 7 7';

const YELLOW = '#f2c14e';
const RED = '#e5484d';
const BLUE = '#4aa3ff';

/** UDR tower of the tile; the ring shows the state */
function TurmIcon({ zustand, animate }: { zustand: KachelZustand; animate: boolean }): React.JSX.Element {
    let ring: React.ReactNode = (
        <circle
            cx={12}
            cy={9}
            r={2.8}
        />
    );
    if (zustand === 'langsam') {
        ring = (
            <circle
                className={animate ? 'zh-a-ring' : undefined}
                cx={12}
                cy={9}
                r={2.8}
                stroke={YELLOW}
            />
        );
    } else if (zustand === 'gestoert') {
        ring = (
            <circle
                className={animate ? 'zh-a-blink' : undefined}
                cx={12}
                cy={9}
                r={2.8}
                stroke={RED}
            />
        );
    } else if (zustand === 'updateLaeuft') {
        ring = (
            <circle
                className={animate ? 'zh-a-spin-fast' : undefined}
                cx={12}
                cy={9}
                r={2.8}
                stroke={BLUE}
                strokeDasharray="11 6"
            />
        );
    }
    return (
        <svg
            viewBox="0 0 24 24"
            width={30}
            height={30}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            style={{ overflow: 'visible' }}
        >
            <path d={UDR} />
            {ring}
        </svg>
    );
}

/** Corner of the tile: "U" for an available update, yellow or blue LED for slow links or a running update */
function Ecke({ zustand, animate }: { zustand: KachelZustand; animate: boolean }): React.JSX.Element | null {
    if (zustand === 'update') {
        return (
            <span
                className={animate ? 'zh-a-once' : undefined}
                aria-hidden
                style={{
                    position: 'absolute',
                    right: 6,
                    top: 6,
                    width: 15,
                    height: 15,
                    borderRadius: '50%',
                    background: YELLOW,
                    color: '#2a2108',
                    font: `700 10px/15px ${fonts.text}`,
                    textAlign: 'center',
                }}
            >
                U
            </span>
        );
    }
    const farbe = zustand === 'langsam' ? YELLOW : zustand === 'updateLaeuft' ? BLUE : '';
    if (!farbe) {
        return null;
    }
    return (
        <span
            className={animate ? 'zh-a-ring' : undefined}
            aria-hidden
            style={{
                position: 'absolute',
                right: 8,
                top: 8,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: farbe,
                boxShadow: `0 0 6px ${farbe}`,
            }}
        />
    );
}

// ---------------------------------------------------------------- page styles

const STYLE_ID = 'zh-netz-styles';
const NUM = fonts.numbers;
const CSS = `
.zn{width:${W}px;height:${H}px;padding:24px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;font-family:${fonts.text};color:var(--text,#ece9e1);transform-origin:top left;user-select:none;-webkit-tap-highlight-color:transparent}
.zn *{box-sizing:border-box}
.zn-kopf{display:flex;align-items:flex-end;gap:14px;flex:none}
.zn-zur{display:flex;align-items:center;justify-content:center;width:48px;height:48px;padding:0;border-radius:24px;border:1px solid var(--sw-off-bd,#44444a);background:var(--sw-off-bg,#333338);color:var(--sw-off-fg,#cfccc3);cursor:pointer;align-self:center}
.zn-zur svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.zn-titel{flex:1;min-width:0}
.zn-over{font-size:12px;letter-spacing:.12em;color:var(--text-2,#a3a19a);text-transform:uppercase}
.zn-titel h1{margin:2px 0 0;font-size:30px;font-weight:600;line-height:1.05;display:flex;align-items:center;gap:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zn-led{width:11px;height:11px;border-radius:50%;flex:none}
.zn-kpi{background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);border-radius:18px;padding:10px 16px;min-width:128px}
.zn-kpi .zn-over{font-size:10.5px}
.zn-kpi b{display:block;font:600 28px/1.05 ${NUM};margin-top:2px}
.zn-kpi small{font-size:16px;color:var(--text-2,#a3a19a)}
.zn-kpi.gelb b{color:${YELLOW}}
.zn-kpi.rot b{color:var(--warn-fg,#ffb3b3)}
.zn-karte{flex:1;min-height:0;background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);border-radius:var(--radius-card,18px);padding:12px 14px 8px;display:flex;flex-direction:column;position:relative}
.zn-hd{display:flex;align-items:baseline;gap:10px}
.zn-hd b{font-size:14px;font-weight:600}
.zn-hd span{font-size:11px;color:var(--text-2,#a3a19a)}
.zn-leg{margin-left:auto;display:flex;gap:14px;font-size:11px;color:var(--text-2,#a3a19a);align-items:center}
.zn-leg i{display:inline-block;width:18px;margin-right:5px;vertical-align:middle}
.zn-map{flex:1;min-height:0;width:100%}
.zn-map text{font-family:${fonts.text}}
.zn-map .zn-k{cursor:pointer;outline:none}
.zn-leer{flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-2,#a3a19a);font-size:16px}
.zn-det{position:absolute;right:14px;top:44px;width:300px;background:#232327;border:1px solid var(--border,#36363b);border-radius:16px;padding:14px 16px;box-shadow:0 8px 24px rgba(0,0,0,.45)}
.zn-det h2{margin:0;font-size:20px;font-weight:600;padding-right:36px}
.zn-det .zn-sub{font-size:13px;color:var(--text-2,#a3a19a);margin-bottom:10px}
.zn-det dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0;font-size:15px}
.zn-det dt{color:var(--text-2,#a3a19a)}
.zn-det dd{margin:0}
.zn-det .zn-x{position:absolute;right:6px;top:6px;width:40px;height:40px;border:0;border-radius:12px;background:transparent;color:var(--text-2,#a3a19a);font-size:22px;cursor:pointer}
.zn-det .zn-hin{margin-top:12px;font-size:13px;padding:8px 10px;border-radius:10px}
.zn-det .zn-hin.gelb{color:${YELLOW};border:1px solid #6b5a22}
.zn-det .zn-hin.rot{color:var(--warn-fg,#ffb3b3);border:1px solid var(--warn-bd,#e5484d)}
`;

function ensureNetzStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

// card look per state (like the status tiles of the start page)
const LOOK: Record<
    string,
    { bg: string; bd: string; fg: string; sub: string; led?: string; cls?: string; dash?: string }
> = {
    ok: { bg: '#183323', bd: '#3f8f57', fg: '#9fe0b2', sub: '#7fbf93', led: '#6fe08a' },
    degraded: { bg: '#183323', bd: '#3f8f57', fg: '#9fe0b2', sub: YELLOW, led: YELLOW, cls: 'zh-a-ring' },
    offline: { bg: '#3a1d1f', bd: RED, fg: '#ffb3b3', sub: '#ffb3b3', led: RED, cls: 'zh-a-blink' },
    consequence: { bg: 'none', bd: '#4f4f56', fg: '#a3a19a', sub: '#77746c', dash: '5 4' },
    busy: { bg: '#16283a', bd: BLUE, fg: '#9cc9ff', sub: '#9cc9ff', led: BLUE, cls: 'zh-a-ring' },
    virtual: { bg: 'none', bd: '#e8913a', fg: '#e8913a', sub: '#b98552', dash: '5 4' },
};

const ZUSTAND_TEXT: Record<string, string> = {
    ok: 'läuft',
    degraded: 'Uplink langsamer als gewohnt',
    offline: 'ausgefallen',
    consequence: 'nicht erreichbar (hinter einem ausgefallenen Gerät)',
    busy: 'Update läuft',
};

// ---------------------------------------------------------------- widget

export default class ZuhauseNetz extends (window.visRxWidget as typeof VisRxWidget)<NetzRxData, NetzState> {
    private watcher?: StateWatcher;
    private box = React.createRef<HTMLDivElement>();
    private znResize?: ResizeObserver;
    private timers: ReturnType<typeof setInterval>[] = [];
    private alive = true;
    private letzteAktion = Date.now();
    private wisch: { x: number; y: number; t: number } | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, znScale: 1, znAuswahl: '', znTick: 0 };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseNetz',
            ...SET_INFO,
            visName: 'ZuhauseNetz',
            visWidgetLabel: 'netz_label',
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
                                { value: 'kachel', label: 'netz_tile' },
                                { value: 'seite', label: 'netz_page' },
                            ],
                            default: 'kachel',
                        },
                        {
                            name: 'instanz',
                            type: 'text',
                            label: 'netz_instance',
                            tooltip: 'netz_instance_tip',
                            default: DEFAULT_INSTANCE,
                        },
                        {
                            name: 'label',
                            type: 'text',
                            label: 'netz_name',
                            default: 'Netzwerk',
                            hidden: 'data.darstellung === "seite"',
                        },
                        {
                            name: 'klickView',
                            type: 'select-views',
                            label: 'click_view',
                            multiple: false,
                            hidden: 'data.darstellung === "seite"',
                        },
                        {
                            name: 'zurueck',
                            type: 'select-views',
                            label: 'energie_back',
                            multiple: false,
                            hidden: 'data.darstellung !== "seite"',
                        },
                        {
                            name: 'autoZurueck',
                            type: 'number',
                            label: 'energie_auto_back',
                            default: 2,
                            min: 0,
                            max: 60,
                            hidden: 'data.darstellung !== "seite"',
                        },
                    ],
                },
                { name: 'motion', label: 'group_animation', fields: MOTION_FIELDS },
            ],
            visDefaultStyle: { width: TILE_BASE, height: TILE_BASE },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-kachel.png',
        };
    }

    // Do not delete: VIS-2 reads the widget configuration through the instance
    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseNetz.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        ensureNetzStyles();
        this.watcher = new StateWatcher(this.props.context.socket, () => this.alive && this.forceUpdate());
        if (this.box.current && typeof ResizeObserver !== 'undefined') {
            this.znResize = new ResizeObserver(() => this.measure());
            this.znResize.observe(this.box.current);
        }
        this.measure();
        this.sync();
        this.timers.push(
            // clock for the night mode of the animations
            setInterval(() => this.alive && this.setState({ znTick: Date.now() }), 60_000),
            setInterval(() => this.autoZurueck(), 5_000),
        );
    }

    componentWillUnmount(): void {
        this.alive = false;
        this.watcher?.stop();
        this.znResize?.disconnect();
        this.timers.forEach(t => clearInterval(t));
        super.componentWillUnmount();
    }

    onRxDataChanged(): void {
        this.sync();
        this.measure();
    }

    private base(): string {
        return (this.state.rxData.instanz || DEFAULT_INSTANCE).replace(/\.$/, '');
    }

    private id(k: (typeof SHOWN)[number]): string {
        return `${this.base()}.${k}`;
    }

    private val(k: (typeof SHOWN)[number]): unknown {
        return this.watcher?.val(this.id(k));
    }

    private seite(): boolean {
        return this.state.rxData.darstellung === 'seite';
    }

    private sync(): void {
        void this.watcher?.watch(SHOWN.map(k => this.id(k)));
    }

    private measure(): void {
        const el = this.box.current;
        if (!el || !this.seite()) {
            return;
        }
        const s = Math.min(el.clientWidth / W, el.clientHeight / H);
        if (s > 0 && Number.isFinite(s) && Math.abs(s - this.state.znScale) > 0.001) {
            this.setState({ znScale: s });
        }
    }

    /** back to the start page after some minutes without touch, only while the page is on screen */
    private autoZurueck(): void {
        const d = this.state.rxData;
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
            this.setState({ znAuswahl: '' });
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

    private waehle = (id: string): void => this.setState({ znAuswahl: this.state.znAuswahl === id ? '' : id });

    // ---------------------------------------------------------------- render

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        return this.seite() ? this.renderSeite() : this.renderKachel();
    }

    private renderKachel(): React.JSX.Element {
        const d = this.state.rxData;
        const topo = parseTopologie(this.val('topology.json'));
        const zustand = kachelZustand(this.val('summary.state'), topo, this.val('info.connection'));
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date());
        const animate = motionAllowed(levelClass) && d.animation !== 'keine';
        const name = d.label || 'Netzwerk';
        const label =
            zustand === 'ok' || zustand === 'update' || zustand === 'keineDaten' ? name : KACHEL_TEXT[zustand];
        const clickable = !!d.klickView && !this.props.editMode;
        const tap = (): void => {
            if (clickable) {
                this.go(d.klickView);
            }
        };
        return (
            <Scaled base={TILE_BASE}>
                {scale => (
                    <Tile
                        look={zustand === 'gestoert' ? 'warn' : zustand === 'keineDaten' ? 'status-off' : 'status-on'}
                        label={label}
                        ariaLabel={`${name}, ${KACHEL_STATUS[zustand]}`}
                        title={KACHEL_STATUS[zustand]}
                        icon={
                            <TurmIcon
                                zustand={zustand}
                                animate={animate}
                            />
                        }
                        overlay={
                            <Ecke
                                zustand={zustand}
                                animate={animate}
                            />
                        }
                        clickable={clickable}
                        led={
                            zustand === 'ok' || zustand === 'gestoert'
                                ? true
                                : zustand === 'keineDaten'
                                  ? false
                                  : undefined
                        }
                        warnPulse={zustand === 'gestoert' && animate}
                        noReception={zustand === 'keineDaten' && !this.props.editMode}
                        levelClass={levelClass}
                        scale={scale}
                        onPointerUp={tap}
                        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && tap()}
                    />
                )}
            </Scaled>
        );
    }

    private renderSeite(): React.JSX.Element {
        const d = this.state.rxData;
        const topo = parseTopologie(this.val('topology.json'));
        const zustand = kachelZustand(this.val('summary.state'), topo, this.val('info.connection'));
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date());
        const real = topo ? topo.nodes.filter(n => !n.virtual) : [];
        const aus = real.filter(n => n.state === 'offline');
        const folge = real.filter(n => n.state === 'consequence');
        const langsam = real.filter(n => n.state === 'degraded');
        const updates = real.filter(n => n.updatable);
        let titel = 'Netzwerk läuft';
        let farbe = '#6fe08a';
        let cls = '';
        if (zustand === 'keineDaten') {
            titel = 'Keine aktuellen Daten';
            farbe = '#7d7b75';
        } else if (aus.length) {
            titel = `${aus.map(n => n.name).join(', ')} ausgefallen`;
            farbe = RED;
            cls = 'zh-a-blink';
        } else if (zustand === 'updateLaeuft') {
            titel = 'Firmware-Update läuft';
            farbe = BLUE;
            cls = 'zh-a-ring';
        } else if (langsam.length) {
            titel = 'Uplink langsamer als gewohnt';
            farbe = YELLOW;
            cls = 'zh-a-ring';
        }
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
                    className="zn"
                    style={{ transform: `scale(${this.state.znScale})` }}
                >
                    <header className="zn-kopf">
                        {d.zurueck ? (
                            <button
                                type="button"
                                className="zn-zur zh-btn"
                                aria-label="Zurück"
                                title="Zurück"
                                onClick={() => this.go(d.zurueck)}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                >
                                    <path d={ZURUECK} />
                                </svg>
                            </button>
                        ) : null}
                        <div className="zn-titel">
                            <div className="zn-over">{`UniFi · ${real.length} Geräte`}</div>
                            <h1>
                                <span
                                    className={`zn-led ${cls}`}
                                    style={{ background: farbe, boxShadow: `0 0 8px ${farbe}` }}
                                />
                                {titel}
                            </h1>
                        </div>
                        <div className={`zn-kpi${aus.length ? ' rot' : ''}`}>
                            <div className="zn-over">Online</div>
                            <b>
                                {real.length - aus.length - folge.length}
                                <small>{` / ${real.length}`}</small>
                            </b>
                        </div>
                        <div className={`zn-kpi${langsam.length ? ' gelb' : ''}`}>
                            <div className="zn-over">Langsam</div>
                            <b>{langsam.length}</b>
                        </div>
                        <div className={`zn-kpi${updates.length ? ' gelb' : ''}`}>
                            <div className="zn-over">Updates</div>
                            <b>{updates.length}</b>
                        </div>
                    </header>
                    <section className="zn-karte">
                        <div className="zn-hd">
                            <b>Topologie</b>
                            <span>Tippen zeigt Details</span>
                            <div className="zn-leg">
                                <span>
                                    <i style={{ borderTop: '2px solid #8c8a83' }} />
                                    Kabel
                                </span>
                                <span>
                                    <i style={{ borderTop: `2px dashed ${BLUE}` }} />
                                    Mesh
                                </span>
                                <span>
                                    <i style={{ borderTop: '2px dotted #e8913a' }} />
                                    {topo?.nodes.find(n => n.virtual && n.name)?.name || 'Nicht UniFi'}
                                </span>
                            </div>
                        </div>
                        {topo && topo.nodes.length ? (
                            this.renderKarte(topo)
                        ) : (
                            <div className="zn-leer">Noch keine Daten vom Adapter</div>
                        )}
                        {topo ? this.renderDetails(topo) : null}
                    </section>
                </div>
            </div>
        );
    }

    private renderKarte(topo: NetzTopologie): React.JSX.Element {
        const { pos, breite, hoehe } = anordnen(topo);
        const byId = new Map(topo.nodes.map(n => [n.id, n]));
        const S = KARTE;
        const linien: React.ReactNode[] = [];
        const schilder: React.ReactNode[] = [];
        topo.edges.forEach((e, i) => {
            const a = pos[e.from];
            const b = pos[e.to];
            const kind = byId.get(e.to);
            const eltern = byId.get(e.from);
            if (!a || !b || !kind) {
                return;
            }
            // the cable into the section is a normal cable; only the way through it (e.g. powerline) is orange
            const ueberFremd = !!eltern?.virtual;
            let farbe = '#8c8a83';
            let dash = '';
            let cap: 'butt' | 'round' = 'butt';
            if (kind.state === 'offline') {
                farbe = RED;
            } else if (kind.state === 'consequence') {
                farbe = '#7d7b75';
                dash = '5 4';
            } else if (e.degraded) {
                farbe = YELLOW;
            } else if (e.type === 'wireless') {
                farbe = BLUE;
                dash = '7 6';
            } else if (ueberFremd) {
                farbe = '#e8913a';
                dash = '2 5';
                cap = 'round';
            }
            const y1 = a.y + S.hoehe / 2;
            const y2 = b.y - S.hoehe / 2;
            const my = (y1 + y2) / 2;
            linien.push(
                <path
                    key={`l${i}`}
                    d={`M${a.x} ${y1} C${a.x} ${my + 6} ${b.x} ${my - 6} ${b.x} ${y2}`}
                    stroke={farbe}
                    strokeWidth={2.4}
                    fill="none"
                    strokeDasharray={dash || undefined}
                    strokeLinecap={cap}
                />,
            );
            const text = kantenText(e, kind);
            if (text) {
                const gelb = e.degraded && kind.state !== 'offline' && kind.state !== 'consequence';
                const w = text.length * 5.7 + 16;
                const cy = y2 - 11;
                schilder.push(
                    <g key={`s${i}`}>
                        <rect
                            x={b.x - w / 2}
                            y={cy - 9}
                            width={w}
                            height={18}
                            rx={9}
                            fill="#2b2b2f"
                            stroke={gelb ? YELLOW : '#3d3d42'}
                        />
                        <text
                            x={b.x}
                            y={cy + 4}
                            textAnchor="middle"
                            fontSize={11}
                            fill={gelb ? YELLOW : '#a3a19a'}
                        >
                            {text}
                        </text>
                    </g>,
                );
            }
        });
        const karten = topo.nodes.map(n => {
            const p = pos[n.id];
            if (!p) {
                return null;
            }
            const look = LOOK[n.virtual ? 'virtual' : n.state] || LOOK.ok;
            const x = p.x - S.breite / 2;
            const y = p.y - S.hoehe / 2;
            const kante = topo.edges.find(e => e.to === n.id);
            let sub = n.virtual
                ? n.name
                    ? 'kein UniFi-Gerät'
                    : 'z. B. Powerline'
                : n.role === 'switch'
                  ? 'Switch'
                  : n.model;
            if (n.state === 'degraded' && kante && kante.type !== 'wireless') {
                sub = `${tempo(kante.speed)} – langsamer als gewohnt`;
            } else if (n.state === 'offline') {
                sub = 'ausgefallen';
            } else if (n.state === 'consequence') {
                sub = 'nicht erreichbar';
            } else if (n.state === 'busy') {
                sub = 'Update läuft';
            }
            const gewaehlt = this.state.znAuswahl === n.id;
            return (
                <g
                    key={n.id}
                    className="zn-k"
                    role="button"
                    tabIndex={0}
                    aria-label={kartenName(n)}
                    onClick={() => this.waehle(n.id)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && this.waehle(n.id)}
                >
                    <rect
                        className={n.state === 'offline' ? 'zh-a-blink' : undefined}
                        x={x}
                        y={y}
                        width={S.breite}
                        height={S.hoehe}
                        rx={14}
                        fill={look.bg}
                        stroke={look.bd}
                        strokeWidth={gewaehlt ? 3 : 1.5}
                        strokeDasharray={look.dash}
                    />
                    <g
                        transform={`translate(${x + 11} ${p.y - 13}) scale(1.1)`}
                        fill="none"
                        stroke={look.fg}
                        strokeWidth={1.7}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d={ICON[n.virtual ? 'unknownSwitch' : n.role] || ICON.accessPoint} />
                    </g>
                    <text
                        x={x + 45}
                        y={p.y - 2}
                        fontSize={13.5}
                        fontWeight={600}
                        fill={look.fg}
                    >
                        {kuerzen(kartenName(n), 12)}
                    </text>
                    <text
                        x={x + 45}
                        y={p.y + 13}
                        fontSize={11}
                        fill={look.sub}
                    >
                        {kuerzen(sub, 17)}
                    </text>
                    {look.led ? (
                        <circle
                            className={look.cls}
                            cx={x + S.breite - 11}
                            cy={y + 11}
                            r={4}
                            fill={look.led}
                            style={{ filter: `drop-shadow(0 0 4px ${look.led})` }}
                        />
                    ) : null}
                    {n.updatable ? (
                        <g className="zh-a-ring">
                            <rect
                                x={x + 6}
                                y={y - 8}
                                width={44}
                                height={15}
                                rx={7.5}
                                fill={YELLOW}
                            />
                            <text
                                x={x + 28}
                                y={y + 3}
                                textAnchor="middle"
                                fontSize={9.5}
                                fontWeight={700}
                                letterSpacing=".04em"
                                fill="#2a2108"
                            >
                                UPDATE
                            </text>
                        </g>
                    ) : null}
                </g>
            );
        });
        return (
            <svg
                className="zn-map"
                viewBox={`0 -10 ${breite} ${hoehe + 10}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="Netzwerkkarte"
                onClick={e => e.target === e.currentTarget && this.setState({ znAuswahl: '' })}
            >
                {linien}
                {schilder}
                {karten}
            </svg>
        );
    }

    private renderDetails(topo: NetzTopologie): React.JSX.Element | null {
        const n = topo.nodes.find(k => k.id === this.state.znAuswahl);
        if (!n) {
            return null;
        }
        const byId = new Map(topo.nodes.map(k => [k.id, k]));
        const geraet = parseGeraete(this.val('summary.json')).get(n.id);
        const kante = topo.edges.find(e => e.to === n.id);
        const eltern: NetzKnoten | undefined = n.uplinkId ? byId.get(n.uplinkId) : undefined;
        const zeilen: [string, string][] = [];
        const zeile = (k: string, wert: string | number | null | undefined): void => {
            if (wert !== undefined && wert !== null && wert !== '') {
                zeilen.push([k, String(wert)]);
            }
        };
        if (!n.virtual) {
            zeile('Modell', n.model);
            zeile('Zustand', ZUSTAND_TEXT[n.state]);
        }
        if (eltern) {
            zeile(
                'Hängt an',
                kante?.port !== null && kante?.port !== undefined
                    ? `${kartenName(eltern)} · Port ${kante.port}`
                    : kartenName(eltern),
            );
        }
        if (kante && !n.virtual) {
            zeile(
                'Verbindung',
                kante.type === 'wireless' ? kantenText({ ...kante, port: null }, n) : `Kabel · ${tempo(kante.speed)}`,
            );
        }
        if (!n.virtual) {
            zeile('Laufzeit', n.state === 'offline' || n.state === 'consequence' ? '–' : laufzeit(geraet?.uptime));
            zeile('Firmware', geraet?.firmware);
            zeile('Clients', geraet?.clients);
        }
        const ursache = n.state === 'consequence' && n.causeId ? byId.get(n.causeId) : undefined;
        const rolle = n.virtual
            ? n.name
                ? 'kein UniFi-Gerät'
                : 'z. B. Powerline'
            : n.role === 'switch'
              ? 'Switch'
              : n.role === 'gateway'
                ? 'Gateway'
                : 'Access Point';
        return (
            <div
                className="zn-det"
                role="dialog"
                aria-label={n.name}
            >
                <button
                    type="button"
                    className="zn-x zh-btn"
                    aria-label="Schließen"
                    onClick={() => this.setState({ znAuswahl: '' })}
                >
                    ✕
                </button>
                <h2>{n.virtual ? kartenName(n) : n.name}</h2>
                <div className="zn-sub">{rolle}</div>
                <dl>
                    {zeilen.map(([k, wert]) => (
                        <React.Fragment key={k}>
                            <dt>{k}</dt>
                            <dd>{wert}</dd>
                        </React.Fragment>
                    ))}
                </dl>
                {n.updatable ? (
                    <div className="zn-hin gelb">
                        Ein Firmware-Update ist verfügbar. Starten von hier folgt in einer späteren Version.
                    </div>
                ) : ursache ? (
                    <div className="zn-hin rot">{`Nicht erreichbar, weil ${ursache.name} ausgefallen ist.`}</div>
                ) : null}
            </div>
        );
    }
}
