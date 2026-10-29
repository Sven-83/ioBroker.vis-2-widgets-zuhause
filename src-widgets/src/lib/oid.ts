/*
 * "!" before a data point id inverts it, so no alias is needed for points with the opposite meaning
 * (Homematic UNREACH: true = no reception, Zigbee contact: true = closed). Meant for on/off data points:
 * reading gives the opposite boolean, writing sends the opposite of true/false or 0/1.
 */
import { isOn } from './model';

export function isInverted(raw: string | undefined): boolean {
    return !!raw && raw.trim().startsWith('!');
}

/** The id without "!" and spaces */
export function realId(raw: string | undefined): string {
    const id = (raw || '').trim();
    return id.startsWith('!') ? id.slice(1).trim() : id;
}

/** Opposite of an on/off value; unknown values (null, undefined, "") stay unknown */
export function invertValue(val: unknown): unknown {
    if (val === null || val === undefined || val === '') {
        return val;
    }
    return !isOn(val);
}

/** Value as the widget sees it */
export function readValue(raw: string | undefined, val: unknown): unknown {
    return isInverted(raw) ? invertValue(val) : val;
}

/** Id and value to send for a command on raw */
export function writeTarget(raw: string, value: boolean | number): { id: string; value: boolean | number } {
    if (!isInverted(raw)) {
        return { id: raw, value };
    }
    return { id: realId(raw), value: typeof value === 'number' ? (value > 0 ? 0 : 1) : !value };
}

/** Ids of the list that start with "!" (VIS-2 subscribes them with the "!", so the widget does it itself) */
export function invertedIds(ids: (string | undefined)[]): string[] {
    return ids.filter((id): id is string => isInverted(id));
}
