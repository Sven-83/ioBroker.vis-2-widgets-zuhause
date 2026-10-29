/*
 * Icon of the register, optionally animated. The moving parts are own <path>/<g> elements
 * (reference: animationen-vorschau.html of the icon package); the classes come from theme.ts.
 */
import React from 'react';

import { ICONS, iconFor } from '../lib/icons';

interface Part {
    d: string;
    cls?: string;
    style?: React.CSSProperties;
    /** circle instead of path: cx, cy, r */
    circle?: [number, number, number];
}

interface AnimatedIcon {
    /** static part */
    base: string;
    parts: Part[];
}

const CO2 = 'var(--co2, #4aa3ff)';

/** Animation per icon (base name); `on` is the value the tile animates for */
function animated(name: string, opts: { co2?: boolean }): AnimatedIcon | null {
    switch (name) {
        case 'waschmaschine':
            return {
                base: 'M5 3h14v18H5z M5 7h14 M8 5h1',
                parts: [{ d: 'M7 14a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M10 13.5c1-1.2 3-.3 4 .8', cls: 'zh-a-spin' }],
            };
        case 'trockner':
            return {
                base: 'M5 3h14v18H5z M5 7h14 M8 5h1',
                parts: [{ d: 'M8 14a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M10.5 13c1 1 2 1 3 0', cls: 'zh-a-spin-fast' }],
            };
        case 'spuelmaschine':
            return {
                base: 'M5 3h14v18H5z M5 7h14 M8 5h1 M15 5h1 M8 18h8',
                parts: [
                    { d: 'M9 11v2', cls: 'zh-a-rain' },
                    { d: 'M12 11v2', cls: 'zh-a-rain zh-d2' },
                    { d: 'M15 11v2', cls: 'zh-a-rain zh-d3' },
                ],
            };
        case 'backofen':
            return {
                base: ICONS.backofen,
                parts: [
                    { d: 'M8 13.5c.6-.8-.6-1.4 0-2.2', cls: 'zh-a-rise' },
                    { d: 'M10.5 13.5c.6-.8-.6-1.4 0-2.2', cls: 'zh-a-rise zh-d2' },
                    { d: 'M13 13.5c.6-.8-.6-1.4 0-2.2', cls: 'zh-a-rise zh-d3' },
                ],
            };
        case 'aquarium':
            return {
                base: 'M3 6h18v14H3z M3 9h18 M17 20v-5 M18.5 20v-3',
                parts: [
                    { d: 'M7 15c1.5-2 4-2 5.5 0-1.5 2-4 2-5.5 0z M12.5 15l2.5-1.8v3.6z', cls: 'zh-a-swim' },
                    ...(opts.co2
                        ? [
                              { d: '', circle: [9, 12.5, 0.6], cls: 'zh-a-bubble', style: { stroke: CO2 } },
                              { d: '', circle: [10.5, 12, 0.5], cls: 'zh-a-bubble zh-d2', style: { stroke: CO2 } },
                              { d: '', circle: [8, 12, 0.5], cls: 'zh-a-bubble zh-d3', style: { stroke: CO2 } },
                          ]
                        : []),
                ] as Part[],
            };
        case 'licht':
            return {
                base: ICONS.licht,
                parts: [{ d: 'M12 .8v1.2 M4.2 4l.9.9 M19.8 4l-.9.9 M1.5 10H3 M21 10h1.5', cls: 'zh-a-glow' }],
            };
        case 'garten':
            return {
                base: ICONS.garten,
                parts: [{ d: 'M4.5 5.5l1.6 1 M19.5 5.5l-1.6 1 M4.5 9.5h1.8 M17.7 9.5h1.8', cls: 'zh-a-glow' }],
            };
        case 'alarm':
            return {
                base: 'M9 17v-4a3 3 0 0 1 6 0v4z M7 20h10',
                parts: [{ d: 'M12 4v2 M6 7l1.4 1.4 M18 7l-1.4 1.4 M4 13h2 M18 13h2', cls: 'zh-a-glow' }],
            };
        case 'sirene':
            return {
                base: ICONS.sirene,
                parts: [{ d: 'M12 1.5v2 M4.5 4.5l1.4 1.4 M19.5 4.5l-1.4 1.4 M2 11h2 M20 11h2', cls: 'zh-a-glow' }],
            };
        case 'baum':
            return {
                base: ICONS.baum,
                parts: [
                    { d: 'M14 9h.1', cls: 'zh-a-twinkle' },
                    { d: 'M17 12.5h.1', cls: 'zh-a-twinkle zh-d2' },
                    { d: 'M13 13.5h.1', cls: 'zh-a-twinkle zh-d3' },
                ],
            };
        case 'tv':
            return {
                base: ICONS.tv,
                parts: [
                    {
                        d: 'M6 8h12v6H6z',
                        cls: 'zh-a-flicker',
                        style: { fill: 'currentColor', stroke: 'none', opacity: 0.6 },
                    },
                ],
            };
        case 'kamera':
            return {
                base: 'M3 7h12v10H3z M15 10.5l6-3.5v10l-6-3.5z',
                parts: [
                    { d: '', circle: [6.5, 10.5, 1.3], cls: 'zh-a-rec', style: { fill: '#e5484d', stroke: 'none' } },
                ],
            };
        case 'fenster':
            // animates while open
            return { base: ICONS.fenster, parts: [{ d: 'M12 20l6-2.5V11l-6-2', cls: 'zh-a-sway' }] };
        case 'post':
            // animates while post is there
            return {
                base: 'M3 6h18v13H3z M3 9h18',
                parts: [{ d: 'M7 11.5h10v5.5H7z M7 11.5l5 3 5-3', cls: 'zh-a-wobble' }],
            };
        case 'steckdose':
            return {
                base: 'M5 5h14v14H5z M10.5 11v2 M13.5 11v2',
                parts: [{ d: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0', cls: 'zh-a-glow' }],
            };
        case 'jalousie':
            return {
                base: 'M4 3h16v3H4z M5 6v15 M19 6v15',
                parts: [{ d: 'M5 9h14 M5 12h14 M5 15h14', cls: 'zh-a-slats' }],
            };
        case 'rauchmelder':
            return {
                base: ICONS.rauchmelder,
                parts: [{ d: '', circle: [12, 9, 1.3], cls: 'zh-a-led', style: { fill: '#6fe08a', stroke: 'none' } }],
            };
        case 'wetter-sonne':
            return { base: '', parts: [{ d: ICONS['wetter-sonne'], cls: 'zh-a-slow' }] };
        case 'wetter-regen':
            return {
                base: '',
                parts: [
                    { d: 'M7 15h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z', cls: 'zh-a-drift' },
                    { d: 'M9 18v1.5', cls: 'zh-a-rain', style: { stroke: CO2 } },
                    { d: 'M12 18v1.5', cls: 'zh-a-rain zh-d2', style: { stroke: CO2 } },
                    { d: 'M15 18v1.5', cls: 'zh-a-rain zh-d3', style: { stroke: CO2 } },
                ],
            };
        case 'wetter-wolke':
        case 'wetter-teilweise':
            return { base: '', parts: [{ d: ICONS[name], cls: 'zh-a-drift' }] };
        default:
            return null;
    }
}

/** Icons whose animation shows the off state (window open = value false) */
const ANIMATE_WHEN_OFF = new Set(['fenster']);

export interface IconProps {
    /** base name of the register, e.g. "fenster" */
    name: string;
    /** state value as boolean (chooses the state variant) */
    on: boolean;
    /** the tile is active or warns: the animation runs */
    animate?: boolean;
    co2?: boolean;
    size?: number;
    strokeWidth?: number;
    color?: string;
    /** own SVG path (field iconEigen as path) instead of the register */
    path?: string;
    /** key that restarts a one-time animation (garage gate) */
    replayKey?: string;
}

export function Icon(props: IconProps): React.JSX.Element {
    const { name, on, animate, co2, size = 30, strokeWidth = 1.7, color, path, replayKey } = props;
    const common: React.SVGProps<SVGSVGElement> = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color || 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { flexShrink: 0, overflow: 'visible' },
    };
    if (path) {
        return (
            <svg {...common}>
                <path d={path} />
            </svg>
        );
    }
    if (name === 'garage' && animate && replayKey !== undefined) {
        // the gate moves once after every change (hand-over 10.3, rule 3); the key restarts the animation
        return (
            <svg {...common}>
                <path d="M3 10l9-6 9 6v11H3z M6 21v-9h12v9" />
                <g
                    key={replayKey}
                    className="zh-a-garage"
                >
                    <path d={on ? 'M6 14.5h12' : 'M6 15h12 M6 18h12'} />
                </g>
            </svg>
        );
    }
    const anim = animate ? animated(name, { co2 }) : null;
    // window and post only animate in their warning variant; the rest in the "on" variant
    const showAnim = anim && (ANIMATE_WHEN_OFF.has(name) ? !on : true);
    if (anim && showAnim) {
        return (
            <svg {...common}>
                {anim.base ? <path d={anim.base} /> : null}
                {anim.parts.map((part, i) =>
                    part.circle ? (
                        <circle
                            key={i}
                            className={part.cls}
                            cx={part.circle[0]}
                            cy={part.circle[1]}
                            r={part.circle[2]}
                            style={part.style}
                        />
                    ) : (
                        <path
                            key={i}
                            className={part.cls}
                            d={part.d}
                            style={part.style}
                        />
                    ),
                )}
            </svg>
        );
    }
    return (
        <svg {...common}>
            <path d={iconFor(name, on) || ICONS[name] || ''} />
        </svg>
    );
}
