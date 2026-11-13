/*
 * VIS-2 widget "Sternenhimmel": tile for a Tuya star projector (adapter ioBroker.tuya).
 * Short tap = lamp on/off (DP 20), long press = detail view (colour, laser, rotation).
 * Look (decided 13.11.2026): no green on the tile, because green means "status ok" everywhere else.
 * Laser on = dark tile with a white star field turning with the rotation; colour light on = glow in
 * the real colour; off = grey; not reachable = red. Shows only confirmed values (ack).
 * Self-contained on purpose: the lamp may go again, then this widget is removed without side effects.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { SternePopup } from '../components/SternePopup';
import { Scaled } from '../components/Scaled';
import { TILE_BASE, Tile } from '../components/Tile';
import { ACK_TIMEOUT_MS } from '../lib/model';
import {
    asIntensity,
    asRotation,
    colourData,
    DP,
    type Hsv,
    hsvToRgb,
    parseColour,
    spinSeconds,
    statusText,
} from '../lib/sterne';
import { ensureStyles, v } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const LONG_PRESS_MS = 500;
const SHOWN = [DP.power, DP.intensity, DP.colour, DP.rotation, DP.laser, DP.rgb, DP.online] as const;
const FALLBACK_COLOUR: Hsv = { h: 240, s: 1000, v: 1000 };
const STYLE_ID = 'zh-sterne-styles';
const FIELD = [
    [20, 30, 1],
    [70, 20, 1],
    [40, 70, 1.2],
    [85, 60, 1],
    [10, 80, 1],
    [55, 45, 1.4],
    [30, 10, 1],
    [75, 85, 1],
    [60, 15, 1],
    [15, 50, 1.2],
    [90, 35, 1],
    [45, 92, 1],
]
    .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, #fff 99%, transparent)`)
    .join(',');
const CSS = `
@keyframes zh-sterne-breathe{0%,100%{opacity:.42}50%{opacity:.7}}
.zh-sterne-glow{animation:zh-sterne-breathe 5s ease-in-out infinite}
.zh-sterne-field{animation:zh-spin 20s linear infinite}
.zh-sterne-orbit{transform-origin:17px 17px;animation:zh-spin 20s linear infinite}
.zh-sterne-still .zh-sterne-glow,.zh-sterne-still .zh-sterne-field,.zh-sterne-still .zh-sterne-orbit,
.zh-sterne-still .zh-a-twinkle{animation:none!important}
@media (prefers-reduced-motion:reduce){.zh-sterne-glow,.zh-sterne-field,.zh-sterne-orbit{animation:none!important}}
`;

function ensureSterneStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

interface SterneRxData {
    geraet: string;
    label: string;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface SterneState extends VisRxWidgetState {
    zhPending: boolean;
    zhUnconfirmed: boolean;
    zhPopup: boolean;
    zhNow: number;
}

const SPARKLES = [
    'M11 9 l.8 2 2 .8 -2 .8 -.8 2 -.8 -2 -2 -.8 2 -.8z',
    'M24 4 l.6 1.5 1.5 .6 -1.5 .6 -.6 1.5 -.6 -1.5 -1.5 -.6 1.5 -.6z',
    'M20 13 l.5 1.2 1.2 .5 -1.2 .5 -.5 1.2 -.5 -1.2 -1.2 -.5 1.2 -.5z',
];

function StarIcon({ laser, spin }: { laser: boolean; spin: number }): React.JSX.Element {
    return (
        <svg
            viewBox="0 0 34 30"
            width={34}
            height={30}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            style={{ overflow: 'visible' }}
        >
            <path d="M7 25 a10 10 0 0 1 20 0 z" />
            <path d="M5 25 h24 M10 28 h14" />
            {laser ? (
                <>
                    <g
                        className="zh-sterne-orbit"
                        style={{ animationDuration: `${spin}s` }}
                    >
                        <circle
                            cx={17}
                            cy={4}
                            r={0.9}
                            fill="currentColor"
                            stroke="none"
                        />
                        <circle
                            cx={29}
                            cy={11}
                            r={0.8}
                            fill="currentColor"
                            stroke="none"
                        />
                        <circle
                            cx={5}
                            cy={11}
                            r={0.8}
                            fill="currentColor"
                            stroke="none"
                        />
                    </g>
                    {SPARKLES.map((d, i) => (
                        <path
                            key={d}
                            d={d}
                            fill="currentColor"
                            stroke="none"
                            className={`zh-a-twinkle${i ? ` zh-d${i + 1}` : ''}`}
                            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                        />
                    ))}
                </>
            ) : null}
        </svg>
    );
}

export default class ZuhauseSterne extends (window.visRxWidget as typeof VisRxWidget)<SterneRxData, SterneState> {
    private watcher?: StateWatcher;
    /** last confirmed value per data point */
    private confirmed: Record<string, ioBroker.StateValue> = {};
    private longTimer?: ReturnType<typeof setTimeout>;
    private longFired = false;
    private ackTimer?: ReturnType<typeof setTimeout>;
    private wanted?: boolean;
    private clock?: ReturnType<typeof setInterval>;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhPending: false, zhUnconfirmed: false, zhPopup: false, zhNow: Date.now() };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseSterne',
            ...SET_INFO,
            visName: 'ZuhauseSterne',
            visWidgetLabel: 'sterne_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'geraet',
                            type: 'text',
                            label: 'sterne_device',
                            tooltip: 'sterne_device_tip',
                            default: '',
                        },
                        { name: 'label', type: 'text', label: 'sterne_name', default: 'Sterne' },
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
        return ZuhauseSterne.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        ensureSterneStyles();
        this.watcher = new StateWatcher(this.props.context.socket, this.onStates);
        this.watch();
        // night mode switches the animation off at 22 o'clock
        this.clock = setInterval(() => this.setState({ zhNow: Date.now() }), 60_000);
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

    private get device(): string {
        return (this.state.rxData.geraet || '').trim().replace(/\.$/, '');
    }

    private id(dp: string): string {
        return `${this.device}.${dp}`;
    }

    private watch(): void {
        if (this.device) {
            void this.watcher?.watch(SHOWN.map(dp => this.id(dp)));
        }
    }

    private onStates = (): void => {
        for (const dp of SHOWN) {
            const snapshot = this.watcher?.snapshot(this.id(dp));
            if (snapshot?.ack) {
                this.confirmed[dp] = snapshot.val;
            }
        }
        if (this.state.zhPending && this.confirmed[DP.power] === this.wanted) {
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

    private set(dp: string, value: ioBroker.StateValue): void {
        if (this.device && !this.props.editMode) {
            this.props.context.setValue(this.id(dp), value);
        }
    }

    private setPower = (on: boolean): void => {
        this.wanted = on;
        this.set(DP.power, on);
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

    private tap = (): void => {
        if (this.props.editMode || !this.device) {
            return;
        }
        this.setPower(this.confirmed[DP.power] !== true);
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

    // ---------------------------------------------------------------- render

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const c = this.confirmed;
        // the first answer is still missing: no warning yet
        const online = c[DP.online] !== false;
        const power = c[DP.power] === true;
        const laser = c[DP.laser] === true;
        const rgb = c[DP.rgb] === true;
        const intensity = asIntensity(c[DP.intensity]);
        const rotation = asRotation(c[DP.rotation]);
        const colour = parseColour(c[DP.colour]) ?? FALLBACK_COLOUR;
        const status = statusText({ online, power, laser, rgb });
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date(this.state.zhNow));
        const motion = motionAllowed(levelClass) && d.animation !== 'keine';
        const name = d.label || 'Sterne';
        const lit = online && power;
        const showLaser = lit && laser;
        const showRgb = lit && rgb;
        const spin = spinSeconds(rotation) * (levelClass === 'zh-dezent' ? 2 : 1);
        const [r, g, b] = hsvToRgb({ ...colour, v: 1000 });
        const glowAlpha = 0.35 + (0.65 * colour.v) / 1000;

        const surface: React.CSSProperties | undefined = lit
            ? {
                  background: showLaser ? '#17171b' : v('card'),
                  border: `1.5px solid ${showRgb ? `rgba(${r},${g},${b},.75)` : '#5c5c66'}`,
                  color: v('text'),
              }
            : undefined;

        const layers = lit ? (
            <>
                {showRgb ? (
                    <span
                        className="zh-sterne-glow"
                        style={{
                            position: 'absolute',
                            inset: '-20%',
                            pointerEvents: 'none',
                            background: `radial-gradient(circle at 50% 42%, rgba(${r},${g},${b},${glowAlpha}) 0%, transparent 62%)`,
                        }}
                    />
                ) : null}
                {showLaser ? (
                    <span
                        className="zh-sterne-field"
                        style={{
                            position: 'absolute',
                            inset: '-30%',
                            pointerEvents: 'none',
                            opacity: 0.6,
                            backgroundImage: FIELD,
                            animationDuration: `${spin}s`,
                        }}
                    />
                ) : null}
                {this.state.zhPending ? null : (
                    <span
                        style={{
                            position: 'absolute',
                            right: 7,
                            top: 7,
                            width: 16,
                            height: 9,
                            borderRadius: 5,
                            background: v('sw-on'),
                        }}
                    >
                        <span
                            style={{
                                position: 'absolute',
                                top: 1,
                                right: 1,
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: '#fff',
                            }}
                        />
                    </span>
                )}
            </>
        ) : null;

        return (
            <Scaled base={TILE_BASE}>
                {scale => (
                    <>
                        <Tile
                            look={online ? 'switch-off' : 'warn'}
                            surface={surface}
                            label={name}
                            ariaLabel={`${name}, ${status}`}
                            title={status}
                            icon={
                                <StarIcon
                                    laser={showLaser}
                                    spin={spin}
                                />
                            }
                            overlay={layers}
                            clickable={!this.props.editMode}
                            toggle={online && !lit}
                            noReception={!online}
                            pending={this.state.zhPending}
                            unconfirmed={this.state.zhUnconfirmed}
                            levelClass={`${levelClass}${motion ? '' : ' zh-sterne-still'}`}
                            scale={scale}
                            onPointerDown={this.onPointerDown}
                            onPointerUp={this.onPointerUp}
                            onPointerLeave={this.onPointerLeave}
                            onPointerCancel={this.onPointerLeave}
                            onKeyDown={this.props.editMode ? undefined : this.onKeyDown}
                        />
                        {this.state.zhPopup && !this.props.editMode ? (
                            <SternePopup
                                title={name === 'Sterne' ? 'Sternenhimmel' : name}
                                status={status}
                                online={online}
                                power={power}
                                laser={laser}
                                rgb={rgb}
                                intensity={intensity}
                                rotation={rotation}
                                colour={colour}
                                motion={motion}
                                onPower={this.setPower}
                                onLaser={on => this.set(DP.laser, on)}
                                onRgb={on => this.set(DP.rgb, on)}
                                onIntensity={value => this.set(DP.intensity, value)}
                                onRotation={value => this.set(DP.rotation, value)}
                                onColour={hsv => this.set(DP.colour, colourData(hsv))}
                                onClose={this.closePopup}
                            />
                        ) : null}
                    </>
                )}
            </Scaled>
        );
    }
}
