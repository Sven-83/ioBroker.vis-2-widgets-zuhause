/*
 * Detail view of the star projector (long press on the tile): colour ring, arc sliders for the laser
 * (left: intensity, right: rotation), buttons for lamp / laser / colour light, slider for the colour
 * brightness. In the middle an animated preview: green laser stars over a nebula in the chosen colour.
 * Kept in its own file, so the widget can be removed without touching the other popups.
 */
import React from 'react';

import { POPUP_CLOSE_MS } from '../lib/plan';
import {
    arcShare,
    angleOf,
    clamp,
    type Hsv,
    hsvToRgb,
    hueSatAt,
    INTENSITY,
    pointAt,
    ROTATION,
    rotationShown,
} from '../lib/sterne';
import { v } from '../lib/theme';
import { Frame, useAutoClose } from './ControlPopups';

const SIZE = 330;
const C = SIZE / 2;
const R_IN = 76;
const R_OUT = 117;
const R_ARC = 146;
/** laser intensity: bottom left → top left */
const ARC_L: [number, number] = [205, 335];
/** rotation: bottom right → top right */
const ARC_R: [number, number] = [155, 25];
const SKY = 144;
const RING_MASK = `radial-gradient(circle, transparent ${R_IN - 1}px, #000 ${R_IN}px, #000 ${R_OUT}px, transparent ${R_OUT + 1}px)`;

type Drag = 'colour' | 'int' | 'rot' | null;

interface Draft {
    colour?: Hsv;
    colourFrom?: string;
    intensity?: number;
    intensityFrom?: number;
    rotation?: number;
    rotationFrom?: number;
}

export interface SternePopupProps {
    title: string;
    status: string;
    online: boolean;
    power: boolean;
    laser: boolean;
    rgb: boolean;
    intensity: number;
    rotation: number;
    colour: Hsv;
    motion: boolean;
    onPower: (on: boolean) => void;
    onLaser: (on: boolean) => void;
    onRgb: (on: boolean) => void;
    onIntensity: (value: number) => void;
    onRotation: (value: number) => void;
    onColour: (colour: Hsv) => void;
    onClose: () => void;
}

function Btn(p: { on: boolean; disabled?: boolean; onClick: () => void; label: string }): React.JSX.Element {
    return (
        <button
            type="button"
            className="zh-btn"
            aria-pressed={p.on}
            aria-label={p.label}
            disabled={p.disabled}
            onClick={p.onClick}
            style={{
                width: 96,
                height: 44,
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                opacity: p.disabled ? 0.38 : 1,
                cursor: p.disabled ? 'default' : 'pointer',
                ...(p.on
                    ? { background: v('sw-on'), border: `1px solid ${v('sw-on')}`, color: v('sw-on-fg') }
                    : { background: v('sw-off-bg'), border: `1px solid ${v('sw-off-bd')}`, color: v('sw-off-fg') }),
            }}
        >
            {p.on ? 'An' : 'Aus'}
        </button>
    );
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }): React.JSX.Element {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', alignItems: 'center', gap: 8, minHeight: 48 }}>
            <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', flexDirection: 'column' }}>
                {label}
                <span style={{ fontSize: 11, color: v('text-2'), fontWeight: 500 }}>{sub}</span>
            </span>
            {children}
        </div>
    );
}

interface SkyValues {
    power: boolean;
    laser: boolean;
    rgb: boolean;
    intensity: number;
    rotation: number;
    colour: Hsv;
    motion: boolean;
}

