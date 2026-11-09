/*
 * Popups on long press (hand-over 11.1): brightness of a dimmer, height of a blind, setpoint of the
 * floor heating. They close by themselves: 0.6 s after a quick choice, 1.2 s after the last slider
 * movement, 5 s without any input. Every input restarts the time; "✕" and a tap outside close at once.
 */
import React from 'react';
import { createPortal } from 'react-dom';

import { HAUBE_LEVELS, HAUBE_TIMERS, type HaubePreset, presetLevelWrites, type PresetWrite } from '../lib/haube';
import { formatNumber } from '../lib/model';
import { POPUP_CLOSE_MS } from '../lib/plan';
import { fonts, v } from '../lib/theme';
import { Icon } from './Icon';

/** Timer that closes the popup; restart with the delay of the last input */
function useAutoClose(onClose: () => void): (ms: number) => void {
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // the parent passes a new function on every render (new values arrive while the popup is open);
    // a ref keeps the timer running instead of restarting it with the idle time
    const close = React.useRef(onClose);
    React.useLayoutEffect(() => {
        close.current = onClose;
    });
    const restart = React.useCallback((ms: number): void => {
        if (timer.current) {
            clearTimeout(timer.current);
        }
        timer.current = setTimeout(() => close.current(), ms);
    }, []);
    React.useEffect(() => {
        restart(POPUP_CLOSE_MS.idle);
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                close.current();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            if (timer.current) {
                clearTimeout(timer.current);
            }
        };
    }, [restart]);
    return restart;
}

/** Writes only after the slider rested for a moment, not every intermediate value */
function useDebounced(fn: (n: number) => void, ms = 250): (n: number) => void {
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pending = React.useRef<number | undefined>(undefined);
    const latest = React.useRef(fn);
    React.useLayoutEffect(() => {
        latest.current = fn;
    });
    // the popup may close before the time is up: write the last value then
    React.useEffect(
        () => () => {
            if (timer.current) {
                clearTimeout(timer.current);
            }
            if (pending.current !== undefined) {
                latest.current(pending.current);
            }
        },
        [],
    );
    return React.useCallback(
        (n: number): void => {
            if (timer.current) {
                clearTimeout(timer.current);
            }
            pending.current = n;
            timer.current = setTimeout(() => {
                pending.current = undefined;
                latest.current(n);
            }, ms);
        },
        [ms],
    );
}

function Frame({
    kind,
    title,
    label,
    onClose,
    children,
    width = 360,
    hint = 'Schließt nach dem Verstellen automatisch · ohne Eingabe nach 5 s',
}: {
    kind: string;
    title: string;
    label: string;
    onClose: () => void;
    children: React.ReactNode;
    width?: number;
    /** line at the bottom; empty = none */
    hint?: string;
}): React.JSX.Element {
    return createPortal(
        <div
            onPointerDown={e => e.target === e.currentTarget && onClose()}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2000,
                background: 'rgba(10,10,12,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fonts.text,
                color: v('text'),
            }}
        >
            <div
                role="dialog"
                aria-label={label}
                style={{
                    width,
                    maxWidth: 'calc(100vw - 32px)',
                    boxSizing: 'border-box',
                    background: v('card'),
                    border: `1px solid ${v('sw-off-bd')}`,
                    borderRadius: 22,
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 12, letterSpacing: '0.1em', fontWeight: 600, color: v('text-2') }}>
                            {kind}
                        </span>
                        <span style={{ fontSize: 20, fontWeight: 600 }}>{title}</span>
                    </div>
                    <button
                        type="button"
                        className="zh-btn"
                        aria-label="Schließen"
                        onClick={onClose}
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            border: `1px solid ${v('sw-off-bd')}`,
                            background: v('sw-off-bg'),
                            color: v('text'),
                            fontSize: 18,
                        }}
                    >
                        ✕
                    </button>
                </div>
                {children}
                {hint ? <span style={{ fontSize: 11, color: v('text-2'), textAlign: 'center' }}>{hint}</span> : null}
            </div>
        </div>,
        document.body,
    );
}

