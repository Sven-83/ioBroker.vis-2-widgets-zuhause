/*
 * Popup of the Christmas lights (long press on the tile): one row per circuit with its real state and
 * an on/off button (the icon switches too); the tree has the switch "Saison" in its row (out of season:
 * hidden on the tile, its run times rest and are shown greyed). Below the timer: circuit, weekday, a 24 h bar and the list of run times.
 * Editing covers the timer area: days (several at once), start as time or sunset ± minutes,
 * end as time or "not set" (= 23:00). Plus/minus instead of a keyboard, holding repeats faster.
 * Closes after 60 s without input (editing needs longer than the 5 s of the switch popups).
 */
import React from 'react';

import {
    applyDraft,
    DAY_NAMES,
    DAYS,
    daysText,
    daysWith,
    endMin,
    fmtHm,
    MAX_SUN_OFFSET,
    minuteOfDay,
    newDraft,
    type Draft,
    type Entry,
    type KreisKey,
    type Plan,
    removeEntry,
    signed,
    sortDay,
    startMin,
    SUN_STEP,
    toDraft,
    validOn,
    weekdayIndex,
    windowsOf,
} from '../lib/weihnacht';
import { v } from '../lib/theme';
import { Frame, useAutoClose } from './ControlPopups';
import { ScrollPfeile } from './ScrollPfeile';
import { KreisIcon, MiniIcon, SunsetIcon } from './WeihnachtIcons';

export const WEIHNACHT_CLOSE_MS = 60_000;

export interface WeihnachtKreis {
    /** index in KREISE (the widget may leave out circuits without a switch) */
    idx: number;
    key: KreisKey;
    name: string;
    short: string;
    /** only for seasonal circuits (tree): confirmed value of <kreis>.saison */
    saison?: boolean;
    saisonPending?: boolean;
    on: boolean;
    online: boolean;
    pending: boolean;
    unconfirmed: boolean;
    status: string;
    plan: Plan;
    /** saved run times wait for the confirmation of the script */
    planPending: boolean;
}

export interface WeihnachtPopupProps {
    kreise: WeihnachtKreis[];
    sunsets: (number | null)[];
    now: Date;
    motion: boolean;
    onSwitch: (index: number, on: boolean) => void;
    onSave: (index: number, plan: Plan) => void;
    onSaison: (index: number, on: boolean) => void;
    onClose: () => void;
}

interface Edit {
    idx: number;
    orig: Entry | null;
    draft: Draft;
    days: Set<number>;
}

const btnOff: React.CSSProperties = {
    background: v('sw-off-bg'),
    border: `1px solid ${v('sw-off-bd')}`,
    color: v('sw-off-fg'),
};
const btnOn: React.CSSProperties = { background: v('sw-on'), border: `1px solid ${v('sw-on')}`, color: v('sw-on-fg') };
const btn = (on: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
    height: 44,
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
    ...(on ? btnOn : btnOff),
    ...extra,
});

/** button that repeats while it is held (plus / minus) */
function Hold({
    label,
    onStep,
    style,
    children,
}: {
    label: string;
    onStep: () => void;
    style: React.CSSProperties;
    children: React.ReactNode;
}): React.JSX.Element {
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const step = React.useRef(onStep);
    React.useLayoutEffect(() => {
        step.current = onStep;
    });
    const stop = (): void => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = undefined;
        }
    };
    React.useEffect(() => stop, []);
    const start = (e: React.PointerEvent): void => {
        e.preventDefault();
        stop();
        let n = 0;
        const run = (): void => {
            step.current();
            n++;
            timer.current = setTimeout(run, n < 4 ? 350 : n < 12 ? 120 : 50);
        };
        run();
    };
    return (
        <button
            type="button"
            className="zh-btn"
            aria-label={label}
            onPointerDown={start}
            onPointerUp={stop}
            onPointerLeave={stop}
            onPointerCancel={stop}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && step.current()}
            style={style}
        >
            {children}
        </button>
    );
}

