/*
 * VIS-2 widget "Aquarium": tile + popup for the script script.js.vis2.Aquarium
 * (spec Claude-Specs/chihiros-aquarium.md, part A / phase 5). The widget only reads; the script decides.
 * Look (accepted 18.11.2026): green = running, red pulsing "Aquarium prüfen" = a device is disturbed,
 * yellow "!" = hint (e.g. fertiliser almost empty), dashed = not running / no data.
 * Blue dot + bubbles only while the CO2 valve is really open, yellow dot while the background light is on.
 * A tap opens the popup "which device?", a long press the tank view (part D / phase 6, accepted 20.11.2026).
 * Since 20.11.2026 the tile shows a small drawn tank instead of the line icon (variant B "Mini-Becken"),
 * no temperature: outside the limits the script turns the tile red anyway.
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { AquariumPopup } from '../components/AquariumPopup';
import { BeckenAnsicht, VORLAGEN_ID } from '../components/becken/BeckenAnsicht';
import { MiniBecken } from '../components/MiniBecken';
import { Scaled } from '../components/Scaled';
import { TILE_BASE, Tile } from '../components/Tile';
import { AQ, DEFAULT_BASE, miniBecken, parseGeraete, type TileArt, tileView } from '../lib/aquarium';
import { FUTURE, IDS, PLUGS, plugPower, plugSwitch, PUMP_FIELDS, pumpId, PUMPS, type PlugKey } from '../lib/becken';
import type { TileLook } from '../lib/model';
import { ensureStyles, fonts, v } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const YELLOW = '#f2c14e';
const LONG_PRESS_MS = 500;

/** data points of the tank view (watched only while it is open) */
const BECKEN_IDS: string[] = [
    ...Object.values(IDS),
    ...(Object.keys(PLUGS) as PlugKey[]).flatMap(k => [plugSwitch(k), plugPower(k)]),
    ...PUMPS.flatMap(n => PUMP_FIELDS.map(f => pumpId(n, f))),
    ...Object.values(FUTURE),
    VORLAGEN_ID,
    'chihiros.0.info.proxyVersion',
];

interface AquariumRxData {
    basis: string;
    label: string;
    popupTitel: string;
    animation: string;
    animationStufe: string;
    nachtAus: boolean;
}

interface AquariumState extends VisRxWidgetState {
    zhPopup: boolean;
    zhBecken: boolean;
    zhNow: number;
    zhVorhanden: Set<string>;
}

const LOOK: Record<TileArt, TileLook> = {
    ok: 'status-on',
    gelb: 'status-on',
    rot: 'warn',
    aus: 'status-off',
    leer: 'status-off',
};

