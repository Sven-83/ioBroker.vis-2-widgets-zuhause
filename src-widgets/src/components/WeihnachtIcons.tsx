/*
 * Icons of the Christmas lights: star, reindeer, fairy lights (34 x 30, line style of the other tiles).
 * "on" fills them and starts the animations (twinkle, nod, blinking bulbs).
 */
import React from 'react';

import type { KreisKey } from '../lib/weihnacht';

const STAR = 'M17 3.5l3.4 7 7.6 1-5.5 5.3 1.4 7.6L17 20.8l-6.9 3.6 1.4-7.6L6 11.5l7.6-1z';
const BULBS: [number, number][] = [
    [5, 9.6],
    [10.5, 11.2],
    [16, 9],
    [21.5, 6.6],
    [27, 7.6],
];
const BULB_FILL = ['#fff4c2', '#ffffff', '#ffe08a', '#fff4c2', '#ffffff'];

export const WEIHNACHT_CSS = `
@keyframes zh-wn-twinkle{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(.55)}}
@keyframes zh-wn-bulb{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes zh-wn-nod{0%,100%{transform:rotate(0)}50%{transform:rotate(-5deg)}}
@keyframes zh-wn-pop{0%{transform:scale(0)}70%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes zh-wn-dot{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes zh-wn-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes zh-wn-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes zh-wn-press{0%{opacity:0;clip-path:inset(0 100% 0 0)}100%{opacity:1;clip-path:inset(0 0 0 0)}}
.zh-wn-on .zh-wn-tw{transform-box:fill-box;transform-origin:center;animation:zh-wn-twinkle 2.2s ease-in-out infinite}
.zh-wn-on .zh-wn-tw2{animation-delay:.7s}.zh-wn-on .zh-wn-tw3{animation-delay:1.4s}
.zh-wn-on .zh-wn-bulb{animation:zh-wn-bulb 1.8s ease-in-out infinite}
.zh-wn-on .zh-wn-bulb:nth-of-type(2n){animation-delay:.6s}.zh-wn-on .zh-wn-bulb:nth-of-type(3n){animation-delay:1.2s}
.zh-wn-on .zh-wn-head{transform-box:view-box;transform-origin:22px 15px;animation:zh-wn-nod 3.2s ease-in-out infinite}
.zh-wn-on .zh-wn-nose{animation:zh-wn-bulb 1.6s ease-in-out infinite}
.zh-wn-layer{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;
 opacity:0;transform:translateY(8px) scale(.94);transition:opacity .55s ease,transform .55s ease;pointer-events:none}
.zh-wn-layer.zh-wn-show{opacity:1;transform:none}
.zh-wn-badge{animation:zh-wn-pop .35s ease}
.zh-wn-pause .zh-wn-dot-a{animation:zh-wn-dot 1s infinite}
.zh-wn-in{animation:zh-wn-in .3s ease}
.zh-wn-grow{transform-origin:left;animation:zh-wn-grow .6s ease}
.zh-wn-still .zh-wn-tw,.zh-wn-still .zh-wn-bulb,.zh-wn-still .zh-wn-head,.zh-wn-still .zh-wn-nose{animation:none!important}
.zh-wn-still .zh-wn-layer{transition:none}
@media (prefers-reduced-motion:reduce){.zh-wn-tw,.zh-wn-bulb,.zh-wn-head,.zh-wn-nose{animation:none!important}.zh-wn-layer{transition:none}}
`;

const STYLE_ID = 'zh-weihnacht-styles';

export function ensureWeihnachtStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = WEIHNACHT_CSS;
    document.head.appendChild(style);
}

const svgProps = (size: number): React.SVGProps<SVGSVGElement> => ({
    viewBox: '0 0 34 30',
    width: size,
    height: (size * 30) / 34,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    style: { overflow: 'visible' },
});

