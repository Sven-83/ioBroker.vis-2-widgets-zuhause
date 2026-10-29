/*
 * Pin on the floor plan (hand-over 11.2 "zuhause-pin"): compact tile with the colours of the 88 px tiles,
 * centred on its plan position. Sizes after the drafts: lamps 40/36, sockets 36, blinds 34, sensors 30.
 */
import React from 'react';

import type { DeviceType, PinLook, PinState } from '../lib/plan';
import { fonts, v } from '../lib/theme';
import { Icon } from './Icon';

const LOOKS: Record<PinLook, React.CSSProperties> = {
    on: {
        background: v('sw-on'),
        border: `1px solid ${v('sw-on')}`,
        color: v('sw-on-fg'),
        boxShadow: '0 0 16px rgba(242,193,78,0.55)',
    },
    off: { background: v('sw-off-bg'), border: '1px solid #4a4a50', color: '#b5b2a9' },
    ok: { background: v('st-on-bg'), border: `1.5px solid ${v('st-on-bd')}`, color: v('st-on-fg') },
    neutral: { background: v('sw-off-bg'), border: '1.5px solid #4a4a50', color: v('sw-off-fg') },
    warn: { background: v('warn-bg'), border: `1.5px solid ${v('warn-bd')}`, color: v('warn-fg') },
    alarm: { background: '#5a1316', border: '1.5px solid #ff4d55', color: '#fff' },
    active: { background: '#2a2f3d', border: '1.5px solid #7aa7ff', color: '#cfe0ff' },
    water: { background: '#10243d', border: `1.5px solid ${v('co2')}`, color: '#fff' },
    open: { background: v('st-on-bg'), border: `1.5px solid ${v('st-on-bd')}`, color: v('st-on-fg') },
    part: { background: '#3a2f12', border: `1.5px solid ${v('sw-on')}`, color: v('sw-on') },
    closed: { background: v('sw-off-bg'), border: '1.5px solid #4a4a50', color: v('sw-off-fg') },
};

/** Flashing layer colour of alarm states */
const FLASH: Partial<Record<PinLook, string>> = { alarm: '#a3161d', water: '#1d4f8f' };

export function pinSize(typ: DeviceType, look: PinLook): number {
    switch (typ) {
        case 'lampe':
        case 'dimmer':
            return look === 'on' ? 40 : 36;
        case 'steckdose':
            return 36;
        case 'rollo':
            return 34;
        default:
            return 30;
    }
}

/** Icon base name + value for the Icon component (it picks the state variant and the animation) */
export function pinIcon(typ: DeviceType, on: boolean, own?: string): { name: string; on: boolean } {
    switch (typ) {
        case 'lampe':
        case 'dimmer':
            return { name: 'licht', on };
        case 'rollo':
            // full slats when closed
            return { name: 'jalousie', on: !on };
        case 'fenster':
            return { name: 'fenster', on: !on };
        case 'tuer':
            return { name: 'haustuer', on: !on };
        case 'tor':
            return { name: 'garage', on };
        case 'geraet':
            return { name: own || 'energie', on };
        default:
            return { name: typ, on };
    }
}

const WLAN_OFF = 'M2 8.5a15 15 0 0 1 20 0 M5 12a10 10 0 0 1 14 0 M8.5 15.5a5 5 0 0 1 7 0 M12 19h.01 M3 3l18 18';
const BATTERY_LOW = 'M3 7h15v10H3z M18 10h2.5v4H18 M6 10v4';

