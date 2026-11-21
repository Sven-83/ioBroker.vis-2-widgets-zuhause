/*
 * Shared parts of the widget definitions: set data, translation prefix, animation level, PIN event.
 */
import type { RxWidgetInfoAttributesField } from '@iobroker/types-vis-2';

export const ADAPTER = 'vis-2-widgets-zuhause';
export const PREFIX = `${ADAPTER}_`;

/** Common part of getWidgetInfo() of every widget */
export const SET_INFO = {
    visSet: ADAPTER,
    visSetLabel: 'set_label',
    visSetColor: '#f2c14e',
    visSetIcon: `widgets/${ADAPTER}/img/zuhause.png`,
} as const;

// ---------------------------------------------------------------- animation level

export type MotionLevel = 'voll' | 'dezent' | 'aus';

/** Class for the animation level; "night off" switches animations off from 22 to 6 o'clock */
export function motionClass(level: unknown, nightOff: unknown, now: Date): string {
    const hour = now.getHours();
    if (level === 'aus' || (nightOff && (hour >= 22 || hour < 6))) {
        return 'zh-still';
    }
    return level === 'dezent' ? 'zh-dezent' : '';
}

export function motionAllowed(cls: string): boolean {
    return cls !== 'zh-still';
}

/** Attribute group "Animation", the same in every widget that animates */
export const MOTION_FIELDS: RxWidgetInfoAttributesField[] = [
    {
        name: 'animation',
        type: 'select',
        label: 'animation',
        options: [
            { value: 'auto', label: 'animation_auto' },
            { value: 'keine', label: 'animation_none' },
        ],
        default: 'auto',
    },
    {
        name: 'animationStufe',
        type: 'select',
        label: 'animation_level',
        options: [
            { value: 'voll', label: 'level_full' },
            { value: 'dezent', label: 'level_subtle' },
            { value: 'aus', label: 'level_off' },
        ],
        default: 'voll',
    },
    { name: 'nachtAus', type: 'checkbox', label: 'night_off', default: false },
];

// ---------------------------------------------------------------- PIN dialog

/** Event a tile sends to open the PIN dialog; a ZuhausePin widget on the view answers with preventDefault() */
export const PIN_EVENT = 'zuhause-pin-oeffnen';

export interface PinRequest {
    ziel: string;
    titel: string;
}

/** Default data points of script B (sicherheit-pin.js) */
export const PIN_DEFAULTS = {
    oidZiel: '0_userdata.0.vis.sicherheit.pinZiel',
    oidEingabe: '0_userdata.0.vis.sicherheit.pinEingabe',
    oidMeldung: '0_userdata.0.vis.sicherheit.meldung',
} as const;

/** Asks a ZuhausePin widget to open; false = no PIN widget on the page */
export function requestPin(req: PinRequest): boolean {
    const ev = new CustomEvent<PinRequest>(PIN_EVENT, { detail: req, cancelable: true });
    return !window.dispatchEvent(ev);
}

// ---------------------------------------------------------------- page switch inside a frame

/**
 * Event a tab of the head line sends before it changes the view. A ZuhauseSeiten widget that currently shows
 * the view `von` answers with preventDefault() and shows `nach` itself, so a page embedded in a frame
 * (Jäger menu) stays in that frame. Without such a widget the tab changes the whole view as before.
 */
export const TAB_EVENT = 'zuhause-reiter';

export interface TabRequest {
    von: string;
    nach: string;
}

/** true = a ZuhauseSeiten widget took over the switch */
export function requestTab(req: TabRequest): boolean {
    const ev = new CustomEvent<TabRequest>(TAB_EVENT, { detail: req, cancelable: true });
    return !window.dispatchEvent(ev);
}

/** Decision of a ZuhauseSeiten widget: the view to show next, or null when the request is not for it */
export function nextPage(current: string, req: TabRequest | undefined): string | null {
    if (!req || !req.nach || req.von !== current || req.nach === current) {
        return null;
    }
    return req.nach;
}

// ---------------------------------------------------------------- return after inactivity

/**
 * Event a popup or detail view sends when it opens or closes, so a ZuhauseRuecksprung widget can close it
 * after the idle time (topmost first). `schliessen` must close exactly this level.
 */
export const EBENE_EVENT = 'zuhause-ebene';

export interface EbeneMeldung {
    id: string;
    offen: boolean;
    schliessen?: () => void;
}

/** Reports a level as open (with its close function) or closed; true = a ZuhauseRuecksprung widget listens */
export function meldeEbene(id: string, offen: boolean, schliessen?: () => void): boolean {
    const ev = new CustomEvent<EbeneMeldung>(EBENE_EVENT, { detail: { id, offen, schliessen }, cancelable: true });
    return !window.dispatchEvent(ev);
}

/**
 * Event of the ZuhauseRuecksprung widget to the ZuhauseSeiten widgets. With `zuruecksetzen` false it only asks;
 * a ZuhauseSeiten widget that shows a tab other than its start view answers with preventDefault() and, with
 * `zuruecksetzen` true, also goes back to its start view.
 */
export const STARTSEITE_EVENT = 'zuhause-startseite';

export interface StartseiteAnfrage {
    zuruecksetzen: boolean;
}

/** true = at least one ZuhauseSeiten widget was (and, with zuruecksetzen, is no longer) away from its start view */
export function requestStartseite(zuruecksetzen: boolean): boolean {
    const ev = new CustomEvent<StartseiteAnfrage>(STARTSEITE_EVENT, { detail: { zuruecksetzen }, cancelable: true });
    return !window.dispatchEvent(ev);
}

/** Event the ZuhauseRuecksprung widget sends when it is there; widgets with an own return timer stay silent then */
export const RUECKSPRUNG_AKTIV_EVENT = 'zuhause-ruecksprung-aktiv';

/** true = a ZuhauseRuecksprung widget is on the page and switched on */
export function ruecksprungZentral(): boolean {
    const ev = new CustomEvent<null>(RUECKSPRUNG_AKTIV_EVENT, { detail: null, cancelable: true });
    return !window.dispatchEvent(ev);
}
