/*
 * VIS-2 widget "Seiten-Wechsel": shows one view inside the widget and switches to another one when a tab of
 * the head line (ZuhauseKopf) is tapped. For pages in a frame such as the Jäger menu: the menu entry shows a
 * view with only this widget, the tabs Wohnung/Keller/Garten then switch inside the frame instead of leaving it.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { ensureStyles, fonts, v } from '../lib/theme';
import {
    PREFIX,
    SET_INFO,
    STARTSEITE_EVENT,
    TAB_EVENT,
    nextPage,
    type StartseiteAnfrage,
    type TabRequest,
} from '../lib/vis';

interface SeitenRxData {
    ansicht: string;
}

interface SeitenState extends VisRxWidgetState {
    /** view shown at the moment; '' = the start view from the settings */
    zhAktuell: string;
}

export default class ZuhauseSeiten extends (window.visRxWidget as typeof VisRxWidget)<SeitenRxData, SeitenState> {
    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhAktuell: '' };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseSeiten',
            ...SET_INFO,
            visName: 'ZuhauseSeiten',
            visWidgetLabel: 'seiten_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'ansicht',
                            type: 'select-views',
                            label: 'pages_start',
                            tooltip: 'pages_start_tip',
                            multiple: false,
                        },
                    ],
                },
            ],
            visDefaultStyle: { width: 1357, height: 900 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-kopf.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseSeiten.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        window.addEventListener(TAB_EVENT, this.onTab);
        window.addEventListener(STARTSEITE_EVENT, this.onStartseite);
    }

    componentWillUnmount(): void {
        window.removeEventListener(TAB_EVENT, this.onTab);
        window.removeEventListener(STARTSEITE_EVENT, this.onStartseite);
        super.componentWillUnmount();
    }

    private current(): string {
        return this.state.zhAktuell || this.state.rxData.ansicht || '';
    }

    private onTab = (e: Event): void => {
        if (this.props.editMode) {
            return;
        }
        const next = nextPage(this.current(), (e as CustomEvent<TabRequest>).detail);
        if (next) {
            e.preventDefault();
            this.setState({ zhAktuell: next });
        }
    };

    /** Return after inactivity: report a tab other than the start view and, if asked, go back to it */
    private onStartseite = (e: Event): void => {
        if (this.props.editMode) {
            return;
        }
        const start = this.state.rxData.ansicht || '';
        if (!this.state.zhAktuell || this.state.zhAktuell === start) {
            return;
        }
        e.preventDefault();
        if ((e as CustomEvent<StartseiteAnfrage>).detail?.zuruecksetzen) {
            this.setState({ zhAktuell: '' });
        }
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const view = this.current();
        // never show the own view inside itself
        if (!view || view === this.props.view) {
            return (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `1px dashed ${v('border')}`,
                        borderRadius: 18,
                        color: v('text-2'),
                        fontFamily: fonts.text,
                        fontSize: 14,
                        boxSizing: 'border-box',
                    }}
                >
                    {ZuhauseSeiten.t('pages_empty')}
                </div>
            );
        }
        return (
            <div
                key={view}
                style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
            >
                {this.getWidgetView(view)}
            </div>
        );
    }
}
