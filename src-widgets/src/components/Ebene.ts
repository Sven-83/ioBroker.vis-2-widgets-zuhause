/*
 * Return after inactivity: a popup or detail view reports itself as an open level, so a ZuhauseRuecksprung
 * widget can close it (topmost first). Returns a ref that is true when such a widget took the level over;
 * the popup then leaves out its own close timer.
 */
import React from 'react';

import { meldeEbene } from '../lib/vis';

export function useEbene(name: string, onClose: () => void, offen = true): React.RefObject<boolean> {
    const uid = React.useId();
    const zentral = React.useRef(false);
    const close = React.useRef(onClose);
    React.useLayoutEffect(() => {
        close.current = onClose;
    });
    React.useEffect(() => {
        if (!offen) {
            zentral.current = false;
            return undefined;
        }
        const id = `${name}${uid}`;
        zentral.current = meldeEbene(id, true, () => close.current());
        return () => {
            meldeEbene(id, false);
        };
    }, [name, uid, offen]);
    return zentral;
}
