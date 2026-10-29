/*
 * VIS-2 widget "Legende": one line that explains the tile signs (hand-over section 5.3, "Legende").
 * Every entry can be switched off; the texts follow the widget language.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { ICONS } from '../lib/icons';
import { ensureStyles, fonts, v } from '../lib/theme';
import { PREFIX, SET_INFO } from '../lib/vis';

interface LegendeRxData {
    schalter: boolean;
    aus: boolean;
    status: boolean;
    warnung: boolean;
    co2: boolean;
    pin: boolean;
}

const dot = (color: string): React.JSX.Element => (
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flex: 'none' }} />
);

export default class ZuhauseLegende extends (window.visRxWidget as typeof VisRxWidget)<
    LegendeRxData,
    VisRxWidgetState
> {
    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseLegende',
            ...SET_INFO,
            visName: 'ZuhauseLegende',
            visWidgetLabel: 'legende_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'schalter', type: 'checkbox', label: 'legend_switch', default: true },
                        { name: 'aus', type: 'checkbox', label: 'legend_off', default: true },
                        { name: 'status', type: 'checkbox', label: 'legend_status', default: true },
                        { name: 'warnung', type: 'checkbox', label: 'legend_warn', default: true },
                        { name: 'co2', type: 'checkbox', label: 'legend_co2', default: true },
                        { name: 'pin', type: 'checkbox', label: 'legend_pin', default: true },
                    ],
                },
            ],
            visDefaultStyle: { width: 600, height: 22 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-legende.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseLegende.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const t = (key: string): string => ZuhauseLegende.t(key);
        const items: [boolean, React.JSX.Element, string][] = [
            [
                d.schalter,
                <span
                    key="s"
                    style={{ width: 16, height: 9, borderRadius: 5, background: '#4a4a50', flex: 'none' }}
                />,
                t('legend_switch'),
            ],
            [
                d.aus,
                <svg
                    key="a"
                    aria-hidden="true"
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={v('st-on-fg')}
                    strokeWidth={2.6}
                    strokeLinecap="round"
                >
                    <path d={ICONS['power-badge']} />
                </svg>,
                t('legend_off'),
            ],
            [d.status, dot(v('st-led')), t('legend_status')],
            [d.warnung, dot(v('warn-bd')), t('legend_warn')],
            [d.co2, dot(v('co2')), 'CO₂'],
            [
                d.pin,
                <span
                    key="p"
                    style={{ fontSize: 9, fontWeight: 700, color: v('sw-off-fg') }}
                >
                    PIN
                </span>,
                t('legend_pin'),
            ],
        ];
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '4px 16px',
                    padding: '0 4px',
                    boxSizing: 'border-box',
                    fontFamily: fonts.text,
                    fontSize: 11.5,
                    color: v('text-2'),
                }}
            >
                {items
                    .filter(([show]) => show !== false)
                    .map(([, sign, text]) => (
                        <span
                            key={text}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                        >
                            {sign}
                            {text}
                        </span>
                    ))}
            </div>
        );
    }
}
