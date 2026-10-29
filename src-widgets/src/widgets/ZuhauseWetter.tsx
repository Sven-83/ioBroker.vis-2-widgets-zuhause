/*
 * VIS-2 widget "Wetter": place + up to 7 days with icon and temperature (hand-over 5.1, 10.1 no. 3).
 * Data: e.g. adapter open-meteo-weather; per day one temperature and one WMO weather code.
 * Only today's icon moves (sun turns slowly, cloud drifts, rain falls).
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { Icon } from '../components/Icon';
import { dayLabel, formatValue, weatherColor, weatherIcon } from '../lib/model';
import { ensureStyles, fonts, v } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';

interface WetterRxData {
    ort: string;
    titel: string;
    tage: number;
    nachkomma: number;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
    [key: `oidTemp${number}`]: string;
    [key: `oidCode${number}`]: string;
    [key: `label${number}`]: string;
}

interface WetterState extends VisRxWidgetState {
    zhNow: number;
}

export default class ZuhauseWetter extends (window.visRxWidget as typeof VisRxWidget)<WetterRxData, WetterState> {
    private minuteTimer?: ReturnType<typeof setInterval>;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhNow: Date.now() };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseWetter',
            ...SET_INFO,
            visName: 'ZuhauseWetter',
            visWidgetLabel: 'wetter_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'ort', type: 'text', label: 'place' },
                        { name: 'titel', type: 'text', label: 'title', default: 'WETTER' },
                        { name: 'tage', type: 'number', label: 'days', default: 5, min: 1, max: 7 },
                        { name: 'nachkomma', type: 'number', label: 'decimals', default: 0, min: 0, max: 2 },
                    ],
                },
                {
                    name: 'tag',
                    label: 'group_day',
                    indexFrom: 1,
                    indexTo: 'tage',
                    fields: [
                        { name: 'oidTemp', type: 'id', label: 'oid_temp' },
                        { name: 'oidCode', type: 'id', label: 'oid_code', tooltip: 'oid_code_tip' },
                        { name: 'label', type: 'text', label: 'day_label', tooltip: 'day_label_tip' },
                    ],
                },
                { name: 'motion', label: 'group_animation', fields: MOTION_FIELDS },
            ],
            visDefaultStyle: { width: 520, height: 140 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-wetter.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseWetter.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        // day labels change at midnight
        this.minuteTimer = setInterval(() => this.setState({ zhNow: Date.now() }), 60_000);
    }

    componentWillUnmount(): void {
        if (this.minuteTimer) {
            clearInterval(this.minuteTimer);
        }
        super.componentWillUnmount();
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const lang = ZuhauseWetter.getLanguage();
        const now = new Date(this.state.zhNow);
        const days = Math.max(1, Math.min(7, Number(d.tage) || 5));
        const levelClass = motionClass(d.animationStufe, d.nachtAus, now);
        const motion = motionAllowed(levelClass) && d.animation !== 'keine';
        const items = Array.from({ length: days }, (_, i) => {
            const n = i + 1;
            const temp = this.state.values[`${d[`oidTemp${n}`]}.val`];
            const icon = weatherIcon(this.state.values[`${d[`oidCode${n}`]}.val`]);
            return {
                key: n,
                label: d[`label${n}`] || dayLabel(i, now, lang),
                temp: d[`oidTemp${n}`] ? formatValue(temp, Number(d.nachkomma) || 0, '°', lang) : '—°',
                icon,
                color: weatherColor(icon),
                animate: motion && i === 0,
            };
        });
        return (
            <section
                className={levelClass}
                style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    background: v('card'),
                    border: `1px solid ${v('border')}`,
                    borderRadius: v('radius-card'),
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    fontFamily: fonts.text,
                    color: v('text'),
                    overflow: 'hidden',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span
                        style={{
                            fontSize: 15,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {d.ort}
                    </span>
                    <span style={{ fontSize: 11, letterSpacing: '0.1em', fontWeight: 600, color: v('text-2') }}>
                        {d.titel}
                    </span>
                </div>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))`,
                        gap: 6,
                        flex: 1,
                        minHeight: 0,
                    }}
                >
                    {items.map(it => (
                        <div
                            key={it.key}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4,
                                padding: '8px 0',
                                borderRadius: 12,
                                background: '#323237',
                                minWidth: 0,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    letterSpacing: '0.06em',
                                    color: v('text-2'),
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {it.label}
                            </span>
                            {it.icon ? (
                                <Icon
                                    name={it.icon}
                                    on
                                    animate={it.animate}
                                    size={26}
                                    strokeWidth={1.6}
                                    color={it.color}
                                />
                            ) : (
                                <span style={{ height: 26 }} />
                            )}
                            <span style={{ fontFamily: fonts.numbers, fontSize: 20, fontWeight: 600 }}>{it.temp}</span>
                        </div>
                    ))}
                </div>
            </section>
        );
    }
}
