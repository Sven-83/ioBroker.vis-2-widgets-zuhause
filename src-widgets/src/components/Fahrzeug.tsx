/*
 * Parts shared by the vehicle widgets (card on the start page and detail page).
 */
import React from 'react';

/** Warning symbols, 24 grid, stroke (drawn for this card) */
export const WARN_PATH: Record<string, string> = {
    reifen: 'M6.5 5.5C4.3 8.3 4.3 14.7 6.5 17.5 M17.5 5.5c2.2 2.8 2.2 9.2 0 12 M6.5 17.5h11 M7.5 20.5h1 M11.5 20.5h1 M15.5 20.5h1 M12 8.5v4.5 M12 15.4v.2',
    oel: 'M3 11h6.5l1.8 1.8h5.4L21 10l-3.6 6.8H5.6A2.6 2.6 0 0 1 3 14.2z M6 11V8.6h3.6 M7.8 8.6V7 M21 13.2v1.4',
    v12: 'M3.5 8h17v11h-17z M6.5 8V6h2.5v2 M15 8V6h2.5v2 M6.5 13.5h3.5 M14 13.5h4 M16 11.5v4',
    tank: 'M5 20.5V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15.5 M3.5 20.5h12 M7 8h5 M14 10.5h2a1 1 0 0 1 1 1v5a1.5 1.5 0 0 0 3 0V9l-3-3',
    akku: 'M3 7.5h15.5v9H3z M18.5 10.5h2.2v3h-2.2 M5.5 10v4',
    offen: 'M6 11h12v9.5H6z M9 11V8a3 3 0 0 1 5.8-1.1 M12 14.5v2.5',
    fenster: 'M4.5 16.5h15 M6 16.5l2.2-9.5h7.6l2.2 9.5 M9.5 11.5l1.5-1.5 M12 12l2.5-2.5',
    tuer: 'M8.5 3.5h7a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19V5a1.5 1.5 0 0 1 1.5-1.5z M17 9.5l3.5-2 M17 14.5v-5',
    alarm: 'M6 18.5h12 M8 18.5V13a4 4 0 0 1 8 0v5.5 M12 3v2 M4.5 6.5 6 7.7 M19.5 6.5 18 7.7 M5 20.8h14',
    stecker: 'M9 3v4 M15 3v4 M7 7h10v3a5 5 0 0 1-10 0z M12 15v3 M12 18a2.5 2.5 0 0 0 2.5 2.5H18',
    ladefehler: 'M9 3v4 M15 3v4 M7 7h10v3a5 5 0 0 1-10 0z M12 15v6 M15.5 17.5l4 4 M19.5 17.5l-4 4',
    hvakku: 'M3 7.5h15.5v9H3z M18.5 10.5h2.2v3h-2.2 M11.5 9.3 9 12.4h3l-1 2.6',
    frost: 'M12 3v18 M4.2 7.5l15.6 9 M4.2 16.5l15.6-9 M10 4.5l2 2 2-2 M10 19.5l2-2 2 2',
    alt: 'M12 7.5V12l3 2 M20.5 12A8.5 8.5 0 1 1 12 3.5 M17 3.5h3.5V7',
    login: 'M7.5 14.5a3.5 3.5 0 1 1 3.4-4.3H21v3h-2v2h-3v-2h-5.1a3.5 3.5 0 0 1-3.4 1.3z',
};

/** Counts up from 0 once the value is first known (only with animations) */
export function CountUp({ value, animate }: { value: number; animate: boolean }): React.JSX.Element {
    const [shown, setShown] = React.useState(animate ? 0 : value);
    const done = React.useRef(!animate);
    React.useEffect(() => {
        if (done.current || typeof requestAnimationFrame === 'undefined') {
            setShown(value);
            return undefined;
        }
        done.current = true;
        const t0 = performance.now();
        let raf = 0;
        const step = (t: number): void => {
            const p = Math.min(1, (t - t0) / 1300);
            setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
            if (p < 1) {
                raf = requestAnimationFrame(step);
            }
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    return <>{shown}</>;
}