function Segment<T extends string>({
    options,
    value,
    onPick,
}: {
    options: { value: T; label: string }[];
    value: T;
    onPick: (v: T) => void;
}): React.JSX.Element {
    return (
        <span style={{ display: 'flex', border: `1px solid ${v('sw-off-bd')}`, borderRadius: 8, overflow: 'hidden' }}>
            {options.map((o, i) => (
                <button
                    key={o.value}
                    type="button"
                    className="zh-btn"
                    aria-pressed={o.value === value}
                    onClick={() => onPick(o.value)}
                    style={{
                        height: 26,
                        padding: '0 7px',
                        border: 0,
                        borderLeft: i ? `1px solid ${v('sw-off-bd')}` : 0,
                        background: o.value === value ? '#5a4a26' : v('sw-off-bg'),
                        color: o.value === value ? '#ffd98a' : v('sw-off-fg'),
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                    }}
                >
                    {o.label}
                </button>
            ))}
        </span>
    );
}

function TimeWheel({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (min: number) => void;
}): React.JSX.Element {
    const step = (delta: number): void => onChange((((value + delta) % 1440) + 1440) % 1440);
    const col = (part: 'h' | 'm'): React.JSX.Element => {
        const delta = part === 'h' ? 60 : 1;
        const style = btn(false, { width: 52, height: 32, fontSize: 15 });
        return (
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <Hold
                    label={`${label} ${part === 'h' ? 'Stunde' : 'Minute'} plus`}
                    onStep={() => step(delta)}
                    style={style}
                >
                    ▲
                </Hold>
                <span style={{ fontSize: 28, fontWeight: 600, width: 52, textAlign: 'center', lineHeight: '32px' }}>
                    {part === 'h' ? fmtHm(value).slice(0, 2) : fmtHm(value).slice(3)}
                </span>
                <Hold
                    label={`${label} ${part === 'h' ? 'Stunde' : 'Minute'} minus`}
                    onStep={() => step(-delta)}
                    style={style}
                >
                    ▼
                </Hold>
            </span>
        );
    };
    return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            {col('h')}
            <span style={{ fontSize: 26, fontWeight: 600, color: v('text-2') }}>:</span>
            {col('m')}
        </span>
    );
}

