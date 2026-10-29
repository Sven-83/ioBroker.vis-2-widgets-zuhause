/*
 * VIS-2 widget "Werte-Karte": list of {label, data point, unit, decimals} in one card (hand-over 10.1 no. 4).
 * Used for the temperatures, the energy card (BK215, tap opens the energy view) and the
 * dashed placeholder "Wohnmobil · Victron".
 * The footer is plain text; VIS bindings like {0_userdata.0.x} are resolved by VIS itself.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { Icon } from '../components/Icon';
import { IconPicker } from '../components/IconPicker';
import { formatValue, str } from '../lib/model';
import { ensureStyles, fonts, v } from '../lib/theme';
import { PREFIX, SET_INFO } from '../lib/vis';

interface WerteRxData {
    titel: string;
    kopfIcon: string;
    wertIcon: string;
    darstellung: string;
    anzahl: number;
    wertGroesse: number;
    fusszeile: string;
    klickView: string;
    platzhalter: boolean;
    platzhalterText: string;
    [key: `label${number}`]: string;
    [key: `oid${number}`]: string;
    [key: `einheit${number}`]: string;
    [key: `nachkomma${number}`]: number;
}

export default class ZuhauseWerte extends (window.visRxWidget as typeof VisRxWidget)<WerteRxData, VisRxWidgetState> {
    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state };
    }

    static getWidgetInfo(): RxWidgetInfo {
        const iconField = (name: string, label: string) =>
            ({
                name,
                type: 'custom',
                label,
                default: '',
                component: (
                    _field: unknown,
                    data: Record<string, unknown>,
                    onDataChange: (d: Record<string, unknown>) => void,
                ) => (
                    <div style={{ width: '100%' }}>
                        <IconPicker
                            value={str(data[name])}
                            onChange={icon => onDataChange({ [name]: data[name] === icon ? '' : icon })}
                        />
                    </div>
                ),
            }) as const;
        return {
            id: 'tplZuhauseWerte',
            ...SET_INFO,
            visName: 'ZuhauseWerte',
            visWidgetLabel: 'werte_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'titel', type: 'text', label: 'title', default: 'TEMPERATUR' },
                        {
                            name: 'darstellung',
                            type: 'select',
                            label: 'layout',
                            options: [
                                { value: 'gross', label: 'layout_large' },
                                { value: 'kompakt', label: 'layout_compact' },
                            ],
                            default: 'gross',
                        },
                        { name: 'anzahl', type: 'number', label: 'count', default: 3, min: 1, max: 8 },
                        {
                            name: 'wertGroesse',
                            type: 'number',
                            label: 'value_size',
                            tooltip: 'value_size_tip',
                            default: 0,
                        },
                        { name: 'fusszeile', type: 'text', label: 'footer', tooltip: 'footer_tip' },
                        { name: 'klickView', type: 'select-views', label: 'click_view', multiple: false },
                        { name: 'platzhalter', type: 'checkbox', label: 'placeholder', tooltip: 'placeholder_tip' },
                        {
                            name: 'platzhalterText',
                            type: 'text',
                            label: 'placeholder_text',
                            default: 'geplant',
                            hidden: '!data.platzhalter',
                        },
                    ],
                },
                {
                    name: 'icons',
                    label: 'group_icon',
                    fields: [iconField('kopfIcon', 'icon_head'), iconField('wertIcon', 'icon_value')],
                },
                {
                    name: 'wert',
                    label: 'group_value',
                    indexFrom: 1,
                    indexTo: 'anzahl',
                    fields: [
                        { name: 'label', type: 'text', label: 'label' },
                        { name: 'oid', type: 'id', label: 'oid' },
                        { name: 'einheit', type: 'text', label: 'unit', default: '°' },
                        { name: 'nachkomma', type: 'number', label: 'decimals', default: 1, min: 0, max: 3 },
                    ],
                },
            ],
            visDefaultStyle: { width: 380, height: 140 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-werte.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseWerte.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
    }

    private onClick = (): void => {
        const view = this.state.rxData.klickView;
        if (view && !this.props.editMode) {
            this.props.context.changeView(view);
        }
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const lang = ZuhauseWerte.getLanguage();
        const compact = d.darstellung === 'kompakt';
        const count = Math.max(1, Math.min(8, Number(d.anzahl) || 3));
        const size = Number(d.wertGroesse) || (d.platzhalter ? 24 : compact ? 22 : 36);
        const clickable = !!d.klickView && !this.props.editMode;
        const items = Array.from({ length: count }, (_, i) => {
            const n = i + 1;
            const oid = d[`oid${n}`];
            const dec = d[`nachkomma${n}`];
            return {
                key: n,
                label: d[`label${n}`] || '',
                text: formatValue(
                    oid ? this.state.values[`${oid}.val`] : undefined,
                    dec === undefined || (dec as unknown) === '' ? 1 : Number(dec),
                    d[`einheit${n}`] ?? '',
                    lang,
                ),
            };
        });

        const head = (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                {d.kopfIcon ? (
                    <Icon
                        name={d.kopfIcon}
                        on
                        size={d.platzhalter ? 20 : 16}
                        strokeWidth={1.8}
                        color={d.platzhalter ? v('sw-off-fg') : d.kopfIcon === 'energie' ? v('sw-on') : undefined}
                    />
                ) : null}
                <span
                    style={
                        d.platzhalter
                            ? { flex: 1, fontSize: 14, fontWeight: 600, color: v('sw-off-fg') }
                            : { flex: 1, fontSize: 11, letterSpacing: '0.1em', fontWeight: 600, color: v('text-2') }
                    }
                >
                    {d.titel}
                </span>
                {d.platzhalter ? (
                    <span style={{ fontSize: 11, color: v('text-2') }}>{d.platzhalterText || 'geplant'}</span>
                ) : null}
                {d.klickView ? <span style={{ fontSize: 16, color: v('text-2') }}>›</span> : null}
            </div>
        );

        return (
            <section
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? this.onClick : undefined}
                onKeyDown={clickable ? e => (e.key === 'Enter' || e.key === ' ') && this.onClick() : undefined}
                className={clickable ? 'zh-btn' : undefined}
                style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    background: d.platzhalter ? '#29292d' : v('card'),
                    border: d.platzhalter ? `1.5px dashed ${v('st-off-bd')}` : `1px solid ${v('border')}`,
                    borderRadius: v('radius-card'),
                    padding: d.platzhalter ? '12px 16px' : '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    fontFamily: fonts.text,
                    color: v('text'),
                    overflow: 'hidden',
                    cursor: clickable ? 'pointer' : 'default',
                }}
            >
                {head}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
                        gap: compact ? 6 : 8,
                        flex: 1,
                        alignItems: 'center',
                    }}
                >
                    {items.map(it => (
                        <div
                            key={it.key}
                            style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}
                        >
                            <span
                                style={
                                    compact
                                        ? { fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: v('text-2') }
                                        : {
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 4,
                                              fontSize: d.platzhalter ? 12 : 13,
                                              color: d.platzhalter ? v('text-2') : '#c9c6bc',
                                              whiteSpace: 'nowrap',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                          }
                                }
                            >
                                {!compact && d.wertIcon ? (
                                    <Icon
                                        name={d.wertIcon}
                                        on
                                        size={14}
                                        strokeWidth={1.8}
                                        color="#8fb8c8"
                                    />
                                ) : null}
                                {it.label}
                            </span>
                            <span
                                style={{
                                    fontFamily: fonts.numbers,
                                    fontSize: size,
                                    fontWeight: 600,
                                    lineHeight: 1,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {it.text}
                            </span>
                        </div>
                    ))}
                </div>
                {d.fusszeile ? <span style={{ fontSize: 11.5, color: v('text-2') }}>{d.fusszeile}</span> : null}
            </section>
        );
    }
}
