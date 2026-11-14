/*
 * VIS-2 widget "ioBroker-Status": tile + popup for the watcher script script.js.vis2.iobroker-waechter
 * (spec Claude-Specs/iobroker-status.md). The widget only reads; the watcher decides and repairs.
 * Look (decided 14.11.2026): green = all running (pulse line), number top right = available updates
 * (updates never colour the tile), yellow = restart running / repaired and not seen yet,
 * red = repair failed, dashed grey = the watcher has not reported for 10 minutes.
 * Opening the popup writes <base>.gesehen = true: the watcher acknowledges repairs, the tile turns green.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { Scaled } from '../components/Scaled';
import { SystemPopup } from '../components/SystemPopup';
import { TILE_BASE, Tile } from '../components/Tile';
import { DEFAULT_BASE, parseHost, parseListe, STILL_MS, SYS, type TileArt, tileView } from '../lib/system';
import { ensureStyles, fonts, v } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const STYLE_ID = 'zh-system-styles';
const YELLOW = '#f2c14e';
const CSS = `
@keyframes zh-system-puls{0%{stroke-dashoffset:60}60%{stroke-dashoffset:0}100%{stroke-dashoffset:-60}}
@keyframes zh-system-breathe{0%,100%{opacity:.38}50%{opacity:.68}}
.zh-system-puls{stroke-dasharray:60;stroke-dashoffset:60;animation:zh-system-puls 2.6s linear infinite}
.zh-system-puls.zh-system-schnell{animation-duration:1s}
.zh-system-glow{animation:zh-system-breathe 5s ease-in-out infinite}
.zh-system-still .zh-system-puls{animation:none;stroke-dashoffset:0}
.zh-system-still .zh-system-glow{animation:none}
@media (prefers-reduced-motion:reduce){.zh-system-puls{animation:none;stroke-dashoffset:0}.zh-system-glow{animation:none}}
`;

function ensureSystemStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

interface SystemRxData {
    basis: string;
    label: string;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface SystemState extends VisRxWidgetState {
    zhPopup: boolean;
    zhNow: number;
}

const SURFACE: Record<TileArt, React.CSSProperties> = {
    ok: { background: v('card'), border: `1.5px solid ${v('st-on-bd')}`, color: v('text') },
    gelb: { background: v('card'), border: `1.5px solid ${YELLOW}`, color: v('text') },
    rot: { background: v('warn-bg'), border: `1.5px solid ${v('warn-bd')}`, color: v('warn-fg') },
    steht: { background: v('sw-off-bg'), border: '1.5px dashed #6b6b72', color: v('sw-off-fg') },
    leer: { background: v('sw-off-bg'), border: `1px solid ${v('sw-off-bd')}`, color: v('sw-off-fg') },
};

const GLOW: Partial<Record<TileArt, string>> = {
    ok: 'rgba(111,224,138,.45)',
    gelb: 'rgba(242,193,78,.45)',
    rot: 'rgba(229,72,77,.5)',
};

function PulsIcon({ flat, fast }: { flat: boolean; fast: boolean }): React.JSX.Element {
    return (
        <svg
            viewBox="0 0 40 26"
            width={36}
            height={23}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            style={{ overflow: 'visible' }}
        >
            <rect
                x={1}
                y={1}
                width={38}
                height={24}
                rx={5}
                opacity={0.45}
            />
            {flat ? (
                <path d="M5 14 h30" />
            ) : (
                <>
                    <path
                        d="M5 14 h30"
                        opacity={0.18}
                    />
                    <path
                        className={`zh-system-puls${fast ? ' zh-system-schnell' : ''}`}
                        d="M5 14 h8 l3 -7 l4 13 l3 -9 l2 3 h10"
                    />
                </>
            )}
        </svg>
    );
}

export default class ZuhauseSystem extends (window.visRxWidget as typeof VisRxWidget)<SystemRxData, SystemState> {
    private watcher?: StateWatcher;
    private clock?: ReturnType<typeof setInterval>;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhPopup: false, zhNow: Date.now() };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseSystem',
            ...SET_INFO,
            visName: 'ZuhauseSystem',
            visWidgetLabel: 'system_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'basis',
                            type: 'text',
                            label: 'system_base',
                            tooltip: 'system_base_tip',
                            default: DEFAULT_BASE,
                        },
                        { name: 'label', type: 'text', label: 'system_name', default: 'System' },
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
        return ZuhauseSystem.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        ensureSystemStyles();
        this.watcher = new StateWatcher(this.props.context.socket, this.onStates);
        this.watch();
        // "Wächter steht" needs a clock: no new value arrives when the watcher stopped
        this.clock = setInterval(() => this.setState({ zhNow: Date.now() }), 30_000);
    }

    onRxDataChanged(): void {
        this.watch();
    }

    componentWillUnmount(): void {
        if (this.clock) {
            clearInterval(this.clock);
        }
        this.watcher?.stop();
        super.componentWillUnmount();
    }

    private get base(): string {
        return (this.state.rxData.basis || DEFAULT_BASE).trim().replace(/\.$/, '');
    }

    private id(name: string): string {
        return `${this.base}.${name}`;
    }

    private watch(): void {
        void this.watcher?.watch(
            [
                SYS.ampel,
                SYS.kurztext,
                SYS.updates,
                SYS.instanzen,
                SYS.host,
                SYS.letztePruefung,
                SYS.letzterEingriff,
            ].map(n => this.id(n)),
        );
    }

    private onStates = (): void => this.setState({ zhNow: Date.now() });

    private val(name: string): unknown {
        return this.watcher?.snapshot(this.id(name))?.val;
    }

    private open = (): void => {
        if (this.props.editMode) {
            return;
        }
        this.setState({ zhPopup: true, zhNow: Date.now() });
        // the watcher acknowledges repairs → tile turns green on all tablets
        this.props.context.setValue(this.id(SYS.gesehen), true);
    };

    private onKeyDown = (e: React.KeyboardEvent): void => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            this.open();
        }
    };

    private close = (): void => this.setState({ zhPopup: false });

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const now = this.state.zhNow;
        const liste = parseListe(this.val(SYS.instanzen));
        const lastRaw = this.val(SYS.letztePruefung);
        const last = typeof lastRaw === 'number' ? lastRaw : null;
        const eingriffRaw = this.val(SYS.letzterEingriff);
        const eingriff = typeof eingriffRaw === 'string' ? eingriffRaw : '';
        const view = tileView({
            ampel: this.val(SYS.ampel),
            kurztext: this.val(SYS.kurztext),
            updates: this.val(SYS.updates),
            letztePruefung: last,
            liste,
            now,
        });
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date(now));
        const motion = motionAllowed(levelClass) && d.animation !== 'keine';
        const name = d.label || 'System';
        const glow = GLOW[view.art];
        const status = `${view.text}${view.updates ? `, ${view.updates} Updates` : ''}`;

        const overlay = (
            <>
                {glow ? (
                    <span
                        className="zh-system-glow"
                        style={{
                            position: 'absolute',
                            inset: '-20%',
                            pointerEvents: 'none',
                            background: `radial-gradient(circle at 50% 40%, ${glow} 0%, transparent 62%)`,
                            animationDuration: view.art === 'rot' ? '1.6s' : undefined,
                        }}
                    />
                ) : null}
                {view.updates ? (
                    <span
                        title={`${view.updates} Updates verfügbar`}
                        style={{
                            position: 'absolute',
                            right: 4,
                            top: 4,
                            minWidth: 17,
                            height: 17,
                            padding: '0 4px',
                            boxSizing: 'border-box',
                            borderRadius: 9,
                            background: v('sw-off-bg'),
                            border: `1px solid ${v('sw-off-bd')}`,
                            color: v('text'),
                            font: `700 10.5px/15px ${fonts.text}`,
                            textAlign: 'center',
                        }}
                    >
                        <span style={{ color: YELLOW, marginRight: 1 }}>↑</span>
                        {view.updates}
                    </span>
                ) : null}
                {view.art === 'gelb' ? (
                    <svg
                        viewBox="0 0 24 24"
                        width={14}
                        height={14}
                        fill="none"
                        stroke={YELLOW}
                        strokeWidth={2.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                        style={{ position: 'absolute', left: 7, top: 7 }}
                    >
                        {view.arbeit ? (
                            <path
                                className="zh-a-spin-fast"
                                d="M12 3a9 9 0 1 0 9 9"
                            />
                        ) : (
                            <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
                        )}
                    </svg>
                ) : null}
                <span
                    style={{
                        position: 'absolute',
                        left: 4,
                        right: 4,
                        bottom: 8,
                        textAlign: 'center',
                        font: `500 10.5px ${fonts.text}`,
                        color: view.art === 'rot' ? v('warn-fg') : v('text-2'),
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {view.text}
                </span>
            </>
        );

        return (
            <Scaled base={TILE_BASE}>
                {scale => (
                    <>
                        <Tile
                            look="switch-off"
                            surface={{ ...SURFACE[view.art], paddingBottom: 14, gap: 3 }}
                            label={name}
                            ariaLabel={`${name}, ${status}`}
                            title={status}
                            icon={
                                <PulsIcon
                                    flat={view.art === 'steht' || view.art === 'leer'}
                                    fast={view.art === 'rot'}
                                />
                            }
                            overlay={overlay}
                            clickable={!this.props.editMode}
                            levelClass={`${levelClass}${motion ? '' : ' zh-system-still'}`}
                            scale={scale}
                            onPointerUp={this.props.editMode ? undefined : this.open}
                            onKeyDown={this.props.editMode ? undefined : this.onKeyDown}
                        />
                        {this.state.zhPopup && !this.props.editMode ? (
                            <SystemPopup
                                liste={liste}
                                host={parseHost(this.val(SYS.host))}
                                letztePruefung={last}
                                letzterEingriff={eingriff}
                                steht={last !== null && now - last > STILL_MS}
                                now={now}
                                onClose={this.close}
                            />
                        ) : null}
                    </>
                )}
            </Scaled>
        );
    }
}
