/*
 * Tile 88 x 88 (hand-over sections 2 and 4), drawn at the base size and scaled to the widget box.
 * Pure presentation: the widget decides the look, the badges and what a tap does.
 */
import React from 'react';

import type { TileLook } from '../lib/model';
import { fonts, v } from '../lib/theme';

export const TILE_BASE = 88;

const LOOK_STYLE: Record<TileLook, React.CSSProperties> = {
    'switch-off': { background: v('sw-off-bg'), border: `1px solid ${v('sw-off-bd')}`, color: v('sw-off-fg') },
    'switch-on': { background: v('sw-on'), border: `1px solid ${v('sw-on')}`, color: v('sw-on-fg') },
    'status-on': { background: v('st-on-bg'), border: `1.5px solid ${v('st-on-bd')}`, color: v('st-on-fg') },
    'status-off': { background: 'transparent', border: `1.5px dashed ${v('st-off-bd')}`, color: v('text-2') },
    'offable-on': { background: v('st-on-bg'), border: `1.5px solid ${v('st-on-bd')}`, color: v('st-on-fg') },
    warn: { background: v('warn-bg'), border: `1.5px solid ${v('warn-bd')}`, color: v('warn-fg') },
};

export interface TileProps {
    look: TileLook;
    label: string;
    icon: React.ReactNode;
    /** the tile reacts to taps (cursor, role button) */
    clickable: boolean;
    /** LED dot top right (status types) */
    led?: boolean;
    /** toggle top right (switch types) */
    toggle?: boolean;
    /** power symbol top right (status-aus while on) */
    power?: boolean;
    /** "PIN" top left */
    pin?: boolean;
    /** lock badge top left: true = locked (green), false = open (red) */
    lock?: boolean;
    /** coloured dots top left (aquarium: CO2 blue, light yellow) */
    dots?: string[];
    /** diagnosis badges bottom right */
    noReception?: boolean;
    lowBattery?: boolean;
    /** a command waits for ack */
    pending?: boolean;
    /** no ack within the timeout: red frame */
    unconfirmed?: boolean;
    /** value too old: dimmed + "?" */
    stale?: boolean;
    /** alarm state (e.g. burglary): red flashing layer, text instead of the label */
    alarm?: boolean;
    /** pulsing frame for warnings */
    warnPulse?: boolean;
    /** pulse of the open lock badge */
    lockPulse?: boolean;
    /** class for the animation level (zh-dezent / zh-still) */
    levelClass?: string;
    scale: number;
    title?: string;
    onPointerDown?: (e: React.PointerEvent) => void;
    onPointerUp?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
    onPointerCancel?: (e: React.PointerEvent) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}

export const WLAN_OFF = 'M2 8.5a15 15 0 0 1 20 0 M5 12a10 10 0 0 1 14 0 M8.5 15.5a5 5 0 0 1 7 0 M12 19h.01 M3 3l18 18';
const BATTERY_LOW = 'M3 7h15v10H3z M18 10h2.5v4H18 M6 10v4';
const POWER = 'M12 3v8 M6.5 6.5a8 8 0 1 0 11 0';
const LOCK = 'M5 11h14v11H5z M8 11V8a4 4 0 0 1 8 0v3h-2V8a2 2 0 0 0-4 0v3z';

