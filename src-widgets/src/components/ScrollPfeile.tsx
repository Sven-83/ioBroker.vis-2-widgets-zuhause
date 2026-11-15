/*
 * Up / down arrows next to a scrolling list (Sven 15.11.2026), see lib/scroll.ts.
 * Tap = one step (smooth), hold = continuous run that gets faster; an arrow at its end is dimmed.
 * The list itself still scrolls by swiping; overscroll-behavior keeps the page from reloading.
 * A class: it drives the DOM element of the list directly (scroll position, animation frames).
 */
import React from 'react';

import { HOLD_MS, limits, speed, stepPx } from '../lib/scroll';
import { v } from '../lib/theme';

function Pfeil({ hoch }: { hoch: boolean }): React.JSX.Element {
    return (
        <svg
            viewBox="0 0 24 24"
            width={22}
            height={22}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d={hoch ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
    );
}

interface Props {
    /** the element that scrolls */
    target: React.RefObject<HTMLDivElement | null>;
    /** called on every press, e.g. to restart the auto-close timer of a popup */
    onUse?: () => void;
}

interface State {
    hoch: boolean;
    runter: boolean;
}

interface Lauf {
    dir: number;
    start: number;
    last: number;
    frame: number;
    hold?: ReturnType<typeof setTimeout>;
}

export class ScrollPfeile extends React.Component<Props, State> {
    state: State = { hoch: false, runter: false };
    private el: HTMLDivElement | null = null;
    private lauf: Lauf | null = null;
    private ro: ResizeObserver | null = null;
    private mo: MutationObserver | null = null;

    componentDidMount(): void {
        this.attach();
    }

    componentDidUpdate(): void {
        if (this.props.target.current !== this.el) {
            this.attach();
        }
    }

    componentWillUnmount(): void {
        this.stop();
        this.detach();
    }

    private attach(): void {
        this.detach();
        const el = this.props.target.current;
        this.el = el;
        if (!el) {
            return;
        }
        el.addEventListener('scroll', this.update, { passive: true });
        // the list changes while the popup is open (new values every 2 minutes, filter chips)
        if (typeof ResizeObserver !== 'undefined') {
            this.ro = new ResizeObserver(this.update);
            this.ro.observe(el);
        }
        if (typeof MutationObserver !== 'undefined') {
            this.mo = new MutationObserver(this.update);
            this.mo.observe(el, { childList: true, subtree: true });
        }
        this.update();
    }

    private detach(): void {
        this.el?.removeEventListener('scroll', this.update);
        this.ro?.disconnect();
        this.mo?.disconnect();
        this.ro = null;
        this.mo = null;
    }

    private update = (): void => {
        const el = this.el;
        if (!el) {
            return;
        }
        const l = limits(el.scrollTop, el.scrollHeight, el.clientHeight);
        if (l.hoch !== this.state.hoch || l.runter !== this.state.runter) {
            this.setState(l);
        }
    };

    private stop = (): void => {
        const r = this.lauf;
        if (!r) {
            return;
        }
        if (r.hold) {
            clearTimeout(r.hold);
        }
        cancelAnimationFrame(r.frame);
        this.lauf = null;
    };

    private frame = (ts: number): void => {
        const r = this.lauf;
        const el = this.el;
        if (!r || !el) {
            return;
        }
        const dt = r.last ? Math.min(50, ts - r.last) : 16;
        r.last = ts;
        el.scrollTop += (r.dir * speed(Date.now() - r.start) * dt) / 1000;
        const l = limits(el.scrollTop, el.scrollHeight, el.clientHeight);
        if ((r.dir < 0 && !l.hoch) || (r.dir > 0 && !l.runter)) {
            this.stop();
            this.update();
            return;
        }
        r.frame = requestAnimationFrame(this.frame);
    };

    private down = (dir: number, e: React.PointerEvent<HTMLButtonElement>): void => {
        e.preventDefault();
        e.stopPropagation();
        this.props.onUse?.();
        const el = this.el;
        if (!el) {
            return;
        }
        this.stop();
        el.scrollBy({ top: dir * stepPx(el.clientHeight), behavior: 'smooth' });
        const r: Lauf = { dir, start: Date.now(), last: 0, frame: 0 };
        r.hold = setTimeout(() => {
            r.hold = undefined;
            r.frame = requestAnimationFrame(this.frame);
        }, HOLD_MS);
        this.lauf = r;
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };

    private knopf(dir: number, an: boolean): React.JSX.Element {
        return (
            <button
                type="button"
                className="zh-btn"
                aria-label={dir < 0 ? 'nach oben' : 'nach unten'}
                disabled={!an}
                onPointerDown={an ? e => this.down(dir, e) : undefined}
                onPointerUp={this.stop}
                onPointerCancel={this.stop}
                onLostPointerCapture={this.stop}
                onContextMenu={e => e.preventDefault()}
                style={{
                    width: 44,
                    flex: 1,
                    maxHeight: 120,
                    minHeight: 52,
                    borderRadius: 14,
                    border: `1px solid ${v('sw-off-bd')}`,
                    background: v('sw-off-bg'),
                    color: v('text'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: an ? 1 : 0.3,
                    touchAction: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    padding: 0,
                }}
            >
                <Pfeil hoch={dir < 0} />
            </button>
        );
    }

    render(): React.JSX.Element {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 8,
                    flex: 'none',
                }}
            >
                {this.knopf(-1, this.state.hoch)}
                {this.knopf(1, this.state.runter)}
            </div>
        );
    }
}