function DayBar({
    list,
    sunset,
    nowMin,
}: {
    list: Entry[];
    sunset: number | null;
    nowMin: number | null;
}): React.JSX.Element {
    const w = windowsOf(list, sunset);
    return (
        <div style={{ position: 'relative', height: 26, marginTop: 9 }}>
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 4,
                    height: 12,
                    borderRadius: 6,
                    background: '#1d1d20',
                    border: `1px solid ${v('border')}`,
                    overflow: 'hidden',
                }}
            >
                {w.map(x => (
                    <div
                        key={`${x.start}-${x.end}`}
                        className="zh-wn-grow"
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${x.start / 14.4}%`,
                            width: `${(x.end - x.start) / 14.4}%`,
                            background: 'linear-gradient(90deg, #f2c14e, #ffd977)',
                            borderRadius: 4,
                        }}
                    />
                ))}
            </div>
            {nowMin !== null ? (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: `calc(${nowMin / 14.4}% - 1px)`,
                        width: 2,
                        height: 20,
                        background: '#fff',
                        boxShadow: '0 0 6px #fff',
                        borderRadius: 1,
                    }}
                />
            ) : null}
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 17,
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 9,
                    color: '#77756e',
                }}
            >
                {[0, 6, 12, 18, 24].map(h => (
                    <span key={h}>{h}</span>
                ))}
            </div>
        </div>
    );
}

export function WeihnachtPopup(p: WeihnachtPopupProps): React.JSX.Element {
    const restart = useAutoClose(p.onClose, 'weihnacht');
    const today = weekdayIndex(p.now);
    const [sel, setSel] = React.useState(0);
    const [day, setDay] = React.useState(today);
    const [edit, setEdit] = React.useState<Edit | null>(null);
    const touch = (): void => restart(WEIHNACHT_CLOSE_MS);
    const listRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => restart(WEIHNACHT_CLOSE_MS), [restart]);

    const k = p.kreise[Math.min(sel, p.kreise.length - 1)];
    /** seasonal circuit out of season: its run times rest, shown greyed (still editable) */
    const resting = k.saison === false;
    const restStyle: React.CSSProperties = resting
        ? { opacity: 0.38, filter: 'grayscale(1)', transition: 'opacity .3s' }
        : { transition: 'opacity .3s' };
    const list = k.plan.tage[day];
    const sun = p.sunsets[day];
    const nowMin = minuteOfDay(p.now);

    const openEdit = (idx: number): void => {
        const orig = list[idx];
        setEdit({ idx, orig, draft: toDraft(orig), days: daysWith(k.plan, orig) });
    };
    const setDraft = (d: Partial<Draft>): void => setEdit(e => (e ? { ...e, draft: { ...e.draft, ...d } } : e));
    const invalidDays = edit ? [...edit.days].filter(d => !validOn(edit.draft, p.sunsets[d])) : [];
    const save = (): void => {
        if (!edit || invalidDays.length) {
            return;
        }
        let plan = applyDraft(k.plan, day, edit.idx, edit.orig, edit.draft, edit.days);
        plan = { v: 1, tage: plan.tage.map((l, d) => sortDay(l, p.sunsets[d])) };
        p.onSave(k.idx, plan);
        setEdit(null);
    };

    // ---------------------------------------------------------------- rows: switch per circuit
    const rows = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {p.kreise.map(c => (
                <div
                    key={c.key}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: c.saison !== undefined ? '44px 1fr auto 104px' : '44px 1fr 104px',
                        gap: 10,
                        alignItems: 'center',
                        height: 44,
                    }}
                >
                    <button
                        type="button"
                        className={`zh-btn${c.on && p.motion ? ' zh-wn-on' : ''}`}
                        aria-label={`${c.name} ${c.on ? 'aus' : 'ein'}schalten`}
                        disabled={!c.online || c.pending}
                        onClick={() => {
                            touch();
                            p.onSwitch(c.idx, !c.on);
                        }}
                        style={{
                            width: 44,
                            height: 44,
                            padding: 0,
                            borderRadius: 11,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            ...(c.on ? btnOn : btnOff),
                            ...(c.online
                                ? null
                                : {
                                      background: v('warn-bg'),
                                      border: `1.5px solid ${v('warn-bd')}`,
                                      color: v('warn-fg'),
                                  }),
                        }}
                    >
                        <KreisIcon
                            kreis={c.key}
                            on={c.on}
                            size={30}
                        />
                    </button>
                    <span style={{ display: 'flex', flexDirection: 'column', fontSize: 15, fontWeight: 600 }}>
                        {c.name}
                        <span
                            style={{
                                fontSize: 11.5,
                                color: c.unconfirmed ? v('warn-fg') : v('text-2'),
                                fontWeight: 500,
                            }}
                        >
                            {c.unconfirmed ? 'nicht bestätigt' : c.status}
                        </span>
                    </span>
                    {c.saison !== undefined ? (
                        <button
                            type="button"
                            className="zh-btn"
                            aria-pressed={c.saison}
                            aria-label={`${c.name}: Saison`}
                            disabled={c.saisonPending}
                            onClick={() => {
                                touch();
                                p.onSaison(c.idx, !c.saison);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                height: 42,
                                padding: '0 10px 0 9px',
                                borderRadius: 12,
                                border: `1px solid ${c.saison ? '#6b5a2c' : v('sw-off-bd')}`,
                                background: 'transparent',
                                color: c.saison ? v('text') : v('text-2'),
                                fontSize: 12,
                                fontWeight: 600,
                                fontFamily: 'inherit',
                                textAlign: 'left',
                                cursor: 'pointer',
                                opacity: c.saisonPending ? 0.6 : 1,
                            }}
                        >
                            <span
                                style={{
                                    position: 'relative',
                                    flex: 'none',
                                    width: 30,
                                    height: 18,
                                    borderRadius: 9,
                                    background: c.saison ? v('sw-on') : '#44444a',
                                    transition: 'background .25s',
                                }}
                            >
                                <span
                                    style={{
                                        position: 'absolute',
                                        left: 2,
                                        top: 2,
                                        width: 14,
                                        height: 14,
                                        borderRadius: '50%',
                                        background: c.saison ? '#fff' : '#cfccc3',
                                        transform: c.saison ? 'translateX(12px)' : undefined,
                                        transition: 'transform .25s, background .25s',
                                    }}
                                />
                            </span>
                            <span>
                                Saison
                                <small
                                    style={{
                                        display: 'block',
                                        fontSize: 9.5,
                                        color: '#77756e',
                                        fontWeight: 500,
                                        lineHeight: 1.1,
                                    }}
                                >
                                    {c.saisonPending ? '…' : c.saison ? 'Startseite + Uhr' : 'ausgeblendet'}
                                </small>
                            </span>
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="zh-btn"
                        aria-pressed={c.on}
                        aria-label={c.name}
                        disabled={!c.online || c.pending}
                        onClick={() => {
                            touch();
                            p.onSwitch(c.idx, !c.on);
                        }}
                        style={btn(c.on, {
                            width: 104,
                            height: 42,
                            opacity: c.online ? 1 : 0.38,
                            ...(c.unconfirmed ? { border: `2px solid ${v('warn-bd')}` } : null),
                        })}
                    >
                        {c.pending ? '…' : c.on ? 'Ein' : 'Aus'}
                    </button>
                </div>
            ))}
        </div>
    );

    // ---------------------------------------------------------------- list of run times
    const listView = (
        <div style={{ display: 'flex', gap: 8 }}>
            <div
                ref={listRef}
                style={{
                    flex: 1,
                    minWidth: 0,
                    height: 140,
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    scrollbarWidth: 'thin',
                }}
            >
                {list.length ? (
                    list.map((e, i) => {
                        const s = startMin(e, sun);
                        const runs = day === today && s !== null && s <= nowMin && nowMin < endMin(e);
                        return (
                            <div
                                key={`${i}-${e.start}-${e.sonne}-${e.ende}`}
                                className="zh-wn-in"
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 44px 44px',
                                    gap: 8,
                                    height: 44,
                                    marginBottom: 6,
                                }}
                            >
                                <button
                                    type="button"
                                    className="zh-btn"
                                    onClick={() => openEdit(i)}
                                    style={{
                                        ...btn(false),
                                        background: '#303035',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '0 14px',
                                        fontSize: 17,
                                        color: v('text'),
                                    }}
                                >
                                    {e.sonne !== undefined ? (
                                        <>
                                            <span style={{ color: '#ffb35c', display: 'flex' }}>
                                                <SunsetIcon />
                                            </span>
                                            {s !== null ? fmtHm(s) : ''}
                                            <small style={{ fontSize: 11, color: v('text-2'), fontWeight: 500 }}>
                                                Sonnenunterg. {signed(e.sonne)}
                                            </small>
                                        </>
                                    ) : (
                                        e.start
                                    )}
                                    {' – '}
                                    {fmtHm(endMin(e))}
                                    {e.ende === undefined ? (
                                        <small style={{ fontSize: 11, color: v('text-2'), fontWeight: 500 }}>
                                            Standard
                                        </small>
                                    ) : null}
                                    {runs ? (
                                        <span
                                            style={{
                                                marginLeft: 'auto',
                                                fontSize: 11,
                                                color: v('st-led'),
                                                fontWeight: 600,
                                            }}
                                        >
                                            ● läuft
                                        </span>
                                    ) : null}
                                </button>
                                <button
                                    type="button"
                                    className="zh-btn"
                                    aria-label="Bearbeiten"
                                    onClick={() => openEdit(i)}
                                    style={btn(false, { fontSize: 17 })}
                                >
                                    ✎
                                </button>
                                <button
                                    type="button"
                                    className="zh-btn"
                                    aria-label="Löschen"
                                    onClick={() => p.onSave(k.idx, removeEntry(k.plan, day, i))}
                                    style={btn(false, { fontSize: 17, color: '#ff9b9b' })}
                                >
                                    🗑
                                </button>
                            </div>
                        );
                    })
                ) : (
                    <div style={{ color: v('text-2'), fontSize: 13, padding: '12px 2px' }}>
                        Keine Laufzeit an diesem Tag.
                    </div>
                )}
                <button
                    type="button"
                    className="zh-btn"
                    onClick={() => setEdit({ idx: -1, orig: null, draft: newDraft(), days: new Set([day]) })}
                    style={btn(false, { width: '100%', height: 36, fontSize: 13 })}
                >
                    ＋ Laufzeit hinzufügen
                </button>
            </div>

            <ScrollPfeile
                target={listRef}
                onUse={touch}
            />
        </div>
    );

    // ---------------------------------------------------------------- editor
    let editor: React.JSX.Element | null = null;
    if (edit) {
        const d = edit.draft;
        const s = startMin(d, sun);
        let note = 'Gedrückt halten zählt schnell.';
        if (d.su) {
            note =
                sun === null
                    ? 'Sonnenuntergang unbekannt (Standort fehlt).'
                    : `Sonnenuntergang ${DAYS[day]} ${fmtHm(sun)}, wandert täglich mit.`;
        }
        if (invalidDays.length) {
            note =
                s !== null && endMin(d) <= s
                    ? 'Ende muss nach dem Start liegen, Laufzeiten gehen nie über Mitternacht.'
                    : `Am ${invalidDays.map(x => DAYS[x]).join(', ')} liegt das Ende vor dem Start.`;
        }
        const box: React.CSSProperties = {
            height: 150,
            boxSizing: 'border-box',
            border: `1px solid ${v('sw-off-bd')}`,
            borderRadius: 14,
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
        };
        const top = (cap: string, seg: React.ReactNode): React.JSX.Element => (
            <span
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    height: 26,
                }}
            >
                <span style={{ fontSize: 11, color: v('text-2'), letterSpacing: '0.08em', fontWeight: 600 }}>
                    {cap}
                </span>
                {seg}
            </span>
        );
        const chip = (on: boolean): React.CSSProperties => ({
            ...btn(on, { width: 44, height: 34, fontSize: 13, borderRadius: 9 }),
        });
        const preset = (days: number[], label: string, first = false): React.JSX.Element => (
            <button
                type="button"
                className="zh-btn"
                onClick={() => setEdit({ ...edit, days: new Set(days) })}
                style={{
                    height: 34,
                    padding: '0 9px',
                    borderRadius: 9,
                    border: '1px dashed #55555c',
                    background: 'transparent',
                    color: v('text-2'),
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    marginLeft: first ? 'auto' : undefined,
                }}
            >
                {label}
            </button>
        );
        editor = (
            <div
                className="zh-wn-in"
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: v('card'),
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    zIndex: 5,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                        style={{
                            fontSize: 11,
                            color: v('text-2'),
                            letterSpacing: '0.08em',
                            fontWeight: 600,
                            width: 30,
                        }}
                    >
                        FÜR
                    </span>
                    {DAYS.map((name, i) => (
                        <button
                            key={name}
                            type="button"
                            className="zh-btn"
                            aria-pressed={edit.days.has(i)}
                            onClick={() => {
                                const days = new Set(edit.days);
                                if (days.has(i) && days.size > 1) {
                                    days.delete(i);
                                } else {
                                    days.add(i);
                                }
                                setEdit({ ...edit, days });
                            }}
                            style={chip(edit.days.has(i))}
                        >
                            {name}
                        </button>
                    ))}
                    {preset([0, 1, 2, 3, 4], 'Mo–Fr', true)}
                    {preset([5, 6], 'Sa+So')}
                    {preset([0, 1, 2, 3, 4, 5, 6], 'Alle')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 96px', gap: 10 }}>
                    <div style={box}>
                        {top(
                            'VON',
                            <Segment
                                options={[
                                    { value: 'uhr', label: 'Uhrzeit' },
                                    { value: 'su', label: 'Sonnenuntergang' },
                                ]}
                                value={d.su ? 'su' : 'uhr'}
                                onPick={m => setDraft(m === 'su' ? { su: true } : { su: false, von: s ?? d.von })}
                            />,
                        )}
                        {d.su ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16 }}>
                                <Hold
                                    label="früher"
                                    onStep={() => setDraft({ off: Math.max(-MAX_SUN_OFFSET, d.off - SUN_STEP) })}
                                    style={btn(false, { width: 50, height: 50, fontSize: 22 })}
                                >
                                    −
                                </Hold>
                                <span style={{ width: 82, textAlign: 'center' }}>
                                    <span style={{ color: '#ffb35c', display: 'flex', justifyContent: 'center' }}>
                                        <SunsetIcon size={26} />
                                    </span>
                                    <b style={{ display: 'block', fontSize: 21, fontWeight: 600 }}>
                                        {signed(d.off)} min
                                    </b>
                                    <small style={{ fontSize: 11, color: v('text-2') }}>
                                        {DAYS[day]} {s !== null ? fmtHm(s) : '–'}
                                    </small>
                                </span>
                                <Hold
                                    label="später"
                                    onStep={() => setDraft({ off: Math.min(MAX_SUN_OFFSET, d.off + SUN_STEP) })}
                                    style={btn(false, { width: 50, height: 50, fontSize: 22 })}
                                >
                                    +
                                </Hold>
                            </span>
                        ) : (
                            <TimeWheel
                                label="Von"
                                value={d.von}
                                onChange={von => setDraft({ von })}
                            />
                        )}
                    </div>
                    <div style={box}>
                        {top(
                            'BIS',
                            <Segment
                                options={[
                                    { value: 'frei', label: 'nicht eingestellt' },
                                    { value: 'uhr', label: 'Uhrzeit' },
                                ]}
                                value={d.frei ? 'frei' : 'uhr'}
                                onPick={m => setDraft(m === 'frei' ? { frei: true } : { frei: false, bis: d.bis })}
                            />,
                        )}
                        {d.frei ? (
                            <span style={{ textAlign: 'center', marginTop: 22 }}>
                                <b style={{ display: 'block', fontSize: 28, fontWeight: 600 }}>23:00</b>
                                <small style={{ fontSize: 11, color: v('text-2') }}>
                                    Standard, wenn kein Ende eingestellt ist
                                </small>
                            </span>
                        ) : (
                            <TimeWheel
                                label="Bis"
                                value={d.bis}
                                onChange={bis => setDraft({ bis })}
                            />
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                            type="button"
                            className="zh-btn"
                            disabled={invalidDays.length > 0}
                            onClick={save}
                            style={btn(true, { height: 71, opacity: invalidDays.length ? 0.35 : 1 })}
                        >
                            Fertig
                        </button>
                        <button
                            type="button"
                            className="zh-btn"
                            onClick={() => setEdit(null)}
                            style={btn(false, { height: 71 })}
                        >
                            Abbrechen
                        </button>
                    </div>
                </div>
                <span style={{ fontSize: 11.5, color: invalidDays.length ? v('warn-fg') : v('text-2') }}>
                    {note} Gilt für: <b style={{ color: v('text') }}>{daysText(edit.days)}</b>
                </span>
            </div>
        );
    }

    return (
        <Frame
            kind="WEIHNACHTSBELEUCHTUNG"
            title="Schalten und Zeitschaltuhr"
            label="Weihnachtsbeleuchtung"
            onClose={p.onClose}
            width={590}
            hint="Hand gilt bis zum nächsten Ausschaltpunkt, ohne Laufzeit bis 23:00 · 23–7 Uhr: 15-min-Timer · schließt nach 60 s"
        >
            <div
                onPointerDownCapture={touch}
                onKeyDownCapture={touch}
                style={{ display: 'flex', flexDirection: 'column', marginTop: -8 }}
            >
                {rows}
                <div style={{ height: 1, background: v('border'), margin: '6px 0 5px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                        Zeitschaltuhr
                        <small style={{ color: v('text-2'), fontWeight: 500, marginLeft: 6 }}>
                            {DAY_NAMES[day]}
                            {k.planPending ? ' · wird gespeichert …' : ''}
                        </small>
                    </span>
                    <span
                        style={{
                            display: 'flex',
                            border: `1px solid ${v('sw-off-bd')}`,
                            borderRadius: 11,
                            overflow: 'hidden',
                        }}
                    >
                        {p.kreise.map((c, i) => (
                            <button
                                key={c.key}
                                type="button"
                                className="zh-btn"
                                aria-pressed={i === sel}
                                onClick={() => {
                                    setSel(i);
                                    setEdit(null);
                                }}
                                style={{
                                    height: 36,
                                    padding: '0 12px',
                                    border: 0,
                                    borderLeft: i ? `1px solid ${v('sw-off-bd')}` : 0,
                                    background: i === sel ? '#46443c' : v('sw-off-bg'),
                                    color: i === sel ? v('text') : v('sw-off-fg'),
                                    fontSize: 13,
                                    fontWeight: 600,
                                    fontFamily: 'inherit',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                <MiniIcon
                                    kreis={c.key}
                                    size={15}
                                />
                                {c.short}
                            </button>
                        ))}
                    </span>
                </div>
                <div style={{ position: 'relative', height: 221 }}>
                    {resting && !edit ? (
                        <span
                            className="zh-wn-in"
                            style={{
                                position: 'absolute',
                                left: '50%',
                                top: 92,
                                transform: 'translateX(-50%)',
                                zIndex: 4,
                                background: '#3a382f',
                                border: '1px solid #6b5a2c',
                                color: '#ffd98a',
                                fontSize: 12,
                                fontWeight: 600,
                                padding: '7px 12px',
                                borderRadius: 10,
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none',
                            }}
                        >
                            Zeitschaltuhr ruht · Saison beim {k.name} einschalten
                        </span>
                    ) : null}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: 6,
                            marginTop: 8,
                            ...restStyle,
                        }}
                    >
                        {DAYS.map((name, i) => (
                            <button
                                key={name}
                                type="button"
                                className="zh-btn"
                                aria-pressed={i === day}
                                onClick={() => {
                                    setDay(i);
                                    setEdit(null);
                                }}
                                style={{
                                    ...btn(false, { height: 38, borderRadius: 10, fontSize: 14, position: 'relative' }),
                                    ...(i === day
                                        ? { border: `1px solid ${v('sw-on')}`, color: v('text'), background: '#3b382f' }
                                        : null),
                                }}
                            >
                                {name}
                                {i === today ? (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            right: 3,
                                            fontSize: 8,
                                            color: v('text-2'),
                                            fontWeight: 500,
                                        }}
                                    >
                                        heute
                                    </span>
                                ) : null}
                                {k.plan.tage[i].length ? (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            left: '50%',
                                            bottom: 4,
                                            width: 4,
                                            height: 4,
                                            marginLeft: -2,
                                            borderRadius: '50%',
                                            background: v('sw-on'),
                                        }}
                                    />
                                ) : null}
                            </button>
                        ))}
                    </div>
                    <div style={restStyle}>
                        <DayBar
                            key={`${sel}-${day}`}
                            list={list}
                            sunset={sun}
                            nowMin={day === today ? nowMin : null}
                        />
                        {listView}
                    </div>
                    {editor}
                </div>
            </div>
        </Frame>
    );
}
