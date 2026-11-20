/*
 * Tank view of the aquarium (long press on the aquarium tile; spec chihiros-aquarium.md part D / phase 6,
 * all details accepted by Sven on 20.11.2026, preview .local/bin/aquarium/vorschau/vorschlaege/v2.html).
 * Left: living tank (canvas) inside the technical cut (SVG). Right: summary cards. A tap on a device or card
 * opens its sheet with the controls. Writes go to chihiros.0, the Shelly plugs and 0_userdata.0.vis.aquarium.
 * Controls that need the adapter update (phase 6b) or the care mode (phase 7) are shown read-only with a
 * hint; they switch on by themselves as soon as their data point exists.
 */
import React from 'react';
import { createPortal } from 'react-dom';

import type { Zeile } from '../../lib/aquarium';
import {
    AUFGABEN,
    CURVE_DEFAULT,
    type Curve,
    faellig,
    fanLevelFor,
    flasche,
    FUTURE,
    fmt,
    hhmm,
    IDS,
    lampLevel,
    lampRgb,
    LOCKED,
    lightText,
    MAX_DOSE,
    neuerName,
    num,
    parseCurve,
    parseVorlagen,
    parseWindows,
    PLUGS,
    type PlugKey,
    plugPower,
    plugSwitch,
    pumpId,
    PUMPS,
    type Vorlage,
    vorlagenJson,
    windowsText,
} from '../../lib/becken';
import { backSvg, frontSvg, LED, type Modell, PIPES, type Stufe } from './schnitt';
import { ensureBeckenStyles } from './style';
import { startTank } from './tank';

export const VORLAGEN_ID = '0_userdata.0.vis.aquarium.lichtVorlagen';
const W = 1050;
const H = 575;

export interface BeckenProps {
    /** current value of a data point */
    val: (id: string) => unknown;
    /** time stamp of a data point */
    ts: (id: string) => number | undefined;
    /** device list of the aquarium script */
    liste: Zeile[];
    /** data points that exist (for controls of later phases) */
    vorhanden: Set<string>;
    set: (id: string, value: ioBroker.StateValue) => void;
    motion: boolean;
    onClose: () => void;
}

type SheetKey = string | null;

interface S {
    sheet: SheetKey;
    lampTab: 'farbe' | 'zeit';
    wasserTab: 'temp' | 'kuehl';
    hand: Record<number, number>;
    fanHand: number;
    hell: number;
    renamePump: number | null;
    renameText: string;
    msg: string;
    scale: number;
    now: number;
    sel: string;
}

const PLUG_KEYS = Object.keys(PLUGS) as PlugKey[];
const ORDER: Record<Stufe, number> = { rot: 0, gelb: 1, ok: 2, aus: 3 };
const TASK_ICONS: Record<string, string> = {
    ww: 'M6 5h12l-1 15H7z M6 9h12 M10 13c1 1 3 1 4 0',
    vf: 'M5 6h14l-5 7v5l-4 2v-7z',
    fi: 'M7 4h10v16H7z M7 8h10 M10 12h4 M10 15h4',
    sc: 'M4 5h16v14H4z M8 15l6-6 M11 16l5-5',
    rs: 'M6 7a2 2 0 1 0 0 .1 M6 17a2 2 0 1 0 0 .1 M7.5 8.5L19 18 M7.5 15.5L19 6',
    df: 'M12 20v-6 M8 14h8v-3H8z M10 8a1 1 0 1 0 0 .1 M14 6a1 1 0 1 0 0 .1 M12 3a1 1 0 1 0 0 .1',
    sl: 'M4 8h6a4 4 0 0 1 4 4v0a4 4 0 0 0 4 4h2 M4 12h6 M14 16h6',
    wq: 'M9 3h6 M10 3v6l-4 9a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-4-9V3 M8 15h8',
};

/**
 * Button that acts on a tap or only after holding 1 s (switching off filter/heater/UV, manual dose).
 * The red/yellow bar inside shows the progress of the hold.
 */
class HoldTarget extends React.Component<{
    hold: boolean;
    act: () => void;
    className: string;
    label?: string;
    pressed?: boolean;
    disabled?: boolean;
    children?: React.ReactNode;
}> {
    private bar = React.createRef<HTMLSpanElement>();
    private timer?: ReturnType<typeof setTimeout>;
    private raf = 0;

    componentWillUnmount(): void {
        this.stop();
    }

    private stop = (): void => {
        clearTimeout(this.timer);
        cancelAnimationFrame(this.raf);
        if (this.bar.current) {
            this.bar.current.style.width = '0';
        }
    };

    private down = (e: React.PointerEvent): void => {
        if (!this.props.hold || this.props.disabled) {
            return;
        }
        e.preventDefault();
        const start = performance.now();
        const tick = (): void => {
            if (this.bar.current) {
                this.bar.current.style.width = `${Math.min(100, (performance.now() - start) / 10)}%`;
            }
            this.raf = requestAnimationFrame(tick);
        };
        tick();
        this.timer = setTimeout(() => {
            this.stop();
            this.props.act();
        }, 1000);
    };

    render(): React.JSX.Element {
        return (
            <button
                type="button"
                aria-label={this.props.label}
                aria-pressed={this.props.pressed}
                className={this.props.className}
                disabled={this.props.disabled}
                onClick={this.props.hold ? undefined : this.props.act}
                onPointerDown={this.down}
                onPointerUp={this.stop}
                onPointerLeave={this.stop}
                onPointerCancel={this.stop}
            >
                <span
                    ref={this.bar}
                    className="hold"
                />
                {this.props.children}
            </button>
        );
    }
}

function Switch(p: {
    on: boolean;
    hold?: boolean;
    locked?: boolean;
    onToggle: () => void;
    label: string;
}): React.JSX.Element {
    // switching ON never needs holding
    return (
        <HoldTarget
            hold={!!p.hold && p.on}
            act={p.onToggle}
            label={p.label}
            pressed={p.on}
            className={`sw ${p.on ? 'on' : ''} ${p.locked ? 'locked' : ''}`}
        />
    );
}

function HoldButton(p: { label: string; disabled?: boolean; onAct: () => void }): React.JSX.Element {
    return (
        <HoldTarget
            hold
            act={p.onAct}
            disabled={p.disabled}
            className="btn holdbtn"
        >
            {p.label}
        </HoldTarget>
    );
}

function Step(p: { value: string; onMinus: () => void; onPlus: () => void; disabled?: boolean }): React.JSX.Element {
    return (
        <div className={`step ${p.disabled ? 'dis' : ''}`}>
            <button
                type="button"
                onClick={p.onMinus}
            >
                −
            </button>
            <b>{p.value}</b>
            <button
                type="button"
                onClick={p.onPlus}
            >
                +
            </button>
        </div>
    );
}

