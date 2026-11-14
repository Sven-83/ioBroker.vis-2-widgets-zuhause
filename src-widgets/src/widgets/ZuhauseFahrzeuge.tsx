/*
 * VIS-2 widget "Fahrzeuge": card of the start page for the adapter ioBroker.mobility (Ford + Easee + fuel prices).
 * Look decided 13.11.2026 (sketch v3):
 * - top row: one column per car (fuel = amber, electric = green) with level, range and warning symbols,
 *   the fuel car also shows the cheapest station right now; optional dashed "camper, planned" column.
 *   A tap on a car opens its detail page (inside a ZuhauseSeiten frame when there is one).
 * - bottom row: both wallboxes with start/stop. Grey and locked without a car, yellow "Start" with a car,
 *   red "Stopp" while charging; after a tap a spinner until the wallbox confirms (no double tap).
 * Names of cars, wallboxes and stations come from the adapter states, nothing private is in the code.
 * The data points are no attribute fields, the widget subscribes them itself (StateWatcher).
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import {
    CHARGER_DP,
    GLOBAL_DP,
    VEHICLE_DP,
    WARN_SYMBOL,
    clampPct,
    clock,
    driveOf,
    fullAt,
    isCharging,
    isPluggedIn,
    lastSessionKwh,
    num,
    parseWarnings,
    price,
    standText,
    text,
    visibleWarnings,
    wallboxPhase,
    warningText,
    type ChargerDp,
    type Drive,
    type GlobalDp,
    type VehicleDp,
    type WallboxPhase,
    type Warning,
} from '../lib/fahrzeuge';
import { CountUp, WARN_PATH } from '../components/Fahrzeug';
import { WallboxRow, ensureWallboxStyles } from '../components/Wallbox';
import { formatNumber } from '../lib/model';
import { ensureStyles, fonts } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass, requestTab } from '../lib/vis';
import { StateWatcher, type Snapshot } from '../lib/watch';

const W = 488;
const H = 218;
const STYLE_ID = 'zh-fahrzeuge-styles';
const COLOR: Record<Drive, string> = { fuel: '#e8a33d', ev: '#6fe08a' };

const CSS = `
.zf{position:relative;width:100%;height:100%;box-sizing:border-box;background:var(--card,#2b2b2f);border:1px solid var(--border,#36363b);border-radius:var(--radius-card,18px);padding:12px 14px;display:flex;flex-direction:column;font-family:${fonts.text};color:var(--text,#ece9e1);overflow:hidden}
.zf *{box-sizing:border-box}
.zf-kopf{display:flex;align-items:center;gap:8px;min-width:0}
.zf-kopf .t{font-size:11px;letter-spacing:.1em;font-weight:600;color:var(--text-2,#a3a19a)}
.zf-kopf small{font-size:11px;color:var(--text-2,#a3a19a);white-space:nowrap}
.zf-kopf .r{margin-left:auto;font-size:11px;color:var(--text-2,#a3a19a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zf-kopf .r.warn{color:var(--warn-fg,#ffb3b3);font-weight:600}
.zf-autos{display:grid;gap:10px;margin-top:10px}
.zf-auto{position:relative;border-radius:12px;padding:8px 10px 9px;background:#2f2f34;border:1px solid var(--border,#36363b);overflow:hidden;min-width:0;text-align:left;font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
button.zf-auto{cursor:pointer;transition:transform .15s}
button.zf-auto:active{transform:scale(.97)}
.zf-auto:focus-visible,.zf-wb button:focus-visible{outline:2px solid var(--sw-on,#f2c14e);outline-offset:2px}
.zf-name{white-space:nowrap;font-size:10px;color:var(--text-2,#a3a19a);text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:5px;height:18px}
.zf-name>i{flex:none;width:6px;height:6px;border-radius:50%;display:inline-block}
.zf-name>em{font-style:normal;overflow:hidden;text-overflow:ellipsis}
.zf-pfeil{position:absolute;right:8px;top:7px;color:var(--text-2,#a3a19a);font-size:12px}
.zf-wert{white-space:nowrap;font-family:${fonts.numbers};font-weight:600;font-size:26px;line-height:1.05;margin-top:3px;display:flex;align-items:baseline;gap:6px}
.zf-wert small{font-family:${fonts.text};font-weight:500;font-size:12px;color:var(--text-2,#a3a19a)}
.zf-balken{height:5px;border-radius:3px;background:#3a3a40;margin-top:5px;overflow:hidden}
.zf-balken>b{display:block;height:100%;border-radius:3px;transition:width 1.4s cubic-bezier(.2,.8,.2,1)}
.zf-chips{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;min-height:17px}
.zf-chip{font-size:10px;font-weight:600;border-radius:6px;padding:2px 6px;border:1px solid;white-space:nowrap}
.zf-chip.ok{color:var(--st-on-fg,#9fe0b2);background:var(--st-on-bg,#183323);border-color:var(--st-on-bd,#3f8f57)}
.zf-chip.aus{color:var(--text-2,#a3a19a);border-color:var(--st-off-bd,#4f4f56)}
.zf-tank{margin-top:6px;font-size:11px;display:flex;justify-content:space-between;align-items:center;gap:6px;padding:1px 6px;border-radius:6px;border:1px solid var(--st-on-bd,#3f8f57);background:var(--st-on-bg,#183323);color:var(--st-on-fg,#9fe0b2);white-space:nowrap;min-width:0}
.zf-tank span{overflow:hidden;text-overflow:ellipsis}
.zf-tank b{font-family:${fonts.numbers};font-weight:600;font-size:12px;flex:none}
.zf-wm{border-style:dashed;border-color:var(--st-off-bd,#4f4f56);background:transparent}
.zf-wm .z{display:flex;justify-content:space-between;margin-top:6px}
.zf-wm .z div{font-size:10px;color:var(--text-2,#a3a19a)}
.zf-wm .z b{display:block;font-family:${fonts.numbers};font-weight:600;font-size:17px;color:var(--text-2,#a3a19a)}
.zf-laedt .zf-wert::after{content:'';width:8px;height:8px;border-radius:50%;background:${COLOR.ev};margin-left:2px;align-self:center;animation:zf-puls 1.2s ease-out infinite}
.zf-laedt .zf-balken>b{background:linear-gradient(90deg,${COLOR.ev} 0%,#b8f5c7 50%,${COLOR.ev} 100%)!important;background-size:200% 100%!important;animation:zf-fluss 1.6s linear infinite}
@keyframes zf-puls{0%{box-shadow:0 0 0 0 rgba(111,224,138,.7)}100%{box-shadow:0 0 0 10px rgba(111,224,138,0)}}
@keyframes zf-fluss{to{background-position:-200% 0}}
.zf-warns{margin-left:auto;margin-right:9px;height:14px;display:flex;gap:3px;align-items:center}
.zf-voll .zf-warns{margin-right:0}
.zf-voll .zf-pfeil{display:none}
.zf-warn{width:18px;height:18px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;border:1px solid}
.zf-warn svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.zf-warn.critical{color:#ffb3b3;background:var(--warn-bg,#3a1d1f);border-color:var(--warn-bd,#e5484d);animation:zf-rotpuls 1.6s ease-in-out infinite}
.zf-warn.warning{color:#ffd98a;background:#3a3014;border-color:#8f7330}
.zf-warn.info{color:#8a8890;background:#333338;border-color:#44444a}
.zf-warn.alarm{animation:zf-alarm .6s steps(2) infinite}
.zf-mehr{font-size:10px;font-weight:700;color:var(--text-2,#a3a19a);letter-spacing:0}
@keyframes zf-rotpuls{50%{box-shadow:0 0 0 3px rgba(229,72,77,.28)}}
@keyframes zf-alarm{50%{background:var(--warn-bd,#e5484d);color:#fff}}
.zf-trenn{height:1px;background:var(--border,#36363b);margin:10px 0 8px}
.zf-wbs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.zf.zh-dezent *,.zf.zh-dezent *::after{animation-duration:6s!important}
.zf.zh-dezent .zf-spin{animation-duration:.8s!important}
.zf.zf-still *,.zf.zf-still *::after{animation:none!important;transition:none!important}
.zf.zf-still .zf-spin{animation:zh-spinner .8s linear infinite!important}
@media (prefers-reduced-motion:reduce){.zf *,.zf *::after{animation:none!important;transition:none!important}.zf .zf-spin{animation:zh-spinner .8s linear infinite!important}}
`;

function ensureFahrzeugeStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

interface FahrzeugeRxData {
    instanz: string;
    fahrzeug1: number;
    view1: string;
    fahrzeug2: number;
    view2: string;
    wallbox1: number;
    wallbox2: number;
    wohnmobil: boolean;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface FahrzeugeState extends VisRxWidgetState {
    zfNow: number;
    /** false until the first frame, so the bars grow from 0 */
    zfShown: boolean;
}

