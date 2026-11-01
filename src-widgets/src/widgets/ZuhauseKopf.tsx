/*
 * VIS-2 widget "Kopfzeile": small line + page title on the left, date and clock on the right (hand-over section 2,
 * "Kopf links / Kopf rechts"). The clock follows the minute of the tablet.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { ICONS } from '../lib/icons';
import { headDate, headTime, parseTabs } from '../lib/model';
import { ensureStyles, fonts, v } from '../lib/theme';
import { PREFIX, SET_INFO, requestTab } from '../lib/vis';

interface KopfRxData {
    oberzeile: string;
    titel: string;
    reiter: string;
    datum: boolean;
    uhr: boolean;
}

interface KopfState extends VisRxWidgetState {
    zhNow: number;
}

const glyph = (d: string): React.JSX.Element => (
    <svg
        aria-hidden="true"
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d={d} />
    </svg>
);

export default class ZuhauseKopf extends (window.visRxWidget as typeof VisRxWidget)<KopfRxData, KopfState> {
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhNow: Date.now() };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseKopf',
            ...SET_INFO,
            visName: 'ZuhauseKopf',
            visWidgetLabel: 'kopf_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'oberzeile', type: 'text', label: 'head_line', tooltip: 'head_line_tip' },
                        { name: 'titel', type: 'text', label: 'head_title', default: 'zu Hause' },
                        { name: 'reiter', type: 'text', label: 'head_tabs', tooltip: 'head_tabs_tip' },
                        { name: 'datum', type: 'checkbox', label: 'head_date', default: true },
                        { name: 'uhr', type: 'checkbox', label: 'head_clock', default: true },
                    ],
                },
            ],
            visDefaultStyle: { width: 900, height: 52 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-kopf.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseKopf.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        this.tick();
    }

    componentWillUnmount(): void {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        super.componentWillUnmount();
    }

    /** re-render at the start of every minute */
    private tick(): void {
        const now = Date.now();
        this.setState({ zhNow: now });
        this.timer = setTimeout(() => this.tick(), 60_000 - (now % 60_000) + 50);
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const now = new Date(this.state.zhNow);
        const lang = this.props.context.lang || 'de';
        const tabs = parseTabs(d.reiter);
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 16,
                    fontFamily: fonts.text,
                    color: v('text'),
                    overflow: 'hidden',
                }}
            >
                <header style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    {d.oberzeile ? (
                        <span
                            style={{
                                fontSize: 12,
                                letterSpacing: '0.12em',
                                fontWeight: 600,
                                color: v('text-2'),
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {d.oberzeile}
                        </span>
                    ) : null}
                    {d.titel ? (
                        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                            {d.titel}
                        </h1>
                    ) : null}
                </header>
                {tabs.length ? (
                    <nav style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'center', paddingBottom: 2 }}>
                        {tabs.map(tab => {
                            const active = tab.view === this.props.view;
                            return (
                                <button
                                    key={tab.view}
                                    type="button"
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => {
                                        if (!active && !this.props.editMode) {
                                            // inside a ZuhauseSeiten widget (Jäger frame) the page switches there
                                            if (!requestTab({ von: this.props.view, nach: tab.view })) {
                                                this.props.context.changeView(tab.view);
                                            }
                                        }
                                    }}
                                    style={{
                                        height: 44,
                                        minWidth: 44,
                                        padding: '0 18px',
                                        borderRadius: 999,
                                        border: active ? 0 : '1px solid #4a4a50',
                                        background: active ? v('text') : 'transparent',
                                        color: active ? '#1f1f22' : v('sw-off-fg'),
                                        fontFamily: fonts.text,
                                        fontSize: 15,
                                        fontWeight: 600,
                                        cursor: active ? 'default' : 'pointer',
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                ) : null}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 16, color: '#c9c6bc' }}>
                    {d.datum !== false ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                            {glyph(ICONS.kalender)}
                            {headDate(now, lang)}
                        </span>
                    ) : null}
                    {d.uhr !== false ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {glyph(ICONS.uhr)}
                            <span
                                style={{
                                    fontFamily: fonts.numbers,
                                    fontSize: 30,
                                    fontWeight: 600,
                                    color: v('text'),
                                    lineHeight: 1,
                                }}
                            >
                                {headTime(now)}
                            </span>
                        </span>
                    ) : null}
                </div>
            </div>
        );
    }
}
