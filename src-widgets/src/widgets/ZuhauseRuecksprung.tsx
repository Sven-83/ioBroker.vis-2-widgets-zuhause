/*
 * VIS-2 widget "Rücksprung": invisible at runtime. After the idle time it closes open popups and details
 * (topmost first), goes back to the start tab and the start menu entry of the Jäger layout. On the start page
 * the screen of a Fully Kiosk tablet is dimmed after the idle time without touch or motion; a touch or motion
 * sets the wake brightness again. Time adjustable, 0 = off (WCAG 2.2 SC 2.2.1).
 * Touches inside frames of the same origin (climate, camera) count too; nothing happens while a video or a
 * live image plays there.
 */
import React from 'react';
import { createPortal } from 'react-dom';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import {
    DEFAULT_LIMIT_S,
    DEFAULT_ZEIT_S,
    istStartHash,
    naechsterSchritt,
    sekunden,
    startHash,
} from '../lib/ruecksprung';
import { ensureStyles, fonts, v } from '../lib/theme';
import {
    EBENE_EVENT,
    PREFIX,
    RUECKSPRUNG_AKTIV_EVENT,
    SET_INFO,
    requestStartseite,
    type EbeneMeldung,
} from '../lib/vis';

const TICK_MS = 1_000;
const AKTIV_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'input', 'wheel'] as const;
const ENDE_EVENTS = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'] as const;

/** Part of the Fully Kiosk JavaScript interface that is used (Plus licence, "JavaScript Interface" on) */
interface FullyApi {
    getScreenBrightness?: () => number;
    setScreenBrightness?: (value: number) => void;
    bind?: (event: string, code: string) => void;
}

interface RuecksprungRxData {
    zeit: number | string;
    limit: number | string;
    jaegerAnsicht: string;
    jaegerWidget: string;
    startMenue: string;
    dimmen: boolean;
    hellGedimmt: number | string;
    hellWach: number | string;
}

const WACH_FN = '__zuhauseRuecksprungWach';
/** the catch layer stays this long after the waking finger is lifted, so its click cannot reach a tile */
const SPERRE_NACH_MS = 350;
const SPERRE_MAX_MS = 3_000;

interface RuecksprungState extends VisRxWidgetState {
    /** dimmed: a transparent layer catches the first touch, it only wakes the screen */
    zhSperre: boolean;
}

export default class ZuhauseRuecksprung extends (window.visRxWidget as typeof VisRxWidget)<
    RuecksprungRxData,
    RuecksprungState
