/*
 * VIS-2 widget "Dunstabzug": tile for the adapter falmec.
 * Short tap = preset.toggle (the adapter decides between preset and off), long press = popup.
 * Shows only confirmed values (ack), so the tile changes after the signal has been accepted.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { HaubePopup } from '../components/ControlPopups';
import { Scaled } from '../components/Scaled';
import { TILE_BASE, Tile } from '../components/Tile';
import {
    asLevel,
    CANOPY_PATH,
    type HaubePreset,
    type PresetWrite,
    ringOffset,
    ROTOR_CENTRE,
    ROTOR_TURN_S,
    rotorPath,
    statusText,
    timerText,
} from '../lib/haube';
import { ACK_TIMEOUT_MS } from '../lib/model';
import { fonts, ensureStyles, v } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const LONG_PRESS_MS = 500;
const DEFAULT_INSTANCE = 'falmec.0';
const TOGGLE = 'preset.toggle';
const SHOWN = [
    'fan.level',
    'light.on',
    'info.connection',
    'timer.active',
    'timer.end',
    'timer.total',
    'preset.level',
    'preset.light',
    'preset.timer',
] as const;
const ROTOR = rotorPath(ROTOR_CENTRE.x, ROTOR_CENTRE.y, ROTOR_CENTRE.r);

interface HaubeRxData {
    instanz: string;
    label: string;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface HaubeState extends VisRxWidgetState {
    zhPending: boolean;
    zhUnconfirmed: boolean;
    zhPopup: boolean;
    /** clock for the timer and the night mode */
    zhNow: number;
}

function HoodIcon({ level, animate }: { level: number; animate: boolean }): React.JSX.Element {
    const { x, y } = ROTOR_CENTRE;
    return (
        <span style={{ position: 'relative', display: 'flex', justifyContent: 'center', width: TILE_BASE - 3 }}>
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
            >
                <path d={CANOPY_PATH} />
                <g
                    className={animate && level > 0 ? 'zh-a-rotor' : undefined}
                    style={{
                        transformOrigin: `${x}px ${y}px`,
                        animationDuration: animate && level > 0 ? `${ROTOR_TURN_S[level]}s` : undefined,
                    }}
                >
                    <path d={ROTOR} />
                </g>
            </svg>
            {level > 0 ? (
                <span
                    style={{
                        position: 'absolute',
                        left: 61,
                        bottom: 0,
                        fontFamily: fonts.text,
                        fontSize: 20,
                        lineHeight: '24px',
                        fontWeight: 600,
                    }}
                >
                    {level}
                </span>
            ) : null}
        </span>
    );
}

function TimerRing({ offset }: { offset: number }): React.JSX.Element {
    const rect = { x: 1.5, y: 1.5, width: 85, height: 85, rx: 13 };
    return (
        <svg
            viewBox="0 0 88 88"
            aria-hidden
            style={{
                position: 'absolute',
                left: -1.5,
                top: -1.5,
                width: TILE_BASE,
                height: TILE_BASE,
                fill: 'none',
                pointerEvents: 'none',
            }}
        >
            <rect
                {...rect}
                stroke="#2c5a3b"
                strokeWidth={3}
            />
            <rect
                {...rect}
                stroke={v('st-led')}
                strokeWidth={3}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={offset}
            />
        </svg>
    );
}

