/*
 * VIS-2 widget "Weihnachtsbeleuchtung": one tile for three circuits (star, reindeer, fairy lights).
 * Every 3 s the next picture fades in; grey = off, yellow = on. Top right: small symbols of the
 * circuits that are on. A short tap switches the circuit whose picture was shown at the moment of
 * the touch (not at release); the picture then stays 3 s. A long press opens the popup with the
 * switches and the timer. The picture change runs in the browser only, no data point is written.
 * The tile writes only the switch data points and <basis>.<kreis>.laufzeiten; the ioBroker script
 * "weihnachten" does the timing and confirms the run times (ack). Shows only confirmed values.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { Scaled } from '../components/Scaled';
import { TILE_BASE, Tile } from '../components/Tile';
import { ensureWeihnachtStyles, KreisIcon, MiniIcon } from '../components/WeihnachtIcons';
import { WeihnachtPopup, type WeihnachtKreis } from '../components/WeihnachtPopup';
import { ACK_TIMEOUT_MS } from '../lib/model';
import { ensureStyles, v } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';
import { StateWatcher } from '../lib/watch';
import { KREISE, emptyPlan, parsePlan, serializePlan, statusLine, sunsetWeek, type Plan } from '../lib/weihnacht';

const LONG_PRESS_MS = 500;
const CHANGE_MS = 3000;
const HOLD_AFTER_TAP_MS = 3000;
const DATA = ['laufzeiten', 'hand', 'handBis', 'nachtTimer', 'naechsterStart'] as const;
const OID_FIELD = ['oidStern', 'oidRentier', 'oidLichterkette'] as const;

interface WeihnachtRxData {
    basis: string;
    oidStern: string;
    oidRentier: string;
    oidLichterkette: string;
    label: string;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface WeihnachtState extends VisRxWidgetState {
    zhShown: number;
    zhPause: boolean;
    zhPress: boolean;
    zhPending: boolean[];
    zhUnconfirmed: boolean[];
    zhPlanPending: boolean[];
    zhPopup: boolean;
    zhNow: number;
    zhLat: number | null;
    zhLon: number | null;
}

export default class ZuhauseWeihnacht extends (window.visRxWidget as typeof VisRxWidget)<
    WeihnachtRxData,
    WeihnachtState
> {
    private watcher?: StateWatcher;
    private longTimer?: ReturnType<typeof setTimeout>;
    private longFired = false;
    /** circuit shown at the moment of the touch */
    private captured: number | null = null;
    private changeTimer?: ReturnType<typeof setTimeout>;
    private pauseTimer?: ReturnType<typeof setTimeout>;
    private ackTimers: (ReturnType<typeof setTimeout> | undefined)[] = [];
    private planTimers: (ReturnType<typeof setTimeout> | undefined)[] = [];
    private wanted: (boolean | undefined)[] = [];
    private clock?: ReturnType<typeof setInterval>;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            zhShown: 0,
            zhPause: false,
            zhPress: false,
            zhPending: [false, false, false],
            zhUnconfirmed: [false, false, false],
            zhPlanPending: [false, false, false],
            zhPopup: false,
            zhNow: Date.now(),
            zhLat: null,
            zhLon: null,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseWeihnacht',
            ...SET_INFO,
            visName: 'ZuhauseWeihnacht',
            visWidgetLabel: 'weihnacht_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'basis',
                            type: 'text',
                            label: 'weihnacht_base',
                            tooltip: 'weihnacht_base_tip',
                            default: '0_userdata.0.weihnachten',
                        },
                        { name: 'oidStern', type: 'id', label: 'weihnacht_stern' },
                        { name: 'oidRentier', type: 'id', label: 'weihnacht_rentier' },
                        { name: 'oidLichterkette', type: 'id', label: 'weihnacht_lichterkette' },
                        { name: 'label', type: 'text', label: 'weihnacht_name', default: 'Weihnacht' },
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
        return ZuhauseWeihnacht.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        ensureWeihnachtStyles();
        this.watcher = new StateWatcher(this.props.context.socket, this.onStates);
        this.watch();
        this.scheduleChange();
        // status lines ("noch 12 min"), the "now" mark and night mode follow the clock
        this.clock = setInterval(() => this.setState({ zhNow: Date.now() }), 30_000);
        void this.loadLocation();
    }

    onRxDataChanged(): void {
        this.watch();
    }

    componentWillUnmount(): void {
        this.cancelLongPress();
        for (const t of [this.changeTimer, this.pauseTimer, ...this.ackTimers, ...this.planTimers]) {
            if (t) {
                clearTimeout(t);
            }
        }
        if (this.clock) {
            clearInterval(this.clock);
        }
        this.watcher?.stop();
        super.componentWillUnmount();
    }

    /** coordinates of the ioBroker system for the sunset shown in the popup */
    private async loadLocation(): Promise<void> {
        try {
            const obj = await this.props.context.socket.getObject('system.config');
            const lat = Number(obj?.common?.latitude);
            const lon = Number(obj?.common?.longitude);
            if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) {
                this.setState({ zhLat: lat, zhLon: lon });
            }
        } catch {
            // no location: the popup shows "sunset ± min" without the time
        }
    }

    private get basis(): string {
        return (this.state.rxData.basis || '0_userdata.0.weihnachten').trim().replace(/\.$/, '');
    }

    private switchId(i: number): string {
        return String(this.state.rxData[OID_FIELD[i]] || '').trim();
    }

    private onlineId(i: number): string {
        const id = this.switchId(i);
        return /\.Relay0\.Switch$/.test(id) ? id.replace(/\.Relay0\.Switch$/, '.online') : '';
    }

    private dataId(i: number, dp: (typeof DATA)[number]): string {
        return `${this.basis}.${KREISE[i].key}.${dp}`;
    }

    private watch(): void {
        const ids: string[] = [];
        KREISE.forEach((_, i) => {
            ids.push(this.switchId(i), this.onlineId(i), ...DATA.map(dp => this.dataId(i, dp)));
        });
        void this.watcher?.watch(ids.filter(Boolean));
    }

    /** confirmed value of a data point, undefined while it is not confirmed */
    private ack(id: string): ioBroker.StateValue | undefined {
        const s = id ? this.watcher?.snapshot(id) : undefined;
        return s?.ack ? s.val : undefined;
    }

    private on(i: number): boolean {
        return this.ack(this.switchId(i)) === true;
    }

    private online(i: number): boolean {
        // the first answer is still missing: no warning yet
        return !this.switchId(i) ? false : this.ack(this.onlineId(i)) !== false;
    }

    private plan(i: number): Plan {
        const raw = this.ack(this.dataId(i, 'laufzeiten'));
        return raw === undefined ? emptyPlan() : parsePlan(raw);
    }

    private onStates = (): void => {
        const pending = [...this.state.zhPending];
        const unconfirmed = [...this.state.zhUnconfirmed];
        const planPending = [...this.state.zhPlanPending];
        let changed = false;
        KREISE.forEach((_, i) => {
            if (pending[i] && this.on(i) === this.wanted[i]) {
                clearTimeout(this.ackTimers[i]);
                pending[i] = false;
                unconfirmed[i] = false;
                changed = true;
            }
            if (planPending[i]) {
                const s = this.watcher?.snapshot(this.dataId(i, 'laufzeiten'));
                if (s?.ack) {
                    clearTimeout(this.planTimers[i]);
                    planPending[i] = false;
                    changed = true;
                }
            }
        });
        if (changed) {
            this.setState({
                zhPending: pending,
                zhUnconfirmed: unconfirmed,
                zhPlanPending: planPending,
                zhNow: Date.now(),
            });
        } else {
            this.setState({ zhNow: Date.now() });
        }
    };

    // ---------------------------------------------------------------- picture change

    private scheduleChange(ms = CHANGE_MS): void {
        if (this.changeTimer) {
            clearTimeout(this.changeTimer);
        }
        this.changeTimer = setTimeout(() => {
            if (!this.state.zhPress) {
                this.setState(s => ({ zhShown: (s.zhShown + 1) % KREISE.length }));
            }
            this.scheduleChange();
        }, ms);
    }

    // ---------------------------------------------------------------- actions

    private setSwitch = (i: number, on: boolean): void => {
        const id = this.switchId(i);
        if (!id || this.props.editMode || !this.online(i)) {
            return;
        }
        this.wanted[i] = on;
        this.props.context.setValue(id, on);
        clearTimeout(this.ackTimers[i]);
        this.setState(s => {
            const pending = [...s.zhPending];
            const unconfirmed = [...s.zhUnconfirmed];
            pending[i] = true;
            unconfirmed[i] = false;
            return { zhPending: pending, zhUnconfirmed: unconfirmed };
        });
        this.ackTimers[i] = setTimeout(() => {
            if (this.state.zhPending[i]) {
                this.setState(s => {
                    const pending = [...s.zhPending];
                    const unconfirmed = [...s.zhUnconfirmed];
                    pending[i] = false;
                    unconfirmed[i] = true;
                    return { zhPending: pending, zhUnconfirmed: unconfirmed };
                });
            }
        }, ACK_TIMEOUT_MS);
    };

    private savePlan = (i: number, plan: Plan): void => {
        if (this.props.editMode) {
            return;
        }
        const json = serializePlan(plan);
        this.props.context.setValue(this.dataId(i, 'laufzeiten'), json);
        clearTimeout(this.planTimers[i]);
        this.setState(s => {
            const planPending = [...s.zhPlanPending];
            planPending[i] = true;
            return { zhPlanPending: planPending };
        });
        // the script confirms within a second; without it the popup keeps showing "wird gespeichert"
        this.planTimers[i] = setTimeout(() => {
            this.setState(s => {
                const planPending = [...s.zhPlanPending];
                planPending[i] = false;
                return { zhPlanPending: planPending };
            });
        }, ACK_TIMEOUT_MS * 2);
    };

    private cancelLongPress(): void {
        if (this.longTimer) {
            clearTimeout(this.longTimer);
            this.longTimer = undefined;
        }
    }

    private onPointerDown = (e: React.PointerEvent): void => {
        if (this.props.editMode || e.button > 0) {
            return;
        }
        // the picture at the moment of the touch counts, not the one at release
        this.captured = this.state.zhShown;
        this.longFired = false;
        this.cancelLongPress();
        this.setState({ zhPress: true });
        this.longTimer = setTimeout(() => {
            this.longTimer = undefined;
            this.longFired = true;
            this.setState({ zhPopup: true, zhPress: false });
        }, LONG_PRESS_MS);
    };

    private onPointerUp = (): void => {
        if (this.props.editMode) {
            return;
        }
        const wasPressed = this.longTimer !== undefined;
        this.cancelLongPress();
        const i = this.captured;
        this.captured = null;
        this.setState({ zhPress: false });
        if (wasPressed && !this.longFired && i !== null) {
            this.tapCircuit(i);
        }
        this.longFired = false;
    };

    private onPointerLeave = (): void => {
        this.cancelLongPress();
        this.captured = null;
        if (this.state.zhPress) {
            this.setState({ zhPress: false });
        }
    };

    private onKeyDown = (e: React.KeyboardEvent): void => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            this.tapCircuit(this.state.zhShown);
        }
    };

    private tapCircuit(i: number): void {
        this.setSwitch(i, !this.on(i));
        // the picture stays 3 s and shows the new state, then the change goes on
        if (this.pauseTimer) {
            clearTimeout(this.pauseTimer);
        }
        this.setState({ zhShown: i, zhPause: true });
        this.scheduleChange(HOLD_AFTER_TAP_MS + CHANGE_MS);
        this.pauseTimer = setTimeout(() => this.setState({ zhPause: false }), HOLD_AFTER_TAP_MS);
    }

    private closePopup = (): void => this.setState({ zhPopup: false });

    // ---------------------------------------------------------------- render

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const now = new Date(this.state.zhNow);
        const levelClass = motionClass(d.animationStufe, d.nachtAus, now);
        const motion = motionAllowed(levelClass) && d.animation !== 'keine';
        const shown = this.state.zhShown;
        const ons = KREISE.map((_, i) => this.on(i));
        const onlines = KREISE.map((_, i) => this.online(i));
        const sunsets = sunsetWeek(now, this.state.zhLat, this.state.zhLon);
        const k = KREISE[shown];
        const lit = ons[shown];
        const offline = !onlines[shown];
        const name = d.label || 'Weihnacht';

        const layers = (
            <>
                {KREISE.map((c, i) => (
                    <span
                        key={c.key}
                        className={`zh-wn-layer${i === shown ? ' zh-wn-show' : ''}${ons[i] ? ' zh-wn-on' : ''}`}
                        style={{ color: ons[i] ? v('sw-on-fg') : undefined }}
                    >
                        <span style={{ display: 'flex', opacity: ons[i] ? 1 : 0.6 }}>
                            <KreisIcon
                                kreis={c.key}
                                on={ons[i]}
                            />
                        </span>
                        <span style={{ lineHeight: 1.1 }}>{c.short}</span>
                    </span>
                ))}
                {this.state.zhPending[shown] ? null : (
                    <span style={{ position: 'absolute', right: 6, top: 6, display: 'flex', gap: 2 }}>
                        {KREISE.filter((_, i) => ons[i]).map(c => (
                            <span
                                key={c.key}
                                className="zh-wn-badge"
                                style={{ display: 'flex', color: lit ? v('sw-on-fg') : v('sw-on') }}
                            >
                                <MiniIcon kreis={c.key} />
                            </span>
                        ))}
                    </span>
                )}
                <span
                    className={this.state.zhPause ? 'zh-wn-pause' : undefined}
                    style={{
                        position: 'absolute',
                        bottom: 6,
                        left: 0,
                        right: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 4,
                    }}
                >
                    {KREISE.map((c, i) => (
                        <span
                            key={c.key}
                            className={i === shown ? 'zh-wn-dot-a' : undefined}
                            style={{
                                width: 4,
                                height: 4,
                                borderRadius: '50%',
                                background: 'currentColor',
                                opacity: i === shown ? 0.9 : 0.3,
                                transform: i === shown ? 'scale(1.3)' : undefined,
                                transition: 'opacity .3s, transform .3s',
                            }}
                        />
                    ))}
                </span>
                {this.state.zhPress ? (
                    <span
                        className="zh-wn-press"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: v('radius-tile'),
                            border: `2px solid ${lit ? '#fff' : v('sw-on')}`,
                            pointerEvents: 'none',
                            animation: `zh-wn-press ${LONG_PRESS_MS}ms linear forwards`,
                        }}
                    />
                ) : null}
            </>
        );

        const kreise: WeihnachtKreis[] = KREISE.map((c, i) => {
            const plan = this.plan(i);
            return {
                key: c.key,
                name: c.name,
                on: ons[i],
                online: onlines[i],
                pending: this.state.zhPending[i],
                unconfirmed: this.state.zhUnconfirmed[i],
                plan,
                planPending: this.state.zhPlanPending[i],
                status: statusLine(
                    {
                        on: ons[i],
                        online: onlines[i],
                        hand: this.ack(this.dataId(i, 'hand')) === true,
                        handBis: Number(this.ack(this.dataId(i, 'handBis'))) || 0,
                        nachtTimer: this.ack(this.dataId(i, 'nachtTimer')) === true,
                        naechsterStart: Number(this.ack(this.dataId(i, 'naechsterStart'))) || 0,
                    },
                    plan,
                    now,
                    sunsets,
                ),
            };
        });

        return (
            <Scaled base={TILE_BASE}>
                {scale => (
                    <>
                        <Tile
                            look={offline ? 'warn' : lit ? 'switch-on' : 'switch-off'}
                            label=""
                            hideEmptyLabel
                            ariaLabel={`${name}: ${k.name} ${lit ? 'an' : 'aus'}`}
                            title={kreise[shown].status}
                            icon={<span style={{ width: 36, height: 32 }} />}
                            overlay={layers}
                            clickable={!this.props.editMode}
                            noReception={offline}
                            pending={this.state.zhPending[shown]}
                            unconfirmed={this.state.zhUnconfirmed[shown]}
                            levelClass={`${levelClass}${motion ? '' : ' zh-wn-still'}`}
                            scale={scale}
                            onPointerDown={this.onPointerDown}
                            onPointerUp={this.onPointerUp}
                            onPointerLeave={this.onPointerLeave}
                            onPointerCancel={this.onPointerLeave}
                            onKeyDown={this.props.editMode ? undefined : this.onKeyDown}
                        />
                        {this.state.zhPopup && !this.props.editMode ? (
                            <WeihnachtPopup
                                kreise={kreise}
                                sunsets={sunsets}
                                now={now}
                                motion={motion}
                                onSwitch={this.setSwitch}
                                onSave={this.savePlan}
                                onClose={this.closePopup}
                            />
                        ) : null}
                    </>
                )}
            </Scaled>
        );
    }
}
