/*
 * Living tank on a canvas for the tank view (ported from the accepted preview, 20.11.2026):
 * plants, lava rocks + root, the real fish (harlequin rasboras as a school, five-banded barbs near the bottom),
 * light rays + caustics in the lamp colour, glowing back wall, CO2 mist from the diffuser and drifting particles
 * that stop when the filter stands. The scene callbacks are read every frame, so the drawing follows live values.
 */

export interface Szene {
    /** lamp level 0..1 (schedule incl. ramps) */
    level: () => number;
    /** brightness of the colour 0..1 */
    power: () => number;
    rgb: () => [number, number, number];
    /** back wall glows (background light on) */
    back: () => boolean;
    /** water flows (filter running) */
    flow: () => boolean;
    /** CO2 valve open and water flows */
    bubbles: () => boolean;
    /** animations allowed */
    motion: () => boolean;
}

type RGB = [number, number, number];
type Kind = 'heteromorpha' | 'pentazona';

interface Fish {
    kind: Kind;
    len: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    face: number;
    ph: number;
    tx: number;
    ty: number;
    timer: number;
    off: [number, number];
}

interface Plant {
    x: number;
    h: number;
    kind: 'stem' | 'blade' | 'red' | 'bush';
    back: boolean;
    ph: number;
    sp: number;
    lw: number;
    leaves: number;
    bush: Array<{ a: number; l: number; w: number; ph: number }>;
    hue: number[];
}

const O = {
    seed: 61,
    surface: 0.07,
    sand: 0.8,
    diffuser: { x: 0.9, y: 0.78 },
    outlet: { x: 0.94, y: 0.16 },
    plants: 7,
    bushes: 2,
    hetero: 14,
    penta: 6,
    fishScale: 0.9,
    backGlow: 2.6,
};