// ---------------------------------------------------------------- small parts

function CarIcon(): React.JSX.Element {
    return (
        <svg
            viewBox="0 0 24 24"
            width={16}
            height={16}
            fill="none"
            stroke="var(--sw-on,#f2c14e)"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M5 17h14v-5l-2-5H7l-2 5z M5 12h14 M7.5 17v2 M16.5 17v2" />
        </svg>
    );
}

function CamperIcon(): React.JSX.Element {
    return (
        <svg
            viewBox="0 0 24 24"
            width={13}
            height={13}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M2 17V8a2 2 0 0 1 2-2h11l5 5v6z M2 13h18 M6 9h4 M7 19a2 2 0 1 0 0.01 0 M16 19a2 2 0 1 0 0.01 0" />
        </svg>
    );
}

function WarnIcons({ list, lang }: { list: Warning[]; lang: string }): React.JSX.Element | null {
    if (!list.length) {
        return null;
    }
    const { shown, more } = visibleWarnings(list);
    return (
        <span className="zf-warns">
            {shown.map((w, i) => {
                const sym = WARN_SYMBOL[w.key];
                const t = warningText(w, lang);
                return (
                    <span
                        key={`${w.key}-${i}`}
                        className={`zf-warn ${w.level}${w.key === 'alarm' ? ' alarm' : ''}`}
                        title={t}
                        role="img"
                        aria-label={t}
                    >
                        <svg viewBox="0 0 24 24">
                            <path d={WARN_PATH[sym]} />
                        </svg>
                    </span>
                );
            })}
            {more ? <span className="zf-mehr">+{more}</span> : null}
        </span>
    );
}

