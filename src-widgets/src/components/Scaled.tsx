/*
 * Measures the widget box and hands the scale factor to its child (tile 88 px -> 72 px on the phone ...).
 */
import React from 'react';

export function Scaled({
    base,
    children,
}: {
    /** size the child is drawn at */
    base: number;
    children: (scale: number) => React.ReactNode;
}): React.JSX.Element {
    const ref = React.useRef<HTMLDivElement>(null);
    const [scale, setScale] = React.useState(1);
    React.useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const measure = (): void => {
            const s = Math.min(el.clientWidth / base, el.clientHeight / base);
            if (s > 0 && Number.isFinite(s)) {
                setScale(Math.max(0.4, Math.min(3, Math.round(s * 100) / 100)));
            }
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [base]);
    return (
        <div
            ref={ref}
            style={{ width: '100%', height: '100%', position: 'relative', overflow: 'visible' }}
        >
            {children(scale)}
        </div>
    );
}