/** Up/down bar below a long sheet (Sven 20.11.2026) */
function ScrollBar({ target }: { target: React.RefObject<HTMLDivElement | null> }): React.JSX.Element | null {
    const [st, setSt] = React.useState({ over: false, top: true, end: true });
    React.useEffect(() => {
        const el = target.current;
        if (!el) {
            return undefined;
        }
        const upd = (): void =>
            setSt({
                over: el.scrollHeight > el.clientHeight + 4,
                top: el.scrollTop <= 4,
                end: el.scrollTop + el.clientHeight >= el.scrollHeight - 4,
            });
        upd();
        el.addEventListener('scroll', upd);
        const ro = new ResizeObserver(upd);
        ro.observe(el);
        const mo = new MutationObserver(upd);
        mo.observe(el, { childList: true, subtree: true });
        return () => {
            el.removeEventListener('scroll', upd);
            ro.disconnect();
            mo.disconnect();
        };
    }, [target]);
    if (!st.over) {
        return null;
    }
    const go = (d: number): void =>
        target.current?.scrollBy({ top: d * target.current.clientHeight * 0.7, behavior: 'smooth' });
    return (
        <div className="sbar">
            <button
                type="button"
                className="sarrow"
                disabled={st.top}
                onClick={() => go(-1)}
                aria-label="nach oben"
            >
                ▲
            </button>
            <span>{st.end ? 'Ende' : 'mehr unten'}</span>
            <button
                type="button"
                className="sarrow"
                disabled={st.end}
                onClick={() => go(1)}
                aria-label="nach unten"
            >
                ▼
            </button>
        </div>
    );
}

export class BeckenAnsicht extends React.Component<BeckenProps, S> {
    state: S = {
        sheet: null,
        lampTab: 'farbe',
        wasserTab: 'temp',
        hand: { 1: 1, 2: 1, 3: 1 },
        fanHand: 11,
        hell: 100,
        renamePump: null,
        renameText: '',
        msg: '',
        scale: 1,
        now: Date.now(),
        sel: 'ww',
    };
    private canvas = React.createRef<HTMLCanvasElement>();
    private back = React.createRef<SVGSVGElement>();
    private front = React.createRef<SVGSVGElement>();
    private body = React.createRef<HTMLDivElement>();
    private stopTank?: () => void;
    private raf = 0;
    private clock?: ReturnType<typeof setInterval>;
    private parts: Array<{ p: SVGPathElement; L: number; d: number; v: number; el: SVGCircleElement }> = [];
    private hellBase: [number, number, number, number] | null = null;
    private model: Modell | null = null;

    componentDidMount(): void {
        ensureBeckenStyles();
        window.addEventListener('resize', this.fit);
        window.addEventListener('keydown', this.onKey);
        this.fit();
        this.clock = setInterval(() => this.setState({ now: Date.now() }), 30_000);
        if (this.canvas.current) {
            this.stopTank = startTank(this.canvas.current, {
                level: () => this.lampNow(),
                power: () => {
                    const [r, g, b, w] = this.channels();
                    return Math.min(1, Math.max(r, g, b, w) / 180);
                },
                rgb: () => {
                    const [r, g, b, w] = this.channels();
                    return lampRgb(r, g, b, w);
                },
                back: () => !!this.model?.sw.hinter,
                flow: () => !!this.model?.flow,
                bubbles: () => !!this.model?.valve && !!this.model?.flow,
                motion: () => this.props.motion,
            });
        }
        this.collectParts();
        let last = performance.now();
        let T = 0;
        const tick = (now: number): void => {
            const dt = this.props.motion ? Math.min(0.05, (now - last) / 1000) : 0;
            last = now;
            T += dt;
            for (const q of this.parts) {
                q.d = (q.d + q.v * dt) % q.L;
                const pt = q.p.getPointAtLength(q.d);
                q.el.setAttribute('cx', String(pt.x));
                q.el.setAttribute('cy', String(pt.y));
            }
            const rotor = this.back.current?.querySelector<SVGGElement>('[data-rotor]');
            if (rotor && this.model?.flow) {
                rotor.style.transform = `rotate(${T * 220}deg)`;
            }
            const fan = this.front.current?.querySelector<SVGGElement>('[data-fan]');
            if (fan && this.model?.fan.running) {
                fan.style.transform = `rotate(${T * 600}deg)`;
            }
            const reactor = this.back.current?.querySelector<SVGGElement>('[data-reactor]');
            if (reactor) {
                const on = !!this.model?.valve && !!this.model?.flow && this.props.motion;
                reactor.innerHTML = on
                    ? [0, 1, 2, 3, 4]
                          .map(
                              i =>
                                  `<circle cx="${396 + Math.sin(T * 4 + i) * 3}" cy="${466 - ((T * 6 + i * 24) % 116)}" r="${1.4 + (i % 2)}" fill="#d8ecff" opacity=".85"/>`,
                          )
                          .join('')
                    : '';
            }
            this.raf = requestAnimationFrame(tick);
        };
        this.raf = requestAnimationFrame(tick);
    }

    componentDidUpdate(): void {
        this.collectParts();
    }

    componentWillUnmount(): void {
        this.stopTank?.();
        cancelAnimationFrame(this.raf);
        clearInterval(this.clock);
        window.removeEventListener('resize', this.fit);
        window.removeEventListener('keydown', this.onKey);
    }