function Badge({ d, side }: { d: string; side: 'right' | 'left' }): React.JSX.Element {
    return (
        <span
            className="zh-a-blink"
            style={{
                position: 'absolute',
                [side]: -9,
                bottom: -9,
                width: 18,
                height: 18,
                boxSizing: 'border-box',
                borderRadius: '50%',
                background: v('warn-bd'),
                border: '2px solid #1d1d20',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <svg
                viewBox="0 0 24 24"
                width={10}
                height={10}
                fill="none"
                stroke="#fff"
                strokeWidth={2.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
            >
                <path d={d} />
            </svg>
        </span>
    );
}

export interface PinProps {
    typ: DeviceType;
    state: PinState;
    on: boolean;
    ownIcon?: string;
    left: number;
    top: number;
    scale: number;
    ariaLabel: string;
    clickable: boolean;
    noReception: boolean;
    lowBattery: boolean;
    pending: boolean;
    unconfirmed: boolean;
    motion: boolean;
    onPointerDown?: (e: React.PointerEvent) => void;
    onPointerUp?: (e: React.PointerEvent) => void;
    onPointerLeave?: () => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function Pin(p: PinProps): React.JSX.Element {
    const size = pinSize(p.typ, p.state.look);
    // smoke detector driven as siren by the alarm adapter: siren rays instead of smoke
    const icon =
        p.state.alarmText === 'ALARM' && p.typ === 'rauchmelder'
            ? { name: 'sirene', on: true }
            : pinIcon(p.typ, p.on, p.ownIcon);
    const flash = FLASH[p.state.look];
    const iconSize = Math.round(size * (p.typ === 'lampe' || p.typ === 'dimmer' ? 0.6 : 0.58));
    return (
        <div
            role={p.clickable ? 'button' : 'img'}
            tabIndex={p.clickable ? 0 : undefined}
            aria-label={p.ariaLabel}
            title={p.ariaLabel}
            className={[p.state.look === 'warn' && p.motion ? 'zh-a-warn' : '', 'zh-pin'].join(' ')}
            onPointerDown={p.onPointerDown}
            onPointerUp={p.onPointerUp}
            onPointerLeave={p.onPointerLeave}
            onPointerCancel={p.onPointerLeave}
            onKeyDown={p.onKeyDown}
            onContextMenu={e => e.preventDefault()}
            style={{
                position: 'absolute',
                left: p.left,
                top: p.top,
                width: size,
                height: size,
                transform: `translate(-50%, -50%) scale(${p.scale})`,
                boxSizing: 'border-box',
                borderRadius: Math.round(size * 0.3),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: p.clickable ? 'pointer' : 'default',
                touchAction: 'none',
                userSelect: 'none',
                fontFamily: fonts.text,
                ...LOOKS[p.state.look],
                ...(p.unconfirmed ? { outline: `2px solid ${v('warn-bd')}`, outlineOffset: 2 } : null),
            }}
        >
            {flash ? (
                <span
                    className={p.motion ? 'zh-alarm-layer' : undefined}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 'inherit',
                        background: flash,
                        pointerEvents: 'none',
                    }}
                />
            ) : null}
            {p.state.shade !== undefined ? (
                <span
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 'inherit',
                        overflow: 'hidden',
                        pointerEvents: 'none',
                    }}
                >
                    <span
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: 0,
                            height: '100%',
                            transform: `scaleY(${p.state.shade / 100})`,
                            transformOrigin: 'top',
                            transition: 'transform .6s ease',
                            background: 'rgba(207,204,195,.22)',
                        }}
                    />
                </span>
            ) : null}
            <span style={{ position: 'relative', display: 'flex' }}>
                <Icon
                    name={icon.name}
                    on={icon.on}
                    animate={p.motion && p.state.animate}
                    size={iconSize}
                    strokeWidth={1.8}
                />
            </span>
            {p.state.label ? (
                <span
                    style={{
                        position: 'absolute',
                        left: '50%',
                        ...(p.typ === 'thermometer' ? { top: -19 } : { bottom: -18 }),
                        transform: 'translateX(-50%)',
                        fontSize: 11,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        background: '#1d1d20',
                        color: p.state.look === 'on' ? v('sw-on') : v('text'),
                        padding: '1px 5px',
                        borderRadius: 6,
                    }}
                >
                    {p.state.label}
                </span>
            ) : null}
            {p.pending ? (
                <span
                    className="zh-spinner"
                    style={{
                        position: 'absolute',
                        inset: -5,
                        boxSizing: 'border-box',
                        borderRadius: '50%',
                        border: `2px solid ${v('sw-on')}`,
                        borderRightColor: 'transparent',
                        pointerEvents: 'none',
                    }}
                />
            ) : null}
            {p.noReception ? (
                <Badge
                    d={WLAN_OFF}
                    side="right"
                />
            ) : null}
            {p.lowBattery ? (
                <Badge
                    d={BATTERY_LOW}
                    side={p.noReception ? 'left' : 'right'}
                />
            ) : null}
        </div>
    );
}
