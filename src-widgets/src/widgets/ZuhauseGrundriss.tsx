/*
 * VIS-2 widget "Grundriss" (hand-over 11): floor plan SVG with device pins, light glow per zone
 * ("Raum leuchtet"), daylight of open blinds and red tint of open windows / alarms.
 *
 * Devices come as JSON list with positions in the units of the SVG viewBox, so the coordinates of the
 * drafts can be taken over. Pins and glow scale with the plan. Taps: lights/sockets toggle, blinds
 * open/close, the garage gate opens/closes, sensors only show; long press opens brightness or height.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { DimmerPopup, RolloPopup } from '../components/ControlPopups';
import { Pin } from '../components/Pin';
import { ACK_TIMEOUT_MS } from '../lib/model';
import {
    blindPosition,
    blindWrite,
    deviceGlow,
    deviceOids,
    deviceOn,
    diagnosis,
    dimLevel,
    longPressPopup,
    parseDevices,
    parseZones,
    pinState,
    pointsBox,
    roomName,
    tapAction,
    zoneOf,
    type Glow,
    type PlanDevice,
} from '../lib/plan';
import { loadPlan, resolveImage, type PlanSvg } from '../lib/svg';
import { ensureStyles, fonts, v } from '../lib/theme';
import { PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const LONG_PRESS_MS = 500;
/** pins are drawn for a plan of this width (drafts: 884 px) and scale with the real width */
const PIN_BASE_WIDTH = 884;
/** free space around the plan for the pins on the outer walls */
const PLAN_MARGIN = 22;