function Camper(): React.JSX.Element {
    return (
        <div className="zf-auto zf-wm">
            <div className="zf-name">
                <CamperIcon />
                <em>Wohnmobil</em>
            </div>
            <div className="z">
                <div>
                    Aufbau<b>— %</b>
                </div>
                <div>
                    Starter<b>— V</b>
                </div>
            </div>
            <div className="zf-chips">
                <span className="zf-chip aus">geplant · Victron</span>
            </div>
        </div>
    );
}

/** Slot number from a widget field; 0 or nonsense = not shown */
function slotOf(value: unknown): number {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------- widget

export default class ZuhauseFahrzeuge extends (window.visRxWidget as typeof VisRxWidget)<
    FahrzeugeRxData,
    FahrzeugeState
> {
    private watcher?: StateWatcher;
    private timers: ReturnType<typeof setInterval>[] = [];
    private alive = true;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zfNow: Date.now(), zfShown: false };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseFahrzeuge',
            ...SET_INFO,
            visName: 'ZuhauseFahrzeuge',
            visWidgetLabel: 'fahrzeuge_label',
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
                        { name: 'fahrzeug1', type: 'number', label: 'fahrzeuge_car1', default: 1, min: 0, max: 9 },
                        { name: 'view1', type: 'views', label: 'fahrzeuge_view1' },
                        { name: 'fahrzeug2', type: 'number', label: 'fahrzeuge_car2', default: 2, min: 0, max: 9 },
                        { name: 'view2', type: 'views', label: 'fahrzeuge_view2' },
                        { name: 'wallbox1', type: 'number', label: 'fahrzeuge_wb1', default: 1, min: 0, max: 9 },
                        { name: 'wallbox2', type: 'number', label: 'fahrzeuge_wb2', default: 2, min: 0, max: 9 },
                        { name: 'wohnmobil', type: 'checkbox', label: 'fahrzeuge_camper', default: true },
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
        return ZuhauseFahrzeuge.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        ensureFahrzeugeStyles();
        ensureWallboxStyles();
        this.watcher = new StateWatcher(this.props.context.socket, this.onStates);
        this.watch();
        // clock: "voll ca.", command timeout, night mode
        this.timers.push(setInterval(() => this.alive && this.tick(), 5_000));
        requestAnimationFrame(() => this.alive && this.setState({ zfShown: true }));
    }

    onRxDataChanged(): void {
        this.watch();
    }

    componentWillUnmount(): void {
        this.alive = false;
        this.timers.forEach(t => clearInterval(t));
        this.watcher?.stop();
        super.componentWillUnmount();
    }

    // ---------------------------------------------------------------- data

    private get inst(): string {
        return (this.state.rxData.instanz || 'mobility.0').trim().replace(/\.$/, '');
    }

    private cars(): number[] {
        const d = this.state.rxData;
        return [slotOf(d.fahrzeug1 ?? 1), slotOf(d.fahrzeug2 ?? 2)].filter(Boolean);
    }

    private boxes(): number[] {
        const d = this.state.rxData;
        return [slotOf(d.wallbox1 ?? 1), slotOf(d.wallbox2 ?? 2)].filter(Boolean);
    }

    private vid(n: number, dp: VehicleDp): string {
        return `${this.inst}.ford.vehicle${n}.${dp}`;
    }

    private cid(n: number, dp: ChargerDp): string {
        return `${this.inst}.easee.charger${n}.${dp}`;
    }

    private gid(dp: GlobalDp): string {
        return `${this.inst}.${dp}`;
    }

    private watch(): void {
        const ids = [
            ...GLOBAL_DP.map(dp => this.gid(dp)),
            ...this.cars().flatMap(n => VEHICLE_DP.map(dp => this.vid(n, dp))),
            ...this.boxes().flatMap(n => CHARGER_DP.map(dp => this.cid(n, dp))),
        ];
        void this.watcher?.watch(ids);
    }

    private val(id: string): unknown {
        return this.watcher?.val(id);
    }

    private snap(id: string): Snapshot | undefined {
        return this.watcher?.snapshot(id);
    }

    private onStates = (): void => {
        if (this.alive) {
            this.tick();
        }
    };

    private phase(n: number): WallboxPhase {
        return wallboxPhase({
            online: this.val(this.cid(n, 'online')),
            opMode: this.val(this.cid(n, 'opMode')),
            carConnected: this.val(this.cid(n, 'carConnected')),
            charging: this.val(this.cid(n, 'charging')),
        });
    }

    private tick(): void {
        this.setState({ zfNow: Date.now() });
    }

    // ---------------------------------------------------------------- actions

    private go(view: string): void {
        if (!view || this.props.editMode) {
            return;
        }
        if (!requestTab({ von: this.props.view, nach: view })) {
            this.props.context.changeView(view);
        }
    }

    // ---------------------------------------------------------------- render

    private renderCar(n: number, view: string, motion: boolean, lang: string, wbCharging: boolean): React.JSX.Element {
        const drive = driveOf(this.val(this.vid(n, 'engineType')));
        const name = text(this.val(this.vid(n, 'name'))) || `Fahrzeug ${n}`;
        const level = num(this.val(this.vid(n, drive === 'ev' ? 'soc' : 'fuelLevel')));
        const range = num(this.val(this.vid(n, drive === 'ev' ? 'evRange' : 'fuelRange')));
        const warnings = parseWarnings(this.val(this.vid(n, 'warnings')));
        const plugged = drive === 'ev' && isPluggedIn(this.val(this.vid(n, 'plugStatus')));
        const charging =
            drive === 'ev' && (isCharging(this.val(this.vid(n, 'chargeStatus'))) || (plugged && wbCharging));
        const full = charging
            ? fullAt(this.val(this.vid(n, 'timeToFull')), this.val(this.vid(n, 'lastUpdate')), this.state.zfNow)
            : null;
        const cheapest = text(this.val(this.gid('fuel.cheapestStation')));
        const cheapPrice = this.val(this.gid('fuel.cheapestPrice'));
        const clickable = !!view && !this.props.editMode;
        const levelText = level === null ? '—' : `${formatNumber(level, 0, lang)} %`;
        const aria = [
            name,
            levelText,
            range !== null ? `${formatNumber(range, 0, lang)} km` : '',
            ...warnings.map(w => warningText(w, lang)),
        ]
            .filter(Boolean)
            .join(', ');
        const inner = (
            <>
                {view ? <span className="zf-pfeil">›</span> : null}
                <div className="zf-name">
                    <i style={{ background: COLOR[drive] }} />
                    <em>{name}</em>
                    <WarnIcons
                        list={warnings}
                        lang={lang}
                    />
                </div>
                <div className="zf-wert">
                    <span>
                        {level === null ? (
                            '—'
                        ) : (
                            <CountUp
                                value={Math.round(level)}
                                animate={motion}
                            />
                        )}
                        {' %'}
                    </span>
                    {range !== null ? <small>{formatNumber(range, 0, lang)} km</small> : null}
                </div>
                <div className="zf-balken">
                    <b
                        style={{
                            width: `${this.state.zfShown || !motion ? clampPct(level) : 0}%`,
                            background: COLOR[drive],
                        }}
                    />
                </div>
                {drive === 'fuel' ? (
                    cheapest ? (
                        <div
                            className="zf-tank"
                            title="gerade günstigste Tankstelle (Super E10)"
                        >
                            <span>▼ {cheapest}</span>
                            <b>{price(cheapPrice, lang)}</b>
                        </div>
                    ) : null
                ) : (
                    <div className="zf-chips">
                        {full !== null ? <span className="zf-chip ok">voll ca. {clock(full)}</span> : null}
                    </div>
                )}
            </>
        );
        const cls = `zf-auto${charging ? ' zf-laedt' : ''}${warnings.length > 3 ? ' zf-voll' : ''}`;
        return clickable ? (
            <button
                key={`car-${n}`}
                type="button"
                className={cls}
                aria-label={aria}
                onClick={() => this.go(view)}
            >
                {inner}
            </button>
        ) : (
            <div
                key={`car-${n}`}
                className={cls}
                aria-label={aria}
            >
                {inner}
            </div>
        );
    }

    private renderWallbox(n: number, phase: WallboxPhase, car: string, lang: string): React.JSX.Element {
        return (
            <WallboxRow
                key={`wb-${n}`}
                n={n}
                name={text(this.val(this.cid(n, 'name'))) || `Wallbox ${n}`}
                phase={phase}
                info={{
                    opMode: this.val(this.cid(n, 'opMode')),
                    power: this.val(this.cid(n, 'power')),
                    sessionEnergy: this.val(this.cid(n, 'sessionEnergy')),
                    reasonText: this.val(this.cid(n, 'reasonText')),
                    lastKwh: lastSessionKwh(this.val(this.cid(n, 'history.lastSession'))),
                    car,
                }}
                charge={this.snap(this.cid(n, 'charge'))}
                editMode={!!this.props.editMode}
                lang={lang}
                onSend={wanted => this.props.context.setValue(this.cid(n, 'charge'), wanted)}
            />
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const lang = ZuhauseFahrzeuge.getLanguage();
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date(this.state.zfNow));
        const motion = motionAllowed(levelClass) && d.animation !== 'keine';
        const cars = this.cars();
        const boxes = this.boxes();
        const views = [d.view1 || '', d.view2 || ''];
        const phases = new Map(boxes.map(n => [n, this.phase(n)]));
        const occupied = boxes.filter(n => {
            const p = phases.get(n);
            return p === 'bereit' || p === 'laedt';
        });
        // Easee does not know the car: name the electric car only when Ford says it is plugged in
        // and exactly one wallbox has a car
        const evPlugged = cars.find(
            n =>
                driveOf(this.val(this.vid(n, 'engineType'))) === 'ev' &&
                isPluggedIn(this.val(this.vid(n, 'plugStatus'))),
        );
        const evName = evPlugged !== undefined ? text(this.val(this.vid(evPlugged, 'name'))) : '';
        const carAt = (n: number): string => (evName && occupied.length === 1 && occupied[0] === n ? evName : '');
        const wbCharging = occupied.length === 1 && phases.get(occupied[0]) === 'laedt';

        const connected = this.val(this.gid('info.connection'));
        const fordTs = Math.max(0, ...cars.map(n => num(this.val(this.vid(n, 'lastUpdate'))) ?? 0)) || null;
        const wbTs = Math.max(0, ...boxes.map(n => num(this.val(this.cid(n, 'lastUpdate'))) ?? 0)) || null;
        const offline = connected === false && !this.props.editMode;
        const stand = offline
            ? 'Adapter ohne Verbindung'
            : standText(fordTs, this.val(this.gid('easee.streamConnected')), wbTs);
        const columns = cars.length + (d.wohnmobil !== false ? 1 : 0);

        return (
            <section
                className={['zf', levelClass, motion ? '' : 'zf-still'].filter(Boolean).join(' ')}
                aria-label="Fahrzeuge"
            >
                <div className="zf-kopf">
                    <CarIcon />
                    <span className="t">FAHRZEUGE</span>
                    {views.some(Boolean) ? <small>Tippen öffnet Details</small> : null}
                    <span className={`r${offline ? ' warn' : ''}`}>{stand}</span>
                </div>
                <div
                    className="zf-autos"
                    style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}
                >
                    {cars.map((n, i) => this.renderCar(n, views[i], motion, lang, wbCharging))}
                    {d.wohnmobil !== false ? <Camper key="camper" /> : null}
                </div>
                {boxes.length ? (
                    <>
                        <div className="zf-trenn" />
                        <div className="zf-wbs">
                            {boxes.map(n => this.renderWallbox(n, phases.get(n) ?? 'frei', carAt(n), lang))}
                        </div>
                    </>
                ) : null}
            </section>
        );
    }
}
