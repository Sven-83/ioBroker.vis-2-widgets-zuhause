/*
 * Small drawn tank for the aquarium tile (variant B "Mini-Becken", Sven 20.11.2026; preview
 * .local/bin/aquarium/vorschau/kachel/kachel-vorschlaege.html). Same look as the tank view:
 * lamp bar glows while the light is on, fish swim to and fro, plants sway, CO2 pearls rise while the valve
 * is open and the water flows. Animations use zh-a-* classes, so the animation level of the tile applies.
 */
import React from 'react';

const W = 50;
const H = 30;
const WY = 6;
/** drawn a bit larger since the tile shows no temperature (Sven 20.11.2026) */
const ZOOM = 1.1;

interface Props {
    licht: boolean;
    co2: boolean;
    fluss: boolean;
    /** animations allowed (tile active, level not "aus") */
    animate: boolean;
    /** unique suffix for the gradient id (several tiles on one page) */
    uid: string;
}

const FISH: Array<[number, number, string, string]> = [
    [9, WY + 10, '', '#f2a14e'],
    [21, WY + 15, 'zh-d-f2', '#e6e3db'],
    [13, WY + 19, 'zh-d-f3', '#f2a14e'],
];

export function MiniBecken(p: Props): React.JSX.Element {
    const a = (cls: string): string | undefined => (p.animate ? cls : undefined);
    const top = p.licht ? '#2f6f86' : '#173847';
    const bottom = p.licht ? '#174556' : '#0d1f28';
    const gid = `zh-mb-${p.uid}`;
    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W * ZOOM}
            height={H * ZOOM}
            style={{ overflow: 'visible', marginTop: 6 }}
            aria-hidden
        >
            <defs>
                <linearGradient
                    id={gid}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                >
                    <stop
                        offset="0"
                        stopColor={top}
                    />
                    <stop
                        offset="1"
                        stopColor={bottom}
                    />
                </linearGradient>
            </defs>
            <rect
                x={2}
                y={WY}
                width={W - 4}
                height={H - WY - 2}
                fill={`url(#${gid})`}
            />
            {p.licht ? (
                <>
                    <polygon
                        className={a('zh-a-ray')}
                        points={`8,${WY} 17,${WY} 22,${H - 3} 4,${H - 3}`}
                        fill="rgba(255,240,200,.10)"
                    />
                    <polygon
                        className={a('zh-a-ray zh-d-r2')}
                        points={`29,${WY} 38,${WY} 44,${H - 3} 25,${H - 3}`}
                        fill="rgba(255,240,200,.08)"
                    />
                </>
            ) : null}
            <path
                className={a('zh-a-plant')}
                d={`M8 ${H - 3} q-2 -7 1 -12`}
                stroke="#3f8f57"
                strokeWidth={1.6}
                fill="none"
            />
            <path
                className={a('zh-a-plant zh-d2')}
                d={`M12 ${H - 3} q2 -5 0 -9`}
                stroke="#57a86d"
                strokeWidth={1.4}
                fill="none"
            />
            <path
                className={a('zh-a-plant zh-d3')}
                d={`M${W - 15} ${H - 3} q-1 -6 2 -10`}
                stroke="#3f8f57"
                strokeWidth={1.5}
                fill="none"
            />
            <path
                d={`M2 ${H - 4} q12 -2 23 0 t23 0 V${H - 2} H2z`}
                fill="#6b5a44"
                opacity={0.85}
            />
            <circle
                cx={W / 2 + 4}
                cy={H - 5}
                r={2.4}
                fill="#3b3b40"
            />
            <circle
                cx={W / 2 + 8}
                cy={H - 4.5}
                r={1.8}
                fill="#2f2f34"
            />
            {FISH.map(([x, y, d, col]) => (
                <g
                    key={`${x}-${y}`}
                    className={a(`zh-a-fish ${d}`)}
                >
                    <path
                        d={`M${x} ${y}c1.6-1.6 3.6-1.6 5 0-1.4 1.6-3.4 1.6-5 0z M${x + 5} ${y}l2.2-1.5v3z`}
                        fill={p.licht ? col : '#8a877f'}
                    />
                </g>
            ))}
            {p.co2 && p.fluss && p.animate
                ? [0, 1, 2].map(i => (
                      <circle
                          key={i}
                          className={`zh-a-pearl ${['', 'zh-d2', 'zh-d3'][i]}`}
                          cx={W - 9 + i * 1.5}
                          cy={H - 4}
                          r={0.9 + (i % 2) * 0.4}
                          fill="#cfe6ff"
                      />
                  ))
                : null}
            <rect
                x={1.5}
                y={WY - 1}
                width={W - 3}
                height={H - WY - 0.5}
                rx={1.5}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
                opacity={0.9}
            />
            <rect
                x={0}
                y={0}
                width={W}
                height={4}
                rx={2}
                fill={p.licht ? '#f2c14e' : '#55555c'}
                style={p.licht ? { filter: 'drop-shadow(0 0 3px #f2c14e)' } : undefined}
            />
        </svg>
    );
}
