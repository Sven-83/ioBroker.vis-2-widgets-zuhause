/*
 * One wallbox row (symbol, name, status, start/stop button), shared by the vehicles card and the detail page.
 * After a tap the button shows a spinner until the wallbox itself reports the new state; a refused command
 * (the adapter writes the old value back) or no answer within 60 s ends it with a short notice.
 */
import React from 'react';

import { pendingResult, wallboxText, type Pending, type WallboxPhase, type WallboxTextInput } from '../lib/fahrzeuge';
import { fonts } from '../lib/theme';
import type { Snapshot } from '../lib/watch';

const STYLE_ID = 'zh-wallbox-styles';
const NOTICE_MS = 6_000;

const CSS = `
.zf-wb{display:flex;align-items:center;gap:9px;min-width:0}
.zf-sym{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--sw-off-bg,#333338);border:1px solid var(--sw-off-bd,#44444a);color:var(--sw-off-fg,#cfccc3);flex:none}
.zf-sym svg{width:30px;height:30px;overflow:visible}
.zf-txt{flex:1;min-width:0}
.zf-txt b{font-size:12px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zf-txt span{font-size:10.5px;color:var(--text-2,#a3a19a);white-space:nowrap;display:block;overflow:hidden;text-overflow:ellipsis}
.zf-wb button{position:relative;overflow:hidden;width:60px;height:44px;border-radius:12px;font:700 13px ${fonts.text};cursor:pointer;flex:none;border:1px solid var(--sw-off-bd,#44444a);background:var(--sw-off-bg,#333338);color:var(--text-2,#a3a19a);transition:background .3s,box-shadow .3s,transform .1s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.zf-wb button:disabled{opacity:.45;cursor:default}
.zf-wb button:active:not(:disabled){transform:scale(.96)}
.zf-wb.bereit button{background:linear-gradient(180deg,#f7d277,#d6a12c);border-color:#f6cf6a;color:#2a2108;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 6px 16px rgba(242,193,78,.32)}
.zf-wb.laedt button{background:linear-gradient(180deg,#e5484d,#a92a2f);border-color:#f06a6e;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 6px 16px rgba(229,72,77,.32)}
.zf-wb.warte button{opacity:1}
.zf-wb.bereit button::after,.zf-wb.laedt button::after{content:'';position:absolute;top:0;bottom:0;width:22px;left:-36px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);transform:skewX(-20deg);animation:zf-glanz 4.5s ease-in-out infinite}
@keyframes zf-glanz{0%,70%{transform:translateX(0) skewX(-20deg)}100%{transform:translateX(130px) skewX(-20deg)}}
.zf-spin{display:inline-block;width:16px;height:16px;border:2px solid #5a5a60;border-top-color:var(--sw-on,#f2c14e);border-radius:50%;animation:zh-spinner .8s linear infinite;vertical-align:middle}
.zf-wb.laedt .zf-sym{background:var(--st-on-bg,#183323);border-color:var(--st-on-bd,#3f8f57);color:var(--st-led,#6fe08a);animation:zf-glimm 2.4s ease-in-out infinite}
.zf-wb.laedt .zf-txt span{color:var(--st-on-fg,#9fe0b2)}
.zf-wb.bereit .zf-sym,.zf-wb.warte .zf-sym{color:var(--sw-on,#f2c14e);border-color:#8f7330;background:#3a3014}
.zf-wb.offline .zf-sym,.zf-wb.fehler .zf-sym{color:var(--warn-fg,#ffb3b3);border-color:var(--warn-bd,#e5484d);background:var(--warn-bg,#3a1d1f)}
.zf-wb.offline .zf-txt span,.zf-wb.fehler .zf-txt span,.zf-wb .zf-txt span.hinweis{color:var(--warn-fg,#ffb3b3)}
@keyframes zf-glimm{50%{box-shadow:0 0 10px rgba(111,224,138,.35)}}
.zf-wbx{transition:transform .5s ease}
.zf-wb.frei .zf-wbx{transform:translateX(3px)}
.zf-wbx .gh{fill:#3b3b41;stroke:currentColor;stroke-width:1.2}
.zf-wbx .leiste{fill:#55555c;transition:fill .4s}
.zf-wbx .lauf{fill:#d9ffe3;opacity:0}
.zf-wbx .blitz{fill:#55555c;transition:fill .4s}
.zf-wbx .buchse{fill:none;stroke:currentColor;stroke-width:1}
.zf-wbx .kabel{fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-dasharray:14;stroke-dashoffset:14;transition:stroke-dashoffset .9s ease}
.zf-wbx .stecker{fill:currentColor;stroke:currentColor;stroke-width:.9;stroke-linecap:round;opacity:0;transition:opacity .3s .7s}
.zf-wbx .fluss{fill:none;stroke:#d9ffe3;stroke-width:1.8;stroke-linecap:round;stroke-dasharray:.01 3.2;opacity:0}
.zf-wb.frei .leiste{animation:zf-ruhe 4s ease-in-out infinite}
.zf-wb.bereit .blitz,.zf-wb.warte .blitz{fill:var(--sw-on,#f2c14e)}
.zf-wb.laedt .blitz{fill:var(--st-led,#6fe08a);animation:zf-zuck 1.4s ease-in-out infinite;transform-origin:9px 11.5px}
.zf-wb.bereit .kabel,.zf-wb.laedt .kabel,.zf-wb.warte .kabel{stroke-dashoffset:0}
.zf-wb.bereit .stecker,.zf-wb.laedt .stecker,.zf-wb.warte .stecker{opacity:1}
.zf-wb.bereit .leiste{fill:var(--sw-on,#f2c14e);animation:zf-gelb 1.8s ease-in-out infinite}
.zf-wb.warte .leiste{fill:var(--sw-on,#f2c14e)}
.zf-wb.laedt .leiste{fill:#2f7a45}
.zf-wb.laedt .lauf{opacity:1;animation:zf-hoch 1.4s linear infinite}
.zf-wb.laedt .fluss{opacity:1;animation:zf-fliessen .8s linear infinite}
@keyframes zf-zuck{50%{transform:scale(1.15);filter:drop-shadow(0 0 1.5px #b8f5c7)}}
@keyframes zf-ruhe{50%{fill:#7a7a82}}
@keyframes zf-gelb{50%{fill:#7a6427}}
@keyframes zf-hoch{from{transform:translateX(-3px)}to{transform:translateX(8px)}}
@keyframes zf-fliessen{to{stroke-dashoffset:-3.21}}
.zf-wb button{font-family:${fonts.text}}
.zf.zf-still .zf-wb .zf-spin,.za.za-still .zf-wb .zf-spin{animation:zh-spinner .8s linear infinite!important}
@media (prefers-reduced-motion:reduce){.zf-wb .zf-wb-x,.zf-wb *{animation:none!important;transition:none!important}.zf-wb .zf-spin{animation:zh-spinner .8s linear infinite!important}}
`;

