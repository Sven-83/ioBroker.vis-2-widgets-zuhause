/*
 * Loads a floor plan SVG once per page and reads viewBox and room polygons.
 * The plan itself is shown as <img> (no script of the file can run); rooms are drawn again
 * as overlay for glow, tint and labels.
 */
import { parseViewBox, type Room } from './plan';

export interface PlanSvg {
    url: string;
    viewBox: { x: number; y: number; w: number; h: number };
    rooms: Room[];
    /** the file brings its own labels (<text>): no room names on top */
    hasText: boolean;
}

const cache = new Map<string, Promise<PlanSvg>>();

/** VIS image path -> URL the browser can load ("_PRJ_NAME" = project, paths without "/" are files of vis-2.0) */
export function resolveImage(path: string, projectName: string): string {
    const p = path.trim().replace('_PRJ_NAME', projectName);
    if (/^(https?:|data:|\/|\.\.\/)/.test(p)) {
        return p;
    }
    return p.startsWith('vis-2.0/') ? `../${p}` : `../vis-2.0/${p}`;
}

export function loadPlan(url: string): Promise<PlanSvg> {
    let p = cache.get(url);
    if (!p) {
        p = fetch(url, { credentials: 'same-origin' })
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                return res.text();
            })
            .then(text => {
                const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
                const svg = doc.documentElement;
                if (!svg || svg.nodeName.toLowerCase() !== 'svg') {
                    throw new Error('no SVG');
                }
                const viewBox = parseViewBox(svg.getAttribute('viewBox')) || {
                    x: 0,
                    y: 0,
                    w: Number(svg.getAttribute('width')) || 1000,
                    h: Number(svg.getAttribute('height')) || 700,
                };
                const rooms: Room[] = [];
                // rooms: polygons with an id inside <g id="raeume">, or any polygon with data-name
                svg.querySelectorAll('#raeume polygon[id], polygon[data-name][id]').forEach(el => {
                    const id = el.getAttribute('id') || '';
                    if (id && !rooms.some(r => r.id === id)) {
                        rooms.push({
                            id,
                            name: el.getAttribute('data-name') || '',
                            points: el.getAttribute('points') || '',
                        });
                    }
                });
                return { url, viewBox, rooms, hasText: svg.querySelector('text') !== null };
            });
        cache.set(url, p);
        // a failed load may be retried on the next render (file uploaded later)
        p.catch(() => cache.delete(url));
    }
    return p;
}
