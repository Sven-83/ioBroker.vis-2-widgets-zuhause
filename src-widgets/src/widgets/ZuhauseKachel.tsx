/*
 * VIS-2 widget "Kachel": covers the five tile types of hand-over section 4 (schalter, schalter-pin,
 * status-aus, status, status-warnung) with badges, diagnosis, ack feedback, long press and animations.
 *
 * Commands: setValue (ack=false); the tile shows a spinner until the data point comes back with ack=true.
 * Without ack after ACK_TIMEOUT_MS the tile gets a red frame (hand-over 10.1).
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { Icon } from '../components/Icon';
import { IconPicker } from '../components/IconPicker';
import { PinPad, ViewPopup } from '../components/Overlays';
import { Scaled } from '../components/Scaled';
import { TILE_BASE, Tile } from '../components/Tile';
import { ICONS } from '../lib/icons';
import {
    ACK_TIMEOUT_MS,
    DEVICE_CLASSES,
    PIN_DIGITS_DEFAULT,
    TILE_TYPES,
    asTileType,
    hasDiag,
    isActive,
    isOn,
    isStale,
    matchesValue,
    isWarning,
    str,
    lowBattery,
    noReception,
    tapAction,
    tileLook,
} from '../lib/model';
import { invertedIds, isInverted, readValue, writeTarget } from '../lib/oid';
import { ensureStyles, v } from '../lib/theme';
import { MOTION_FIELDS, PIN_DEFAULTS, PREFIX, SET_INFO, motionAllowed, motionClass, requestPin } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const LONG_PRESS_MS = 500;
/** attribute fields of type "id"; the ones starting with "!" are subscribed by the widget itself */
const ID_FIELDS = [
    'oid',
    'oidSchreiben',
    'oidAlarm',
    'badgeSchloss',
    'badgeCo2',
    'badgeLicht',
    'oidEmpfang',
    'oidBatterie',
] as const;