/** Animated preview: nebula in the colour, green laser stars turning with the rotation */
function SkyPreview(p: SkyValues): React.JSX.Element {
    const canvas = React.useRef<HTMLCanvasElement>(null);
    const values = React.useRef(p);
    React.useLayoutEffect(() => {
        values.current = p;
    });

    React.useEffect(() => {
        const cv = canvas.current;
        const cx = cv?.getContext('2d');
        if (!cv || !cx) {
            return undefined;
        }
        const W = cv.width;
        const mid = W / 2;
        let seed = 7;
        const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const stars = Array.from({ length: 150 }, () => ({
            r: Math.sqrt(rnd()) * mid * 1.05,
            a: rnd() * Math.PI * 2,
            s: 0.6 + rnd() * 1.6,
            p: rnd() * 6.28,
            f: 0.6 + rnd() * 1.8,
        }));
        const clouds = Array.from({ length: 9 }, () => ({
            r: rnd() * W * 0.45,
            a: rnd() * 6.28,
            size: W * (0.25 + rnd() * 0.3),
            sp: 0.15 + rnd() * 0.3,
            light: rnd() < 0.5,
        }));
        let turn = 0;
        let last = performance.now();
        let frame = 0;

        const draw = (now: number): void => {
            const s = values.current;
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const t = now / 1000;
            if (s.motion) {
                turn +=
                    (s.laser ? 0.04 + ((s.rotation - ROTATION.min) / (ROTATION.max - ROTATION.min)) * 0.9 : 0.04) * dt;
            }
            cx.globalAlpha = 1;
            cx.shadowBlur = 0;
            cx.fillStyle = '#0c0c10';
            cx.fillRect(0, 0, W, W);
            if (s.power && s.rgb) {
                const [r, g, b] = hsvToRgb({ ...s.colour, v: 1000 });
                const k = 0.25 + (0.75 * s.colour.v) / 1000;
                cx.fillStyle = `rgba(${r},${g},${b},${0.55 * k})`;
                cx.fillRect(0, 0, W, W);
                const [lr, lg, lb] = hsvToRgb({ h: s.colour.h, s: s.colour.s * 0.55, v: 1000 });
                for (const c of clouds) {
                    const a = c.a + (s.motion ? t * c.sp * 0.4 : 0) + turn * 0.3;
                    const x = mid + Math.cos(a) * c.r;
                    const y = mid + Math.sin(a * 1.3) * c.r;
                    const gr = cx.createRadialGradient(x, y, 0, x, y, c.size);
                    if (c.light) {
                        gr.addColorStop(0, `rgba(${lr},${lg},${lb},${0.45 * k})`);
                        gr.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
                    } else {
                        gr.addColorStop(0, 'rgba(5,5,10,.5)');
                        gr.addColorStop(1, 'rgba(5,5,10,0)');
                    }
                    cx.fillStyle = gr;
                    cx.fillRect(0, 0, W, W);
                }
            }
            if (s.power && s.laser) {
                const inten = 0.25 + (0.75 * (s.intensity - INTENSITY.min)) / (INTENSITY.max - INTENSITY.min);
                cx.fillStyle = '#5dff7a';
                cx.shadowColor = '#3dff60';
                cx.shadowBlur = 6;
                for (const st of stars) {
                    const a = st.a + turn;
                    const tw = s.motion ? 0.55 + 0.45 * Math.sin(t * st.f + st.p) : 0.8;
                    cx.globalAlpha = Math.min(1, inten * tw);
                    cx.beginPath();
                    cx.arc(mid + Math.cos(a) * st.r, mid + Math.sin(a) * st.r, st.s * (1 + 0.8 * inten), 0, 6.283);
                    cx.fill();
                }
                cx.globalAlpha = 1;
                cx.shadowBlur = 0;
            }
            if (!s.power) {
                cx.fillStyle = '#4f4f56';
                cx.font = '600 26px Barlow, sans-serif';
                cx.textAlign = 'center';
                cx.fillText('aus', mid, mid + 9);
            }
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <canvas
            ref={canvas}
            width={SKY * 2}
            height={SKY * 2}
            aria-hidden
            style={{
                position: 'absolute',
                left: C - SKY / 2,
                top: C - SKY / 2,
                width: SKY,
                height: SKY,
                borderRadius: '50%',
                pointerEvents: 'none',
                boxShadow: 'inset 0 0 0 1px #3a3a40',
            }}
        />
    );
}

function arcPath(a0: number, a1: number, r: number): string {
    const [x0, y0] = pointAt(C, a0, r);
    const [x1, y1] = pointAt(C, a1, r);
    return `M${x0} ${y0} A${r} ${r} 0 0 ${a1 > a0 ? 1 : 0} ${x1} ${y1}`;
}

export function SternePopup(p: SternePopupProps): React.JSX.Element {
    const restart = useAutoClose(p.onClose);
    const [draft, setDraft] = React.useState<Draft>({});
    const [drag, setDrag] = React.useState<Drag>(null);
    const box = React.useRef<HTMLDivElement>(null);

    // a draft counts only as long as the confirmed value it started from: a new confirmed value replaces it
    const colourKey = `${p.colour.h}/${p.colour.s}/${p.colour.v}`;
    const colour = draft.colour && draft.colourFrom === colourKey ? draft.colour : p.colour;
    const intensity =
        draft.intensity !== undefined && draft.intensityFrom === p.intensity ? draft.intensity : p.intensity;
    const rotation = draft.rotation !== undefined && draft.rotationFrom === p.rotation ? draft.rotation : p.rotation;
    const draftColour = (c: Hsv): void => setDraft(d => ({ ...d, colour: c, colourFrom: colourKey }));
    const usable = p.online && p.power;
    const laserUsable = usable && p.laser;
    const rgbUsable = usable && p.rgb;

    const at = (e: React.PointerEvent): { dx: number; dy: number } => {
        const r = box.current!.getBoundingClientRect();
        // the popup may be scaled: map the screen point back to the 330 px box
        const k = SIZE / r.width;
        return { dx: (e.clientX - r.left) * k - C, dy: (e.clientY - r.top) * k - C };
    };

    const apply = (which: Drag, dx: number, dy: number): void => {
        if (which === 'colour') {
            draftColour({ ...colour, ...hueSatAt(dx, dy, R_IN, R_OUT) });
        } else if (which === 'int') {
            const share = arcShare(angleOf(dx, dy), ARC_L[0], ARC_L[1]);
            const n = Math.round(INTENSITY.min + share * (INTENSITY.max - INTENSITY.min));
            setDraft(d => ({ ...d, intensity: n, intensityFrom: p.intensity }));
        } else if (which === 'rot') {
            const share = arcShare(angleOf(dx, dy), ARC_R[0], ARC_R[1]);
            const n = Math.round(ROTATION.min + share * (ROTATION.max - ROTATION.min));
            setDraft(d => ({ ...d, rotation: n, rotationFrom: p.rotation }));
        }
    };

    const onDown = (e: React.PointerEvent): void => {
        restart(POPUP_CLOSE_MS.idle);
        const { dx, dy } = at(e);
        const r = Math.hypot(dx, dy);
        let which: Drag = null;
        if (r > R_IN - 4 && r < R_OUT + 8) {
            which = rgbUsable ? 'colour' : null;
        } else if (r >= R_OUT + 8) {
            which = laserUsable ? (dx < 0 ? 'int' : 'rot') : null;
        }
        if (!which) {
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(which);
        apply(which, dx, dy);
    };

    const onMove = (e: React.PointerEvent): void => {
        if (!drag) {
            return;
        }
        restart(POPUP_CLOSE_MS.idle);
        const { dx, dy } = at(e);
        apply(drag, dx, dy);
    };

    const onUp = (): void => {
        if (drag === 'colour') {
            p.onColour(colour);
        } else if (drag === 'int') {
            p.onIntensity(intensity);
        } else if (drag === 'rot') {
            p.onRotation(rotation);
        }
        setDrag(null);
        restart(POPUP_CLOSE_MS.idle);
    };

    const shareI = (intensity - INTENSITY.min) / (INTENSITY.max - INTENSITY.min);
    const shareR = (rotation - ROTATION.min) / (ROTATION.max - ROTATION.min);
    const aI = ARC_L[0] + (ARC_L[1] - ARC_L[0]) * shareI;
    const aR = ARC_R[0] + (ARC_R[1] - ARC_R[0]) * shareR;
    const arcOn = laserUsable ? v('sw-on') : '#5a5a60';
    const knob = (a: number): React.JSX.Element => {
        const [x, y] = pointAt(C, a, R_ARC);
        return (
            <circle
                cx={x}
                cy={y}
                r={11}
                fill="#fff"
                stroke="rgba(0,0,0,.45)"
            />
        );
    };
    const [mx, my] = pointAt(C, colour.h, clamp(R_IN + ((R_OUT - R_IN) * colour.s) / 1000, R_IN + 9, R_OUT - 9));
    const [r, g, b] = hsvToRgb({ ...colour, v: 1000 });
    const shown = (label: string, value: string, side: 'left' | 'right'): React.JSX.Element => (
        <span
            style={{
                position: 'absolute',
                top: 2,
                [side]: -6,
                width: 70,
                textAlign: 'center',
                fontSize: 11,
                color: v('text-2'),
                lineHeight: 1.2,
                pointerEvents: 'none',
            }}
        >
            {label}
            <b style={{ display: 'block', fontSize: 17, color: v('text'), fontWeight: 600 }}>{value}</b>
        </span>
    );

    return (
        <Frame
            kind="STERNENHIMMEL"
            title={p.title}
            label={p.title}
            onClose={p.onClose}
            width={580}
            hint="Ring: Farbe (außen satt, innen weiß) · Bogen links: Laser-Intensität · Bogen rechts: Rotation"
        >
            <div
                onClickCapture={() => restart(POPUP_CLOSE_MS.idle)}
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
                <span style={{ fontSize: 12, color: v('text-2') }}>{p.status}</span>
                <div style={{ display: 'grid', gridTemplateColumns: `${SIZE}px 1fr`, gap: 10, alignItems: 'center' }}>
                    <div
                        ref={box}
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                        style={{
                            position: 'relative',
                            width: SIZE,
                            height: SIZE,
                            touchAction: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        <svg
                            viewBox={`0 0 ${SIZE} ${SIZE}`}
                            aria-hidden
                            style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
                        >
                            {[ARC_L, ARC_R].map(([a0, a1]) => (
                                <path
                                    key={a0}
                                    d={arcPath(a0, a1, R_ARC)}
                                    stroke="#3a3a40"
                                    strokeWidth={10}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                            ))}
                            {shareI > 0.002 ? (
                                <path
                                    d={arcPath(ARC_L[0], aI, R_ARC)}
                                    stroke={arcOn}
                                    strokeWidth={10}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                            ) : null}
                            {shareR > 0.002 ? (
                                <path
                                    d={arcPath(ARC_R[0], aR, R_ARC)}
                                    stroke={arcOn}
                                    strokeWidth={10}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                            ) : null}
                            <g opacity={laserUsable ? 1 : 0.5}>
                                {knob(aI)}
                                {knob(aR)}
                            </g>
                        </svg>
                        <div
                            style={{
                                position: 'absolute',
                                left: C - R_OUT - 1,
                                top: C - R_OUT - 1,
                                width: (R_OUT + 1) * 2,
                                height: (R_OUT + 1) * 2,
                                borderRadius: '50%',
                                background: `radial-gradient(circle, #fff 0, #fff ${R_IN}px, rgba(255,255,255,0) ${R_OUT + 1}px), conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)`,
                                WebkitMaskImage: RING_MASK,
                                maskImage: RING_MASK,
                                filter: rgbUsable ? undefined : 'grayscale(1)',
                                opacity: rgbUsable ? 1 : 0.35,
                            }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                left: C - R_OUT - 1,
                                top: C - R_OUT - 1,
                                width: (R_OUT + 1) * 2,
                                height: (R_OUT + 1) * 2,
                                borderRadius: '50%',
                                background: '#000',
                                WebkitMaskImage: RING_MASK,
                                maskImage: RING_MASK,
                                pointerEvents: 'none',
                                opacity: rgbUsable ? (1 - (0.35 + (0.65 * colour.v) / 1000)) * 0.8 : 0,
                            }}
                        />
                        {rgbUsable ? (
                            <span
                                style={{
                                    position: 'absolute',
                                    left: mx - 11,
                                    top: my - 11,
                                    width: 22,
                                    height: 22,
                                    boxSizing: 'border-box',
                                    borderRadius: '50%',
                                    border: '3px solid #fff',
                                    background: `rgb(${r},${g},${b})`,
                                    boxShadow: '0 0 0 1px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.5)',
                                    pointerEvents: 'none',
                                }}
                            />
                        ) : null}
                        <SkyPreview
                            power={usable}
                            laser={p.laser}
                            rgb={p.rgb}
                            intensity={intensity}
                            rotation={rotation}
                            colour={colour}
                            motion={p.motion}
                        />
                        {shown('Laser', `${Math.round(intensity)} %`, 'left')}
                        {shown('Rotation', String(rotationShown(rotation)), 'right')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <Row
                            label="Lampe"
                            sub="ganz an/aus"
                        >
                            <Btn
                                label="Lampe"
                                on={p.power}
                                disabled={!p.online}
                                onClick={() => p.onPower(!p.power)}
                            />
                        </Row>
                        <Row
                            label="Laser"
                            sub="Sterne"
                        >
                            <Btn
                                label="Laser"
                                on={p.laser}
                                disabled={!usable}
                                onClick={() => p.onLaser(!p.laser)}
                            />
                        </Row>
                        <Row
                            label="Farblicht"
                            sub="Hintergrund"
                        >
                            <Btn
                                label="Farblicht"
                                on={p.rgb}
                                disabled={!usable}
                                onClick={() => p.onRgb(!p.rgb)}
                            />
                        </Row>
                        <div style={{ opacity: rgbUsable ? 1 : 0.38, marginTop: 4 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: 14,
                                    fontWeight: 600,
                                }}
                            >
                                <span>Farbhelligkeit</span>
                                <span style={{ color: v('text-2'), fontWeight: 500 }}>
                                    {Math.round(colour.v / 10)} %
                                </span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={100}
                                aria-label="Farbhelligkeit"
                                disabled={!rgbUsable}
                                value={Math.max(1, Math.round(colour.v / 10))}
                                onChange={e => {
                                    restart(POPUP_CLOSE_MS.idle);
                                    draftColour({ ...colour, v: Number(e.target.value) * 10 });
                                }}
                                onPointerUp={() => p.onColour(colour)}
                                onKeyUp={() => p.onColour(colour)}
                                style={{ width: '100%', accentColor: '#f2c14e', height: 32 }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </Frame>
    );
}
