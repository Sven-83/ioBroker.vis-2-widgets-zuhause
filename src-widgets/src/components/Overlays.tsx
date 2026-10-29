/*
 * Overlays above the whole page (portal to document.body): PIN pad, popup with a VIS view, toast.
 */
import React from 'react';
import { createPortal } from 'react-dom';

import { pinKey } from '../lib/model';
import { fonts, v } from '../lib/theme';

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }): React.JSX.Element {
    return createPortal(
        <div
            onPointerDown={e => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2000,
                background: 'rgba(10,10,12,0.62)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fonts.text,
                color: v('text'),
            }}
        >
            {children}
        </div>,
        document.body,
    );
}

// ---------------------------------------------------------------- PIN

const LOCK_ICON = 'M6 11h12v10H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3 M12 15v2';

export interface PinPadProps {
    title: string;
    hint: string;
    digits: number;
    /** called with the complete entry; the pad closes right after */
    onComplete: (entry: string) => void;
    onClose: () => void;
}

/** Number pad with 64 px keys and dots; never stores the PIN anywhere but in its own state */
export function PinPad(p: PinPadProps): React.JSX.Element {
    const [entry, setEntry] = React.useState('');
    const press = (key: string): void => {
        const next = pinKey(entry, key, p.digits);
        if (next.complete) {
            setEntry('');
            p.onComplete(next.entry);
            p.onClose();
            return;
        }
        setEntry(next.entry);
    };
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                p.onClose();
            } else if (e.key === 'Backspace') {
                press('del');
            } else if (/^[0-9]$/.test(e.key)) {
                press(e.key);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
    const keys: { label: string; key: string; aria: string }[] = [
        ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => ({ label: d, key: d, aria: `Ziffer ${d}` })),
        { label: '✕', key: 'close', aria: 'Abbrechen' },
        { label: '0', key: '0', aria: 'Ziffer 0' },
        { label: '⌫', key: 'del', aria: 'Löschen' },
    ];
    return (
        <Backdrop onClose={p.onClose}>
            <div
                role="dialog"
                aria-label={p.title}
                style={{
                    width: 320,
                    boxSizing: 'border-box',
                    background: v('card'),
                    border: `1px solid ${v('sw-off-bd')}`,
                    borderRadius: 22,
                    padding: 22,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 14,
                }}
            >
                <svg
                    viewBox="0 0 24 24"
                    width={30}
                    height={30}
                    fill="none"
                    stroke={v('sw-on')}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                >
                    <path d={LOCK_ICON} />
                </svg>
                <span style={{ fontSize: 18, fontWeight: 600 }}>{p.title}</span>
                <span style={{ fontSize: 13, color: v('text-2') }}>{p.hint}</span>
                <div style={{ display: 'flex', gap: 12 }}>
                    {Array.from({ length: p.digits }, (_, i) =>
                        i < entry.length ? (
                            <span
                                key={i}
                                style={{ width: 14, height: 14, borderRadius: '50%', background: v('sw-on') }}
                            />
                        ) : (
                            <span
                                key={i}
                                style={{
                                    width: 14,
                                    height: 14,
                                    boxSizing: 'border-box',
                                    borderRadius: '50%',
                                    border: '2px solid #6a6a70',
                                }}
                            />
                        ),
                    )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 10 }}>
                    {keys.map(k => (
                        <button
                            key={k.key}
                            type="button"
                            className="zh-btn"
                            aria-label={k.aria}
                            onClick={() => (k.key === 'close' ? p.onClose() : press(k.key))}
                            style={{
                                height: 56,
                                borderRadius: 14,
                                border: `1px solid ${v('sw-off-bd')}`,
                                background: v('sw-off-bg'),
                                color: v('text'),
                                fontFamily: fonts.numbers,
                                fontSize: 22,
                                fontWeight: 600,
                                padding: 0,
                            }}
                        >
                            {k.label}
                        </button>
                    ))}
                </div>
            </div>
        </Backdrop>
    );
}

// ---------------------------------------------------------------- popup with a view

export interface ViewPopupProps {
    title?: string;
    /** rendered view (VisRxWidget.getWidgetView) */
    content: React.ReactNode;
    width: number;
    height: number;
    /** close without any input after this many seconds (0 = never); every input restarts the time */
    autoCloseS: number;
    onClose: () => void;
}

export function ViewPopup(p: ViewPopupProps): React.JSX.Element {
    const { autoCloseS, onClose } = p;
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const restart = React.useCallback((): void => {
        if (timer.current) {
            clearTimeout(timer.current);
        }
        if (autoCloseS > 0) {
            timer.current = setTimeout(onClose, autoCloseS * 1000);
        }
    }, [autoCloseS, onClose]);
    React.useEffect(() => {
        restart();
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            if (timer.current) {
                clearTimeout(timer.current);
            }
        };
    }, [restart, onClose]);
    return (
        <Backdrop onClose={onClose}>
            <div
                role="dialog"
                aria-label={p.title || 'Popup'}
                onPointerDown={restart}
                onPointerMove={restart}
                onWheel={restart}
                style={{
                    position: 'relative',
                    width: p.width,
                    maxWidth: 'calc(100vw - 32px)',
                    height: p.height,
                    maxHeight: 'calc(100vh - 32px)',
                    boxSizing: 'border-box',
                    background: v('card'),
                    border: `1px solid ${v('sw-off-bd')}`,
                    borderRadius: 22,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 10px 0 18px', minHeight: 44 }}>
                    <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{p.title}</span>
                    <button
                        type="button"
                        className="zh-btn"
                        aria-label="Schließen"
                        onClick={onClose}
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            border: 0,
                            background: 'transparent',
                            color: v('text-2'),
                            fontSize: 22,
                        }}
                    >
                        ✕
                    </button>
                </div>
                <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>{p.content}</div>
            </div>
        </Backdrop>
    );
}

// ---------------------------------------------------------------- toast

export function Toast({ text }: { text: string }): React.JSX.Element {
    return createPortal(
        <div
            role="status"
            style={{
                position: 'fixed',
                left: '50%',
                bottom: 32,
                transform: 'translate(-50%,0)',
                animation: 'zh-toast .2s ease-out',
                zIndex: 2100,
                background: v('card'),
                border: `1px solid ${v('sw-off-bd')}`,
                borderRadius: 14,
                padding: '12px 20px',
                fontFamily: fonts.text,
                fontSize: 15,
                fontWeight: 600,
                color: v('text'),
                boxShadow: '0 8px 24px rgba(0,0,0,.45)',
                pointerEvents: 'none',
            }}
        >
            {text}
        </div>,
        document.body,
    );
}