interface KachelRxData {
    typ: string;
    oid: string;
    oidSchreiben: string;
    anWerte: string;
    label: string;
    labelWarnung: string;
    warnBei: boolean;
    icon: string;
    iconAuto: boolean;
    iconEigen: string;
    pinZiel: string;
    pinTitel: string;
    oidAlarm: string;
    alarmText: string;
    popupView: string;
    popupTitel: string;
    popupBreite: number;
    popupHoehe: number;
    popupSchliessen: number;
    badgeSchloss: string;
    badgeCo2: string;
    badgeLicht: string;
    geraeteklasse: string;
    oidEmpfang: string;
    empfangGrenze: number;
    oidBatterie: string;
    batterieGrenze: number;
    veraltetNachMin: number;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface KachelState extends VisRxWidgetState {
    /** a command waits for ack */
    zhPending: boolean;
    /** the last command was not confirmed in time */
    zhUnconfirmed: boolean;
    zhPopup: boolean;
    /** own PIN pad (no ZuhausePin widget on the page) */
    zhPin: boolean;
    /** counts value changes; restarts one-time animations (garage) */
    zhChanges: number;
    /** minute tick for "stale" and night mode */
    zhNow: number;
}

export default class ZuhauseKachel extends (window.visRxWidget as typeof VisRxWidget)<KachelRxData, KachelState> {
    private longTimer?: ReturnType<typeof setTimeout>;
    private longFired = false;
    private ackTimer?: ReturnType<typeof setTimeout>;
    /** timestamp of the value before our command; a newer ack confirms it */
    private sentTs = 0;
    private minuteTimer?: ReturnType<typeof setInterval>;
    /** subscriptions of the ids with "!" */
    private inverted?: StateWatcher;
    /** last raw value of oid, to count changes */
    private lastVal: unknown;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            zhPending: false,
            zhUnconfirmed: false,
            zhPopup: false,
            zhPin: false,
            zhChanges: 0,
            zhNow: Date.now(),
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        const typeIs =
            (...types: string[]) =>
            (data: Record<string, unknown>) =>
                !types.includes(str(data.typ) || 'schalter');
        return {
            id: 'tplZuhauseKachel',
            ...SET_INFO,
            visName: 'ZuhauseKachel',
            visWidgetLabel: 'kachel_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'typ',
                            type: 'select',
                            label: 'typ',
                            options: TILE_TYPES.map(t => ({ value: t, label: `typ_${t}` })),
                            default: 'schalter',
                            noTranslation: false,
                        },
                        { name: 'oid', type: 'id', label: 'oid', tooltip: 'oid_tip' },
                        {
                            name: 'oidSchreiben',
                            type: 'id',
                            label: 'oid_write',
                            tooltip: 'oid_write_tip',
                            hidden: typeIs('schalter', 'schalter-pin', 'status-aus'),
                        },
                        { name: 'anWerte', type: 'text', label: 'on_values', tooltip: 'on_values_tip' },
                        { name: 'label', type: 'text', label: 'label' },
                        { name: 'labelWarnung', type: 'text', label: 'label_warn', hidden: typeIs('status-warnung') },
                        {
                            name: 'warnBei',
                            type: 'checkbox',
                            label: 'warn_at_true',
                            tooltip: 'warn_at_true_tip',
                            hidden: typeIs('status-warnung'),
                        },
                        {
                            name: 'pinZiel',
                            type: 'text',
                            label: 'pin_target',
                            tooltip: 'pin_target_tip',
                            default: 'alarm',
                            hidden: typeIs('schalter-pin'),
                        },
                        { name: 'pinTitel', type: 'text', label: 'pin_title', hidden: typeIs('schalter-pin') },
                    ],
                },
                {
                    name: 'icon',
                    label: 'group_icon',
                    fields: [
                        {
                            name: 'icon',
                            type: 'custom',
                            label: 'icon',
                            default: 'licht',
                            component: (_field, data, onDataChange) => (
                                <IconPicker
                                    value={str(data.icon)}
                                    onChange={icon => onDataChange({ icon })}
                                />
                            ),
                        },
                        { name: 'iconAuto', type: 'checkbox', label: 'icon_auto', default: true },
                        { name: 'iconEigen', type: 'image', label: 'icon_own' },
                    ],
                },
                {
                    name: 'alarm',
                    label: 'group_alarm',
                    fields: [
                        { name: 'oidAlarm', type: 'id', label: 'oid_alarm', tooltip: 'oid_alarm_tip' },
                        { name: 'alarmText', type: 'text', label: 'alarm_text', default: 'ALARM' },
                    ],
                },
                {
                    name: 'badges',
                    label: 'group_badges',
                    fields: [
                        { name: 'badgeSchloss', type: 'id', label: 'badge_lock', tooltip: 'badge_lock_tip' },
                        { name: 'badgeCo2', type: 'id', label: 'badge_co2' },
                        { name: 'badgeLicht', type: 'id', label: 'badge_light' },
                    ],
                },
                {
                    name: 'diag',
                    label: 'group_diag',
                    fields: [
                        {
                            name: 'geraeteklasse',
                            type: 'select',
                            label: 'device_class',
                            options: Object.keys(DEVICE_CLASSES).map(k => ({ value: k, label: `class_${k}` })),
                            default: 'geraet',
                        },
                        {
                            name: 'oidEmpfang',
                            type: 'id',
                            label: 'oid_reception',
                            tooltip: 'oid_reception_tip',
                            hidden: (data: Record<string, unknown>) =>
                                !hasDiag(str(data.geraeteklasse) || 'geraet', 'empfang'),
                        },
                        {
                            name: 'empfangGrenze',
                            type: 'number',
                            label: 'reception_limit',
                            tooltip: 'reception_limit_tip',
                            default: 0,
                            hidden: (data: Record<string, unknown>) => !data.oidEmpfang,
                        },
                        {
                            name: 'oidBatterie',
                            type: 'id',
                            label: 'oid_battery',
                            hidden: (data: Record<string, unknown>) =>
                                !hasDiag(str(data.geraeteklasse) || 'geraet', 'batterie'),
                        },
                        {
                            name: 'batterieGrenze',
                            type: 'number',
                            label: 'battery_limit',
                            default: 20,
                            hidden: (data: Record<string, unknown>) => !data.oidBatterie,
                        },
                        {
                            name: 'veraltetNachMin',
                            type: 'number',
                            label: 'stale_after',
                            tooltip: 'stale_after_tip',
                            default: 0,
                        },
                    ],
                },
                {
                    name: 'popup',
                    label: 'group_popup',
                    fields: [
                        {
                            name: 'popupView',
                            type: 'select-views',
                            label: 'popup_view',
                            tooltip: 'popup_view_tip',
                            multiple: false,
                        },
                        { name: 'popupTitel', type: 'text', label: 'popup_title' },
                        { name: 'popupBreite', type: 'number', label: 'popup_width', default: 600 },
                        { name: 'popupHoehe', type: 'number', label: 'popup_height', default: 420 },
                        {
                            name: 'popupSchliessen',
                            type: 'number',
                            label: 'popup_close',
                            tooltip: 'popup_close_tip',
                            default: 5,
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
        return ZuhauseKachel.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        this.minuteTimer = setInterval(() => this.setState({ zhNow: Date.now() }), 60_000);
        this.inverted = new StateWatcher(this.props.context.socket, () => this.forceUpdate());
        this.syncInverted();
    }

    onRxDataChanged(): void {
        this.syncInverted();
    }

    private syncInverted(): void {
        void this.inverted?.watch(invertedIds(ID_FIELDS.map(f => this.state.rxData[f] as string | undefined)));
    }

    componentWillUnmount(): void {
        this.cancelLongPress();
        if (this.ackTimer) {
            clearTimeout(this.ackTimer);
        }
        if (this.minuteTimer) {
            clearInterval(this.minuteTimer);
        }
        this.inverted?.stop();
        super.componentWillUnmount();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: typeof this.state): void {
        super.componentDidUpdate(prevProps, prevState);
        const oid = this.state.rxData.oid;
        if (!oid) {
            return;
        }
        const val = this.raw(oid, 'val');
        if (val !== this.lastVal && this.lastVal !== undefined) {
            this.setState(s => ({ zhChanges: s.zhChanges + 1 }));
        }
        this.lastVal = val;
        const ts = this.raw(oid, 'ts') as number | undefined;
        const ack = this.raw(oid, 'ack') as boolean | undefined;
        if (this.state.zhPending && ack && ts !== undefined && ts !== this.sentTs) {
            if (this.ackTimer) {
                clearTimeout(this.ackTimer);
                this.ackTimer = undefined;
            }
            this.setState({ zhPending: false, zhUnconfirmed: false });
        }
    }

    // ---------------------------------------------------------------- values

    /** State part as stored; ids with "!" come from the own subscription */
    private raw(oid: string | undefined, key: 'val' | 'ts' | 'ack'): unknown {
        if (!oid) {
            return undefined;
        }
        return isInverted(oid) ? this.inverted?.snapshot(oid)?.[key] : this.state.values[`${oid}.${key}`];
    }

    /** Value as the tile sees it ("!" inverted) */
    private val(oid: string | undefined): unknown {
        return readValue(oid, this.raw(oid, 'val'));
    }

    private get on(): boolean {
        const val = this.val(this.state.rxData.oid);
        return matchesValue(val, this.state.rxData.anWerte) ?? isOn(val);
    }

    // ---------------------------------------------------------------- actions

    private write(value: boolean): void {
        const { oid, oidSchreiben } = this.state.rxData;
        const target = oidSchreiben || oid;
        if (!target) {
            return;
        }
        // keep the type of numeric switches (0/1)
        const current = this.raw(target, 'val');
        const w = writeTarget(target, typeof current === 'number' ? (value ? 1 : 0) : value);
        this.sentTs = (this.raw(oid, 'ts') as number | undefined) ?? 0;
        this.props.context.setValue(w.id, w.value);
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
    }

    private tap = (): void => {
        if (this.props.editMode) {
            return;
        }
        const typ = asTileType(this.state.rxData.typ);
        switch (tapAction(typ, this.on)) {
            case 'write-true':
                this.write(true);
                break;
            case 'write-false':
                this.write(false);
                break;
            case 'open-pin':
                this.openPin();
                break;
            default:
                break;
        }
    };

    private openPin(): void {
        const ziel = this.state.rxData.pinZiel || 'alarm';
        const titel =
            this.state.rxData.pinTitel || `${this.state.rxData.label || ziel} ${ZuhauseKachel.t('switch_off')}`;
        if (requestPin({ ziel, titel })) {
            return;
        }
        // no ZuhausePin widget on the page: own pad with the data points of script B
        this.props.context.setValue(PIN_DEFAULTS.oidZiel, ziel);
        this.setState({ zhPin: true });
    }

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
        if (this.state.rxData.popupView) {
            this.longTimer = setTimeout(() => {
                this.longTimer = undefined;
                this.longFired = true;
                this.setState({ zhPopup: true });
            }, LONG_PRESS_MS);
        }
    };

    private onPointerUp = (): void => {
        if (this.props.editMode) {
            return;
        }
        this.cancelLongPress();
        if (!this.longFired) {
            this.tap();
        }
        this.longFired = false;
    };

    private onPointerLeave = (): void => {
        this.cancelLongPress();
    };

    private onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.tap();
        }
    };

    private closePopup = (): void => this.setState({ zhPopup: false });

    // ---------------------------------------------------------------- render

    private renderIcon(animate: boolean, garageAnimate: boolean): React.JSX.Element {
        const d = this.state.rxData;
        const name = d.icon || 'licht';
        if (d.iconEigen) {
            // own SVG from the VIS files, coloured through the mask with currentColor
            return (
                <span
                    style={{
                        width: 30,
                        height: 30,
                        background: 'currentColor',
                        WebkitMask: `url("${d.iconEigen}") center / contain no-repeat`,
                        mask: `url("${d.iconEigen}") center / contain no-repeat`,
                    }}
                />
            );
        }
        const auto = d.iconAuto !== false;
        return (
            <Icon
                name={name}
                on={this.on}
                path={auto ? undefined : ICONS[name]}
                animate={auto && animate}
                co2={isOn(this.val(d.badgeCo2))}
                replayKey={garageAnimate && this.state.zhChanges > 0 ? String(this.state.zhChanges) : undefined}
            />
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const typ = asTileType(d.typ);
        const on = this.on;
        const warnBei = !!d.warnBei;
        const alarm = !!d.oidAlarm && isOn(this.val(d.oidAlarm));
        const look = tileLook(typ, on, warnBei);
        const warn = isWarning(typ, on, warnBei);
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date(this.state.zhNow));
        const motion = motionAllowed(levelClass) && d.animation !== 'keine';
        const klasse = d.geraeteklasse || 'geraet';

        const label = alarm ? d.alarmText || 'ALARM' : warn ? d.labelWarnung || d.label : d.label;
        const clickable = !this.props.editMode && (tapAction(typ, on) !== 'none' || !!d.popupView);
        const isStatusType = typ === 'status' || typ === 'status-warnung' || (typ === 'status-aus' && !on);
        const dots: string[] = [];
        if (d.badgeCo2 && isOn(this.val(d.badgeCo2))) {
            dots.push(v('co2'));
        }
        if (d.badgeLicht && isOn(this.val(d.badgeLicht))) {
            dots.push(v('light'));
        }
        const lock = d.badgeSchloss ? isOn(this.val(d.badgeSchloss)) : undefined;
        const ts = this.raw(d.oid, 'ts') as number | undefined;

        return (
            <Scaled base={TILE_BASE}>
                {scale => (
                    <>
                        <Tile
                            look={look}
                            label={label || ''}
                            icon={this.renderIcon(motion && (isActive(look) || alarm), motion)}
                            clickable={clickable}
                            toggle={typ === 'schalter' || typ === 'schalter-pin'}
                            power={look === 'offable-on'}
                            led={isStatusType ? look === 'status-on' || look === 'warn' : undefined}
                            pin={typ === 'schalter-pin'}
                            lock={lock}
                            lockPulse={lock === false && motion}
                            dots={dots}
                            noReception={
                                hasDiag(klasse, 'empfang') &&
                                !!d.oidEmpfang &&
                                noReception(this.val(d.oidEmpfang), Number(d.empfangGrenze) || 0)
                            }
                            lowBattery={
                                hasDiag(klasse, 'batterie') &&
                                !!d.oidBatterie &&
                                lowBattery(
                                    this.val(d.oidBatterie),
                                    d.batterieGrenze === undefined ||
                                        d.batterieGrenze === null ||
                                        (d.batterieGrenze as unknown) === ''
                                        ? 20
                                        : Number(d.batterieGrenze),
                                )
                            }
                            pending={this.state.zhPending}
                            unconfirmed={this.state.zhUnconfirmed}
                            stale={isStale(ts, Number(d.veraltetNachMin) || 0, this.state.zhNow)}
                            alarm={alarm}
                            warnPulse={warn && motion}
                            levelClass={levelClass}
                            scale={scale}
                            onPointerDown={this.onPointerDown}
                            onPointerUp={this.onPointerUp}
                            onPointerLeave={this.onPointerLeave}
                            onPointerCancel={this.onPointerLeave}
                            onKeyDown={clickable ? this.onKeyDown : undefined}
                        />
                        {this.state.zhPopup && d.popupView && !this.props.editMode ? (
                            <ViewPopup
                                title={d.popupTitel || d.label}
                                content={this.getWidgetView(d.popupView)}
                                width={Number(d.popupBreite) || 600}
                                height={Number(d.popupHoehe) || 420}
                                autoCloseS={
                                    d.popupSchliessen === undefined || (d.popupSchliessen as unknown) === ''
                                        ? 5
                                        : Number(d.popupSchliessen)
                                }
                                onClose={this.closePopup}
                            />
                        ) : null}
                        {this.state.zhPin ? (
                            <PinPad
                                title={d.pinTitel || `${d.label || d.pinZiel} ${ZuhauseKachel.t('switch_off')}`}
                                hint={ZuhauseKachel.t('pin_hint')}
                                digits={PIN_DIGITS_DEFAULT}
                                onComplete={entry => this.props.context.setValue(PIN_DEFAULTS.oidEingabe, entry)}
                                onClose={() => this.setState({ zhPin: false })}
                            />
                        ) : null}
                    </>
                )}
            </Scaled>
        );
    }
}