export function DiagBadge({ d, right, title }: { d: string; right: number; title: string }): React.JSX.Element {
    return (
        <span
            className="zh-a-blink"
            title={title}
            style={{
                position: 'absolute',
                right,
                bottom: 4,
                width: 17,
                height: 17,
                borderRadius: '50%',
                background: v('warn-bd'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <svg
                viewBox="0 0 24 24"
                width={11}
                height={11}
                fill="none"
                stroke="#fff"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
            >
                <path d={d} />
            </svg>
        </span>
    );
}

export function Tile(p: TileProps): React.JSX.Element {
    const look = LOOK_STYLE[p.look];
    const onLook = p.look === 'switch-on';
    const diag: React.JSX.Element[] = [];
    if (p.noReception) {
        diag.push(
            <DiagBadge
                key="wlan"
                d={WLAN_OFF}
                right={4}
                title="kein Empfang"
            />,
        );
    }
    if (p.lowBattery) {
        diag.push(
            <DiagBadge
                key="bat"
                d={BATTERY_LOW}
                right={p.noReception ? 24 : 4}
                title="Batterie schwach"
            />,
        );
    }
    return (
        <div
            role={p.clickable ? 'button' : undefined}
            tabIndex={p.clickable ? 0 : undefined}
            aria-label={p.label}
            title={p.title}
            className={['zh-tile', p.warnPulse ? 'zh-a-warn' : '', p.levelClass || ''].join(' ')}
            onPointerDown={p.onPointerDown}
            onPointerUp={p.onPointerUp}
            onPointerLeave={p.onPointerLeave}
            onPointerCancel={p.onPointerCancel}
            onKeyDown={p.onKeyDown}
            onContextMenu={e => e.preventDefault()}
            style={{
                width: TILE_BASE,
                height: TILE_BASE,
                boxSizing: 'border-box',
                borderRadius: v('radius-tile'),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                paddingBottom: diag.length ? 12 : 0,
                fontFamily: fonts.text,
                fontSize: 13,
                fontWeight: 600,
                position: 'relative',
                overflow: 'hidden',
                cursor: p.clickable ? 'pointer' : 'default',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'manipulation',
                transform: p.scale !== 1 ? `scale(${p.scale})` : undefined,
                transformOrigin: 'top left',
                opacity: p.stale ? 0.45 : 1,
                ...look,
                ...(p.unconfirmed ? { border: `2px solid ${v('warn-bd')}` } : null),
                ...(p.alarm ? { background: '#5a1316', border: `1.5px solid ${v('warn-bd')}`, color: '#fff' } : null),
            }}
        >
            {p.alarm ? (
                <span
                    className="zh-alarm-layer"
                    style={{ position: 'absolute', inset: 0, background: '#a3161d', pointerEvents: 'none' }}
                />
            ) : null}
            <span style={{ position: 'relative', display: 'flex' }}>{p.icon}</span>
            <span
                style={{
                    position: 'relative',
                    maxWidth: TILE_BASE - 8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.1,
                    letterSpacing: p.alarm ? '0.06em' : undefined,
                }}
            >
                {p.label}
            </span>

            {p.pending ? (
                <span
                    className="zh-spinner"
                    aria-label="wird geschaltet"
                    style={{
                        position: 'absolute',
                        right: 7,
                        top: 6,
                        width: 12,
                        height: 12,
                        boxSizing: 'border-box',
                        borderRadius: '50%',
                        border: '2px solid currentColor',
                        borderRightColor: 'transparent',
                        opacity: 0.8,
                    }}
                />
            ) : (
                <>
                    {p.toggle ? (
                        <span
                            style={{
                                position: 'absolute',
                                right: 7,
                                top: 7,
                                width: 16,
                                height: 9,
                                borderRadius: 5,
                                background: onLook ? v('sw-on-fg') : '#4a4a50',
                            }}
                        >
                            <span
                                style={{
                                    position: 'absolute',
                                    top: 1,
                                    left: onLook ? undefined : 1,
                                    right: onLook ? 1 : undefined,
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: onLook ? v('sw-on') : '#9a978e',
                                }}
                            />
                        </span>
                    ) : null}
                    {p.power ? (
                        <span
                            style={{
                                position: 'absolute',
                                right: 5,
                                top: 5,
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                background: '#2a4a34',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                width={11}
                                height={11}
                                fill="none"
                                stroke={v('st-on-fg')}
                                strokeWidth={2.6}
                                strokeLinecap="round"
                                aria-hidden
                            >
                                <path d={POWER} />
                            </svg>
                        </span>
                    ) : null}
                    {p.led !== undefined ? (
                        <span
                            style={
                                p.look === 'warn'
                                    ? {
                                          position: 'absolute',
                                          right: 7,
                                          top: 7,
                                          width: 10,
                                          height: 10,
                                          borderRadius: '50%',
                                          background: v('warn-bd'),
                                          boxShadow: `0 0 6px ${v('warn-bd')}`,
                                      }
                                    : p.led
                                      ? {
                                            position: 'absolute',
                                            right: 8,
                                            top: 8,
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: v('st-led'),
                                            boxShadow: `0 0 6px ${v('st-led')}`,
                                        }
                                      : {
                                            position: 'absolute',
                                            right: 8,
                                            top: 8,
                                            width: 8,
                                            height: 8,
                                            boxSizing: 'border-box',
                                            borderRadius: '50%',
                                            border: '1.5px solid #6a6a70',
                                        }
                            }
                        />
                    ) : null}
                </>
            )}

            {p.pin ? (
                <span
                    style={{
                        position: 'absolute',
                        left: 6,
                        top: 5,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        color: onLook ? undefined : v('text-2'),
                    }}
                >
                    PIN
                </span>
            ) : null}
            {p.lock !== undefined ? (
                <svg
                    viewBox="0 0 24 24"
                    width={13}
                    height={13}
                    fill={p.lock ? v('lock-closed') : v('lock-open')}
                    className={p.lockPulse ? 'zh-a-once' : undefined}
                    style={{ position: 'absolute', left: 7, top: 6 }}
                    aria-label={p.lock ? 'abgeschlossen' : 'offen'}
                >
                    <path d={LOCK} />
                </svg>
            ) : null}
            {p.dots?.length ? (
                <span style={{ position: 'absolute', left: 7, top: 7, display: 'flex', gap: 3 }}>
                    {p.dots.map(color => (
                        <span
                            key={color}
                            style={{ width: 8, height: 8, borderRadius: '50%', background: color }}
                        />
                    ))}
                </span>
            ) : null}
            {p.stale ? (
                <span
                    title="Wert veraltet"
                    style={{ position: 'absolute', left: 7, bottom: 5, fontSize: 12, fontWeight: 700 }}
                >
                    ?
                </span>
            ) : null}
            {diag}
        </div>
    );
}