interface GrundrissRxData {
    svg: string;
    geraete: string;
    zonen: string;
    raumnamen: boolean;
    pinGroesse: number;
    titel: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface GrundrissState extends VisRxWidgetState {
    zhPlan: PlanSvg | null;
    zhPlanError: string;
    zhTick: number;
    zhBox: { w: number; h: number };
    /** pending commands: data point -> timestamp of the value before the command */
    zhPending: Record<string, number>;
    zhUnconfirmed: Record<string, boolean>;
    /** index of the device whose popup is open */
    zhPopup: number;
}

export default class ZuhauseGrundriss extends (window.visRxWidget as typeof VisRxWidget)<
    GrundrissRxData,
    GrundrissState
> {
    private watcher?: StateWatcher;
    private box = React.createRef<HTMLDivElement>();
    private zhResize?: ResizeObserver;
    private longTimer?: ReturnType<typeof setTimeout>;
    private longFired = false;
    private ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private planUrl = '';

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            zhPlan: null,
            zhPlanError: '',
            zhTick: 0,
            zhBox: { w: 0, h: 0 },
            zhPending: {},
            zhUnconfirmed: {},
            zhPopup: -1,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseGrundriss',
            ...SET_INFO,
            visName: 'ZuhauseGrundriss',
            visWidgetLabel: 'grundriss_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'titel', type: 'text', label: 'plan_title', tooltip: 'plan_title_tip' },
                        { name: 'svg', type: 'image', label: 'plan_svg', tooltip: 'plan_svg_tip' },
                        { name: 'geraete', type: 'json', label: 'devices_json', tooltip: 'devices_json_tip' },
                        { name: 'zonen', type: 'json', label: 'zones_json', tooltip: 'zones_json_tip' },
                        { name: 'raumnamen', type: 'checkbox', label: 'room_names', default: true },
                        { name: 'pinGroesse', type: 'number', label: 'pin_size', tooltip: 'pin_size_tip', default: 1 },
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
            visDefaultStyle: { width: 884, height: 730 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-grundriss.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseGrundriss.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        this.watcher = new StateWatcher(this.props.context.socket, this.onValues);
        this.sync();
        if (this.box.current && typeof ResizeObserver !== 'undefined') {
            this.zhResize = new ResizeObserver(() => this.measure());
            this.zhResize.observe(this.box.current);
        }
        this.measure();
    }

    componentWillUnmount(): void {
        this.watcher?.stop();
        this.zhResize?.disconnect();
        this.ackTimers.forEach(t => clearTimeout(t));
        if (this.longTimer) {
            clearTimeout(this.longTimer);
        }
        super.componentWillUnmount();
    }

    onRxDataChanged(): void {
        this.sync();
    }

    private measure(): void {
        const el = this.box.current;
        if (el && (el.clientWidth !== this.state.zhBox.w || el.clientHeight !== this.state.zhBox.h)) {
            this.setState({ zhBox: { w: el.clientWidth, h: el.clientHeight } });
        }
    }

    private devices(): PlanDevice[] {
        return parseDevices(this.state.rxData.geraete).devices;
    }

    /** Loads the plan and subscribes the data points of the device list */
    private sync(): void {
        void this.watcher?.watch(this.devices().flatMap(deviceOids));
        const path = this.state.rxData.svg;
        const url = path ? resolveImage(path, this.props.context.projectName) : '';
        if (url === this.planUrl) {
            return;
        }
        this.planUrl = url;
        if (!url) {
            this.setState({ zhPlan: null, zhPlanError: '' });
            return;
        }
        loadPlan(url)
            .then(plan => this.planUrl === url && this.setState({ zhPlan: plan, zhPlanError: '' }))
            .catch((e: Error) => this.planUrl === url && this.setState({ zhPlan: null, zhPlanError: e.message }));
    }

    private onValues = (): void => {
        // confirm pending commands: a newer value with ack=true arrived
        const pending = { ...this.state.zhPending };
        let changed = false;
        for (const [id, ts] of Object.entries(pending)) {
            const s = this.watcher?.snapshot(id);
            if (s?.ack && s.ts !== ts) {
                delete pending[id];
                this.clearAck(id);
                changed = true;
            }
        }
        if (changed) {
            this.setState({ zhPending: pending, zhTick: this.state.zhTick + 1 });
        } else {
            this.setState({ zhTick: this.state.zhTick + 1 });
        }
    };

    private clearAck(id: string): void {
        const t = this.ackTimers.get(id);
        if (t) {
            clearTimeout(t);
            this.ackTimers.delete(id);
        }
    }

    private write(id: string, value: boolean | number): void {
        if (this.props.editMode || !id) {
            return;
        }
        this.props.context.setValue(id, value);
        const ts = this.watcher?.snapshot(id)?.ts ?? 0;
        this.setState(s => ({
            zhPending: { ...s.zhPending, [id]: ts },
            zhUnconfirmed: { ...s.zhUnconfirmed, [id]: false },
        }));
        this.clearAck(id);
        this.ackTimers.set(
            id,
            setTimeout(() => {
                this.ackTimers.delete(id);
                if (id in this.state.zhPending) {
                    const zhPending = { ...this.state.zhPending };
                    delete zhPending[id];
                    this.setState(s => ({ zhPending, zhUnconfirmed: { ...s.zhUnconfirmed, [id]: true } }));
                }
            }, ACK_TIMEOUT_MS),
        );
    }

    private tap(d: PlanDevice): void {
        const a = tapAction(d, this.watcher?.val ?? (() => undefined));
        if (a.kind === 'write') {
            this.write(a.oid, a.value);
        }
    }

    // ---------------------------------------------------------------- render

    private renderGlow(plan: PlanSvg, devices: PlanDevice[], motion: boolean): React.JSX.Element | null {
        const val = this.watcher?.val ?? ((): unknown => undefined);
        const zones = parseZones(this.state.rxData.zonen);
        const byZone = new Map<string, Glow[]>();
        for (const d of devices) {
            const g = deviceGlow(d, val, plan.viewBox.w);
            if (g) {
                const z = zoneOf(d.raum, zones);
                byZone.set(z, [...(byZone.get(z) || []), g]);
            }
        }
        if (!byZone.size) {
            return null;
        }
        const wid = String(this.props.id);
        const roomsOf = (zone: string): string[] => zones.find(z => z.id === zone)?.raeume || [zone];
        return (
            <g className={motion ? 'zh-a-breathe' : undefined}>
                <defs>
                    {[...byZone.entries()].map(([zone, glows]) => (
                        <React.Fragment key={zone}>
                            <clipPath id={`${wid}-z-${zone}`}>
                                {plan.rooms
                                    .filter(r => roomsOf(zone).includes(r.id))
                                    .map(r => (
                                        <polygon
                                            key={r.id}
                                            points={r.points}
                                        />
                                    ))}
                            </clipPath>
                            {glows.map((g, i) => (
                                <radialGradient
                                    key={i}
                                    id={`${wid}-g-${zone}-${i}`}
                                    gradientUnits="userSpaceOnUse"
                                    cx={g.x}
                                    cy={g.y}
                                    r={g.r}
                                >
                                    {g.stops.map(([offset, alpha], j) => (
                                        <stop
                                            key={j}
                                            offset={Math.min(1, offset)}
                                            stopColor={`rgb(${g.rgb})`}
                                            stopOpacity={alpha}
                                        />
                                    ))}
                                </radialGradient>
                            ))}
                        </React.Fragment>
                    ))}
                </defs>
                {[...byZone.entries()].map(([zone, glows]) => {
                    // a room unknown to the SVG gets no clip (the glow is not cut)
                    const clipped = plan.rooms.some(r => roomsOf(zone).includes(r.id));
                    return (
                        <g
                            key={zone}
                            clipPath={clipped ? `url(#${wid}-z-${zone})` : undefined}
                        >
                            {glows.map((g, i) => (
                                <circle
                                    key={i}
                                    cx={g.x}
                                    cy={g.y}
                                    r={g.r}
                                    fill={`url(#${wid}-g-${zone}-${i})`}
                                />
                            ))}
                        </g>
                    );
                })}
            </g>
        );
    }

    private static renderLabels(plan: PlanSvg): React.JSX.Element {
        const size = (11 / PIN_BASE_WIDTH) * plan.viewBox.w;
        return (
            <g
                fill="#77756f"
                fontFamily={fonts.text}
                fontSize={size}
                fontWeight={600}
                letterSpacing="0.08em"
                textAnchor="middle"
                style={{ pointerEvents: 'none' }}
            >
                {plan.rooms.map(r => {
                    const b = pointsBox(r.points);
                    return (
                        <text
                            key={r.id}
                            x={b.x + b.w / 2}
                            y={b.y + size * 2.6}
                        >
                            {(r.name || r.id).toUpperCase()}
                        </text>
                    );
                })}
            </g>
        );
    }

    private renderPopup(devices: PlanDevice[], plan: PlanSvg | null): React.JSX.Element | null {
        const d = devices[this.state.zhPopup];
        if (!d || this.props.editMode) {
            return null;
        }
        const val = this.watcher?.val ?? ((): unknown => undefined);
        const title = d.name || roomName(d.raum, plan?.rooms || []);
        const close = (): void => this.setState({ zhPopup: -1 });
        if (longPressPopup(d) === 'dimmer' && d.oidHelligkeit) {
            const level = d.oidHelligkeit;
            return (
                <DimmerPopup
                    title={title}
                    level={dimLevel(d, val)}
                    onLevel={n => {
                        this.write(level, n);
                        if (d.oid && !deviceOn(d, val)) {
                            this.write(d.oidSchreiben || d.oid, true);
                        }
                    }}
                    onOff={() =>
                        d.oid || d.oidSchreiben ? this.write(d.oidSchreiben || d.oid, false) : this.write(level, 0)
                    }
                    onClose={close}
                />
            );
        }
        if (longPressPopup(d) === 'rollo') {
            return (
                <RolloPopup
                    title={title}
                    position={blindPosition(d, val)}
                    onPosition={pos => {
                        const w = blindWrite(d, pos);
                        if (w) {
                            this.write(w.oid, w.value);
                        }
                    }}
                    onClose={close}
                />
            );
        }
        return null;
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const plan = this.state.zhPlan;
        const { devices, errors } = parseDevices(d.geraete);
        const val = this.watcher?.val ?? ((): unknown => undefined);
        const lang = ZuhauseGrundriss.getLanguage();
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date());
        const motion = motionAllowed(levelClass);

        // drawn area of the plan inside the widget (contain, centred)
        const { w, h } = this.state.zhBox;
        const vb = plan?.viewBox;
        // margin, so pins on the outer walls (x = 0) are not cut off
        const m = PLAN_MARGIN;
        const s = vb && w > 2 * m && h > 2 * m ? Math.min((w - 2 * m) / vb.w, (h - 2 * m) / vb.h) : 0;
        const ox = vb ? (w - vb.w * s) / 2 : 0;
        const oy = vb ? (h - vb.h * s) / 2 : 0;
        const pinScale = vb
            ? Math.max(0.55, Math.min(1.8, ((vb.w * s) / PIN_BASE_WIDTH) * (Number(d.pinGroesse) || 1)))
            : 1;

        let hint = '';
        if (!d.svg) {
            hint = ZuhauseGrundriss.t('plan_no_svg');
        } else if (this.state.zhPlanError) {
            hint = `${ZuhauseGrundriss.t('plan_load_error')}: ${this.state.zhPlanError}`;
        } else if (errors.length && this.props.editMode) {
            hint = errors.slice(0, 3).join(' · ');
        }

        return (
            <div
                ref={this.box}
                className={levelClass}
                role="group"
                aria-label={d.titel || 'Grundriss'}
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    borderRadius: v('radius-card'),
                    background: '#1d1d20',
                    border: '1px solid #2f2f34',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    fontFamily: fonts.text,
                }}
            >
                {plan && vb && s > 0 ? (
                    <>
                        <img
                            src={plan.url}
                            alt=""
                            draggable={false}
                            style={{
                                position: 'absolute',
                                left: ox,
                                top: oy,
                                width: vb.w * s,
                                height: vb.h * s,
                                pointerEvents: 'none',
                            }}
                        />
                        <svg
                            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                            style={{
                                position: 'absolute',
                                left: ox,
                                top: oy,
                                width: vb.w * s,
                                height: vb.h * s,
                                pointerEvents: 'none',
                            }}
                            aria-hidden
                        >
                            {this.renderGlow(plan, devices, motion)}
                            {d.raumnamen !== false && !plan.hasText ? ZuhauseGrundriss.renderLabels(plan) : null}
                        </svg>
                        {devices.map((dev, i) => {
                            const st = pinState(dev, val, lang);
                            const diag = diagnosis(dev, val);
                            const action = tapAction(dev, val);
                            const popup = longPressPopup(dev);
                            const clickable = !this.props.editMode && (action.kind !== 'none' || !!popup);
                            const name = dev.name || roomName(dev.raum, plan.rooms);
                            const ids = deviceOids(dev);
                            const pendingIds = ids.filter(id => id in this.state.zhPending);
                            return (
                                <Pin
                                    key={i}
                                    typ={dev.typ}
                                    state={st}
                                    on={deviceOn(dev, val)}
                                    ownIcon={dev.icon}
                                    left={ox + (dev.x - vb.x) * s}
                                    top={oy + (dev.y - vb.y) * s}
                                    scale={pinScale}
                                    ariaLabel={`${name}${st.label ? ` ${st.label}` : ''}`}
                                    clickable={clickable}
                                    noReception={diag.noReception}
                                    lowBattery={diag.lowBattery}
                                    pending={pendingIds.length > 0}
                                    unconfirmed={ids.some(id => this.state.zhUnconfirmed[id])}
                                    motion={motion}
                                    onPointerDown={
                                        clickable
                                            ? e => {
                                                  if (e.button > 0) {
                                                      return;
                                                  }
                                                  this.longFired = false;
                                                  if (this.longTimer) {
                                                      clearTimeout(this.longTimer);
                                                  }
                                                  if (popup) {
                                                      this.longTimer = setTimeout(() => {
                                                          this.longTimer = undefined;
                                                          this.longFired = true;
                                                          this.setState({ zhPopup: i });
                                                      }, LONG_PRESS_MS);
                                                  }
                                              }
                                            : undefined
                                    }
                                    onPointerUp={
                                        clickable
                                            ? () => {
                                                  if (this.longTimer) {
                                                      clearTimeout(this.longTimer);
                                                      this.longTimer = undefined;
                                                  }
                                                  if (!this.longFired) {
                                                      this.tap(dev);
                                                  }
                                                  this.longFired = false;
                                              }
                                            : undefined
                                    }
                                    onPointerLeave={() => {
                                        if (this.longTimer) {
                                            clearTimeout(this.longTimer);
                                            this.longTimer = undefined;
                                        }
                                    }}
                                    onKeyDown={
                                        clickable
                                            ? e => {
                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                      e.preventDefault();
                                                      if (popup) {
                                                          this.setState({ zhPopup: i });
                                                      } else {
                                                          this.tap(dev);
                                                      }
                                                  }
                                              }
                                            : undefined
                                    }
                                />
                            );
                        })}
                    </>
                ) : null}
                {hint ? (
                    <div
                        style={{
                            position: 'absolute',
                            left: 12,
                            right: 12,
                            bottom: 12,
                            fontSize: 12,
                            color: v('text-2'),
                            background: 'rgba(0,0,0,.35)',
                            borderRadius: 8,
                            padding: '6px 10px',
                        }}
                    >
                        {hint}
                    </div>
                ) : null}
                {this.renderPopup(devices, plan)}
            </div>
        );
    }
}