> {
    private tick?: ReturnType<typeof setInterval>;
    private letzteAktivitaet = Date.now();
    private bedienungSeit: number | null = null;
    private ebenen: { id: string; schliessen?: () => void }[] = [];
    private letzteBewegung = 0;
    private gedimmt = false;
    /** the brightness was really lowered (Fully interface present), so waking has to raise it again */
    private dimmWirkt = false;
    private fenster = new WeakSet<Window>();
    private alive = false;
    private sperreWartetAufLoslassen = false;
    private sperreTimer?: ReturnType<typeof setTimeout>;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhSperre: false };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseRuecksprung',
            ...SET_INFO,
            visName: 'ZuhauseRuecksprung',
            visWidgetLabel: 'back_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'zeit',
                            type: 'number',
                            label: 'back_time',
                            tooltip: 'back_time_tip',
                            default: DEFAULT_ZEIT_S,
                            min: 0,
                            max: 3600,
                        },
                        {
                            name: 'limit',
                            type: 'number',
                            label: 'back_limit',
                            tooltip: 'back_limit_tip',
                            default: DEFAULT_LIMIT_S,
                            min: 10,
                            max: 3600,
                        },
                        { name: 'jaegerAnsicht', type: 'text', label: 'back_view', default: 'Hauptseite' },
                        { name: 'jaegerWidget', type: 'text', label: 'back_widget', tooltip: 'back_widget_tip' },
                        { name: 'startMenue', type: 'text', label: 'back_menu', default: 'Startseite' },
                    ],
                },
                {
                    name: 'dim',
                    label: 'group_dim',
                    fields: [
                        { name: 'dimmen', type: 'checkbox', label: 'back_dim', tooltip: 'back_dim_tip', default: true },
                        {
                            name: 'hellGedimmt',
                            type: 'slider',
                            label: 'back_dim_level',
                            min: 1,
                            max: 100,
                            default: 10,
                        },
                        {
                            name: 'hellWach',
                            type: 'slider',
                            label: 'back_wake_level',
                            tooltip: 'back_wake_level_tip',
                            min: 1,
                            max: 100,
                            default: 100,
                        },
                    ],
                },
            ],
            visDefaultStyle: { width: 120, height: 40 },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-pin.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseRuecksprung.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        if (this.props.editMode) {
            return;
        }
        this.alive = true;
        window.addEventListener(EBENE_EVENT, this.onEbene);
        window.addEventListener(RUECKSPRUNG_AKTIV_EVENT, this.onFrage);
        this.beobachte(window);
        const fully = this.fully();
        if (fully?.bind) {
            // motion in front of the tablet wakes the screen and keeps it bright (needs Fully's motion detection);
            // it does not count as a touch, so it never holds a page or popup open
            (window as unknown as Record<string, () => void>)[WACH_FN] = () => {
                this.letzteBewegung = Date.now();
                this.aufwecken(true);
            };
            try {
                fully.bind('onMotion', `window.${WACH_FN} && window.${WACH_FN}();`);
            } catch {
                // interface switched off: no wake by motion
            }
        }
        // start bright: after a reload the tablet may still be dimmed from before
        this.hellSetzen(this.prozent(this.state.rxData.hellWach, 100));
        this.tick = setInterval(() => this.pruefe(), TICK_MS);
    }

    componentWillUnmount(): void {
        this.alive = false;
        if (this.tick) {
            clearInterval(this.tick);
        }
        if (this.sperreTimer) {
            clearTimeout(this.sperreTimer);
        }
        window.removeEventListener(EBENE_EVENT, this.onEbene);
        window.removeEventListener(RUECKSPRUNG_AKTIV_EVENT, this.onFrage);
        this.vergiss(window);
        this.aufwecken(true);
        delete (window as unknown as Record<string, unknown>)[WACH_FN];
        super.componentWillUnmount();
    }

    // ------------------------------------------------------------ settings

    private zeitMs(): number {
        return sekunden(this.state.rxData.zeit, DEFAULT_ZEIT_S, true) * 1000;
    }

    private limitMs(): number {
        return sekunden(this.state.rxData.limit, DEFAULT_LIMIT_S, false) * 1000;
    }

    private jaeger(): { view: string; widget: string; menu: string } {
        const d = this.state.rxData;
        return {
            view: (d.jaegerAnsicht || 'Hauptseite').trim(),
            widget: (d.jaegerWidget || '').trim(),
            menu: (d.startMenue || 'Startseite').trim(),
        };
    }

    // eslint-disable-next-line class-methods-use-this
    private fully(): FullyApi | undefined {
        return (window as unknown as { fully?: FullyApi }).fully;
    }

    // ------------------------------------------------------------ activity

    private onAktiv = (e: Event): void => {
        this.letzteAktivitaet = Date.now();
        if (e.type === 'pointerdown' || e.type === 'touchstart') {
            this.bedienungSeit = this.bedienungSeit ?? this.letzteAktivitaet;
        }
        // a finger: keep the catch layer until it is lifted; keys and other input: remove it at once
        this.aufwecken(e.type !== 'pointerdown' && e.type !== 'touchstart');
    };

    private onEnde = (): void => {
        this.letzteAktivitaet = Date.now();
        this.bedienungSeit = null;
        if (this.sperreWartetAufLoslassen) {
            this.sperreWartetAufLoslassen = false;
            this.sperreAus(SPERRE_NACH_MS);
        }
    };

    private sperreAus(nachMs: number): void {
        if (this.sperreTimer) {
            clearTimeout(this.sperreTimer);
        }
        this.sperreTimer = setTimeout(() => {
            this.sperreTimer = undefined;
            this.sperreWartetAufLoslassen = false;
            if (this.alive && this.state.zhSperre) {
                this.setState({ zhSperre: false });
            }
        }, nachMs);
    }

    private beobachte(w: Window): void {
        if (this.fenster.has(w)) {
            return;
        }
        this.fenster.add(w);
        for (const t of AKTIV_EVENTS) {
            w.addEventListener(t, this.onAktiv, { capture: true, passive: true });
        }
        for (const t of ENDE_EVENTS) {
            w.addEventListener(t, this.onEnde, { capture: true, passive: true });
        }
    }

    private vergiss(w: Window): void {
        for (const t of AKTIV_EVENTS) {
            w.removeEventListener(t, this.onAktiv, { capture: true });
        }
        for (const t of ENDE_EVENTS) {
            w.removeEventListener(t, this.onEnde, { capture: true });
        }
    }

    /** Windows of the frames that belong to the same origin (others cannot be watched and are left out) */
    // eslint-disable-next-line class-methods-use-this
    private rahmen(): Window[] {
        const out: Window[] = [];
        for (const f of Array.from(document.querySelectorAll('iframe'))) {
            try {
                const w = f.contentWindow;
                if (w && w.document && w.location.origin === window.location.origin) {
                    out.push(w);
                }
            } catch {
                // other origin
            }
        }
        return out;
    }

    /** A video or a live image (MJPEG) plays in the page or in a frame of the same origin */
    // eslint-disable-next-line class-methods-use-this
    private medienLaufen(wins: Window[]): boolean {
        for (const w of [window, ...wins]) {
            try {
                const doc = w.document;
                for (const vid of Array.from(doc.querySelectorAll('video'))) {
                    if (!vid.paused && !vid.ended) {
                        return true;
                    }
                }
                if (doc.querySelector('img[src*=".mjpeg"]')) {
                    return true;
                }
            } catch {
                // frame went away
            }
        }
        return false;
    }

    // ------------------------------------------------------------ levels

    private onEbene = (e: Event): void => {
        const m = (e as CustomEvent<EbeneMeldung>).detail;
        if (!m?.id) {
            return;
        }
        e.preventDefault();
        this.ebenen = this.ebenen.filter(x => x.id !== m.id);
        if (m.offen) {
            this.ebenen.push({ id: m.id, schliessen: m.schliessen });
        }
    };

    private onFrage = (e: Event): void => {
        if (this.zeitMs() > 0) {
            e.preventDefault();
        }
    };

    // ------------------------------------------------------------ steps

    private aufStartseite(): boolean {
        const j = this.jaeger();
        const hashOk = !j.widget || istStartHash(window.location.hash, j.view, j.widget, j.menu);
        return hashOk && !requestStartseite(false);
    }

    private zurStartseite(): void {
        requestStartseite(true);
        const j = this.jaeger();
        if (j.widget && !istStartHash(window.location.hash, j.view, j.widget, j.menu)) {
            // the Jäger layout follows the hash (hashchange) and shows the menu entry
            window.location.hash = startHash(j.view, j.widget, j.menu);
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private prozent(raw: unknown, def: number): number {
        const n = Number(raw);
        return Math.max(1, Math.min(100, Number.isFinite(n) && n > 0 ? n : def));
    }

    /** Fully brightness 0…255 from percent; false = no interface (PC browser) or it failed */
    private hellSetzen(prozent: number): boolean {
        const fully = this.fully();
        if (!this.state.rxData.dimmen || !fully?.setScreenBrightness) {
            return false;
        }
        try {
            fully.setScreenBrightness(Math.round((prozent * 255) / 100));
            return true;
        } catch {
            return false;
        }
    }

    private dimmen(): void {
        this.gedimmt = true;
        const gedimmt = this.prozent(this.state.rxData.hellGedimmt, 10);
        if (gedimmt >= this.prozent(this.state.rxData.hellWach, 100)) {
            return;
        }
        this.dimmWirkt = this.hellSetzen(gedimmt);
        if (this.dimmWirkt) {
            this.setState({ zhSperre: true });
        }
    }

    /** sofort = remove the catch layer now (motion, key); otherwise when the waking finger is lifted */
    private aufwecken(sofort: boolean): void {
        if (!this.gedimmt) {
            return;
        }
        this.gedimmt = false;
        if (this.state.zhSperre) {
            if (sofort) {
                this.sperreAus(0);
            } else {
                this.sperreWartetAufLoslassen = true;
                this.sperreAus(SPERRE_MAX_MS);
            }
        }
        if (this.dimmWirkt) {
            this.hellSetzen(this.prozent(this.state.rxData.hellWach, 100));
        }
        this.dimmWirkt = false;
    }

    private pruefe(): void {
        if (!this.alive) {
            return;
        }
        const wins = this.rahmen();
        for (const w of wins) {
            this.beobachte(w);
        }
        const cfg = { zeitMs: this.zeitMs(), limitMs: this.limitMs() };
        const medien = this.medienLaufen(wins);
        if (medien) {
            // after the video or live image the full idle time starts again
            this.letzteAktivitaet = Date.now();
        }
        // a few steps per tick at most: close detail, popup, then go to the start page
        for (let i = 0; i < 8; i++) {
            const schritt = naechsterSchritt(cfg, {
                now: Date.now(),
                letzteAktivitaet: this.letzteAktivitaet,
                bedienungSeit: this.bedienungSeit,
                medienLaufen: medien,
                ebenen: this.ebenen.map(x => x.id),
                aufStartseite: this.aufStartseite(),
                letzteBewegung: this.letzteBewegung,
                gedimmt: this.gedimmt,
            });
            if (schritt.art === 'warten') {
                return;
            }
            if (schritt.art === 'ebene') {
                const ebene = this.ebenen.find(x => x.id === schritt.id);
                this.ebenen = this.ebenen.filter(x => x.id !== schritt.id);
                try {
                    ebene?.schliessen?.();
                } catch {
                    // the level is gone already
                }
            } else if (schritt.art === 'startseite') {
                this.zurStartseite();
                this.bedienungSeit = null;
                // the menu needs a moment; dimming follows in a later tick
                return;
            } else {
                this.dimmen();
                return;
            }
        }
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        if (!this.props.editMode) {
            if (!this.state.zhSperre) {
                return <></>;
            }
            // over everything, also over the frames: the first touch on the dark screen only wakes it
            return createPortal(
                <div
                    aria-hidden="true"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 2147483000,
                        background: 'transparent',
                        touchAction: 'none',
                    }}
                    onClick={e => e.stopPropagation()}
                    onContextMenu={e => e.preventDefault()}
                />,
                document.body,
            );
        }
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    border: `1px dashed ${v('st-off-bd')}`,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: fonts.text,
                    fontSize: 12,
                    color: v('text-2'),
                }}
            >
                {ZuhauseRuecksprung.t('back_label')}
            </div>
        );
    }
}
