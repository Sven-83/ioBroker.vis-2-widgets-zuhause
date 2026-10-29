/*
 * VIS-2 widget "Schul-Liste": substitution plan of the selected classes (hand-over 5.4, 10.1 no. 5).
 * Data: script C (vertretungsplan) writes per day titel, stand, hinweise and vertretungen (JSON).
 * The class chips write the selection as JSON array to oidKlassen; script C filters by it,
 * the widget filters once more so it stays right while the script has not answered yet.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { ViewPopup } from '../components/Overlays';
import { Icon } from '../components/Icon';
import {
    classList,
    normClass,
    notesLine,
    parseJsonArray,
    planDate,
    rowInfo,
    rowsForClasses,
    standShort,
    toggleClass,
    type Vertretung,
} from '../lib/model';
import { ensureStyles, fonts, v } from '../lib/theme';
import { PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';

interface SchuleRxData {
    titel: string;
    schule: string;
    klassen: string;
    oidKlassen: string;
    maxZeilen: number;
    hinweiseMax: number;
    popupView: string;
    popupTitel: string;
    popupBreite: number;
    popupHoehe: number;
    animationStufe: string;
    nachtAus: boolean;
    oidVertretungen1: string;
    oidVertretungen2: string;
    oidTitel1: string;
    oidTitel2: string;
    oidStand1: string;
    oidStand2: string;
    oidHinweise1: string;
    oidHinweise2: string;
}

interface SchuleState extends VisRxWidgetState {
    zhTag: 1 | 2;
    /** selection without oidKlassen (kept only in this browser) */
    zhLocal: string[] | null;
    zhPopup: boolean;
    /** restarts the highlight animation when the list of the shown day changed */
    zhFlash: number;
}

const LOCAL_KEY = 'vis-2-widgets-zuhause.schule.klassen';

function readLocal(): string[] | null {
    try {
        const raw = window.localStorage.getItem(LOCAL_KEY);
        return raw ? parseJsonArray<string>(raw) : null;
    } catch {
        return null;
    }
}