function Steps<T extends number>({
    values,
    current,
    label,
    onPick,
}: {
    values: T[];
    current: number;
    label: (v: T) => string;
    onPick: (v: T) => void;
}): React.JSX.Element {
    return (
        <div style={{ display: 'flex', gap: 6 }}>
            {values.map(val => {
                const on = Math.abs(current - val) < 0.01;
                return (
                    <button
                        key={val}
                        type="button"
                        className="zh-btn"
                        aria-pressed={on}
                        onClick={() => onPick(val)}
                        style={{
                            flex: 1,
                            height: 44,
                            borderRadius: 10,
                            border: `1px solid ${on ? v('sw-on') : v('sw-off-bd')}`,
                            background: on ? v('sw-on') : v('sw-off-bg'),
                            color: on ? v('sw-on-fg') : v('sw-off-fg'),
                            fontSize: 13,
                            fontWeight: 600,
                            padding: 0,
                        }}
                    >
                        {label(val)}
                    </button>
                );
            })}
        </div>
    );
}

const sliderStyle: React.CSSProperties = { width: '100%', accentColor: '#f2c14e', height: 32 };

// ---------------------------------------------------------------- dimmer

export function DimmerPopup(p: {
    title: string;
    level: number;
    onLevel: (level: number) => void;
    onOff: () => void;
    onClose: () => void;
}): React.JSX.Element {
    const restart = useAutoClose(p.onClose);
    const writeLater = useDebounced(p.onLevel);
    // starts with the value at opening; the popup shows its own changes (it closes after a few seconds)
    const [level, setLevel] = React.useState(p.level);
    return (
        <Frame
            kind="DIMMER"
            title={p.title}
            label="Helligkeit"
            onClose={p.onClose}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div
                    style={{
                        width: 110,
                        height: 110,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: `radial-gradient(circle, rgba(242,193,78,${(0.15 + (0.85 * level) / 100).toFixed(2)}) 0%, rgba(242,193,78,0) 70%)`,
                    }}
                >
                    <Icon
                        name="licht"
                        on={false}
                        size={56}
                        strokeWidth={1.6}
                        color="#f2c14e"
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: fonts.numbers, fontSize: 46, fontWeight: 600, lineHeight: 1 }}>
                        {Math.round(level)} %
                    </span>
                    <span style={{ fontSize: 12, color: v('text-2') }}>Helligkeit</span>
                </div>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: v('text-2') }}>
                Helligkeit
                <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={Math.max(1, level)}
                    onChange={e => {
                        const n = Number(e.target.value);
                        setLevel(n);
                        writeLater(n);
                        restart(POPUP_CLOSE_MS.slider);
                    }}
                    style={sliderStyle}
                />
            </label>
            <Steps
                values={[10, 30, 50, 75, 100]}
                current={level}
                label={x => `${x} %`}
                onPick={x => {
                    setLevel(x);
                    p.onLevel(x);
                    restart(POPUP_CLOSE_MS.quick);
                }}
            />
            <button
                type="button"
                className="zh-btn"
                onClick={() => {
                    p.onOff();
                    p.onClose();
                }}
                style={{
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${v('sw-off-bd')}`,
                    background: 'transparent',
                    color: v('text'),
                    fontSize: 14,
                    fontWeight: 600,
                }}
            >
                Ausschalten
            </button>
        </Frame>
    );
}

// ---------------------------------------------------------------- blind

export function RolloPopup(p: {
    title: string;
    position: number;
    onPosition: (pos: number) => void;
    onClose: () => void;
}): React.JSX.Element {
    const restart = useAutoClose(p.onClose);
    const writeLater = useDebounced(p.onPosition);
    const [pos, setPos] = React.useState(p.position);
    const text = pos <= 0 ? 'zu' : `${Math.round(pos)} %`;
    return (
        <Frame
            kind="ROLLO"
            title={p.title}
            label="Höhensteuerung"
            onClose={p.onClose}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div
                    aria-hidden
                    style={{
                        position: 'relative',
                        width: 120,
                        height: 160,
                        boxSizing: 'border-box',
                        borderRadius: 10,
                        border: '3px solid #55555c',
                        background: 'linear-gradient(#3b4a5c, #2a3542)',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: 0,
                            height: '100%',
                            transform: `scaleY(${(100 - pos) / 100})`,
                            transformOrigin: 'top',
                            transition: 'transform .3s ease',
                            background: 'repeating-linear-gradient(#5a5a62 0 7px, #46464d 7px 9px)',
                        }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontFamily: fonts.numbers, fontSize: 46, fontWeight: 600, lineHeight: 1 }}>
                        {text}
                    </span>
                    <span style={{ fontSize: 12, color: v('text-2') }}>geöffnet</span>
                </div>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: v('text-2') }}>
                Höhe
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={pos}
                    onChange={e => {
                        const n = Number(e.target.value);
                        setPos(n);
                        writeLater(n);
                        restart(POPUP_CLOSE_MS.slider);
                    }}
                    style={sliderStyle}
                />
            </label>
            <Steps
                values={[0, 25, 50, 75, 100]}
                current={pos}
                label={x => (x === 0 ? 'zu' : x === 100 ? 'auf' : `${x} %`)}
                onPick={x => {
                    setPos(x);
                    p.onPosition(x);
                    restart(POPUP_CLOSE_MS.quick);
                }}
            />
        </Frame>
    );
}

// ---------------------------------------------------------------- setpoint (floor heating)

export interface Preset {
    label: string;
    value: number;
}

/** "Eco:19, Komfort:21.5, Bad:24" -> presets */
export function parsePresets(text: string): Preset[] {
    return String(text || '')
        .split(/[,;\n]+/)
        .map(s => s.split(':'))
        .filter(parts => parts.length === 2 && Number.isFinite(Number(parts[1].replace(',', '.'))))
        .map(([label, value]) => ({ label: label.trim(), value: Number(value.replace(',', '.')) }));
}

export function SetpointPopup(p: {
    title: string;
    setpoint: number;
    min: number;
    max: number;
    step: number;
    presets: Preset[];
    lang: string;
    onSetpoint: (value: number) => void;
    onClose: () => void;
}): React.JSX.Element {
    const restart = useAutoClose(p.onClose);
    const [value, setValue] = React.useState(p.setpoint);
    const set = (n: number, ms: number): void => {
        const clamped = Math.max(p.min, Math.min(p.max, Math.round(n / p.step) * p.step));
        setValue(clamped);
        p.onSetpoint(clamped);
        restart(ms);
    };
    const btn: React.CSSProperties = {
        width: 64,
        height: 64,
        borderRadius: 16,
        border: `1px solid ${v('sw-off-bd')}`,
        background: v('sw-off-bg'),
        color: v('text'),
        fontFamily: fonts.numbers,
        fontSize: 30,
        fontWeight: 600,
    };
    return (
        <Frame
            kind="SOLLTEMPERATUR"
            title={p.title}
            label="Solltemperatur"
            onClose={p.onClose}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                    type="button"
                    className="zh-btn"
                    aria-label="kälter"
                    onClick={() => set(value - p.step, POPUP_CLOSE_MS.slider)}
                    style={btn}
                >
                    −
                </button>
                <span style={{ fontFamily: fonts.numbers, fontSize: 52, fontWeight: 600, lineHeight: 1 }}>
                    {formatNumber(value, 1, p.lang)}°
                </span>
                <button
                    type="button"
                    className="zh-btn"
                    aria-label="wärmer"
                    onClick={() => set(value + p.step, POPUP_CLOSE_MS.slider)}
                    style={btn}
                >
                    +
                </button>
            </div>
            {p.presets.length ? (
                <div style={{ display: 'flex', gap: 6 }}>
                    {p.presets.map(pr => {
                        const on = Math.abs(pr.value - value) < 0.01;
                        return (
                            <button
                                key={pr.label}
                                type="button"
                                className="zh-btn"
                                aria-pressed={on}
                                onClick={() => set(pr.value, POPUP_CLOSE_MS.quick)}
                                style={{
                                    flex: 1,
                                    height: 52,
                                    borderRadius: 12,
                                    border: `1px solid ${on ? v('sw-on') : v('sw-off-bd')}`,
                                    background: on ? v('sw-on') : v('sw-off-bg'),
                                    color: on ? v('sw-on-fg') : v('sw-off-fg'),
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 2,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    padding: 0,
                                }}
                            >
                                <span>{pr.label}</span>
                                <span style={{ fontFamily: fonts.numbers, fontSize: 16 }}>
                                    {formatNumber(pr.value, 1, p.lang)}°
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </Frame>
    );
}

// ---------------------------------------------------------------- hood

/** Button of the hood popup; `sel` = chosen value (green), `lit` = light on (yellow), `stop` = red */
function HaubeButton(p: {
    text: string;
    look?: 'sel' | 'lit' | 'stop';
    disabled?: boolean;
    onClick: () => void;
}): React.JSX.Element {
    const looks: Record<string, React.CSSProperties> = {
        sel: { background: v('st-on-bg'), border: `1.5px solid ${v('st-on-bd')}`, color: v('st-on-fg') },
        lit: { background: v('sw-on'), border: `1px solid ${v('sw-on')}`, color: v('sw-on-fg') },
        stop: { background: v('warn-bg'), border: `1px solid #6b3134`, color: v('warn-fg') },
        off: { background: v('sw-off-bg'), border: `1px solid ${v('sw-off-bd')}`, color: v('sw-off-fg') },
    };
    return (
        <button
            type="button"
            className="zh-btn"
            aria-pressed={p.look === 'sel' || p.look === 'lit'}
            disabled={p.disabled}
            onClick={p.onClick}
            style={{
                height: 44,
                padding: 0,
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                opacity: p.disabled ? 0.38 : 1,
                cursor: p.disabled ? 'default' : 'pointer',
                ...looks[p.look || 'off'],
            }}
        >
            {p.text}
        </button>
    );
}