function rng(seed: number): () => number {
    let s = seed % 2147483647;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
];
const rgba = (c: number[], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * Starts the drawing on the canvas; returns a stop function.
 *
 * @param canvas the canvas (its CSS size is used)
 * @param s scene callbacks
 */
export function startTank(canvas: HTMLCanvasElement, s: Szene): () => void {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return () => undefined;
    }
    let W = 0;
    let H = 0;
    let plants: Plant[] = [];
    let fish: Fish[] = [];
    let motes: Array<{ x: number; y: number; s: number; ph: number }> = [];
    let mist: Array<{ x: number; y: number; r: number; v: number; ph: number }> = [];
    let carpet: Array<{ x: number; h: number; ph: number }> = [];
    let hardImg: HTMLCanvasElement | null = null;
    let hardShade: HTMLCanvasElement | null = null;
    let last = performance.now();
    let T = 0;
    let light = 0;
    let back = 0;
    let frameId = 0;
    let first = true;
    let DPR = 0;
    const school = { x: 0, y: 0, tx: 0, ty: 0, timer: 0 };
    const R = rng(O.seed);

    function buildHardscape(top: number, sand: number): void {
        const dpr = canvas.width / W;
        const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
            const c = document.createElement('canvas');
            c.width = canvas.width;
            c.height = canvas.height;
            const x = c.getContext('2d') as CanvasRenderingContext2D;
            x.setTransform(dpr, 0, 0, dpr, 0, 0);
            return [c, x];
        };
        const [img, c] = mk();
        const [sh, sx] = mk();
        const r = rng(O.seed + 9);
        const pick = <X>(a: X[]): X => a[Math.floor(r() * a.length)];
        const span = sand - top;
        // driftwood rising right of the centre
        const seg = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number): void => {
            for (let i = 0; i < 12; i++) {
                const k = i / 12;
                const k2 = (i + 1) / 12;
                const p = [
                    W * (x0 + (x1 - x0) * k) + Math.sin(k * 7) * 2,
                    y0 + (y1 - y0) * k,
                    W * (x0 + (x1 - x0) * k2) + Math.sin(k2 * 7) * 2,
                    y0 + (y1 - y0) * k2,
                    w0 + (w1 - w0) * k,
                ];
                for (const [cx, col] of [
                    [c, i % 2 ? '#3a2d25' : '#33271f'],
                    [sx, '#000'],
                ] as Array<[CanvasRenderingContext2D, string]>) {
                    cx.strokeStyle = col;
                    cx.lineWidth = p[4];
                    cx.lineCap = 'round';
                    cx.beginPath();
                    cx.moveTo(p[0], p[1]);
                    cx.lineTo(p[2], p[3]);
                    cx.stroke();
                }
            }
        };
        seg(0.62, sand + 4, 0.75, top + span * 0.05, 11, 4);
        seg(0.68, sand - span * 0.45, 0.6, sand - span * 0.58, 4, 1.5);
        c.strokeStyle = 'rgba(160,130,100,.35)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(W * 0.63, sand - span * 0.05);
        c.lineTo(W * 0.742, top + span * 0.09);
        c.stroke();
        // lava rocks: rounded dark lumps, porous, a hint of moss
        for (const [cx, rx, ry] of [
            [0.17, 0.08, 0.16],
            [0.3, 0.09, 0.24],
            [0.44, 0.07, 0.15],
            [0.58, 0.08, 0.28],
            [0.68, 0.05, 0.11],
            [0.8, 0.07, 0.17],
            [0.92, 0.06, 0.12],
        ]) {
            const pts: Array<[number, number]> = [];
            const n = 14;
            const by = sand + 6;
            for (let i = 0; i <= n; i++) {
                const a = Math.PI + (Math.PI * i) / n;
                const k = 0.85 + r() * 0.25;
                pts.push([W * (cx + Math.cos(a) * rx * k), by + Math.sin(a) * span * ry * k]);
            }
            const path = new Path2D();
            path.moveTo(pts[0][0], by + 4);
            path.lineTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < n; i++) {
                path.quadraticCurveTo(
                    pts[i][0],
                    pts[i][1],
                    (pts[i][0] + pts[i + 1][0]) / 2,
                    (pts[i][1] + pts[i + 1][1]) / 2,
                );
            }
            path.lineTo(pts[n][0], by + 4);
            path.closePath();
            const g = c.createLinearGradient(0, by - span * ry, 0, by);
            g.addColorStop(0, '#3b4237');
            g.addColorStop(1, '#1b1e1b');
            c.fillStyle = g;
            c.fill(path);
            sx.fillStyle = '#000';
            sx.fill(path);
            c.save();
            c.clip(path);
            for (let i = 0; i < rx * ry * 16000; i++) {
                c.fillStyle = pick([
                    'rgba(95,112,70,.45)',
                    'rgba(15,17,15,.7)',
                    'rgba(70,80,60,.45)',
                    'rgba(110,125,85,.3)',
                ]);
                c.beginPath();
                c.arc(W * (cx - rx + 2 * rx * r()), by - span * ry * r(), 0.6 + r() * 1.2, 0, 6.3);
                c.fill();
            }
            c.restore();
        }
        hardImg = img;
        hardShade = sh;
    }

    function newFish(kind: Kind, len: number, r: () => number): Fish {
        const top = H * O.surface;
        const sand = H * O.sand;
        const y = top + 20 + r() * (sand - top - 40);
        const dir = r() < 0.5 ? -1 : 1;
        return {
            kind,
            len,
            x: W * (0.1 + 0.8 * r()),
            y,
            vx: dir * 20,
            vy: 0,
            face: dir,
            ph: r() * 6,
            tx: W * r(),
            ty: y,
            timer: 0,
            off: [(r() - 0.5) * 70, (r() - 0.5) * 34],
        };
    }

    function build(): void {
        const r = rng(O.seed);
        const top = H * O.surface;
        const sand = H * O.sand;
        // the preview drew four plain rocks first; keep the random sequence identical
        for (let i = 0; i < 4; i++) {
            r();
            r();
            r();
            for (let j = 0; j <= 7; j++) {
                r();
                r();
            }
            r();
        }
        buildHardscape(top, sand);
        plants = [];
        for (let i = 0; i < O.plants; i++) {
            const x = W * (0.03 + 0.94 * r());
            const isBack = r() < 0.55;
            const kind = r() < 0.45 ? 'stem' : r() < 0.6 ? 'blade' : 'red';
            const h = (sand - top) * (isBack ? 0.55 + 0.4 * r() : 0.25 + 0.3 * r());
            plants.push({
                x,
                h,
                kind,
                back: isBack,
                ph: r() * 6.28,
                sp: 0.5 + 0.5 * r(),
                lw: 2 + 2 * r(),
                leaves: 8 + Math.floor(r() * 8),
                bush: [],
                hue: kind === 'red' ? [200, 80, 70] : [70 + r() * 40, 150 + r() * 60, 70 + r() * 30],
            });
        }
        for (let i = 0; i < O.bushes; i++) {
            const x = W * (0.05 + 0.9 * r());
            const bush: Plant['bush'] = [];
            for (let j = 0; j < 26; j++) {
                bush.push({
                    a: -Math.PI / 2 + (r() - 0.5) * 2.4,
                    l: (sand - top) * (0.07 + 0.11 * r()),
                    w: 0.22 + 0.12 * r(),
                    ph: r() * 6,
                });
            }
            plants.push({
                x,
                kind: 'bush',
                back: false,
                bush,
                hue: r() < 0.5 ? [80, 150, 70] : [120, 110, 60],
                ph: r() * 6,
                sp: 0.6,
                h: 0,
                lw: 2,
                leaves: 0,
            });
        }
        plants.sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0));
        carpet = [];
        for (let x = 0; x < W; x += 5) {
            carpet.push({ x: x + r() * 4, h: 3 + r() * 7, ph: r() * 6 });
        }
        fish = [];
        const add = (kind: Kind, n: number, len: number): void => {
            for (let i = 0; i < n; i++) {
                fish.push(newFish(kind, len * O.fishScale * (0.85 + 0.3 * r()), r));
            }
        };
        add('heteromorpha', O.hetero, 15);
        add('pentazona', O.penta, 19);
        school.x = school.tx = W * 0.5;
        school.y = school.ty = (top + sand) / 2;
        motes = [];
        for (let i = 0; i < 46; i++) {
            motes.push({ x: r() * W, y: top + r() * (sand - top), s: 0.6 + r() * 1.4, ph: r() * 6 });
        }
        mist = [];
    }

    function size(): void {
        const rect = canvas.getBoundingClientRect();
        const w = canvas.clientWidth || rect.width;
        const h = canvas.clientHeight || rect.height;
        // the view is scaled by CSS: draw with the real pixel size, so it stays sharp when enlarged
        const zoom = w ? rect.width / w : 1;
        const dpr = Math.min(3, (window.devicePixelRatio || 1) * zoom);
        if (!w || !h || (w === W && h === H && Math.abs(dpr - DPR) < 0.05)) {
            return;
        }
        W = w;
        H = h;
        DPR = dpr;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        build();
    }

    function steer(f: Fish, dt: number): void {
        const top = H * O.surface + 14;
        const sand = H * O.sand - 14;
        const isSchool = f.kind === 'heteromorpha';
        let tx: number;
        let ty: number;
        if (isSchool) {
            tx = school.x + f.off[0];
            ty = school.y + f.off[1];
        } else {
            f.timer -= dt;
            // five-banded barbs stay near the bottom and the middle
            if (f.timer <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < 30) {
                f.tx = W * (0.06 + 0.88 * R());
                f.ty = top + (sand - top) * (0.45 + 0.45 * R());
                f.timer = 6 + R() * 8;
            }
            tx = f.tx;
            ty = f.ty;
        }
        const night = light < 0.05;
        const maxV = (f.kind === 'pentazona' ? 30 : 36) * (night ? 0.35 : 1);
        const dx = tx - f.x;
        const dy = ty - f.y;
        const d = Math.hypot(dx, dy) || 1;
        const want = Math.min(maxV, d * 0.8);
        f.vx += ((dx / d) * want - f.vx) * Math.min(1, dt * 0.9);
        f.vy += ((dy / d) * want * 0.45 - f.vy) * Math.min(1, dt * 0.9);
        if (isSchool) {
            for (const g of fish) {
                if (g !== f && g.kind === f.kind) {
                    const ex = f.x - g.x;
                    const ey = f.y - g.y;
                    const e = Math.hypot(ex, ey);
                    if (e < f.len * 1.3 && e > 0) {
                        f.vx += (ex / e) * 18 * dt;
                        f.vy += (ey / e) * 12 * dt;
                    }
                }
            }
        }
        if (s.flow()) {
            f.vx += 3 * dt;
        }
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.y = Math.max(top, Math.min(sand, f.y));
        f.x = Math.max(-20, Math.min(W + 20, f.x));
        const dir = Math.abs(f.vx) > 2 ? Math.sign(f.vx) : f.face >= 0 ? 1 : -1;
        f.face += (dir - f.face) * Math.min(1, dt * 3.2);
        f.ph += dt * (4 + Math.hypot(f.vx, f.vy) * 0.25);
    }

    function drawFish(c: CanvasRenderingContext2D, f: Fish): void {
        const Lf = f.len;
        const sc = Math.abs(f.face) < 0.12 ? 0.12 * Math.sign(f.face || 1) : f.face;
        const tilt = Math.max(-0.35, Math.min(0.35, Math.atan2(f.vy, Math.abs(f.vx) + 4)));
        c.save();
        c.translate(f.x, f.y);
        c.scale(sc, 1);
        c.rotate(tilt);
        c.globalAlpha = 0.35 + 0.65 * Math.max(light, 0.08);
        // tail behind (-x); the head points to +x = direction of swimming
        c.save();
        c.translate(-Lf * 0.34, 0);
        c.rotate(Math.sin(f.ph) * 0.32);
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(-Lf * 0.18, -Lf * 0.2, -Lf * 0.3, -Lf * 0.2);
        c.quadraticCurveTo(-Lf * 0.2, 0, -Lf * 0.3, Lf * 0.2);
        c.quadraticCurveTo(-Lf * 0.18, Lf * 0.2, 0, 0);
        c.fillStyle = f.kind === 'pentazona' ? 'rgba(215,85,55,.85)' : 'rgba(225,120,95,.8)';
        c.fill();
        c.restore();
        const bend = Math.sin(f.ph - 0.8) * Lf * 0.03;
        const deep = f.kind === 'pentazona' ? 0.3 : 0.25;
        c.beginPath();
        c.moveTo(Lf * 0.5, 0);
        c.bezierCurveTo(Lf * 0.32, -Lf * deep, -Lf * 0.2, -Lf * 0.17 + bend, -Lf * 0.36, bend);
        c.bezierCurveTo(-Lf * 0.2, Lf * 0.15 + bend, Lf * 0.3, Lf * deep * 0.9, Lf * 0.5, 0);
        const g = c.createLinearGradient(0, -Lf * 0.28, 0, Lf * 0.28);
        if (f.kind === 'pentazona') {
            g.addColorStop(0, '#b4552c');
            g.addColorStop(0.5, '#e8873f');
            g.addColorStop(1, '#f6c690');
        } else {
            g.addColorStop(0, '#c7704a');
            g.addColorStop(0.5, '#eea27c');
            g.addColorStop(1, '#f6d2bc');
        }
        c.fillStyle = g;
        c.fill();
        c.save();
        c.clip();
        if (f.kind === 'pentazona') {
            // five dark cross bands
            c.fillStyle = 'rgba(30,20,15,.75)';
            for (const bx of [0.3, 0.14, -0.02, -0.17, -0.31]) {
                c.fillRect(Lf * bx - Lf * 0.035, -Lf, Lf * 0.065, Lf * 2);
            }
        } else {
            // black wedge towards the tail
            c.fillStyle = 'rgba(20,15,15,.9)';
            c.beginPath();
            c.moveTo(Lf * 0.08, -Lf * 0.13);
            c.lineTo(-Lf * 0.36, -Lf * 0.03 + bend);
            c.lineTo(-Lf * 0.36, Lf * 0.04 + bend);
            c.lineTo(-Lf * 0.02, Lf * 0.08);
            c.closePath();
            c.fill();
        }
        c.restore();
        c.fillStyle = '#111';
        c.beginPath();
        c.arc(Lf * 0.35, -Lf * 0.04, Math.max(1, Lf * 0.04), 0, 6.3);
        c.fill();
        c.restore();
    }

    function drawPlants(c: CanvasRenderingContext2D, t: number, backLayer: boolean): void {
        const sway = s.flow() ? 1 : 0.35;
        const base = H * O.sand + 2;
        for (const p of plants) {
            if (p.back !== backLayer) {
                continue;
            }
            const shade = backLayer ? 0.62 : 1;
            const lit = 0.35 + 0.65 * Math.max(light, 0.12);
            const col = p.hue.map(x => Math.round(x * shade * lit));
            c.strokeStyle = rgba(col, 1);
            c.lineWidth = p.lw;
            c.lineCap = 'round';
            if (p.kind === 'bush') {
                const by = H * O.sand + 4;
                for (const lf of p.bush) {
                    const a = lf.a + Math.sin(t * 0.9 + lf.ph) * 0.06 * sway;
                    const ex = p.x + Math.cos(a) * lf.l;
                    const ey = by + Math.sin(a) * lf.l;
                    const g2 = c.createLinearGradient(p.x, by, ex, ey);
                    g2.addColorStop(
                        0,
                        rgba(
                            col.map(x => x * 0.6),
                            1,
                        ),
                    );
                    g2.addColorStop(
                        1,
                        rgba(
                            col.map(x => Math.min(255, x + 40)),
                            1,
                        ),
                    );
                    c.fillStyle = g2;
                    c.save();
                    c.translate((p.x + ex) / 2, (by + ey) / 2);
                    c.rotate(a);
                    c.beginPath();
                    c.ellipse(0, 0, lf.l / 2, (lf.l * lf.w) / 2, 0, 0, 6.3);
                    c.fill();
                    c.strokeStyle = rgba(
                        col.map(x => x * 0.5),
                        0.6,
                    );
                    c.lineWidth = 0.8;
                    c.beginPath();
                    c.moveTo(-lf.l / 2, 0);
                    c.lineTo(lf.l / 2, 0);
                    c.stroke();
                    c.restore();
                }
                continue;
            }
            const pts: Array<[number, number]> = [];
            for (let i = 0; i <= 10; i++) {
                const k = i / 10;
                pts.push([
                    p.x + Math.sin(t * p.sp + p.ph + k * 1.6) * sway * k * k * 18 + Math.sin(p.ph) * k * 10,
                    base - p.h * k,
                ]);
            }
            if (p.kind === 'blade') {
                const tip = pts[pts.length - 1];
                for (let b = -2; b <= 2; b++) {
                    c.beginPath();
                    c.moveTo(p.x + b * 3, pts[0][1]);
                    c.quadraticCurveTo(p.x + b * 5, pts[5][1], tip[0] + b * 9, tip[1] + Math.abs(b) * 12);
                    c.stroke();
                }
                continue;
            }
            c.beginPath();
            c.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) {
                c.lineTo(pts[i][0], pts[i][1]);
            }
            c.stroke();
            c.fillStyle = rgba(
                col.map(x => Math.min(255, x + 25)),
                0.95,
            );
            for (let i = 1; i < p.leaves; i++) {
                const k = i / p.leaves;
                const [lx, ly] = pts[Math.min(pts.length - 1, Math.round(k * (pts.length - 1)))];
                const side = i % 2 ? 1 : -1;
                const ls = (p.kind === 'red' ? 9 : 8) * (1 - k * 0.4);
                c.save();
                c.translate(lx, ly);
                c.rotate(side * (0.9 + Math.sin(t + i) * 0.08));
                c.beginPath();
                c.ellipse(side * ls * 0.6, -2, ls * 0.75, ls * 0.28, side * -0.5, 0, 6.3);
                c.fill();
                c.restore();
            }
        }
    }

    function frame(now: number): void {
        const c = ctx!;
        size();
        const moving = s.motion();
        const dt = moving ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        T += dt;
        const want = s.level() * (0.45 + 0.55 * s.power());
        const wantBack = s.back() ? 1 : 0;
        if (first || !moving) {
            light = want;
            back = wantBack;
            first = false;
        }
        light += (want - light) * Math.min(1, dt * 2.5);
        back += (wantBack - back) * Math.min(1, dt * 2.5);
        const lampCol = s.rgb();
        const flow = s.flow();
        const top = H * O.surface;
        const sand = H * O.sand;
        if (!W || !H) {
            frameId = requestAnimationFrame(frame);
            return;
        }
        c.clearRect(0, 0, W, H);
        const tint = mix([24, 92, 118], lampCol, 0.18);
        const topC = mix([8, 20, 32], tint, light);
        const botC = mix([4, 10, 16], mix([10, 44, 58], lampCol, 0.08), light);
        let g = c.createLinearGradient(0, top, 0, H);
        g.addColorStop(0, rgba(topC, 1));
        g.addColorStop(1, rgba(botC, 1));
        c.fillStyle = '#0b0d10';
        c.fillRect(0, 0, W, H);
        c.fillStyle = g;
        c.fillRect(0, top, W, H - top);
        if (back > 0.01) {
            g = c.createLinearGradient(0, top, 0, sand);
            const bg = O.backGlow;
            g.addColorStop(0, `rgba(205,230,255,${Math.min(0.9, 0.42 * bg) * back})`);
            g.addColorStop(0.6, `rgba(140,190,240,${Math.min(0.6, 0.16 * bg) * back})`);
            g.addColorStop(1, `rgba(110,160,220,${Math.min(0.3, 0.04 * bg) * back})`);
            c.fillStyle = g;
            c.fillRect(0, top, W, sand - top);
        }
        if (light < 0.3) {
            g = c.createRadialGradient(W * 0.3, top, 10, W * 0.3, top, H * 0.9);
            g.addColorStop(0, `rgba(80,120,200,${0.18 * (1 - light / 0.3)})`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = g;
            c.fillRect(0, top, W, H - top);
        }
        drawPlants(c, T, true);
        if (hardImg && hardShade) {
            c.drawImage(hardImg, 0, 0, W, H);
            const shade = 0.7 * (1 - Math.max(light, 0.12));
            if (shade > 0.01) {
                c.globalAlpha = shade;
                c.drawImage(hardShade, 0, 0, W, H);
                c.globalAlpha = 1;
            }
        }
        if (light > 0.02) {
            c.save();
            c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 7; i++) {
                const x = W * (0.08 + i * 0.14) + Math.sin(T * 0.25 + i) * 30;
                const w = 30 + 20 * Math.sin(i * 1.7);
                g = c.createLinearGradient(0, top, 0, sand);
                g.addColorStop(0, rgba(lampCol, 0.13 * light));
                g.addColorStop(1, rgba(lampCol, 0));
                c.fillStyle = g;
                c.beginPath();
                c.moveTo(x, top);
                c.lineTo(x + w, top);
                c.lineTo(x + w * 2.2 + 40, sand);
                c.lineTo(x + 40, sand);
                c.fill();
            }
            c.restore();
        }
        g = c.createLinearGradient(0, sand - 8, 0, H);
        const sl = 0.3 + 0.7 * Math.max(light, 0.12);
        g.addColorStop(0, rgba([Math.round(150 * sl), Math.round(122 * sl), Math.round(86 * sl)], 1));
        g.addColorStop(1, rgba([Math.round(70 * sl), Math.round(56 * sl), Math.round(40 * sl)], 1));
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(0, sand);
        for (let x = 0; x <= W; x += 20) {
            c.lineTo(x, sand + Math.sin(x * 0.02) * 4);
        }
        c.lineTo(W, H);
        c.lineTo(0, H);
        c.fill();
        if (light > 0.05) {
            c.save();
            c.globalCompositeOperation = 'lighter';
            for (let x = 0; x < W; x += 9) {
                for (let y = sand; y < H; y += 7) {
                    const v =
                        Math.sin(x * 0.05 + T * 1.3) +
                        Math.sin(y * 0.11 - T * 0.9 + x * 0.02) +
                        Math.sin((x + y) * 0.03 + T * 0.7);
                    if (v > 1.5) {
                        c.fillStyle = rgba(lampCol, (v - 1.5) * 0.16 * light);
                        c.beginPath();
                        c.ellipse(x, y, 7, 2.2, 0, 0, 6.3);
                        c.fill();
                    }
                }
            }
            c.restore();
        }
        const cl = 0.35 + 0.65 * Math.max(light, 0.12);
        c.strokeStyle = rgba([Math.round(90 * cl), Math.round(170 * cl), Math.round(80 * cl)], 1);
        c.lineWidth = 2;
        for (const k of carpet) {
            c.beginPath();
            c.moveTo(k.x, sand + 6);
            c.lineTo(k.x + Math.sin(T + k.ph) * 1.5, sand + 6 - k.h);
            c.stroke();
        }
        school.timer -= dt;
        if (school.timer <= 0) {
            school.tx = W * (0.15 + 0.7 * R());
            school.ty = top + 40 + R() * (sand - top - 90);
            school.timer = 5 + R() * 6;
        }
        school.x += (school.tx - school.x) * dt * 0.35;
        school.y += (school.ty - school.y) * dt * 0.35;
        for (const f of fish) {
            steer(f, dt);
        }
        for (const f of fish) {
            drawFish(c, f);
        }
        drawPlants(c, T, false);
        c.fillStyle = `rgba(220,235,240,${0.18 + 0.25 * light})`;
        for (const m of motes) {
            if (flow) {
                m.x += (6 + 4 * Math.sin(T + m.ph)) * dt;
                m.y += Math.sin(T * 0.8 + m.ph) * 4 * dt;
            }
            if (m.x > W) {
                m.x = 0;
            }
            c.fillRect(m.x, m.y, m.s, m.s);
        }
        if (s.bubbles() && moving) {
            for (let i = 0; i < 2; i++) {
                if (R() < 0.18) {
                    mist.push({
                        x: W * O.diffuser.x + (R() - 0.5) * 8,
                        y: H * O.diffuser.y,
                        r: 0.6 + R() * 1.3,
                        v: 3 + R() * 4,
                        ph: R() * 6,
                    });
                }
            }
        }
        c.fillStyle = 'rgba(225,240,255,.75)';
        mist = mist.filter(b => b.y > top + 2);
        for (const b of mist) {
            b.y -= b.v * dt;
            b.x += (Math.sin(T * 1.5 + b.ph) * 5 + (flow ? 5 : 0)) * dt;
            c.beginPath();
            c.arc(b.x, b.y, b.r, 0, 6.3);
            c.fill();
        }
        if (flow) {
            c.strokeStyle = 'rgba(200,235,245,.18)';
            c.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
                const ph = (T * 60 + i * 30) % 150;
                c.beginPath();
                c.moveTo(W * O.outlet.x - ph, H * O.outlet.y + i * 4 + Math.sin(T * 2 + i) * 2);
                c.lineTo(W * O.outlet.x - ph - 18, H * O.outlet.y + i * 4 + Math.sin(T * 2 + i + 1) * 2);
                c.stroke();
            }
        }
        c.fillStyle = rgba(mix([20, 24, 28], lampCol, 0.15 * light), 1);
        c.fillRect(0, 0, W, top);
        c.strokeStyle = `rgba(200,235,255,${0.25 + 0.4 * light})`;
        c.lineWidth = 1.5;
        c.beginPath();
        for (let x = 0; x <= W; x += 8) {
            const y = top + Math.sin(x * 0.04 + T * 1.6) * 1.6 + Math.sin(x * 0.013 - T) * 1.2;
            if (x) {
                c.lineTo(x, y);
            } else {
                c.moveTo(x, y);
            }
        }
        c.stroke();
        g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,.45)');
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
        frameId = requestAnimationFrame(frame);
    }

    size();
    frameId = requestAnimationFrame(t => {
        last = t;
        frame(t);
    });
    return () => cancelAnimationFrame(frameId);
}
