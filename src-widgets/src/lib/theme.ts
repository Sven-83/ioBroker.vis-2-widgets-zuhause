/*
 * Design tokens (hand-over section 3) and the shared stylesheet of all widgets.
 * Widgets read only CSS variables: the project CSS can set --card, --sw-on ... and every widget follows.
 * Without project CSS the fallback values below apply (dark theme).
 */
import barlow400 from '../fonts/barlow-latin-400-normal.woff2';
import barlow500 from '../fonts/barlow-latin-500-normal.woff2';
import barlow600 from '../fonts/barlow-latin-600-normal.woff2';
import condensed500 from '../fonts/barlow-condensed-latin-500-normal.woff2';
import condensed600 from '../fonts/barlow-condensed-latin-600-normal.woff2';

const TOKENS = {
    bg: '#232325',
    nav: '#1a1a1c',
    card: '#2b2b2f',
    border: '#36363b',
    text: '#ece9e1',
    'text-2': '#a3a19a',
    'sw-off-bg': '#333338',
    'sw-off-bd': '#44444a',
    'sw-off-fg': '#cfccc3',
    'sw-on': '#f2c14e',
    'sw-on-fg': '#2a2108',
    'st-on-bg': '#183323',
    'st-on-bd': '#3f8f57',
    'st-on-fg': '#9fe0b2',
    'st-led': '#6fe08a',
    'st-off-bd': '#4f4f56',
    'warn-bg': '#3a1d1f',
    'warn-bd': '#e5484d',
    'warn-fg': '#ffb3b3',
    co2: '#4aa3ff',
    light: '#f2c14e',
    'lock-open': '#e5484d',
    'lock-closed': '#1f7a3a',
    'radius-card': '18px',
    'radius-tile': '14px',
} as const;

export type Token = keyof typeof TOKENS;

/** CSS value of a token: the project variable, else the fallback */
export function v(name: Token): string {
    return `var(--${name}, ${TOKENS[name]})`;
}

// Own family names, so a "Barlow" of the VIS project (or a missing one) never changes the widgets
export const fonts = {
    text: "'Zuhause Barlow', Barlow, system-ui, sans-serif",
    numbers: "'Zuhause Barlow Condensed', 'Barlow Semi Condensed', 'Barlow Condensed', system-ui, sans-serif",
} as const;

const STYLE_ID = 'vis-2-widgets-zuhause-styles';

