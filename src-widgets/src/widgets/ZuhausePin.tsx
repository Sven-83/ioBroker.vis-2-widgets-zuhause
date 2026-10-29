/*
 * VIS-2 widget "PIN-Dialog": invisible at runtime. Opens the number pad when a tile of type
 * schalter-pin asks for it (event PIN_EVENT), writes the target to oidZiel and the complete entry
 * to oidEingabe; the check happens in script B. Shows the answer of the script (oidMeldung) as toast.
 * The PIN is never stored by the widget.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { PinPad, Toast } from '../components/Overlays';
import { PIN_DIGITS_DEFAULT } from '../lib/model';
import { ensureStyles, fonts, v } from '../lib/theme';
import { PIN_DEFAULTS, PIN_EVENT, PREFIX, SET_INFO, type PinRequest } from '../lib/vis';

const TOAST_MS = 4_000;

interface PinRxData {
    oidZiel: string;
    oidEingabe: string;
    oidMeldung: string;
    stellen: number;
    hinweis: string;
}

interface PinState extends VisRxWidgetState {
    zhRequest: PinRequest | null;
    zhToast: string;
}

export default class ZuhausePin extends (window.visRxWidget as typeof VisRxWidget)<PinRxData, PinState> {
    private toastTimer?: ReturnType<typeof setTimeout>;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhRequest: null, zhToast: '' };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhausePin',
            ...SET_INFO,
            visName: 'ZuhausePin',
            visWidgetLabel: 'pin_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'oidZiel', type: 'id', label: 'oid_pin_target', default: PIN_DEFAULTS.oidZiel },
                        { name: 'oidEingabe', type: 'id', label: 'oid_pin_input', default: PIN_DEFAULTS.oidEingabe },
                        { name: 'oidMeldung', type: 'id', label: 'oid_pin_message', default: PIN_DEFAULTS.oidMeldung },
                        {
                            name: 'stellen',
                            type: 'number',
                            label: 'pin_digits',
                            default: PIN_DIGITS_DEFAULT,
                            min: 4,
                            max: 8,
                        },
                        { name: 'hinweis', type: 'text', label: 'pin_hint_field' },
                    ],
                },
            ],
            visDefaultStyle: { width: 120, height: 40 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-pin.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhausePin.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        if (!this.props.editMode) {
            window.addEventListener(PIN_EVENT, this.onRequest);
        }
    }

    componentWillUnmount(): void {
        window.removeEventListener(PIN_EVENT, this.onRequest);
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        super.componentWillUnmount();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: typeof this.state): void {
        super.componentDidUpdate(prevProps, prevState);
        const oid = this.state.rxData.oidMeldung;
        if (!oid) {
            return;
        }
        const text = this.state.values[`${oid}.val`];
        const ts = this.state.values[`${oid}.ts`];
        // a message is shown when it arrives (new timestamp), not the old one on page load
        if (ts !== prevState.values[`${oid}.ts`] && prevState.values[`${oid}.ts`] !== undefined) {
            if (typeof text === 'string' && text) {
                this.showToast(text);
            }
        }
    }

    private showToast(text: string): void {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        this.setState({ zhToast: text });
        this.toastTimer = setTimeout(() => this.setState({ zhToast: '' }), TOAST_MS);
    }

    private onRequest = (e: Event): void => {
        const req = (e as CustomEvent<PinRequest>).detail;
        if (!req || this.props.editMode) {
            return;
        }
        e.preventDefault();
        const oidZiel = this.state.rxData.oidZiel || PIN_DEFAULTS.oidZiel;
        // the target first: script B reads it when the entry arrives
        this.props.context.setValue(oidZiel, req.ziel);
        this.setState({ zhRequest: req });
    };

    private onComplete = (entry: string): void => {
        const oidEingabe = this.state.rxData.oidEingabe || PIN_DEFAULTS.oidEingabe;
        this.props.context.setValue(oidEingabe, entry);
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const req = this.state.zhRequest;
        return (
            <>
                {this.props.editMode ? (
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            boxSizing: 'border-box',
                            border: `1px dashed ${v('st-off-bd')}`,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: fonts.text,
                            fontSize: 12,
                            color: v('text-2'),
                        }}
                    >
                        PIN-Dialog
                    </div>
                ) : null}
                {req ? (
                    <PinPad
                        title={req.titel}
                        hint={d.hinweis || ZuhausePin.t('pin_hint')}
                        digits={Math.max(4, Math.min(8, Number(d.stellen) || PIN_DIGITS_DEFAULT))}
                        onComplete={this.onComplete}
                        onClose={() => this.setState({ zhRequest: null })}
                    />
                ) : null}
                {this.state.zhToast ? <Toast text={this.state.zhToast} /> : null}
            </>
        );
    }
}
