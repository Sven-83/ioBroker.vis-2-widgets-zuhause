/*
 * VIS-2 widget "Etagen-Panel" (hand-over 11.1 "freier Platz rechts", 11.2): side panel of a floor plan.
 * Reads the device list of the chosen Grundriss widget, so the devices are configured only once.
 *  - licht:      "x an", "Alle aus", maintenance, room list (tap switches all lamps of the room)
 *  - steckdose:  what is on, maintenance; no collective action
 *  - rollo:      "a offen · b teilweise · c zu", all up / all down, quick choice per blind
 *  - sicherheit: alarm state (off only with PIN), summary, open windows/doors, maintenance
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { Icon } from '../components/Icon';
import { ICONS } from '../lib/icons';
import { isOn } from '../lib/model';
import {
    blindPosition,
    blindSummary,
    blindWrite,
    deviceOids,
    deviceOn,
    diagnosis,
    maintenanceText,
    parseDevices,
    roomName,
    roomRows,
    securityGroups,
    tapAction,
    type PanelFunction,
    type PlanDevice,
    type Room,
} from '../lib/plan';
import { loadPlan, resolveImage } from '../lib/svg';
import { ensureStyles, fonts, v } from '../lib/theme';
import { PREFIX, SET_INFO, requestPin } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

interface PanelRxData {
    grundriss: string;
    funktion: string;
    titel: string;
    oidAlarm: string;
    pinZiel: string;
    hinweis: string;
}

interface PanelState extends VisRxWidgetState {
    zhTick: number;
    zhRooms: Room[];
}

const WLAN_OFF = 'M2 8.5a15 15 0 0 1 20 0 M5 12a10 10 0 0 1 14 0 M8.5 15.5a5 5 0 0 1 7 0 M12 19h.01 M3 3l18 18';

export default class ZuhauseEtagenPanel extends (window.visRxWidget as typeof VisRxWidget)<PanelRxData, PanelState> {
    private watcher?: StateWatcher;
    private planUrl = '';

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhTick: 0, zhRooms: [] };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseEtagenPanel',
            ...SET_INFO,
            visName: 'ZuhauseEtagenPanel',
            visWidgetLabel: 'panel_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'grundriss',
                            type: 'widget',
                            label: 'panel_plan',
                            tpl: 'tplZuhauseGrundriss',
                            all: true,
                        },
                        {
                            name: 'funktion',
                            type: 'select',
                            label: 'panel_function',
                            options: [
                                { value: 'licht', label: 'fn_light' },
                                { value: 'steckdose', label: 'fn_socket' },
                                { value: 'rollo', label: 'fn_blind' },
                                { value: 'sicherheit', label: 'fn_security' },
                            ],
                            default: 'licht',
                        },
                        { name: 'titel', type: 'text', label: 'panel_floor', default: 'Wohnung' },
                        {
                            name: 'oidAlarm',
                            type: 'id',
                            label: 'panel_alarm',
                            tooltip: 'panel_alarm_tip',
                            hidden: "data.funktion !== 'sicherheit'",
                        },
                        {
                            name: 'pinZiel',
                            type: 'text',
                            label: 'pin_target',
                            default: 'alarm',
                            hidden: "data.funktion !== 'sicherheit'",
                        },
                        { name: 'hinweis', type: 'text', label: 'panel_note' },
                    ],
                },
            ],
            visDefaultStyle: { width: 340, height: 640 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-panel.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseEtagenPanel.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        this.watcher = new StateWatcher(this.props.context.socket, () =>
            this.setState(s => ({ zhTick: s.zhTick + 1 })),
        );
        this.sync();
    }

    componentWillUnmount(): void {
        this.watcher?.stop();
        super.componentWillUnmount();
    }

    onRxDataChanged(): void {
        this.sync();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: typeof this.state): void {
        super.componentDidUpdate(prevProps, prevState);
        // the device list lives in the Grundriss widget and may change there; watch() is a no-op when equal
        this.sync();
    }

    /**
     * Data of the chosen Grundriss widget (searched in all views of the project). Without a choice, or when the
     * chosen id is gone (an imported view gets new widget ids), the only Grundriss widget of the own view is used.
     */
    private planData(): Record<string, unknown> | null {
        const wid = this.state.rxData.grundriss;
        const views = this.props.context.views as unknown as Record<
            string,
            { widgets?: Record<string, { tpl?: string; data?: Record<string, unknown> }> }
        >;
        if (wid) {
            // own view first, then the others (a widget id is unique in a project, but be safe with copies)
            const order = [this.props.view, ...Object.keys(views).filter(n => n !== this.props.view)];
            for (const name of order) {
                const view = views[name];
                if (name !== '___settings' && view?.widgets?.[wid]) {
                    return view.widgets[wid].data || null;
                }
            }
        }
        const plans = Object.values(views[this.props.view]?.widgets || {}).filter(w => w.tpl === 'tplZuhauseGrundriss');
        return plans.length === 1 ? plans[0].data || null : null;
    }

    private devices(): PlanDevice[] {
        return parseDevices(this.planData()?.geraete).devices;
    }

    private sync(): void {
        void this.watcher?.watch([...this.devices().flatMap(deviceOids), this.state.rxData.oidAlarm].filter(Boolean));
        const svg = this.planData()?.svg;
        const url = typeof svg === 'string' && svg ? resolveImage(svg, this.props.context.projectName) : '';
        if (url && url !== this.planUrl) {
            this.planUrl = url;
            loadPlan(url)
                .then(plan => this.setState({ zhRooms: plan.rooms }))
                .catch(() => this.setState({ zhRooms: [] }));
        }
    }

    private write(id: string, value: boolean | number): void {
        if (!this.props.editMode && id) {
            this.props.context.setValue(id, value);
        }
    }

    // ---------------------------------------------------------------- parts

    private static head(icon: React.ReactNode, big: string, small: string): React.JSX.Element {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {icon}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontFamily: fonts.numbers, fontSize: 26, fontWeight: 600, lineHeight: 1 }}>
                        {big}
                    </span>
                    <span style={{ fontSize: 12, color: v('text-2') }}>{small}</span>
                </div>
            </div>
        );
    }

    private static iconBox(name: string, on: boolean): React.JSX.Element {
        return (
            <span
                style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: 12,
                    background: on ? v('sw-on') : v('sw-off-bg'),
                    color: on ? v('sw-on-fg') : v('sw-off-fg'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Icon
                    name={name}
                    on={on}
                    size={24}
                    strokeWidth={1.8}
                />
            </span>
        );
    }

    private static button(text: string, onClick: () => void, accent: boolean): React.JSX.Element {
        return (
            <button
                key={text}
                type="button"
                className="zh-btn"
                onClick={onClick}
                style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${accent ? v('sw-on') : v('sw-off-bd')}`,
                    background: 'transparent',
                    color: accent ? v('sw-on') : v('text'),
                    fontSize: 14,
                    fontWeight: 600,
                }}
            >
                {text}
            </button>
        );
    }

    private static maintenance(text: string): React.JSX.Element | null {
        if (!text) {
            return null;
        }
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: v('warn-bg'),
                    border: '1px solid #5a3335',
                    borderRadius: 12,
                    padding: '10px 12px',
                }}
            >
                <span
                    className="zh-a-blink"
                    style={{
                        width: 22,
                        height: 22,
                        flexShrink: 0,
                        borderRadius: '50%',
                        background: v('warn-bd'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <svg
                        viewBox="0 0 24 24"
                        width={13}
                        height={13}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={2.6}
                        strokeLinecap="round"
                        aria-hidden
                    >
                        {/* WLAN sign as soon as a device has no reception, else only weak batteries */}
                        <path d={/kein Empfang|ohne Empfang/i.test(text) ? WLAN_OFF : ICONS['batterie-schwach']} />
                    </svg>
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.35 }}>{text}</span>
            </div>
        );
    }

    private static row(
        key: string,
        dot: 'on' | 'off' | 'bad' | 'good',
        name: string,
        info: string,
        onClick?: () => void,
    ): React.JSX.Element {
        const dotStyle: React.CSSProperties =
            dot === 'on'
                ? { background: v('sw-on'), boxShadow: `0 0 8px ${v('sw-on')}` }
                : dot === 'bad'
                  ? { background: v('warn-bd'), boxShadow: `0 0 8px ${v('warn-bd')}` }
                  : dot === 'good'
                    ? { background: v('st-led') }
                    : { border: '1.5px solid #5a5a60', boxSizing: 'border-box' };
        const Root = onClick ? 'button' : 'div';
        return (
            <Root
                key={key}
                {...(onClick ? { type: 'button' as const, onClick, className: 'zh-btn' } : {})}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 46,
                    border: 0,
                    borderBottom: `1px solid ${v('border')}`,
                    background: 'transparent',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    padding: '0 2px',
                    width: '100%',
                }}
            >
                <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, ...dotStyle }} />
                <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{name}</span>
                <span
                    style={{
                        fontSize: 13,
                        color: dot === 'bad' ? v('warn-fg') : v('text-2'),
                        fontWeight: dot === 'bad' ? 600 : 400,
                    }}
                >
                    {info}
                </span>
            </Root>
        );
    }

    // ---------------------------------------------------------------- functions

    private renderLight(devices: PlanDevice[]): React.JSX.Element[] {
        const val = this.watcher?.val ?? ((): unknown => undefined);
        const lamps = devices.filter(d => d.typ === 'lampe' || d.typ === 'dimmer');
        const on = lamps.filter(d => deviceOn(d, val));
        const rooms = roomRows(lamps, val, this.state.zhRooms, ['lampe', 'dimmer']);
        return [
            <React.Fragment key="head">
                {ZuhauseEtagenPanel.head(
                    ZuhauseEtagenPanel.iconBox('licht', on.length > 0),
                    `${on.length} an`,
                    `von ${lamps.length} ${lamps.length === 1 ? 'Lampe' : 'Lampen'} · ${this.state.rxData.titel}`,
                )}
            </React.Fragment>,
            <div
                key="all"
                style={{ display: 'flex' }}
            >
                {ZuhauseEtagenPanel.button('Alle aus', () => on.forEach(d => this.switchOff(d)), true)}
            </div>,
            <React.Fragment key="wartung">
                {ZuhauseEtagenPanel.maintenance(maintenanceText(lamps, val, this.state.zhRooms))}
            </React.Fragment>,
            <div
                key="rooms"
                style={{ display: 'flex', flexDirection: 'column' }}
            >
                {rooms.map(r =>
                    ZuhauseEtagenPanel.row(
                        r.raum,
                        r.on ? 'on' : 'off',
                        r.name,
                        r.on ? `${r.on} von ${r.total} an` : `${r.total} ${r.total === 1 ? 'Lampe' : 'Lampen'}`,
                        () => {
                            // one tap switches the whole room: any lamp on -> all off, else all on
                            const inRoom = lamps.filter(d => d.raum === r.raum);
                            const anyOn = inRoom.some(d => deviceOn(d, val));
                            for (const lamp of inRoom) {
                                if (anyOn) {
                                    this.switchOff(lamp);
                                } else if (!deviceOn(lamp, val)) {
                                    this.toggle(lamp);
                                }
                            }
                        },
                    ),
                )}
            </div>,
        ];
    }

    private toggle(d: PlanDevice): void {
        const a = tapAction(d, this.watcher?.val ?? (() => undefined));
        if (a.kind === 'write') {
            this.write(a.oid, a.value);
        }
    }

    private switchOff(d: PlanDevice): void {
        if (deviceOn(d, this.watcher?.val ?? (() => undefined))) {
            this.toggle(d);
        }
    }

    private renderSocket(devices: PlanDevice[]): React.JSX.Element[] {
        const val = this.watcher?.val ?? ((): unknown => undefined);
        const sockets = devices.filter(d => d.typ === 'steckdose');
        const on = sockets.filter(d => deviceOn(d, val));
        return [
            <React.Fragment key="head">
                {ZuhauseEtagenPanel.head(
                    ZuhauseEtagenPanel.iconBox('steckdose', on.length > 0),
                    `${on.length} an`,
                    `von ${sockets.length} ${sockets.length === 1 ? 'Steckdose' : 'Steckdosen'} · ${this.state.rxData.titel}`,
                )}
            </React.Fragment>,
            <React.Fragment key="wartung">
                {ZuhauseEtagenPanel.maintenance(maintenanceText(sockets, val, this.state.zhRooms))}
            </React.Fragment>,
            <div
                key="list"
                style={{ display: 'flex', flexDirection: 'column' }}
            >
                {on.length ? (
                    on.map((d, i) =>
                        ZuhauseEtagenPanel.row(`s${i}`, 'on', d.name || roomName(d.raum, this.state.zhRooms), 'an'),
                    )
                ) : (
                    <span style={{ fontSize: 13, color: v('text-2'), padding: '8px 2px' }}>
                        Alle Steckdosen sind aus.
                    </span>
                )}
            </div>,
        ];
    }

    private renderBlind(devices: PlanDevice[]): React.JSX.Element[] {
        const val = this.watcher?.val ?? ((): unknown => undefined);
        const blinds = devices.filter(d => d.typ === 'rollo');
        const s = blindSummary(blinds, val);
        const setAll = (pos: number): void =>
            blinds.forEach(d => {
                const w = blindWrite(d, pos);
                if (w) {
                    this.write(w.oid, w.value);
                }
            });
        return [
            <React.Fragment key="head">
                {ZuhauseEtagenPanel.head(
                    ZuhauseEtagenPanel.iconBox('jalousie', false),
                    `${s.open} offen · ${s.part} teilweise · ${s.closed} zu`,
                    `${blinds.length} ${blinds.length === 1 ? 'Rollo' : 'Rollos'} · ${this.state.rxData.titel}`,
                )}
            </React.Fragment>,
            <div
                key="all"
                style={{ display: 'flex', gap: 8 }}
            >
                {ZuhauseEtagenPanel.button('Alle hoch', () => setAll(100), false)}
                {ZuhauseEtagenPanel.button('Alle runter', () => setAll(0), false)}
            </div>,
            <React.Fragment key="wartung">
                {ZuhauseEtagenPanel.maintenance(maintenanceText(blinds, val, this.state.zhRooms))}
            </React.Fragment>,
            <div
                key="rows"
                style={{ display: 'flex', flexDirection: 'column' }}
            >
                {blinds.map((d, i) => {
                    const pos = blindPosition(d, val);
                    return (
                        <div
                            key={i}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                minHeight: 46,
                                borderBottom: `1px solid ${v('border')}`,
                            }}
                        >
                            <span
                                style={{
                                    flex: 1,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    minWidth: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {d.name || roomName(d.raum, this.state.zhRooms)}
                            </span>
                            <span style={{ display: 'flex', gap: 3 }}>
                                {[0, 25, 50, 75, 100].map(p => {
                                    const on = Math.round(pos) === p;
                                    return (
                                        <button
                                            key={p}
                                            type="button"
                                            className="zh-btn"
                                            aria-label={`${d.name || d.raum} auf ${p} %`}
                                            aria-pressed={on}
                                            onClick={() => {
                                                const w = blindWrite(d, p);
                                                if (w) {
                                                    this.write(w.oid, w.value);
                                                }
                                            }}
                                            style={{
                                                width: 36,
                                                height: 34,
                                                borderRadius: 8,
                                                border: `1px solid ${on ? v('sw-on') : v('sw-off-bd')}`,
                                                background: on ? v('sw-on') : v('sw-off-bg'),
                                                color: on ? v('sw-on-fg') : v('sw-off-fg'),
                                                fontSize: 11,
                                                fontWeight: 600,
                                                padding: 0,
                                            }}
                                        >
                                            {p === 0 ? 'zu' : p === 100 ? 'auf' : p}
                                        </button>
                                    );
                                })}
                            </span>
                        </div>
                    );
                })}
            </div>,
        ];
    }

    private renderSecurity(devices: PlanDevice[]): React.JSX.Element[] {
        const val = this.watcher?.val ?? ((): unknown => undefined);
        const d = this.state.rxData;
        const groups = securityGroups(devices, val);
        const contacts = groups.find(g => g.key === 'kontakte');
        const armed = d.oidAlarm ? isOn(val(d.oidAlarm)) : undefined;
        const openNames = (contacts?.active || []).map(x => x.name || roomName(x.raum, this.state.zhRooms));
        const diagLines: string[] = [];
        for (const x of devices) {
            const g = diagnosis(x, val);
            const n = x.name || roomName(x.raum, this.state.zhRooms);
            if (g.noReception) {
                diagLines.push(`Kein Empfang: ${n}`);
            }
            if (g.lowBattery) {
                diagLines.push(`Batterie schwach: ${n}`);
            }
        }
        const parts: React.JSX.Element[] = [];
        if (armed !== undefined) {
            parts.push(
                <div
                    key="alarm"
                    style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                    {ZuhauseEtagenPanel.head(
                        ZuhauseEtagenPanel.iconBox('alarm', armed),
                        armed ? 'scharf' : 'unscharf',
                        `Alarm · ${d.titel}${armed ? ' · Aus nur mit PIN' : ''}`,
                    )}
                    {!armed && openNames.length ? (
                        <span style={{ fontSize: 12.5, color: v('warn-fg') }}>
                            Noch offen: {openNames.join(', ')} – erst schließen, dann scharf schalten.
                        </span>
                    ) : null}
                    <div style={{ display: 'flex' }}>
                        {ZuhauseEtagenPanel.button(
                            armed ? 'Unscharf schalten (PIN)' : 'Scharf schalten',
                            () => {
                                if (this.props.editMode) {
                                    return;
                                }
                                if (armed) {
                                    if (!requestPin({ ziel: d.pinZiel || 'alarm', titel: 'Alarm ausschalten' })) {
                                        console.warn('vis-2-widgets-zuhause: no PIN widget on the page');
                                    }
                                } else {
                                    this.write(d.oidAlarm, true);
                                }
                            },
                            !armed,
                        )}
                    </div>
                </div>,
            );
        }
        parts.push(
            <div
                key="groups"
                style={{ display: 'flex', flexDirection: 'column' }}
            >
                {groups.map(g =>
                    ZuhauseEtagenPanel.row(
                        g.key,
                        g.active.length ? 'bad' : 'good',
                        g.label,
                        g.key === 'kontakte'
                            ? g.active.length
                                ? `${g.active.length} offen`
                                : 'alle zu'
                            : g.active.length
                              ? g.key === 'bewegung'
                                  ? `${g.active.length} aktiv`
                                  : 'AUSGELÖST'
                              : 'ok',
                    ),
                )}
            </div>,
        );
        if (openNames.length) {
            parts.push(
                <span
                    key="open"
                    style={{ fontSize: 13, lineHeight: 1.4 }}
                >
                    <b>Offen:</b> {openNames.join(', ')}
                </span>,
            );
        }
        if (diagLines.length) {
            parts.push(
                <React.Fragment key="wartung">
                    {ZuhauseEtagenPanel.maintenance(`Wartung: ${diagLines.join(' · ')}`)}
                </React.Fragment>,
            );
        }
        return parts;
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const devices = this.devices();
        const fn = (d.funktion || 'licht') as PanelFunction;
        let content: React.JSX.Element[];
        if (!this.planData()) {
            content = [
                <span
                    key="none"
                    style={{ fontSize: 13, color: v('text-2') }}
                >
                    {ZuhauseEtagenPanel.t('panel_no_plan')}
                </span>,
            ];
        } else if (fn === 'steckdose') {
            content = this.renderSocket(devices);
        } else if (fn === 'rollo') {
            content = this.renderBlind(devices);
        } else if (fn === 'sicherheit') {
            content = this.renderSecurity(devices);
        } else {
            content = this.renderLight(devices);
        }
        return (
            <section
                style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    background: v('card'),
                    border: `1px solid ${v('border')}`,
                    borderRadius: v('radius-card'),
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    fontFamily: fonts.text,
                    color: v('text'),
                    overflowY: 'auto',
                }}
            >
                {content}
                {d.hinweis ? (
                    <span style={{ fontSize: 11.5, color: v('text-2'), lineHeight: 1.4 }}>{d.hinweis}</span>
                ) : null}
            </section>
        );
    }
}