export default class ZuhauseHaube extends (window.visRxWidget as typeof VisRxWidget)<HaubeRxData, HaubeState> {
    private watcher?: StateWatcher;
    /** last confirmed value per state; commands without ack are not shown */
    private confirmed: Record<string, ioBroker.StateValue> = {};
    private longTimer?: ReturnType<typeof setTimeout>;
    private longFired = false;
    private ackTimer?: ReturnType<typeof setTimeout>;
    private clock?: ReturnType<typeof setInterval>;
    private clockMs = 0;
    private sentTs = 0;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhPending: false, zhUnconfirmed: false, zhPopup: false, zhNow: Date.now() };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseHaube',
            ...SET_INFO,
            visName: 'ZuhauseHaube',
            visWidgetLabel: 'haube_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'instanz',
                            type: 'text',
                            label: 'haube_instance',
                            tooltip: 'haube_instance_tip',
                            default: DEFAULT_INSTANCE,
                        },
                        { name: 'label', type: 'text', label: 'haube_name', default: 'Haube' },
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
        return ZuhauseHaube.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        this.watcher = new StateWatcher(this.props.context.socket, this.onStates);
        this.watch();
        this.startClock(60_000);
    }

    onRxDataChanged(): void {
        this.confirmed = {};
        this.watch();
    }

    componentWillUnmount(): void {
        this.cancelLongPress();
        if (this.ackTimer) {
            clearTimeout(this.ackTimer);
        }
        if (this.clock) {
            clearInterval(this.clock);
        }
        this.watcher?.stop();
        super.componentWillUnmount();
    }

    private get base(): string {
        return this.state.rxData.instanz || DEFAULT_INSTANCE;
    }

    private id(state: string): string {
        return `${this.base}.${state}`;
    }

    private watch(): void {
        void this.watcher?.watch([...SHOWN, TOGGLE].map(state => this.id(state)));
    }

    private startClock(ms: number): void {
        if (this.clock) {
            clearInterval(this.clock);
        }
        this.clockMs = ms;
        this.clock = setInterval(() => this.setState({ zhNow: Date.now() }), ms);
    }

    private onStates = (): void => {
        for (const state of SHOWN) {
            const snapshot = this.watcher?.snapshot(this.id(state));
            if (snapshot?.ack) {
                this.confirmed[state] = snapshot.val;
            }
        }
        // the running timer shows seconds in its last minute
        const wanted = this.confirmed['timer.active'] === true ? 1000 : 60_000;
        if (wanted !== this.clockMs) {
            this.startClock(wanted);
        }
        const toggle = this.watcher?.snapshot(this.id(TOGGLE));
        if (this.state.zhPending && toggle?.ack && toggle.ts !== this.sentTs) {
            if (this.ackTimer) {
                clearTimeout(this.ackTimer);
                this.ackTimer = undefined;
            }
            this.setState({ zhPending: false, zhUnconfirmed: false, zhNow: Date.now() });
        } else {
            this.setState({ zhNow: Date.now() });
        }
    };

    // ---------------------------------------------------------------- actions

    private set(state: string, value: ioBroker.StateValue): void {
        this.props.context.setValue(this.id(state), value);
    }

    private tap = (): void => {
        if (this.props.editMode) {
            return;
        }
        this.sentTs = this.watcher?.snapshot(this.id(TOGGLE))?.ts ?? 0;
        this.set(TOGGLE, true);
        if (this.ackTimer) {
            clearTimeout(this.ackTimer);
        }
        this.setState({ zhPending: true, zhUnconfirmed: false });
        this.ackTimer = setTimeout(() => {
            this.ackTimer = undefined;
            if (this.state.zhPending) {
                this.setState({ zhPending: false, zhUnconfirmed: true });
            }
        }, ACK_TIMEOUT_MS);
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
        this.longFired = false;
        this.cancelLongPress();
        this.longTimer = setTimeout(() => {
            this.longTimer = undefined;
            this.longFired = true;
            this.setState({ zhPopup: true });
        }, LONG_PRESS_MS);
    };

    private onPointerUp = (): void => {
        if (this.props.editMode) {
            return;
        }
        const wasPressed = this.longTimer !== undefined;
        this.cancelLongPress();
        if (wasPressed && !this.longFired) {
            this.tap();
        }
        this.longFired = false;
    };

    private onPointerLeave = (): void => this.cancelLongPress();

    private onKeyDown = (e: React.KeyboardEvent): void => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            this.tap();
        }
    };

    private closePopup = (): void => this.setState({ zhPopup: false });

    private writePreset = (writes: PresetWrite[]): void => {
        for (const write of writes) {
            this.set(`preset.${write.key}`, write.value);
        }
    };

    private startTimer = (minutes: number): void => {
        this.set('timer.minutes', minutes);
        this.set('timer.start', true);
    };

    // ---------------------------------------------------------------- render

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const c = this.confirmed;
        const level = asLevel(c['fan.level']);
        const light = c['light.on'] === true;
        // the first answer is still missing: no warning yet
        const connected = c['info.connection'] !== false;
        const on = level > 0 || light;
        const total = typeof c['timer.total'] === 'number' ? c['timer.total'] : 0;
        const end = typeof c['timer.end'] === 'number' ? c['timer.end'] : 0;
        const timerActive = c['timer.active'] === true && end > 0;
        const remaining = timerActive ? Math.max(0, end - this.state.zhNow) : undefined;
        const status = statusText({ level, light, connected, remainingMs: remaining });
        const preset: HaubePreset = {
            level: asLevel(c['preset.level']),
            light: c['preset.light'] === true,
            timer: typeof c['preset.timer'] === 'number' ? c['preset.timer'] : 0,
        };
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date(this.state.zhNow));
        const motion = motionAllowed(levelClass) && d.animation !== 'keine';
        const name = d.label || 'Haube';

        return (
            <Scaled base={TILE_BASE}>
                {scale => (
                    <>
                        <Tile
                            look={on ? 'status-on' : 'status-off'}
                            label={remaining !== undefined ? timerText(remaining) : ''}
                            hideEmptyLabel
                            ariaLabel={`${name}, ${status}`}
                            title={status}
                            icon={
                                <HoodIcon
                                    level={level}
                                    animate={motion}
                                />
                            }
                            overlay={
                                remaining !== undefined ? <TimerRing offset={ringOffset(remaining, total)} /> : null
                            }
                            clickable={!this.props.editMode}
                            led={on}
                            dots={light ? [v('light')] : []}
                            noReception={!connected}
                            pending={this.state.zhPending}
                            unconfirmed={this.state.zhUnconfirmed}
                            levelClass={levelClass}
                            scale={scale}
                            onPointerDown={this.onPointerDown}
                            onPointerUp={this.onPointerUp}
                            onPointerLeave={this.onPointerLeave}
                            onPointerCancel={this.onPointerLeave}
                            onKeyDown={this.props.editMode ? undefined : this.onKeyDown}
                        />
                        {this.state.zhPopup && !this.props.editMode ? (
                            <HaubePopup
                                title={name}
                                status={status}
                                connected={connected}
                                level={level}
                                light={light}
                                timerActive={timerActive}
                                timerTotal={total}
                                timerText={remaining !== undefined ? timerText(remaining) : ''}
                                preset={preset}
                                onLevel={n => this.set('fan.level', n)}
                                onLight={value => this.set('light.on', value)}
                                onTimer={this.startTimer}
                                onTimerStop={() => this.set('timer.stop', true)}
                                onPreset={this.writePreset}
                                onClose={this.closePopup}
                            />
                        ) : null}
                    </>
                )}
            </Scaled>
        );
    }
}