const face = (family: string, weight: number, url: string): string =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${url}) format('woff2');}`;

/*
 * Animations: only transform and opacity (GPU), only on active or warning tiles (the classes are set
 * by the widgets only then), off with prefers-reduced-motion and with the level "aus".
 */
const CSS = `
${face('Zuhause Barlow', 400, barlow400)}
${face('Zuhause Barlow', 500, barlow500)}
${face('Zuhause Barlow', 600, barlow600)}
${face('Zuhause Barlow Condensed', 500, condensed500)}
${face('Zuhause Barlow Condensed', 600, condensed600)}
@keyframes zh-spin{to{transform:rotate(360deg)}}
@keyframes zh-rise{0%{transform:translateY(3px);opacity:0}40%{opacity:1}100%{transform:translateY(-5px);opacity:0}}
@keyframes zh-bubble{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-9px);opacity:0}}
@keyframes zh-swim{0%,100%{transform:translateX(-1.5px)}50%{transform:translateX(1.5px)}}
@keyframes zh-glow{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes zh-twinkle{0%,100%{opacity:.2}50%{opacity:1}}
@keyframes zh-rec{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes zh-sway{0%,100%{transform:skewY(0deg)}50%{transform:skewY(-6deg)}}
@keyframes zh-warnpulse{0%,100%{box-shadow:0 0 0 0 rgba(229,72,77,0)}50%{box-shadow:0 0 0 4px rgba(229,72,77,.35)}}
@keyframes zh-alarmflash{0%,49%{opacity:0}50%,100%{opacity:1}}
@keyframes zh-drift{0%,100%{transform:translateX(-1.5px)}50%{transform:translateX(1.5px)}}
@keyframes zh-rain{0%{transform:translateY(-2px);opacity:0}30%{opacity:1}100%{transform:translateY(4px);opacity:0}}
@keyframes zh-wobble{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
@keyframes zh-flicker{0%,100%{opacity:.55}30%{opacity:.9}60%{opacity:.65}}
@keyframes zh-garage{0%{transform:translateY(0)}50%{transform:translateY(-6px)}100%{transform:translateY(0)}}
@keyframes zh-once{0%{transform:scale(1)}30%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes zh-slats{0%,100%{transform:translateY(-3px)}50%{transform:translateY(3px)}}
@keyframes zh-led{0%,6%{opacity:1}8%,100%{opacity:.15}}
@keyframes zh-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-2px)}40%{transform:translateX(2px)}60%{transform:translateX(-1px)}80%{transform:translateX(1px)}}
@keyframes zh-spinner{to{transform:rotate(360deg)}}
@keyframes zh-breathe{0%,100%{opacity:.82}50%{opacity:1}}
.zh-a-breathe{animation:zh-breathe 4s ease-in-out infinite}
@keyframes zh-flash{0%{opacity:.25}35%{opacity:1}55%{opacity:.5}100%{opacity:1}}
.zh-a-flash{animation:zh-flash 1.4s ease-out 1}
@keyframes zh-toast{0%{transform:translate(-50%,8px);opacity:0}100%{transform:translate(-50%,0);opacity:1}}
.zh-a-spin{transform-box:fill-box;transform-origin:center;animation:zh-spin 3.5s linear infinite}
.zh-a-spin-fast{transform-box:fill-box;transform-origin:center;animation:zh-spin 2.5s linear infinite}
.zh-a-slow{transform-box:fill-box;transform-origin:center;animation:zh-spin 14s linear infinite}
.zh-a-rise{animation:zh-rise 2.2s ease-in-out infinite}
.zh-a-bubble{animation:zh-bubble 2.4s ease-in infinite}
.zh-a-swim{animation:zh-swim 3s ease-in-out infinite}
.zh-a-glow{animation:zh-glow 2.6s ease-in-out infinite}
.zh-a-twinkle{stroke-width:2.6;animation:zh-twinkle 1.8s ease-in-out infinite}
.zh-a-rec{animation:zh-rec 1.6s ease-in-out infinite}
.zh-a-blink{animation:zh-rec 1s steps(2,jump-none) infinite}
.zh-a-sway{transform-box:fill-box;transform-origin:left center;animation:zh-sway 3s ease-in-out infinite}
.zh-a-warn{animation:zh-warnpulse 2.4s ease-in-out infinite}
.zh-a-drift{animation:zh-drift 5s ease-in-out infinite}
.zh-a-rain{animation:zh-rain 1.2s linear infinite}
.zh-a-wobble{transform-box:fill-box;transform-origin:center top;animation:zh-wobble 2.8s ease-in-out infinite}
.zh-a-flicker{animation:zh-flicker 1.4s ease-in-out infinite}
.zh-a-garage{animation:zh-garage .6s ease-in-out 1}
.zh-a-once{transform-box:fill-box;transform-origin:center;animation:zh-once 2.5s ease-in-out infinite}
.zh-a-slats{animation:zh-slats 1.6s ease-in-out infinite}
.zh-a-led{animation:zh-led 4s linear infinite}
.zh-a-shake{animation:zh-shake .5s linear infinite}
.zh-d2{animation-delay:.4s}
.zh-d3{animation-delay:.8s}
.zh-alarm-layer{animation:zh-alarmflash .9s steps(1) infinite}
.zh-spinner{animation:zh-spinner .9s linear infinite}
.zh-dezent [class*="zh-a-"],.zh-dezent.zh-a-warn{animation-duration:6s!important;opacity:.85}
.zh-still [class*="zh-a-"],.zh-still.zh-a-warn,.zh-still .zh-alarm-layer{animation:none!important}
.zh-tile:focus-visible,.zh-btn:focus-visible{outline:2px solid ${TOKENS['sw-on']};outline-offset:2px}
.zh-btn{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.zh-btn:active{transform:scale(.97)}
@media (prefers-reduced-motion:reduce){[class*="zh-a-"],.zh-alarm-layer,.zh-spinner{animation:none!important}}
`;

/** Registers fonts, keyframes and helper classes once per page (no request to Google) */
export function ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}