function HaubeLine({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', alignItems: 'center', gap: 10, minHeight: 52 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
            {/* five equal columns, so the buttons of all lines stand exactly below each other */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>{children}</div>
        </div>
    );
}

/** Switch "Jetzt" / "Voreinstellung" at the top of the hood popup */
function HaubeMode({ preset, onChange }: { preset: boolean; onChange: (preset: boolean) => void }): React.JSX.Element {
    const part = (active: boolean, text: string, value: boolean): React.JSX.Element => (
        <button
            type="button"
            role="radio"
            className="zh-btn"
            aria-checked={active}
            onClick={() => onChange(value)}
            style={{
                position: 'relative',
                border: 0,
                background: 'transparent',
                color: active ? v('text') : v('text-2'),
                fontSize: 14,
                fontWeight: 600,
            }}
        >
            {text}
        </button>
    );
    return (
        <div
            role="radiogroup"
            aria-label="Was wird eingestellt"
            style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                height: 44,
                boxSizing: 'border-box',
                padding: 3,
                background: '#1f1f22',
                border: `1px solid ${v('border')}`,
                borderRadius: 12,
            }}
        >
            <i
                style={{
                    position: 'absolute',
                    left: 3,
                    top: 3,
                    bottom: 3,
                    width: 'calc(50% - 3px)',
                    borderRadius: 9,
                    background: v('sw-off-bd'),
                    transform: preset ? 'translateX(100%)' : undefined,
                    transition: 'transform .18s ease',
                }}
            />
            {part(!preset, 'Jetzt', false)}
            {part(preset, 'Voreinstellung', true)}
        </div>
    );
}