    private onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            if (this.state.sheet) {
                this.setState({ sheet: null });
            } else {
                this.props.onClose();
            }
        }
    };

    private fit = (): void => {
        // fills the screen (also larger than 1050 × 575, Sven 20.11.2026)
        const s = Math.min((window.innerWidth - 16) / W, (window.innerHeight - 16) / H);
        this.setState({ scale: Math.max(0.3, s) });
    };

    /** particles on the water path (rebuilt after every render of the SVG) */
    private collectParts(): void {
        const back = this.back.current;
        const front = this.front.current;
        const g = front?.querySelector('[data-parts]');
        if (!back || !g || !this.model) {
            return;
        }
        const list: Array<{ p: SVGPathElement; L: number; d: number; v: number; r: number; c: string }> = [];
        if (this.model.flow) {
            for (const k of Object.keys(PIPES)) {
                const p = back.querySelector<SVGPathElement>(`[data-pipe="${k}"]`);
                if (p) {
                    const L = p.getTotalLength();
                    for (let i = 0; i < Math.ceil(L / 15); i++) {
                        list.push({ p, L, d: i * 15, v: 20, r: 2.3, c: '#8aeaff' });
                    }
                }
            }
        }
        if (this.model.valve) {
            const p = back.querySelector<SVGPathElement>('[data-pipe="co2"]');
            if (p) {
                const L = p.getTotalLength();
                for (let i = 0; i < 4; i++) {
                    list.push({ p, L, d: (i * L) / 4, v: 14, r: 1.7, c: '#9ccfff' });
                }
            }
        }
        const sig = `${list.length}|${this.model.flow}|${this.model.valve}`;
        if (g.getAttribute('data-sig') === sig && this.parts.length === list.length) {
            return;
        }
        g.setAttribute('data-sig', sig);
        g.innerHTML = list.map(q => `<circle r="${q.r}" fill="${q.c}" filter="url(#zbGlow2)"/>`).join('');
        this.parts = list.map((q, i) => ({ p: q.p, L: q.L, d: q.d, v: q.v, el: g.children[i] as SVGCircleElement }));
    }

    // ---------------------------------------------------------------- values

    private v = (id: string): unknown => this.props.val(id);
    private n = (id: string): number | null => num(this.v(id));
    private has = (id: string): boolean => this.props.vorhanden.has(id);

    private channels(): [number, number, number, number] {
        return [this.n(IDS.red) ?? 0, this.n(IDS.green) ?? 0, this.n(IDS.blue) ?? 0, this.n(IDS.white) ?? 0];
    }

    // eslint-disable-next-line class-methods-use-this
    private minute(): number {
        const d = new Date();
        return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    }

    private lampNow(): number {
        if (this.v(IDS.lampOn) === false) {
            return 0;
        }
        const win = parseWindows(this.v(IDS.schedule));
        return lampLevel(this.minute(), win, this.n(IDS.sunrise) ?? 1, this.n(IDS.sunset) ?? 1);
    }

    private zeile = (k: string): Zeile | undefined => this.props.liste.find(z => z.key === k);
    private stufe = (k: string): Stufe => this.zeile(k)?.stufe ?? 'aus';
    private text = (k: string): string => this.zeile(k)?.text ?? '';

    private set(id: string, value: ioBroker.StateValue, msg: string): void {
        this.props.set(id, value);
        this.setState({ msg });
    }

    private buildModel(): Modell {
        const sw = {} as Record<PlugKey, boolean>;
        for (const k of PLUG_KEYS) {
            sw[k] = this.v(plugSwitch(k)) === true;
        }
        const pumps = PUMPS.map(n => flasche(n, f => this.v(pumpId(n, f))));
        const filter = this.zeile('filter');
        return {
            lit: this.lampNow() > 0,
            flow: sw.filter && (!filter || filter.stufe === 'ok'),
            heating: this.text('heizung').startsWith('heizt'),
            sw,
            stufe: this.stufe,
            text: this.text,
            valve: this.v(IDS.valve) === true,
            water: this.n(IDS.waterTemp),
            fan: { running: this.v(IDS.fanRunning) === true, level: this.n(IDS.fanLevel) ?? 0 },
            pumps,
            pm: false,
            lightText:
                this.v(IDS.lampOn) === false
                    ? 'aus (Zeitplan ruht)'
                    : lightText(this.minute(), parseWindows(this.v(IDS.schedule))),
            proxyOk: this.stufe('proxy') === 'ok',
        };
    }

    // ---------------------------------------------------------------- render

    private open = (k: string): void =>
        this.setState(st => ({
            sheet: k,
            msg: '',
            renamePump: null,
            wasserTab: k === 'luefter' ? 'kuehl' : k === 'doctor' ? 'temp' : st.wasserTab,
        }));

    private onDrawingClick = (e: React.MouseEvent): void => {
        const el = (e.target as Element).closest('[data-k]');
        const k = el?.getAttribute('data-k');
        if (k) {
            this.open(k);
        }
    };

    render(): React.JSX.Element {
        const m = this.buildModel();
        this.model = m;
        const s = this.state.scale;
        return createPortal(
            <div
                onPointerDown={e => {
                    if (e.target === e.currentTarget) {
                        this.props.onClose();
                    }
                }}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 2000,
                    background: 'rgba(10,10,12,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div style={{ width: W * s, height: H * s, flex: 'none' }}>
                    <div
                        className="zb"
                        role="dialog"
                        aria-label="Becken-Ansicht"
                        style={{ transform: s !== 1 ? `scale(${s})` : undefined, transformOrigin: 'top left' }}
                    >
                        <div className="grid" />
                        <svg
                            ref={this.back}
                            className="lay"
                            viewBox="0 0 730 575"
                            onClick={this.onDrawingClick}
                            dangerouslySetInnerHTML={{ __html: backSvg(m) }}
                        />
                        <canvas
                            ref={this.canvas}
                            className="tank"
                        />
                        <svg
                            ref={this.front}
                            className="lay"
                            viewBox="0 0 730 575"
                            onClick={this.onDrawingClick}
                            dangerouslySetInnerHTML={{ __html: frontSvg(m) }}
                        />
                        {this.renderSide(m)}
                        {this.state.sheet ? this.renderSheet(m, this.state.sheet) : null}
                    </div>
                </div>
            </div>,
            document.body,
        );
    }

    private renderSide(m: Modell): React.JSX.Element {
        const liste = this.props.liste;
        const rot = liste.filter(z => z.stufe === 'rot');
        const gelb = liste.filter(z => z.stufe === 'gelb');
        const ok = liste.filter(z => z.stufe === 'ok').length;
        const aus = liste.filter(z => z.stufe === 'aus').length;
        const win = parseWindows(this.v(IDS.schedule));
        const co2Win = parseWindows(this.v(FUTURE.co2Schedule));
        const pct = (x: number): string => `${(x / 1440) * 100}%`;
        const min = this.minute();
        const [r, g, b, w] = this.channels();
        const col = `rgb(${lampRgb(r, g, b, w).join(',')})`;
        const lastRead = this.props.ts(IDS.lastRead) ?? this.n(IDS.lastRead);
        const ago = lastRead ? Math.max(0, Math.round((this.state.now - lastRead) / 60000)) : null;
        const co2W = this.n(plugPower('co2Plug'));
        const timer = co2Win.length > 0 && !(co2Win.length === 1 && co2Win[0][0] === 0 && co2Win[0][1] >= 1439);
        return (
            <div className="side">
                <div className="head">
                    <div className="t">
                        <div className="k">AQUARIUM · TECHNIK</div>
                        <h2>Becken-Ansicht</h2>
                    </div>
                    <button
                        type="button"
                        className="x"
                        aria-label="Schließen"
                        onClick={this.props.onClose}
                    >
                        ✕
                    </button>
                </div>
                <div
                    className="card"
                    onClick={() => this.open('zustand')}
                    style={
                        rot.length
                            ? { borderColor: '#e5484d', background: 'rgba(80,20,24,.6)' }
                            : gelb.length
                              ? { borderColor: 'rgba(242,193,78,.6)' }
                              : undefined
                    }
                >
                    <div className="ct">
                        <span>ZUSTAND</span>
                        <span>{liste.length} Geräte ›</span>
                    </div>
                    <div className="stat">
                        <span className={`led ${rot.length ? 'rot' : gelb.length ? 'gelb' : 'ok'}`} />
                        {rot.length
                            ? rot.map(z => z.name).join(', ')
                            : gelb.length
                              ? `Läuft · ${gelb.length} Hinweis${gelb.length > 1 ? 'e' : ''}`
                              : liste.length
                                ? 'Alles läuft'
                                : 'keine Daten'}
                    </div>
                    {!rot.length && gelb.length ? (
                        <div
                            className="small"
                            style={{ color: '#f2d48a' }}
                        >
                            {gelb.map(z => (z.key === 'dosierpumpe' ? z.text : `${z.name}: ${z.text}`)).join(' · ')}
                        </div>
                    ) : null}
                    <div className="small">
                        {ok} ok · {aus} aus{gelb.length ? ` · ${gelb.length} Hinweis` : ''}
                        {rot.length ? ` · ${rot.length} Störung` : ''} · Wasser{' '}
                        {m.flow ? 'fließt' : <b style={{ color: '#ffb3b3' }}>steht</b>}
                    </div>
                </div>
                <div className="row2">
                    <div
                        className="card"
                        onClick={() => this.open('doctor')}
                    >
                        <div className="ct">
                            <span>WASSER</span>
                        </div>
                        <div className="num">
                            {m.water === null ? '–' : fmt(m.water)}
                            <small>°C</small>
                        </div>
                        <div className="small">
                            Grenzen {fmt(this.n(IDS.tempMin) ?? 20, 0)}–{fmt(this.n(IDS.tempMax) ?? 28, 0)} °C
                        </div>
                    </div>
                    <div
                        className="card"
                        onClick={() => this.open('co2')}
                    >
                        <div className="ct">
                            <span>CO₂</span>
                        </div>
                        <div
                            className="num"
                            style={{ color: m.valve ? '#7fbfff' : undefined }}
                        >
                            {m.valve ? 'offen' : 'zu'}
                        </div>
                        <div className="small">
                            {co2W === null ? '' : `${fmt(co2W, 1)} W · `}
                            {timer ? `Zeitschaltuhr · ${co2Win.length} Fenster` : 'läuft immer'}
                        </div>
                    </div>
                </div>
                <div
                    className="card"
                    onClick={() => this.open('lampe')}
                >
                    <div className="ct">
                        <span>LICHT</span>
                        <span style={{ color: 'var(--zb-text)' }}>
                            {m.lit ? (
                                <span
                                    className="sw8"
                                    style={{ background: col, boxShadow: `0 0 6px ${col}` }}
                                />
                            ) : null}
                            {m.lightText}
                        </span>
                    </div>
                    <div className="dl">
                        <span>Licht</span>
                        <div className="day24">
                            {win.map(([a, e]) => (
                                <i
                                    key={a}
                                    style={{ left: pct(a), width: pct(e - a), background: '#f2c14e' }}
                                />
                            ))}
                            <i
                                className="now"
                                style={{ left: pct(min) }}
                            />
                        </div>
                    </div>
                    {timer ? (
                        <div className="dl">
                            <span>CO₂</span>
                            <div className="day24">
                                {co2Win.map(([a, e]) => (
                                    <i
                                        key={a}
                                        style={{ left: pct(a), width: pct(e - a), background: '#4a8fe0' }}
                                    />
                                ))}
                                <i
                                    className="now"
                                    style={{ left: pct(min) }}
                                />
                            </div>
                        </div>
                    ) : null}
                    <div className="ticks">
                        <span>0</span>
                        <span>6</span>
                        <span>12</span>
                        <span>18</span>
                        <span>24</span>
                    </div>
                </div>
                <div
                    className="card"
                    onClick={() => this.open('dosierpumpe')}
                >
                    <div className="ct">
                        <span>DÜNGER</span>
                        <span>Warnung &lt; {this.n(IDS.warnDays) ?? 7} T</span>
                    </div>
                    <div className="bars">
                        {m.pumps.map(p => (
                            <div
                                key={p.n}
                                className="bar"
                            >
                                <span>{p.label}</span>
                                <span className="tr">
                                    <i
                                        style={{
                                            width: `${p.remaining === null ? 0 : Math.min(100, (p.remaining / p.refill) * 100)}%`,
                                            background: p.col,
                                        }}
                                    />
                                </span>
                                <b style={{ color: p.low ? '#f2d48a' : undefined }}>
                                    {p.days === null ? '–' : `${p.days} T`}
                                </b>
                            </div>
                        ))}
                    </div>
                </div>
                <div
                    className="card"
                    onClick={() => this.open('pflege')}
                >
                    <div className="ct">
                        <span>PFLEGE</span>
                        <span>Phase 7</span>
                    </div>
                    <div className="small">Fälligkeiten, Verlauf und Pflegemodus kommen mit dem Pflegemodul.</div>
                </div>
                <div className="foot">
                    <span>{ago === null ? 'Bluetooth: keine Lesung' : `Bluetooth gelesen vor ${ago} min`}</span>
                    <span>Stand {hhmm(min)}</span>
                </div>
            </div>
        );
    }

    private renderSheet(m: Modell, key: string): React.JSX.Element {
        const k =
            key === 'lampe' || key === 'hinter'
                ? 'licht'
                : key === 'dosierpumpe'
                  ? 'duenger'
                  : key === 'doctor' || key === 'luefter'
                    ? 'wasser'
                    : key;
        const titles: Record<string, [string, string]> = {
            zustand: ['ZUSTAND', `Alle ${this.props.liste.length} Geräte`],
            licht: ['LICHT', 'Lampe + Hintergrund'],
            duenger: ['DÜNGER', 'Dosierpumpe'],
            wasser: ['WASSER', 'Temperatur + Kühlung'],
            pflege: ['PFLEGE', 'Was ist fällig?'],
            co2: ['WASSER', 'CO₂-Ventil'],
            proxy: ['TECHNIK', 'Bluetooth-Proxy'],
        };
        const z = this.zeile(k);
        const [kind, title] = titles[k] ?? [z?.gruppe.toUpperCase() ?? '', z?.name ?? PLUGS[k as PlugKey]?.name ?? k];
        return (
            <div
                className="sheet"
                onClick={e => e.stopPropagation()}
            >
                <div className="sh">
                    <div style={{ flex: 1 }}>
                        <span className="k">{kind}</span>
                        <h4>{title}</h4>
                    </div>
                    {titles[k] && k !== 'co2' && k !== 'proxy' ? null : <span className={`led ${this.stufe(k)}`} />}
                    <button
                        type="button"
                        className="x"
                        aria-label="Fenster schließen"
                        onClick={() => this.setState({ sheet: null })}
                    >
                        ✕
                    </button>
                </div>
                <div
                    className="body"
                    ref={this.body}
                >
                    {this.sheetBody(m, k)}
                </div>
                <ScrollBar target={this.body} />
                <div className="msg">{this.state.msg}</div>
            </div>
        );
    }

    private sheetBody(m: Modell, k: string): React.ReactNode {
        if ((PLUG_KEYS as string[]).includes(k)) {
            return this.plugBody(m, k as PlugKey);
        }
        switch (k) {
            case 'zustand':
                return this.zustandBody();
            case 'licht':
                return this.lichtBody(m);
            case 'co2':
                return this.co2Body(m);
            case 'duenger':
                return this.duengerBody(m);
            case 'wasser':
                return this.wasserBody(m);
            case 'pflege':
                return this.pflegeBody();
            case 'proxy':
                return (
                    <>
                        <div className="big">
                            <b>{m.proxyOk ? 'verbunden' : 'getrennt'}</b>
                            <span>
                                Atom Lite · ESPHome{' '}
                                {typeof this.v('chihiros.0.info.proxyVersion') === 'string'
                                    ? (this.v('chihiros.0.info.proxyVersion') as string)
                                    : ''}
                            </span>
                        </div>
                        <div className="box">
                            <div className="line">
                                <span className="k">Zustand</span>
                                <span>{this.text('proxy')}</span>
                            </div>
                        </div>
                    </>
                );
        }
        return <div className="small">{this.text(k)}</div>;
    }

    private plugBody(m: Modell, k: PlugKey): React.ReactNode {
        const why: Partial<Record<PlugKey, string>> = {
            filter: 'Ohne Filter stehen Heizung, UV und CO₂-Eintrag.',
            heizung: 'Sitzt am Boden des Filters, heizt nur bei Durchfluss.',
            uv: 'Läuft nur sinnvoll mit Filter.',
            skimmer: 'Kann zum Füttern kurz aus.',
            nachfuell: 'Füllt verdunstetes Wasser nach.',
            hinter: 'Läuft immer zusammen mit der Hauptlampe.',
        };
        const on = m.sw[k];
        const w = this.n(plugPower(k));
        if (LOCKED.includes(k)) {
            return (
                <div className="box">
                    <div className="line">
                        <span>Steckdose</span>
                        <Switch
                            on={on}
                            locked
                            label="Steckdose"
                            onToggle={() => undefined}
                        />
                    </div>
                    <div className="small">
                        Muss <b>immer an</b> sein – geschaltet wird per Bluetooth. {this.text(k)}
                    </div>
                </div>
            );
        }
        return (
            <>
                <div className="big">
                    <b>{this.stufe(k) === 'rot' ? 'Störung' : on ? 'an' : 'aus'}</b>
                    <span>
                        {this.text(k)}
                        {w !== null && !this.text(k).includes('W') ? ` · ${fmt(w, 0)} W` : ''}
                    </span>
                </div>
                <div className="box">
                    <div className="line">
                        <span>Steckdose schalten</span>
                        <Switch
                            on={on}
                            hold={PLUGS[k].hold}
                            label={PLUGS[k].name}
                            onToggle={() => this.set(plugSwitch(k), !on, `${PLUGS[k].name} ${on ? 'aus' : 'ein'} …`)}
                        />
                    </div>
                    <div className="small">
                        {PLUGS[k].hold ? 'Ausschalten nur durch 1 s Halten. ' : ''}
                        {why[k] ?? ''}
                    </div>
                </div>
            </>
        );
    }

    private zustandBody(): React.ReactNode {
        const liste = this.props.liste;
        const row = (z: Zeile): React.JSX.Element => (
            <button
                key={z.key}
                type="button"
                className={`zrow ${z.stufe}`}
                onClick={() => this.open(z.key)}
            >
                <span className={`led ${z.stufe}`} />
                <span>{z.name}</span>
                <span className="zt">{z.text}</span>
            </button>
        );
        const bad = liste
            .filter(z => z.stufe === 'rot' || z.stufe === 'gelb')
            .sort((a, b) => ORDER[a.stufe] - ORDER[b.stufe]);
        const groups = [...new Set(liste.map(z => z.gruppe))];
        return (
            <>
                {bad.length ? (
                    <div
                        className="box"
                        style={{ gap: 0 }}
                    >
                        {bad.map(row)}
                    </div>
                ) : null}
                {groups.map(g => (
                    <div key={g}>
                        <div className="zg">{g.toUpperCase()}</div>
                        {liste.filter(z => z.gruppe === g && !bad.includes(z)).map(row)}
                    </div>
                ))}
                <div className="small">
                    Rot = Störung (Telegram nach 2 min) · Gelb = Hinweis · Grau = absichtlich aus.
                </div>
            </>
        );
    }

    private writeChannels(c: [number, number, number, number], msg: string): void {
        const ids = [IDS.red, IDS.green, IDS.blue, IDS.white];
        c.forEach((x, i) => this.props.set(ids[i], Math.max(0, Math.min(255, Math.round(x)))));
        this.setState({ msg });
    }

    private vorlagen(): Vorlage[] {
        return parseVorlagen(this.v(VORLAGEN_ID));
    }

    private lichtBody(m: Modell): React.ReactNode {
        const on = this.v(IDS.lampOn) !== false;
        const tab = this.state.lampTab;
        const [r, g, b, w] = this.channels();
        const win = parseWindows(this.v(IDS.schedule));
        const canPlan = this.has(FUTURE.lampSchedule);
        const canSave = this.has(VORLAGEN_ID);
        const list = this.vorlagen();
        const chSlider = (id: string, label: string, colour: string, value: number): React.JSX.Element => (
            <div
                className="sl"
                style={{ '--c': colour } as React.CSSProperties}
            >
                <span>{label}</span>
                <input
                    type="range"
                    min={0}
                    max={255}
                    defaultValue={value}
                    key={`${id}-${value}`}
                    onPointerUp={e =>
                        this.set(
                            id,
                            Number((e.target as HTMLInputElement).value),
                            `${label} → ${(e.target as HTMLInputElement).value}`,
                        )
                    }
                    onKeyUp={e =>
                        this.set(
                            id,
                            Number((e.target as HTMLInputElement).value),
                            `${label} → ${(e.target as HTMLInputElement).value}`,
                        )
                    }
                    onInput={e => {
                        const t = e.target as HTMLInputElement;
                        (t.nextElementSibling as HTMLElement).textContent = t.value;
                    }}
                />
                <b>{value}</b>
            </div>
        );
        return (
            <>
                <div className="big">
                    <b>{m.lit ? 'an' : 'aus'}</b>
                    <span>{m.lightText} · Rückwand läuft mit</span>
                </div>
                <div className="seg2">
                    <button
                        type="button"
                        className={on ? 'on' : ''}
                        onClick={() => this.set(IDS.lampOn, true, 'Lampe nach Zeitplan …')}
                    >
                        Nach Zeitplan
                    </button>
                    <button
                        type="button"
                        className={!on ? 'on' : ''}
                        onClick={() => this.set(IDS.lampOn, false, 'Lampe aus …')}
                    >
                        Aus
                    </button>
                </div>
                <div className="seg2 tabs">
                    <button
                        type="button"
                        className={tab === 'farbe' ? 'on' : ''}
                        onClick={() => this.setState({ lampTab: 'farbe' })}
                    >
                        Farbe
                    </button>
                    <button
                        type="button"
                        className={tab === 'zeit' ? 'on' : ''}
                        onClick={() => this.setState({ lampTab: 'zeit' })}
                    >
                        Zeitplan
                    </button>
                </div>
                {tab === 'farbe' ? (
                    <>
                        <div className="box">
                            <div
                                className="sl"
                                style={{ '--c': '#f2c14e' } as React.CSSProperties}
                            >
                                <span>Hell %</span>
                                <input
                                    type="range"
                                    min={5}
                                    max={150}
                                    value={this.state.hell}
                                    onPointerDown={() => (this.hellBase = this.channels())}
                                    onChange={e => this.setState({ hell: Number(e.target.value) })}
                                    onPointerUp={() => {
                                        const base = this.hellBase ?? this.channels();
                                        const f = this.state.hell / 100;
                                        this.writeChannels(
                                            base.map(x => x * f) as [number, number, number, number],
                                            `Helligkeit ${this.state.hell} % → alle vier Kanäle`,
                                        );
                                        this.hellBase = null;
                                        this.setState({ hell: 100 });
                                    }}
                                />
                                <b>{this.state.hell}</b>
                            </div>
                            {chSlider(IDS.red, 'Rot', '#e5484d', r)}
                            {chSlider(IDS.green, 'Grün', '#6fe08a', g)}
                            {chSlider(IDS.blue, 'Blau', '#4aa3ff', b)}
                            {chSlider(IDS.white, 'Weiß', '#ece9e1', w)}
                        </div>
                        <div className="box">
                            <div className="line">
                                <span className="k">Farb-Vorlagen</span>
                                <button
                                    type="button"
                                    className="btn"
                                    disabled={!canSave}
                                    onClick={() => {
                                        const next = [...list, { name: neuerName(list), r, g, b, w, eigen: true }];
                                        this.set(VORLAGEN_ID, vorlagenJson(next), 'Vorlage gespeichert');
                                    }}
                                >
                                    + aktuelle speichern
                                </button>
                            </div>
                            <div className="presets">
                                {list.map(p => {
                                    const c = lampRgb(p.r, p.g, p.b, p.w).join(',');
                                    const act = p.r === r && p.g === g && p.b === b && p.w === w;
                                    return (
                                        <button
                                            key={p.name}
                                            type="button"
                                            className={act ? 'on' : ''}
                                            onClick={() =>
                                                this.writeChannels([p.r, p.g, p.b, p.w], `Vorlage „${p.name}“`)
                                            }
                                        >
                                            <i style={{ background: `rgb(${c})` }} />
                                            <span className="pn">{p.name}</span>
                                            {p.eigen ? (
                                                <span
                                                    role="button"
                                                    className="del"
                                                    aria-label={`${p.name} löschen`}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        this.set(
                                                            VORLAGEN_ID,
                                                            vorlagenJson(list.filter(x => x !== p)),
                                                            `„${p.name}“ gelöscht`,
                                                        );
                                                    }}
                                                >
                                                    ✕
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                            {!canSave ? (
                                <div className="hint">
                                    Eigene Vorlagen speichern: Datenpunkt lichtVorlagen fehlt noch (aquarium.js).
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="box">
                            {win.map(([a, e], i) => (
                                <div
                                    key={a}
                                    className="line"
                                >
                                    <span className="k">{i + 1}.</span>
                                    <span>
                                        {hhmm(a)} bis {hhmm(e)}
                                    </span>
                                </div>
                            ))}
                            <div className="line">
                                <span className="k">Licht am Tag</span>
                                <span>{fmt(win.reduce((t, [a, e]) => t + e - a, 0) / 60, 1)} h</span>
                            </div>
                        </div>
                        <div className="box">
                            <div className="line">
                                <span className="k">☀ Sonnenaufgang</span>
                                <span>{this.n(IDS.sunrise) ?? 1} min</span>
                            </div>
                            <div className="line">
                                <span className="k">☾ Sonnenuntergang</span>
                                <span>{this.n(IDS.sunset) ?? 1} min</span>
                            </div>
                        </div>
                        {!canPlan ? (
                            <div className="hint">
                                Zeitfenster, Sonnenauf- und -untergang ändern kommt mit dem Adapter-Update (Schreibtest
                                mit Sven). Bis dahin in der Chihiros-App.
                            </div>
                        ) : null}
                        {canPlan ? <div className="small">Neuer Zeitplan: {windowsText(win)}</div> : null}
                    </>
                )}
            </>
        );
    }

    private co2Body(m: Modell): React.ReactNode {
        const on = this.v(IDS.co2On) !== false;
        const w = this.n(plugPower('co2Plug'));
        const canTimer = this.has(FUTURE.co2Schedule);
        return (
            <>
                <div className="big">
                    <b>{m.valve ? 'offen' : 'zu'}</b>
                    <span>Ventil{w === null ? '' : ` · ${fmt(w, 2)} W`}</span>
                </div>
                <div className="box">
                    <div className="line">
                        <span>CO₂ an</span>
                        <Switch
                            on={on}
                            label="CO₂"
                            onToggle={() =>
                                this.set(IDS.co2On, !on, `CO₂ ${on ? 'aus' : 'an'} … Bestätigung über die Leistung`)
                            }
                        />
                    </div>
                    <div className="small">
                        Über den Controller (Bluetooth), Bestätigung ca. 10 s später über die Leistung.
                    </div>
                </div>
                <div className="box">
                    <div className="line">
                        <span>Zeitschaltuhr</span>
                        <span className="k">
                            {canTimer ? windowsText(parseWindows(this.v(FUTURE.co2Schedule))) : 'aus · läuft immer'}
                        </span>
                    </div>
                    {!canTimer ? (
                        <div className="hint">Zeitschaltuhr mit mehreren Fenstern kommt mit dem Adapter-Update.</div>
                    ) : null}
                </div>
            </>
        );
    }

    private duengerBody(m: Modell): React.ReactNode {
        const warn = this.n(IDS.warnDays) ?? 7;
        return (
            <>
                {m.pumps.map(p => {
                    const hand = this.state.hand[p.n] ?? 1;
                    const rename = this.state.renamePump === p.n;
                    return (
                        <div
                            key={p.n}
                            className="box"
                        >
                            <div className="line">
                                {rename ? (
                                    <input
                                        className="name"
                                        value={this.state.renameText}
                                        onChange={e => this.setState({ renameText: e.target.value })}
                                    />
                                ) : (
                                    <b style={{ color: p.col }}>
                                        P{p.n} · {p.label}
                                    </b>
                                )}
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => {
                                        if (rename) {
                                            const t = this.state.renameText.trim();
                                            if (t) {
                                                this.set(pumpId(p.n, 'label'), t, `P${p.n} heißt jetzt „${t}“`);
                                            }
                                            this.setState({ renamePump: null });
                                        } else {
                                            this.setState({ renamePump: p.n, renameText: p.label });
                                        }
                                    }}
                                >
                                    {rename ? 'Speichern' : 'umbenennen'}
                                </button>
                            </div>
                            <div
                                className="bar"
                                style={{ gridTemplateColumns: '1fr 80px' }}
                            >
                                <span className="tr">
                                    <i
                                        style={{
                                            width: `${p.remaining === null ? 0 : Math.min(100, (p.remaining / p.refill) * 100)}%`,
                                            background: p.col,
                                        }}
                                    />
                                </span>
                                <b style={{ color: p.low ? '#f2d48a' : undefined }}>
                                    {p.remaining === null
                                        ? 'nicht befüllt'
                                        : p.days === null
                                          ? 'neu'
                                          : `${p.days} Tage`}
                                </b>
                            </div>
                            <div className="small">
                                {p.remaining === null
                                    ? 'Flasche leer / ungenutzt'
                                    : `${fmt(p.remaining, 0)} von ${p.refill} ml · ${p.daily ? `${fmt(p.daily, 1)} ml/Tag (gelernt)` : 'Tagesdosis wird gelernt'}`}
                            </div>
                            <div className="line">
                                <span className="k">Flasche</span>
                                <Step
                                    value={`${p.refill} ml`}
                                    onMinus={() =>
                                        this.set(
                                            pumpId(p.n, 'refillAmount'),
                                            Math.max(50, p.refill - 50),
                                            `Flasche P${p.n}: ${p.refill - 50} ml`,
                                        )
                                    }
                                    onPlus={() =>
                                        this.set(
                                            pumpId(p.n, 'refillAmount'),
                                            Math.min(2000, p.refill + 50),
                                            `Flasche P${p.n}: ${p.refill + 50} ml`,
                                        )
                                    }
                                />
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() =>
                                        this.set(
                                            pumpId(p.n, 'refilled'),
                                            true,
                                            `P${p.n} ${p.remaining === null ? 'befüllt' : 'nachgefüllt'}`,
                                        )
                                    }
                                >
                                    {p.remaining === null ? 'Befüllt – aktivieren' : 'Nachgefüllt'}
                                </button>
                            </div>
                            <div className="line">
                                <span className="k">Handdosis</span>
                                <Step
                                    value={`${fmt(hand, 1)} ml`}
                                    onMinus={() =>
                                        this.setState({
                                            hand: { ...this.state.hand, [p.n]: Math.max(0.5, hand - 0.5) },
                                        })
                                    }
                                    onPlus={() =>
                                        this.setState({
                                            hand: { ...this.state.hand, [p.n]: Math.min(MAX_DOSE, hand + 0.5) },
                                        })
                                    }
                                />
                                <HoldButton
                                    label="Dosieren"
                                    disabled={p.remaining === null}
                                    onAct={() =>
                                        this.set(
                                            pumpId(p.n, 'doseNow'),
                                            hand,
                                            `P${p.n}: ${fmt(hand, 1)} ml … Bestätigung über den Zähler`,
                                        )
                                    }
                                />
                            </div>
                        </div>
                    );
                })}
                <div className="box">
                    <div className="line">
                        <span className="k">Warnen, wenn Rest unter</span>
                        <Step
                            value={`${warn} Tage`}
                            onMinus={() =>
                                this.set(IDS.warnDays, Math.max(1, warn - 1), `Warnung unter ${warn - 1} Tagen`)
                            }
                            onPlus={() =>
                                this.set(IDS.warnDays, Math.min(30, warn + 1), `Warnung unter ${warn + 1} Tagen`)
                            }
                        />
                    </div>
                    <div className="small">
                        Dosierzeiten und Tagesmengen stellt die Chihiros-App ein. „Dosieren“ 1 s halten, max. {MAX_DOSE}{' '}
                        ml.
                    </div>
                </div>
            </>
        );
    }

    private wasserBody(m: Modell): React.ReactNode {
        const tab = this.state.wasserTab;
        const tMin = this.n(IDS.tempMin) ?? 20;
        const tMax = this.n(IDS.tempMax) ?? 28;
        const head = (
            <>
                <div className="big">
                    <b>{m.water === null ? '–' : `${fmt(m.water)} °C`}</b>
                    <span>Wasser · Doctor 5{m.fan.running ? ` · Lüfter Stufe ${m.fan.level}` : ''}</span>
                </div>
                <div className="seg2 tabs">
                    <button
                        type="button"
                        className={tab === 'temp' ? 'on' : ''}
                        onClick={() => this.setState({ wasserTab: 'temp' })}
                    >
                        Temperatur
                    </button>
                    <button
                        type="button"
                        className={tab === 'kuehl' ? 'on' : ''}
                        onClick={() => this.setState({ wasserTab: 'kuehl' })}
                    >
                        Kühlung (Lüfter)
                    </button>
                </div>
            </>
        );
        if (tab === 'temp') {
            return (
                <>
                    {head}
                    <div className="box">
                        <div className="line">
                            <span className="k">Alarm unter</span>
                            <Step
                                value={`${fmt(tMin)} °C`}
                                onMinus={() => this.set(IDS.tempMin, tMin - 0.5, `Untere Grenze ${fmt(tMin - 0.5)} °C`)}
                                onPlus={() =>
                                    this.set(
                                        IDS.tempMin,
                                        Math.min(tMax - 0.5, tMin + 0.5),
                                        `Untere Grenze ${fmt(tMin + 0.5)} °C`,
                                    )
                                }
                            />
                        </div>
                        <div className="line">
                            <span className="k">Alarm über</span>
                            <Step
                                value={`${fmt(tMax)} °C`}
                                onMinus={() =>
                                    this.set(
                                        IDS.tempMax,
                                        Math.max(tMin + 0.5, tMax - 0.5),
                                        `Obere Grenze ${fmt(tMax - 0.5)} °C`,
                                    )
                                }
                                onPlus={() => this.set(IDS.tempMax, tMax + 0.5, `Obere Grenze ${fmt(tMax + 0.5)} °C`)}
                            />
                        </div>
                    </div>
                    <div className="box">
                        <div className="line">
                            <span className="k">Doctor-Betriebsart</span>
                            <span>{this.v(IDS.mode) === 'shrimp' ? 'Garnelen' : 'Fische'}</span>
                        </div>
                        <div className="small">Dauerhaft Fische (festgelegt 18.11.).</div>
                    </div>
                    {!this.has(FUTURE.tempHistory) ? (
                        <div className="hint">Temperaturkurve der letzten 24 h kommt mit dem Adapter-Update.</div>
                    ) : null}
                </>
            );
        }
        // cooling
        const multi = this.has(FUTURE.fanCurve);
        const curve: Curve = multi
            ? parseCurve(this.v(FUTURE.fanCurve), null, null)
            : parseCurve(undefined, this.n(IDS.fanOnTemp), this.n(IDS.fanAutoLevel));
        const auto = this.v(IDS.fanAuto) === true;
        const installed = this.has(FUTURE.fanInstalled) ? this.v(FUTURE.fanInstalled) === true : true;
        const off = this.n(IDS.fanOffTemp) ?? curve[0][0] - 0.5;
        const now = m.water === null ? 0 : fanLevelFor(m.water, curve);
        const GW = 300;
        const GH = 90;
        const X = (t: number): number => ((t - 24) / 6) * GW;
        const Y = (l: number): number => GH - 4 - (l / 20) * (GH - 18);
        const pts: Curve = [[24, 0], [curve[0][0], 0], ...curve, [30, curve[curve.length - 1][1]]];
        const manual = !auto && m.fan.running;
        const setCurve = (c: Curve, msg: string): void => {
            if (multi) {
                this.set(FUTURE.fanCurve, JSON.stringify(c), msg);
            } else {
                this.props.set(IDS.fanOnTemp, c[0][0]);
                this.set(IDS.fanAutoLevel, c[0][1], msg);
            }
        };
        return (
            <>
                {head}
                <div className="box">
                    <div className="line">
                        <span>Eingebaut</span>
                        <Switch
                            on={installed}
                            locked={!this.has(FUTURE.fanInstalled)}
                            label="Lüfter eingebaut"
                            onToggle={() =>
                                this.set(
                                    FUTURE.fanInstalled,
                                    !installed,
                                    `Lüfter ${installed ? 'eingemottet' : 'eingebaut'}`,
                                )
                            }
                        />
                        <span className="k">Automatik</span>
                        <Switch
                            on={auto}
                            label="Automatik"
                            onToggle={() => this.set(IDS.fanAuto, !auto, `Automatik ${auto ? 'aus' : 'an'}`)}
                        />
                    </div>
                    {!installed ? (
                        <div className="small">Lüfter eingemottet (Winter) – keine Steuerung, kein Alarm.</div>
                    ) : null}
                </div>
                {installed ? (
                    <>
                        <div className="box">
                            <div className="line">
                                <span>Von Hand</span>
                                <Step
                                    value={String(this.state.fanHand)}
                                    onMinus={() => this.setState({ fanHand: Math.max(1, this.state.fanHand - 1) })}
                                    onPlus={() => this.setState({ fanHand: Math.min(20, this.state.fanHand + 1) })}
                                />
                                {manual ? (
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => {
                                            this.props.set(IDS.fanLevel, 0);
                                            this.set(IDS.fanAuto, true, 'Lüfter aus, Automatik übernimmt wieder');
                                        }}
                                    >
                                        Stoppen
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn prim"
                                        onClick={() => {
                                            this.props.set(IDS.fanAuto, false);
                                            this.set(
                                                IDS.fanLevel,
                                                this.state.fanHand,
                                                `Lüfter Stufe ${this.state.fanHand}, Automatik pausiert`,
                                            );
                                        }}
                                    >
                                        Starten
                                    </button>
                                )}
                            </div>
                            {manual ? (
                                <div className="small">
                                    Läuft von Hand · Stufe {m.fan.level}
                                    {this.has(FUTURE.fanResume) ? ' · Automatik nach 3 h wieder an' : ''}
                                </div>
                            ) : null}
                        </div>
                        <div className="box">
                            <div className="line">
                                <span className="k">Kennlinie</span>
                                <span className="k">jetzt {now ? `Stufe ${now}` : 'aus'}</span>
                            </div>
                            <svg
                                viewBox={`0 0 ${GW} ${GH + 12}`}
                                style={{ width: '100%', height: 90 }}
                            >
                                {[24, 25, 26, 27, 28, 29, 30].map(t => (
                                    <g key={t}>
                                        <line
                                            x1={X(t)}
                                            x2={X(t)}
                                            y1={0}
                                            y2={GH}
                                            stroke="#333338"
                                        />
                                        <text
                                            x={X(t)}
                                            y={GH + 10}
                                            textAnchor="middle"
                                            style={{ font: '500 9px var(--zb-font)', fill: '#8a877f' }}
                                        >
                                            {t}°
                                        </text>
                                    </g>
                                ))}
                                <line
                                    x1={X(off)}
                                    x2={X(off)}
                                    y1={0}
                                    y2={GH}
                                    stroke="#8a877f"
                                    strokeDasharray="2 3"
                                />
                                <polyline
                                    points={pts.map(([t, l]) => `${X(t)},${Y(l)}`).join(' ')}
                                    fill="none"
                                    stroke="#9cc8ff"
                                    strokeWidth={2}
                                />
                                {m.water !== null ? (
                                    <line
                                        x1={X(m.water)}
                                        x2={X(m.water)}
                                        y1={0}
                                        y2={GH}
                                        stroke="#f2c14e"
                                        strokeWidth={1.5}
                                    />
                                ) : null}
                                {curve.map(([t, l]) => (
                                    <g key={t}>
                                        <circle
                                            cx={X(t)}
                                            cy={Y(l)}
                                            r={5}
                                            fill="#9cc8ff"
                                            stroke="#17181b"
                                            strokeWidth={2}
                                        />
                                        <text
                                            x={X(t)}
                                            y={Y(l) - 9}
                                            textAnchor="middle"
                                            style={{ font: '600 9.5px var(--zb-font)', fill: '#cfccc4' }}
                                        >
                                            {l}
                                        </text>
                                    </g>
                                ))}
                            </svg>
                            {curve.map(([t, l], i) => (
                                <div
                                    key={i}
                                    className="line"
                                >
                                    <span className="k">P{i + 1}</span>
                                    <Step
                                        value={`${fmt(t)} °C`}
                                        onMinus={() =>
                                            setCurve(
                                                curve.map((p, j) => (j === i ? [t - 0.5, l] : p)),
                                                `P${i + 1}: ${fmt(t - 0.5)} °C`,
                                            )
                                        }
                                        onPlus={() =>
                                            setCurve(
                                                curve.map((p, j) => (j === i ? [t + 0.5, l] : p)),
                                                `P${i + 1}: ${fmt(t + 0.5)} °C`,
                                            )
                                        }
                                    />
                                    <Step
                                        value={`St. ${l}`}
                                        onMinus={() =>
                                            setCurve(
                                                curve.map((p, j) => (j === i ? [t, Math.max(1, l - 1)] : p)),
                                                `P${i + 1}: Stufe ${l - 1}`,
                                            )
                                        }
                                        onPlus={() =>
                                            setCurve(
                                                curve.map((p, j) => (j === i ? [t, Math.min(20, l + 1)] : p)),
                                                `P${i + 1}: Stufe ${l + 1}`,
                                            )
                                        }
                                    />
                                    {multi && curve.length > 1 ? (
                                        <button
                                            type="button"
                                            className="del"
                                            onClick={() =>
                                                setCurve(
                                                    curve.filter((_, j) => j !== i),
                                                    `P${i + 1} gelöscht`,
                                                )
                                            }
                                        >
                                            ✕
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                            <div className="line">
                                {multi ? (
                                    <button
                                        type="button"
                                        className="btn"
                                        disabled={curve.length >= 6}
                                        onClick={() => {
                                            const l = curve[curve.length - 1];
                                            setCurve(
                                                [...curve, [Math.min(30, l[0] + 0.5), Math.min(20, l[1] + 2)]],
                                                'Punkt hinzugefügt',
                                            );
                                        }}
                                    >
                                        + Punkt
                                    </button>
                                ) : null}
                                <span className="k">aus bei</span>
                                <Step
                                    value={`${fmt(off)}°`}
                                    onMinus={() => this.set(IDS.fanOffTemp, off - 0.1, `Aus bei ${fmt(off - 0.1)} °C`)}
                                    onPlus={() =>
                                        this.set(
                                            IDS.fanOffTemp,
                                            Math.min(curve[0][0] - 0.1, off + 0.1),
                                            `Aus bei ${fmt(off + 0.1)} °C`,
                                        )
                                    }
                                />
                                {multi ? (
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => setCurve(CURVE_DEFAULT, 'Standard-Kennlinie')}
                                    >
                                        Standard
                                    </button>
                                ) : null}
                            </div>
                            {!multi ? (
                                <div className="hint">
                                    Mehrere Punkte und 3-h-Pause kommen mit dem Adapter-Update; bis dahin eine Stufe ab
                                    einer Temperatur.
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}
            </>
        );
    }

    private pflegeBody(): React.ReactNode {
        const sel = AUFGABEN.find(a => a.k === this.state.sel) ?? AUFGABEN[0];
        return (
            <>
                <button
                    type="button"
                    className="btn prim wide"
                    disabled
                >
                    Pflege starten
                </button>
                <div className="rings">
                    {AUFGABEN.map(t => {
                        const f = faellig(t.iv, null);
                        const r = 16;
                        const c = 2 * Math.PI * r;
                        return (
                            <button
                                key={t.k}
                                type="button"
                                className={`ring ${t.k === sel.k ? 'sel' : ''}`}
                                onClick={() => this.setState({ sel: t.k })}
                            >
                                <svg
                                    width={44}
                                    height={44}
                                    viewBox="0 0 44 44"
                                >
                                    <circle
                                        cx={22}
                                        cy={22}
                                        r={r}
                                        fill="none"
                                        stroke="#3a3a40"
                                        strokeWidth={4}
                                    />
                                    <circle
                                        cx={22}
                                        cy={22}
                                        r={r}
                                        fill="none"
                                        stroke={LED.aus}
                                        strokeWidth={4}
                                        strokeDasharray={`${c * f.frac} ${c}`}
                                        transform="rotate(-90 22 22)"
                                    />
                                    <g
                                        transform="translate(10 10)"
                                        fill="none"
                                        stroke="#cfccc3"
                                        strokeWidth={1.6}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d={TASK_ICONS[t.k]} />
                                    </g>
                                </svg>
                                <span className="rn">{t.n}</span>
                                <span className="rd">{t.iv ? `alle ${t.iv} T` : 'ohne Frist'}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="hint">
                    Pflegemodus (Geräte aus/an mit Prüfung), „Heute erledigt“, Verlauf und Wasserwechsel in % kommen mit
                    dem Pflegemodul (Phase 7). Letzte Pflege laut Sven: 13.11. Wasserwechsel 60 %, Rückschnitt,
                    Vorfilter, Scheiben.
                </div>
            </>
        );
    }
}