export default class ZuhauseSchule extends (window.visRxWidget as typeof VisRxWidget)<SchuleRxData, SchuleState> {
    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhTag: 1, zhLocal: null, zhPopup: false, zhFlash: 0 };
    }

    static getWidgetInfo(): RxWidgetInfo {
        const day = (n: 1 | 2): RxWidgetInfo['visAttrs'][number] => ({
            name: `tag${n}`,
            label: `group_day${n}`,
            fields: [
                {
                    name: `oidVertretungen${n}`,
                    type: 'id',
                    label: 'oid_substitutions',
                    tooltip: 'oid_substitutions_tip',
                },
                { name: `oidTitel${n}`, type: 'id', label: 'oid_plan_title' },
                { name: `oidStand${n}`, type: 'id', label: 'oid_plan_time' },
                { name: `oidHinweise${n}`, type: 'id', label: 'oid_notes' },
            ],
        });
        return {
            id: 'tplZuhauseSchule',
            ...SET_INFO,
            visName: 'ZuhauseSchule',
            visWidgetLabel: 'schule_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        { name: 'titel', type: 'text', label: 'title', default: 'Schule heute' },
                        { name: 'schule', type: 'text', label: 'school', tooltip: 'school_tip' },
                        { name: 'klassen', type: 'text', label: 'classes', tooltip: 'classes_tip', default: '5a' },
                        { name: 'oidKlassen', type: 'id', label: 'oid_classes', tooltip: 'oid_classes_tip' },
                        { name: 'maxZeilen', type: 'number', label: 'max_rows', default: 6, min: 1, max: 20 },
                        { name: 'hinweiseMax', type: 'number', label: 'max_notes', default: 3, min: 0, max: 10 },
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
                    ],
                },
                day(1),
                day(2),
                {
                    name: 'popup',
                    label: 'group_popup',
                    fields: [
                        {
                            name: 'popupView',
                            type: 'select-views',
                            label: 'plan_view',
                            tooltip: 'plan_view_tip',
                            multiple: false,
                        },
                        { name: 'popupTitel', type: 'text', label: 'popup_title', default: 'Vertretungsplan' },
                        { name: 'popupBreite', type: 'number', label: 'popup_width', default: 1100 },
                        { name: 'popupHoehe', type: 'number', label: 'popup_height', default: 760 },
                    ],
                },
            ] as RxWidgetInfo['visAttrs'],
            visDefaultStyle: { width: 360, height: 420 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-schule.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseSchule.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        this.setState({ zhLocal: readLocal() });
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: typeof this.state): void {
        super.componentDidUpdate(prevProps, prevState);
        const oid = this.state.rxData[`oidVertretungen${this.state.zhTag}`];
        if (!oid || prevState.zhTag !== this.state.zhTag) {
            return;
        }
        const before = prevState.values[`${oid}.val`];
        const now = this.state.values[`${oid}.val`];
        if (before !== undefined && before !== now) {
            this.setState(s => ({ zhFlash: s.zhFlash + 1 }));
        }
    }

    private selected(): string[] {
        const d = this.state.rxData;
        if (d.oidKlassen) {
            return parseJsonArray<string>(this.state.values[`${d.oidKlassen}.val`]);
        }
        return this.state.zhLocal ?? classList(d.klassen).slice(0, 1);
    }

    private toggle(klasse: string): void {
        if (this.props.editMode) {
            return;
        }
        const d = this.state.rxData;
        const next = toggleClass(this.selected(), klasse, classList(d.klassen));
        if (d.oidKlassen) {
            this.props.context.setValue(d.oidKlassen, JSON.stringify(next));
        } else {
            try {
                window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
            } catch {
                // private mode: the selection lives until the page reloads
            }
            this.setState({ zhLocal: next });
        }
    }

    private static chip(text: string, selected: boolean, onClick: () => void, key: string): React.JSX.Element {
        return (
            <button
                key={key}
                type="button"
                className="zh-btn"
                aria-pressed={selected}
                onClick={onClick}
                style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 999,
                    border: selected ? 0 : '1px solid #4a4a50',
                    background: selected ? v('text') : 'transparent',
                    color: selected ? '#1f1f22' : v('sw-off-fg'),
                    fontSize: 13,
                    fontWeight: 600,
                }}
            >
                {text}
            </button>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const lang = ZuhauseSchule.getLanguage();
        const tag = d.oidVertretungen2 ? this.state.zhTag : 1;
        const val = (oid: string | undefined): unknown => (oid ? this.state.values[`${oid}.val`] : undefined);
        const selected = this.selected();
        const selectedNorm = selected.map(normClass);
        const all = rowsForClasses(parseJsonArray<Vertretung>(val(d[`oidVertretungen${tag}`])), selected);
        const max = Math.max(1, Number(d.maxZeilen) || 6);
        const rows = all.slice(0, max);
        const notesMax =
            d.hinweiseMax === undefined || (d.hinweiseMax as unknown) === '' ? 3 : Number(d.hinweiseMax) || 0;
        const notes = notesMax
            ? notesLine(parseJsonArray<{ k?: string; v?: string }>(val(d[`oidHinweise${tag}`])), notesMax)
            : '';
        const titleDate = planDate(val(d[`oidTitel${tag}`]));
        const stand = standShort(val(d[`oidStand${tag}`]), new Date());
        const sub = [d.schule, titleDate, stand ? `Stand ${stand}` : ''].filter(Boolean).join(' · ');
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date());

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
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    fontFamily: fonts.text,
                    color: v('text'),
                    overflow: 'hidden',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon
                        name="schule"
                        on
                        size={22}
                        color="#8fb8c8"
                    />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{d.titel}</span>
                        <span
                            style={{
                                fontSize: 12,
                                color: v('text-2'),
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {sub}
                        </span>
                    </div>
                </div>

                {d.oidVertretungen2 ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                        {([1, 2] as const).map(n =>
                            ZuhauseSchule.chip(
                                planDate(val(d[`oidTitel${n}`])) ||
                                    (n === 1 ? ZuhauseSchule.t('day1') : ZuhauseSchule.t('day2')),
                                tag === n,
                                () => this.setState({ zhTag: n }),
                                `tag${n}`,
                            ),
                        )}
                    </div>
                ) : null}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {classList(d.klassen).map(k =>
                        ZuhauseSchule.chip(k, selectedNorm.includes(normClass(k)), () => this.toggle(k), `k-${k}`),
                    )}
                </div>

                <div
                    key={this.state.zhFlash}
                    className={this.state.zhFlash > 0 && motionAllowed(levelClass) ? 'zh-a-flash' : undefined}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, overflow: 'hidden' }}
                >
                    {rows.map((r, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                background: r.entfall ? '#3a2324' : '#323237',
                                border: `1px solid ${r.entfall ? '#5a3335' : v('border')}`,
                                borderRadius: 12,
                                padding: '8px 12px',
                            }}
                        >
                            <span style={{ fontFamily: fonts.numbers, fontSize: 20, fontWeight: 600, minWidth: 40 }}>
                                {r.stunde}
                            </span>
                            <span style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                                <b>{r.klasse}</b> · {r.fach}
                                {r.lehrer ? (
                                    <span style={{ color: r.entfall ? '#c9b3b3' : v('text-2') }}> ({r.lehrer})</span>
                                ) : null}
                            </span>
                            <span
                                style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: r.entfall ? '#ff9d9d' : v('sw-off-fg'),
                                    textAlign: 'right',
                                    maxWidth: '45%',
                                }}
                            >
                                {rowInfo(r, lang)}
                            </span>
                        </div>
                    ))}
                    {all.length > rows.length ? (
                        <span style={{ fontSize: 12, color: v('text-2') }}>
                            +{all.length - rows.length} {ZuhauseSchule.t('more')}
                        </span>
                    ) : null}
                    {!rows.length ? (
                        <div
                            style={{
                                border: '1px dashed #4a4a50',
                                borderRadius: 12,
                                padding: 12,
                                fontSize: 13,
                                color: v('text-2'),
                                textAlign: 'center',
                            }}
                        >
                            {selected.length ? ZuhauseSchule.t('no_changes') : ZuhauseSchule.t('no_class')}
                        </div>
                    ) : null}
                </div>

                {notes ? <span style={{ fontSize: 12, color: v('text-2'), lineHeight: 1.4 }}>{notes}</span> : null}

                {d.popupView ? (
                    <button
                        type="button"
                        className="zh-btn"
                        onClick={() => !this.props.editMode && this.setState({ zhPopup: true })}
                        style={{
                            marginTop: 'auto',
                            height: 38,
                            flexShrink: 0,
                            borderRadius: 12,
                            border: '1px solid #4a4a50',
                            background: 'transparent',
                            color: v('text'),
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        {ZuhauseSchule.t('open_plan')}
                    </button>
                ) : null}

                {this.state.zhPopup && d.popupView ? (
                    <ViewPopup
                        title={d.popupTitel}
                        content={this.getWidgetView(d.popupView)}
                        width={Number(d.popupBreite) || 1100}
                        height={Number(d.popupHoehe) || 760}
                        autoCloseS={0}
                        onClose={() => this.setState({ zhPopup: false })}
                    />
                ) : null}
            </section>
        );
    }
}
