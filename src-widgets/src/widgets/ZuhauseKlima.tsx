/*
 * VIS-2 widget "Klima" (hand-over 11.1 floor heating, 11.2 zuhause-klima): tile with the current
 * temperature large, the setpoint small and the state "heizt" (orange, warmth rises) or "erreicht".
 * Long press (500 ms) opens the setpoint: -/+ in steps of 0.5°, quick choice (Eco, Komfort, Bad ...).
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { SetpointPopup, parsePresets } from '../components/ControlPopups';
import { Icon } from '../components/Icon';
import { Scaled } from '../components/Scaled';
import { DiagBadge, TILE_BASE, WLAN_OFF } from '../components/Tile';
import { formatNumber, isOn, noReception } from '../lib/model';
import { ensureStyles, fonts, v } from '../lib/theme';
import { PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';

const LONG_PRESS_MS = 500;
const HEAT = { bg: '#3a2614', border: '#f0883e', fg: '#ffc08a' };

interface KlimaRxData {
    titel: string;
    oidIst: string;
    oidSoll: string;
    oidHeizt: string;
    oidEmpfang: string;
    min: number;
    max: number;
    schritt: number;
    schnellwahl: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface KlimaState extends VisRxWidgetState {
    zhPopup: boolean;
}

export default class ZuhauseKlima extends (window.visRxWidget as typeof VisRxWidget)<KlimaRxData, KlimaState> {
    private longTimer?: ReturnType<typeof setTimeout>;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhPopup: false };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseKlima',
            ...SET_INFO,
            visName: 'ZuhauseKlima',
            visWidgetLabel: 'klima_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'titel', type: 'text', label: 'room' },
                        { name: 'oidIst', type: 'id', label: 'oid_actual' },
                        { name: 'oidSoll', type: 'id', label: 'oid_setpoint' },
                        { name: 'oidHeizt', type: 'id', label: 'oid_heating', tooltip: 'oid_heating_tip' },
                        { name: 'oidEmpfang', type: 'id', label: 'oid_reception', tooltip: 'oid_reception_tip' },
                        { name: 'min', type: 'number', label: 'min', default: 16 },
                        { name: 'max', type: 'number', label: 'max', default: 28 },
                        { name: 'schritt', type: 'number', label: 'step', default: 0.5 },
                        {
                            name: 'schnellwahl',
                            type: 'text',
                            label: 'presets',
                            tooltip: 'presets_tip',
                            default: 'Eco:19, Komfort:21.5, Bad:24',
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
            visDefaultStyle: { width: TILE_BASE, height: TILE_BASE },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-klima.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseKlima.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
    }

    componentWillUnmount(): void {
        if (this.longTimer) {
            clearTimeout(this.longTimer);
        }
        super.componentWillUnmount();
    }

    private val(oid: string | undefined): unknown {
        return oid ? this.state.values[`${oid}.val`] : undefined;
    }

    private cancel = (): void => {
        if (this.longTimer) {
            clearTimeout(this.longTimer);
            this.longTimer = undefined;
        }
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const lang = ZuhauseKlima.getLanguage();
        const heating = !!d.oidHeizt && isOn(this.val(d.oidHeizt));
        const soll = Number(this.val(d.oidSoll));
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date());
        const motion = motionAllowed(levelClass);
        const canSet = !!d.oidSoll && !this.props.editMode;
        const look: React.CSSProperties = heating
            ? { background: HEAT.bg, border: `1.5px solid ${HEAT.border}`, color: HEAT.fg }
            : { background: v('sw-off-bg'), border: `1px solid ${v('sw-off-bd')}`, color: v('sw-off-fg') };
        return (
            <Scaled base={TILE_BASE}>
                {scale => (
                    <>
                        <div
                            role={canSet ? 'button' : undefined}
                            tabIndex={canSet ? 0 : undefined}
                            aria-label={`${d.titel} ${formatNumber(this.val(d.oidIst), 1, lang)}°`}
                            className={['zh-tile', levelClass].join(' ')}
                            onContextMenu={e => e.preventDefault()}
                            onPointerDown={
                                canSet
                                    ? () => {
                                          this.cancel();
                                          this.longTimer = setTimeout(
                                              () => this.setState({ zhPopup: true }),
                                              LONG_PRESS_MS,
                                          );
                                      }
                                    : undefined
                            }
                            onPointerUp={this.cancel}
                            onPointerLeave={this.cancel}
                            onKeyDown={e =>
                                canSet && (e.key === 'Enter' || e.key === ' ') && this.setState({ zhPopup: true })
                            }
                            style={{
                                position: 'relative',
                                width: TILE_BASE,
                                height: TILE_BASE,
                                boxSizing: 'border-box',
                                borderRadius: v('radius-tile'),
                                transform: scale !== 1 ? `scale(${scale})` : undefined,
                                transformOrigin: 'top left',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                padding: '0 10px',
                                fontFamily: fonts.text,
                                cursor: canSet ? 'pointer' : 'default',
                                userSelect: 'none',
                                touchAction: 'manipulation',
                                overflow: 'hidden',
                                ...look,
                            }}
                        >
                            <span style={{ position: 'absolute', left: 8, top: 7, display: 'flex' }}>
                                <Icon
                                    name="heizung"
                                    on={heating}
                                    size={18}
                                    animate={heating && motion}
                                />
                            </span>
                            <span
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textAlign: 'right',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    paddingLeft: 22,
                                    marginTop: -2,
                                }}
                            >
                                {d.titel}
                            </span>
                            <span
                                style={{
                                    fontFamily: fonts.numbers,
                                    fontSize: 28,
                                    fontWeight: 600,
                                    lineHeight: 1.1,
                                    color: v('text'),
                                    marginTop: 6,
                                }}
                            >
                                {formatNumber(this.val(d.oidIst), 1, lang)}°
                            </span>
                            <span style={{ fontSize: 11 }}>
                                {Number.isFinite(soll)
                                    ? `Soll ${formatNumber(soll, Number.isInteger(soll) ? 0 : 1, lang)}°`
                                    : ''}
                                {heating ? ' · heizt' : d.oidHeizt ? ' · erreicht' : ''}
                            </span>
                            {d.oidEmpfang && noReception(this.val(d.oidEmpfang), 0) ? (
                                <DiagBadge
                                    d={WLAN_OFF}
                                    right={4}
                                    title="kein Empfang"
                                />
                            ) : null}
                        </div>
                        {this.state.zhPopup && d.oidSoll ? (
                            <SetpointPopup
                                title={d.titel}
                                setpoint={Number.isFinite(soll) ? soll : 21}
                                min={Number(d.min) || 16}
                                max={Number(d.max) || 28}
                                step={Number(d.schritt) || 0.5}
                                presets={parsePresets(d.schnellwahl)}
                                lang={lang}
                                onSetpoint={n => this.props.context.setValue(d.oidSoll, n)}
                                onClose={() => this.setState({ zhPopup: false })}
                            />
                        ) : null}
                    </>
                )}
            </Scaled>
        );
    }
}