export function HaubePopup(p: {
    title: string;
    status: string;
    connected: boolean;
    level: number;
    light: boolean;
    timerActive: boolean;
    timerTotal: number;
    timerText: string;
    preset: HaubePreset;
    onLevel: (level: number) => void;
    onLight: (light: boolean) => void;
    onTimer: (minutes: number) => void;
    onTimerStop: () => void;
    onPreset: (writes: PresetWrite[]) => void;
    onClose: () => void;
}): React.JSX.Element {
    const restart = useAutoClose(p.onClose);
    // always opens on "Jetzt": a stored choice could change the preset by accident
    const [editPreset, setEditPreset] = React.useState(false);
    const { preset } = p;
    const canRun = p.connected && p.level > 0;

    const note = editPreset
        ? preset.level === 0
            ? 'Stufe 0 schaltet nur das Licht ein; „alles aus“ ist nicht möglich.'
            : 'Startet beim kurzen Tipp, wenn die Haube aus ist. Die Haube ändert sich hier nicht.'
        : p.timerActive
          ? `Noch ${p.timerText}, danach geht der Lüfter aus. Stopp lässt ihn weiterlaufen.`
          : p.level
            ? 'Antippen startet den Timer, danach geht der Lüfter aus.'
            : 'Der Timer braucht einen laufenden Lüfter.';

    return (
        <Frame
            kind="DUNSTABZUG"
            title={p.title}
            label={p.title}
            onClose={p.onClose}
            width={440}
            hint=""
        >
            <div
                onClickCapture={() => restart(POPUP_CLOSE_MS.idle)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
            >
                <span style={{ fontSize: 12, color: v('text-2'), marginBottom: 8 }}>{p.status}</span>
                <HaubeMode
                    preset={editPreset}
                    onChange={setEditPreset}
                />
                <div style={{ height: 4 }} />
                <HaubeLine label="Licht">
                    {editPreset ? (
                        <HaubeButton
                            text={preset.light ? 'An' : 'Aus'}
                            look={preset.light ? 'lit' : undefined}
                            // not greyed out at level 0: the light is part of that preset, it just cannot go off
                            onClick={() => {
                                if (preset.level > 0) {
                                    p.onPreset([{ key: 'light', value: !preset.light }]);
                                }
                            }}
                        />
                    ) : (
                        <HaubeButton
                            text={p.light ? 'An' : 'Aus'}
                            look={p.light ? 'lit' : undefined}
                            disabled={!p.connected}
                            onClick={() => p.onLight(!p.light)}
                        />
                    )}
                </HaubeLine>
                <HaubeLine label="Stufe">
                    {HAUBE_LEVELS.map(n =>
                        editPreset ? (
                            <HaubeButton
                                key={n}
                                text={String(n)}
                                look={preset.level === n ? 'sel' : undefined}
                                onClick={() => p.onPreset(presetLevelWrites(preset, n))}
                            />
                        ) : (
                            <HaubeButton
                                key={n}
                                text={String(n)}
                                look={p.level === n ? 'sel' : undefined}
                                disabled={!p.connected}
                                onClick={() => p.onLevel(n)}
                            />
                        ),
                    )}
                </HaubeLine>
                <HaubeLine label="Timer">
                    {editPreset ? (
                        <HaubeButton
                            text="Ohne"
                            look={preset.timer === 0 ? 'sel' : undefined}
                            onClick={() => p.onPreset([{ key: 'timer', value: 0 }])}
                        />
                    ) : null}
                    {HAUBE_TIMERS.map(m =>
                        editPreset ? (
                            <HaubeButton
                                key={m}
                                text={`${m} Min`}
                                look={preset.timer === m ? 'sel' : undefined}
                                disabled={preset.level === 0}
                                onClick={() => p.onPreset([{ key: 'timer', value: m }])}
                            />
                        ) : (
                            <HaubeButton
                                key={m}
                                text={`${m} Min`}
                                look={p.timerActive && p.timerTotal === m ? 'sel' : undefined}
                                disabled={!canRun}
                                onClick={() => p.onTimer(m)}
                            />
                        ),
                    )}
                    {!editPreset && p.timerActive ? (
                        <HaubeButton
                            text="Stopp"
                            look="stop"
                            onClick={p.onTimerStop}
                        />
                    ) : null}
                </HaubeLine>
                <span style={{ fontSize: 12, color: v('text-2'), minHeight: 30, lineHeight: '15px', marginTop: 6 }}>
                    {note}
                </span>
            </div>
        </Frame>
    );
}
