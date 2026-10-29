/*
 * VIS-2 widget "Karte": card background with group titles (hand-over section 2, "Karten").
 * The tiles are placed on top of it in the editor. A second group gets a 1 px divider at its position.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { ensureStyles, fonts, v } from '../lib/theme';
import { PREFIX, SET_INFO } from '../lib/vis';

interface KarteRxData {
    titel1: string;
    untertitel1: string;
    titel2: string;
    untertitel2: string;
    gruppe2Y: number;
    titel3: string;
    untertitel3: string;
    gruppe3Y: number;
    gestrichelt: boolean;
}

export default class ZuhauseKarte extends (window.visRxWidget as typeof VisRxWidget)<KarteRxData, VisRxWidgetState> {
    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseKarte',
            ...SET_INFO,
            visName: 'ZuhauseKarte',
            visWidgetLabel: 'karte_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'titel1', type: 'text', label: 'group_title1', default: 'Gehen' },
                        { name: 'untertitel1', type: 'text', label: 'group_sub1', default: 'Check vor dem Verlassen' },
                        { name: 'titel2', type: 'text', label: 'group_title2' },
                        { name: 'untertitel2', type: 'text', label: 'group_sub2' },
                        { name: 'gruppe2Y', type: 'number', label: 'group_y2', tooltip: 'group_y_tip', default: 132 },
                        { name: 'titel3', type: 'text', label: 'group_title3' },
                        { name: 'untertitel3', type: 'text', label: 'group_sub3' },
                        { name: 'gruppe3Y', type: 'number', label: 'group_y3', default: 264 },
                        { name: 'gestrichelt', type: 'checkbox', label: 'dashed' },
                    ],
                },
            ],
            visDefaultStyle: { width: 300, height: 264 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-karte.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseKarte.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
    }

    private static head(title: string, sub: string): React.JSX.Element {
        return (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
                <span style={{ fontSize: 11, color: v('text-2'), overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sub}
                </span>
            </div>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const groups = [
            { title: d.titel2, sub: d.untertitel2, y: Number(d.gruppe2Y) || 0 },
            { title: d.titel3, sub: d.untertitel3, y: Number(d.gruppe3Y) || 0 },
        ].filter(g => g.title && g.y > 0);
        return (
            <section
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    background: d.gestrichelt ? '#29292d' : v('card'),
                    border: d.gestrichelt ? `1.5px dashed ${v('st-off-bd')}` : `1px solid ${v('border')}`,
                    borderRadius: v('radius-card'),
                    padding: '12px 14px',
                    fontFamily: fonts.text,
                    color: v('text'),
                    overflow: 'hidden',
                }}
            >
                {d.titel1 ? ZuhauseKarte.head(d.titel1, d.untertitel1) : null}
                {groups.map(g => (
                    <div
                        key={g.y}
                        style={{ position: 'absolute', left: 14, right: 14, top: g.y }}
                    >
                        <div style={{ height: 1, background: v('border'), marginBottom: 11 }} />
                        {ZuhauseKarte.head(g.title, g.sub)}
                    </div>
                ))}
            </section>
        );
    }
}