export default class ZuhauseAquarium extends (window.visRxWidget as typeof VisRxWidget)<AquariumRxData, AquariumState> {
    private watcher?: StateWatcher;
    private clock?: ReturnType<typeof setInterval>;
    private longTimer?: ReturnType<typeof setTimeout>;
    private longFired = false;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhPopup: false, zhBecken: false, zhNow: Date.now(), zhVorhanden: new Set() };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplZuhauseAquarium',
            ...SET_INFO,
            visName: 'ZuhauseAquarium',
            visWidgetLabel: 'aquarium_label',
            visAttrs: [
                {
                    name: 'common',
                    label: 'group_common',
                    fields: [
                        {
                            name: 'basis',
                            type: 'text',
                            label: 'aquarium_base',
                            tooltip: 'aquarium_base_tip',
                            default: DEFAULT_BASE,
                        },
                        { name: 'label', type: 'text', label: 'aquarium_name', default: 'Aquarium' },
                        {
                            name: 'popupTitel',
                            type: 'text',
                            label: 'aquarium_popup_title',
                            default: 'Was läuft im Becken?',
                        },
                    ],
                },
                { name: 'motion', label: 'group_animation', fields: MOTION_FIELDS },
            ],
            visDefaultStyle: { width: TILE_BASE, height: TILE_BASE },
            visPrev: 'widgets/vis-2-widgets-zuhause/img/prev-kachel.png',
        };
    }

    // Do not delete: VIS-2 reads the widget configuration through the instance
    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return ZuhauseAquarium.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return PREFIX;
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureStyles();
        this.watcher = new StateWatcher(this.props.context.socket, this.onStates);
        this.watch();
        // animation level "night off" depends on the time
        this.clock = setInterval(() => this.setState({ zhNow: Date.now() }), 60_000);
    }

    onRxDataChanged(): void {
        this.watch();
    }

    componentWillUnmount(): void {
        if (this.clock) {
            clearInterval(this.clock);
        }
        clearTimeout(this.longTimer);
        this.watcher?.stop();
        super.componentWillUnmount();
    }

    private get base(): string {
        return (this.state.rxData.basis || DEFAULT_BASE).trim().replace(/\.$/, '');
    }

    private id(name: string): string {
        return `${this.base}.${name}`;
    }

    private watch(): void {
        const ids = Object.values(AQ).map(n => this.id(n));
        void this.watcher?.watch(this.state.zhBecken ? [...ids, ...BECKEN_IDS] : ids);
    }

    private onStates = (): void => this.setState({ zhNow: Date.now() });

    private val(name: string): unknown {
        return this.watcher?.snapshot(this.id(name))?.val;
    }

    private open = (): void => {
        if (this.props.editMode) {
            return;
        }
        this.setState({ zhPopup: true, zhNow: Date.now() });
    };

    private onKeyDown = (e: React.KeyboardEvent): void => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault();
            this.open();
        }
    };

    private close = (): void => this.setState({ zhPopup: false });

    /** the tank view: watch its data points and find out which later data points exist already */
    private openBecken = async (): Promise<void> => {
        this.setState({ zhBecken: true }, () => this.watch());
        const socket = this.props.context.socket as unknown as { getObject(id: string): Promise<unknown> };
        const vorhanden = new Set<string>();
        for (const id of [...Object.values(FUTURE), VORLAGEN_ID]) {
            try {
                if (await socket.getObject(id)) {
                    vorhanden.add(id);
                }
            } catch {
                // missing or no right to read: stays read-only
            }
        }
        this.setState({ zhVorhanden: vorhanden });
    };

    private closeBecken = (): void => this.setState({ zhBecken: false }, () => this.watch());

    private onPointerDown = (e: React.PointerEvent): void => {
        if (this.props.editMode || e.button > 0) {
            return;
        }
        this.longFired = false;
        clearTimeout(this.longTimer);
        this.longTimer = setTimeout(() => {
            this.longTimer = undefined;
            this.longFired = true;
            void this.openBecken();
        }, LONG_PRESS_MS);
    };

    private onPointerUp = (): void => {
        if (this.props.editMode) {
            return;
        }
        const pressed = this.longTimer !== undefined;
        clearTimeout(this.longTimer);
        this.longTimer = undefined;
        if (pressed && !this.longFired) {
            this.open();
        }
        this.longFired = false;
    };

    private onPointerLeave = (): void => {
        clearTimeout(this.longTimer);
        this.longTimer = undefined;
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const d = this.state.rxData;
        const name = d.label || 'Aquarium';
        const liste = parseGeraete(this.val(AQ.geraete));
        const view = tileView({
            laeuft: this.val(AQ.laeuft),
            warnung: this.val(AQ.warnung),
            hinweis: this.val(AQ.hinweis),
            co2: this.val(AQ.co2),
            liste,
            label: name,
        });
        const levelClass = motionClass(d.animationStufe, d.nachtAus, new Date(this.state.zhNow));
        const motion = motionAllowed(levelClass) && d.animation !== 'keine';
        const look = LOOK[view.art];
        const dots: string[] = [];
        if (view.co2) {
            dots.push(v('co2'));
        }
        if (liste.some(z => z.key === 'hinter' && z.stufe === 'ok')) {
            dots.push(v('light'));
        }
        const stand = this.watcher?.snapshot(this.id(AQ.geraete))?.ts ?? null;
        const mini = miniBecken(liste);
        const aktiv = view.art !== 'aus' && view.art !== 'leer';

        const overlay =
            view.art === 'gelb' ? (
                <span
                    title={view.text}
                    style={{
                        position: 'absolute',
                        right: 5,
                        bottom: 5,
                        width: 15,
                        height: 15,
                        borderRadius: '50%',
                        background: YELLOW,
                        color: '#2a2108',
                        font: `700 10.5px/15px ${fonts.text}`,
                        textAlign: 'center',
                    }}
                >
                    !
                </span>
            ) : null;

        return (
            <Scaled base={TILE_BASE}>
                {scale => (
                    <>
                        <Tile
                            look={look}
                            label={view.label}
                            ariaLabel={`${name}, ${view.text}`}
                            title={view.text}
                            icon={
                                <MiniBecken
                                    licht={mini.licht && aktiv}
                                    co2={view.co2}
                                    fluss={mini.fluss}
                                    animate={motion && aktiv}
                                    uid={this.props.id}
                                />
                            }
                            led={look === 'status-on' || look === 'warn'}
                            dots={dots}
                            overlay={overlay}
                            warnPulse={view.art === 'rot' && motion}
                            clickable={!this.props.editMode}
                            levelClass={levelClass}
                            scale={scale}
                            onPointerDown={this.props.editMode ? undefined : this.onPointerDown}
                            onPointerUp={this.props.editMode ? undefined : this.onPointerUp}
                            onPointerLeave={this.onPointerLeave}
                            onPointerCancel={this.onPointerLeave}
                            onKeyDown={this.props.editMode ? undefined : this.onKeyDown}
                        />
                        {this.state.zhBecken && !this.props.editMode ? (
                            <BeckenAnsicht
                                val={id => this.watcher?.snapshot(id)?.val}
                                ts={id => this.watcher?.snapshot(id)?.ts}
                                liste={liste}
                                vorhanden={this.state.zhVorhanden}
                                set={(id, value) => this.props.context.setValue(id, value)}
                                motion={motion}
                                onClose={this.closeBecken}
                            />
                        ) : null}
                        {this.state.zhPopup && !this.props.editMode ? (
                            <AquariumPopup
                                liste={liste}
                                title={d.popupTitel || 'Was läuft im Becken?'}
                                stand={stand}
                                onClose={this.close}
                            />
                        ) : null}
                    </>
                )}
            </Scaled>
        );
    }
}
