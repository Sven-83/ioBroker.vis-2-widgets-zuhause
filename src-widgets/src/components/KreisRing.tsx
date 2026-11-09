/*
 * Ring around the camera icon of a tile: one segment and one letter per circle (preview "B1").
 * Not selected = faint, selected = light, armed = red and pulsing, waiting for the command = running dashes.
 */
import React from 'react';

import { type Kreis, type KreisLook, kreisGeometrie, kreisLook } from '../lib/kreise';

const SIZE = 52;
const RADIUS = 19;
const LETTER_GAP = 6.5;
const CAMERA = 'M3 7h12v10H3z M15 10.5l6-3.5v10l-6-3.5z';
const ARMED = '#c42b31';

/** Colours of segment and letter on a dark (off) and on a yellow (on) tile */
const COLOURS: Record<'dark' | 'light', Record<Exclude<KreisLook, 'wartet'>, [string, string]>> = {
    dark: { aus: ['#4a4a50', '#6a6a70'], gewaehlt: ['#a3a19a', '#cfccc3'], scharf: [ARMED, '#ff8a8d'] },
    light: {
        aus: ['rgba(42,33,8,.2)', 'rgba(42,33,8,.35)'],
        gewaehlt: ['rgba(42,33,8,.55)', 'rgba(42,33,8,.8)'],
        scharf: [ARMED, '#9e1d22'],
    },
};

export interface KreisRingProps {
    kreise: Kreis[];
    /** the tile is on (yellow) */
    on: boolean;
    /** the tile waits for its command */
    pending: boolean;
    /** animations allowed */
    animate: boolean;
}

export function KreisRing(p: KreisRingProps): React.JSX.Element {
    const ring = kreisGeometrie(p.kreise.length, SIZE, RADIUS, LETTER_GAP);
    const palette = COLOURS[p.on ? 'light' : 'dark'];
    const anyArmed = p.kreise.some(k => k.scharf === true);
    return (
        <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            aria-hidden
            style={{ flexShrink: 0, overflow: 'visible' }}
        >
            {p.kreise.map((kreis, i) => {
                const look = kreisLook(kreis, p.pending);
                const [segment, letter] = look === 'wartet' ? ['currentColor', 'currentColor'] : palette[look];
                const cls =
                    p.animate && look === 'scharf' ? 'zh-a-ring' : p.animate && look === 'wartet' ? 'zh-a-dash' : '';
                return (
                    <g key={i}>
                        <path
                            d={ring[i].d}
                            fill="none"
                            stroke={segment}
                            strokeWidth={2.4}
                            strokeLinecap="round"
                            strokeDasharray={look === 'wartet' ? '3 4' : undefined}
                            className={cls || undefined}
                        />
                        <text
                            x={ring[i].letter[0].toFixed(1)}
                            y={ring[i].letter[1].toFixed(1)}
                            fill={letter}
                            fontSize={8.5}
                            fontWeight={700}
                            textAnchor="middle"
                            dominantBaseline="central"
                        >
                            {kreis.buchstabe}
                        </text>
                    </g>
                );
            })}
            <g
                transform={`translate(${SIZE / 2 - 11},${SIZE / 2 - 11}) scale(0.92)`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinejoin="round"
            >
                <path d={CAMERA} />
                {anyArmed ? (
                    <circle
                        cx={6.5}
                        cy={10.5}
                        r={1.3}
                        className={p.animate ? 'zh-a-rec' : undefined}
                        style={{ fill: '#e5484d', stroke: 'none' }}
                    />
                ) : null}
            </g>
        </svg>
    );
}