export function ensureWallboxStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

/** Wallbox: case with light bar, flash, socket, cable to the plug on the right */
function WallboxIcon({ n }: { n: number }): React.JSX.Element {
    const cable = 'M9 17.6v1.4q0 2.6 2.6 2.6h7.2';
    const clip = `zf-lc-${n}-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
    return (
        <svg
            className="zf-wbx"
            viewBox="0 0 24 24"
            aria-hidden
        >
            <defs>
                <clipPath id={clip}>
                    <rect
                        x={5.5}
                        y={4.2}
                        width={7}
                        height={1.8}
                        rx={0.9}
                    />
                </clipPath>
            </defs>
            <rect
                className="gh"
                x={3}
                y={1.8}
                width={12}
                height={17.2}
                rx={3.2}
            />
            <rect
                className="leiste"
                x={5.5}
                y={4.2}
                width={7}
                height={1.8}
                rx={0.9}
            />
            <g clipPath={`url(#${clip})`}>
                <rect
                    className="lauf"
                    x={5.5}
                    y={4.2}
                    width={2.6}
                    height={1.8}
                    rx={0.9}
                />
            </g>
            <path
                className="blitz"
                d="M9.9 7.6 7.2 11.9h2.1l-.7 3.4 2.9-4.5H9.4z"
            />
            <circle
                className="buchse"
                cx={9}
                cy={16.6}
                r={0.9}
            />
            <path
                className="kabel"
                d={cable}
            />
            <path
                className="fluss"
                d={cable}
            />
            <path
                className="stecker"
                d="M18.6 20.2h2.6a.8.8 0 0 1 .8.8v1.2a.8.8 0 0 1-.8.8h-2.6z M22 20.9h1.3 M22 22.3h1.3"
            />
        </svg>
    );
}

export interface WallboxRowProps {
    n: number;
    name: string;
    phase: WallboxPhase;
    /** everything for the status text except the phase */
    info: Omit<WallboxTextInput, 'phase'>;
    /** easee.charger<N>.charge, used to see a refused command */
    charge: Snapshot | undefined;
    editMode: boolean;
    lang: string;
    /** writes easee.charger<N>.charge */
    onSend: (wanted: boolean) => void;
}

export function WallboxRow(p: WallboxRowProps): React.JSX.Element {
    const [pending, setPending] = React.useState<Pending | null>(null);
    const [notice, setNotice] = React.useState('');
    const [now, setNow] = React.useState(() => Date.now());

    // clock only while a command is open (timeout)
    React.useEffect(() => {
        if (!pending) {
            return undefined;
        }
        const t = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(t);
    }, [pending]);

    // a sent command ends when the wallbox confirms it, the adapter refuses it or nothing comes back
    // (state adjusted during render, see react.dev "storing information from previous renders")
    const result = pending ? pendingResult(pending, p.phase, p.charge, now) : 'wait';
    if (pending && result !== 'wait') {
        setPending(null);
        setNotice(
            result === 'rejected'
                ? 'nicht angenommen, siehe Log'
                : result === 'timeout'
                  ? 'keine Bestätigung der Wallbox'
                  : '',
        );
    }

    React.useEffect(() => {
        if (!notice) {
            return undefined;
        }
        const t = setTimeout(() => setNotice(''), NOTICE_MS);
        return () => clearTimeout(t);
    }, [notice]);

    const shown = pending ? 'warte' : p.phase;
    const status = notice || wallboxText({ ...p.info, phase: shown }, p.lang);
    const usable = !pending && (p.phase === 'bereit' || p.phase === 'laedt') && !p.editMode;
    const label = shown === 'laedt' ? 'Stopp' : 'Start';
    const press = (): void => {
        if (!usable) {
            return;
        }
        const wanted = p.phase === 'bereit';
        p.onSend(wanted);
        setNotice('');
        setPending({ wanted, since: Date.now() });
    };
    return (
        <div className={`zf-wb ${shown}`}>
            <div className="zf-sym">
                <WallboxIcon n={p.n} />
            </div>
            <div className="zf-txt">
                <b>{p.name}</b>
                <span className={notice ? 'hinweis' : undefined}>{status}</span>
            </div>
            <button
                type="button"
                disabled={!usable}
                aria-label={`${p.name}: ${pending ? 'warte auf Wallbox' : `Laden ${label === 'Stopp' ? 'stoppen' : 'starten'}`}`}
                aria-busy={pending ? true : undefined}
                onClick={press}
            >
                {pending ? <span className="zf-spin" /> : label}
            </button>
        </div>
    );
}