export function KreisIcon({
    kreis,
    on,
    size = 36,
}: {
    kreis: KreisKey;
    on: boolean;
    size?: number;
}): React.JSX.Element {
    if (kreis === 'stern') {
        return (
            <svg
                {...svgProps(size)}
                strokeWidth={1.8}
            >
                <path
                    d={STAR}
                    fill={on ? 'rgba(255,255,255,.55)' : 'none'}
                />
                <path
                    className="zh-wn-tw"
                    d="M29 3v4M27 5h4"
                />
                <path
                    className="zh-wn-tw zh-wn-tw2"
                    d="M5 21v3M3.5 22.5h3"
                />
                <path
                    className="zh-wn-tw zh-wn-tw3"
                    d="M30 22v3M28.5 23.5h3"
                />
            </svg>
        );
    }
    if (kreis === 'rentier') {
        return (
            <svg
                {...svgProps(size)}
                strokeWidth={1.8}
            >
                <path d="M6 15c0-1.6 1.4-2.6 3-2.6h11c1.8 0 3 1.2 3 3v2.4c0 1.4-1 2.4-2.4 2.4H8.4C7 20.2 6 19 6 17.6z" />
                <path d="M9 20v7M12.5 20v7M17.5 20v7M21 20v7M6 14l-2.5-1.5" />
                <g className="zh-wn-head">
                    <path d="M21 13l3-5.5" />
                    <path d="M23 7.5c0-1.3 1.2-2.2 2.6-2.2 1.2 0 2 .6 2.6 1.4l1.6 1.9c.4.5 0 1.2-.6 1.2h-3.6c-1.5 0-2.6-.9-2.6-2.3z" />
                    <path d="M24 5.3L22 1.5M23 3.3l-2.6-.4M26.5 5.3L28.5 1.5M27.6 3.2l2.7-.6" />
                    <circle
                        className="zh-wn-nose"
                        cx={30.4}
                        cy={8.4}
                        r={1.3}
                        fill={on ? '#d8432f' : 'currentColor'}
                        stroke="none"
                    />
                </g>
            </svg>
        );
    }
    return (
        <svg
            {...svgProps(size)}
            strokeWidth={1.6}
        >
            <path d="M1.5 5c5 7 10 7 15.5 3s10.5-4 15.5 3" />
            {BULBS.map(([x, y], i) => (
                <React.Fragment key={x}>
                    <path d={`M${x} ${y}v2.2`} />
                    <ellipse
                        className="zh-wn-bulb"
                        cx={x}
                        cy={y + 5.4}
                        rx={2.3}
                        ry={3.2}
                        fill={on ? BULB_FILL[i] : 'none'}
                    />
                </React.Fragment>
            ))}
        </svg>
    );
}

/** small filled symbols for the badge row top right and the circuit selector */
export function MiniIcon({ kreis, size = 13 }: { kreis: KreisKey; size?: number }): React.JSX.Element {
    const common = { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true as const };
    if (kreis === 'stern') {
        return (
            <svg {...common}>
                <path
                    d="M8 1.2l2 4.1 4.5.6-3.3 3.1.8 4.5L8 11.4l-4 2.1.8-4.5L1.5 5.9 6 5.3z"
                    fill="currentColor"
                />
            </svg>
        );
    }
    if (kreis === 'rentier') {
        return (
            <svg
                {...common}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
            >
                <path d="M3 8h7.5c1 0 1.5.6 1.5 1.5V10H3.5C3 10 2.5 9.5 2.5 9S3 8 3 8zM4 10v4.5M10.5 10v4.5M11 8l2-3.5M12.5 4.5l-1-3M13 4l2-2.5" />
            </svg>
        );
    }
    return (
        <svg
            {...common}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
        >
            <path d="M1 3c3 3.5 5 3.5 7 2s4-1.5 7 1.5" />
            <circle
                cx={4}
                cy={8.5}
                r={1.8}
                fill="currentColor"
            />
            <circle
                cx={8.5}
                cy={7.8}
                r={1.8}
                fill="currentColor"
            />
            <circle
                cx={13}
                cy={9}
                r={1.8}
                fill="currentColor"
            />
        </svg>
    );
}

export function SunsetIcon({ size = 18 }: { size?: number }): React.JSX.Element {
    return (
        <svg
            viewBox="0 0 24 18"
            width={size}
            height={(size * 18) / 24}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            aria-hidden
        >
            <path d="M5 13a7 7 0 0 1 14 0M1.5 13h21M12 2v2.5M4.6 5.6l1.6 1.6M19.4 5.6l-1.6 1.6M9.5 16.5l2.5 1.5 2.5-1.5" />
        </svg>
    );
}
