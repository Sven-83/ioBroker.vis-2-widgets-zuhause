/*
 * VIS-2 widget "Aquarium": tile + popup for the script script.js.vis2.Aquarium
 * (spec Claude-Specs/chihiros-aquarium.md, part A / phase 5). The widget only reads; the script decides.
 * Look (accepted 18.11.2026): green = running, red pulsing "Aquarium prüfen" = a device is disturbed,
 * yellow "!" = hint (e.g. fertiliser almost empty), dashed = not running / no data.
 * Blue dot + bubbles only while the CO2 valve is really open, yellow dot while the background light is on.
 * A tap opens the popup "which device?". The long press stays free for the tank view (part D / phase 6).
 */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { AquariumPopup } from '../components/AquariumPopup';
import { Icon } from '../components/Icon';
import { Scaled } from '../components/Scaled';
import { TILE_BASE, Tile } from '../components/Tile';
import { AQ, DEFAULT_BASE, parseGeraete, type TileArt, tileView } from '../lib/aquarium';
import type { TileLook } from '../lib/model';
import { ensureStyles, fonts, v } from '../lib/theme';
import { MOTION_FIELDS, PREFIX, SET_INFO, motionAllowed, motionClass } from '../lib/vis';
import { StateWatcher } from '../lib/watch';

const YELLOW = '#f2c14e';

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
    zhNow: number;
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

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, zhPopup: false, zhNow: Date.now() };
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
        void this.watcher?.watch(Object.values(AQ).map(n => this.id(n)));
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
                                <Icon
                                    name="aquarium"
                                    on={view.art !== 'aus' && view.art !== 'leer'}
                                    animate={motion && view.art !== 'aus' && view.art !== 'leer'}
                                    co2={view.co2}
                                />
                            }
                            led={look === 'status-on' || look === 'warn'}
                            dots={dots}
                            overlay={overlay}
                            warnPulse={view.art === 'rot' && motion}
                            clickable={!this.props.editMode}
                            levelClass={levelClass}
                            scale={scale}
                            onPointerUp={this.props.editMode ? undefined : this.open}
                            onKeyDown={this.props.editMode ? undefined : this.onKeyDown}
                        />
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
