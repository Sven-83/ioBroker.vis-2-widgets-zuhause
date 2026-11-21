/*
 * Popup of the aquarium tile (spec Claude-Specs/chihiros-aquarium.md, part A): which device causes the warning?
 * Summary (water, CO2, devices in order), problems on top, then all devices in two columns by group.
 * Only shows; controls and settings follow in the tank view (phase 6, long press). Look accepted 18.11.2026.
 */
import React from 'react';

import { spalten, type Stufe, type Zeile, zusammenfassung } from '../lib/aquarium';
import { fonts, v } from '../lib/theme';
import { Frame, useAutoClose } from './ControlPopups';

/** a list is read, not operated: stay open longer than the control popups */
const IDLE_MS = 60_000;
const YELLOW = '#f2c14e';
const MUTED = '#7c7a74';

const LED: Record<Stufe, React.CSSProperties> = {
    ok: { background: v('st-led'), boxShadow: `0 0 6px ${v('st-led')}` },
    gelb: { background: YELLOW, boxShadow: `0 0 6px ${YELLOW}` },
    rot: { background: v('warn-bd'), boxShadow: `0 0 6px ${v('warn-bd')}` },
    aus: { background: '#55555c' },
};

function Led({ stufe, size = 8 }: { stufe: Stufe; size?: number }): React.JSX.Element {
    return (
        <span
            className={stufe === 'rot' ? 'zh-a-rec' : undefined}
            style={{
                display: 'inline-block',
                width: size,
                height: size,
                borderRadius: '50%',
                flex: 'none',
                ...LED[stufe],
            }}
        />
    );
}

const ellipsis: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

function Reihe({ z, odd }: { z: Zeile; odd: boolean }): React.JSX.Element {
    const bg =
        z.stufe === 'rot'
            ? 'rgba(229,72,77,.09)'
            : z.stufe === 'gelb'
              ? 'rgba(242,193,78,.08)'
              : odd
                ? 'rgba(255,255,255,.018)'
                : 'transparent';
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '18px 132px 1fr',
                alignItems: 'center',
                height: 30,
                padding: '0 8px',
                borderRadius: 8,
                fontSize: 13,
                background: bg,
            }}
        >
            <Led stufe={z.stufe} />
            <span style={{ ...ellipsis, fontWeight: 600, color: z.stufe === 'aus' ? v('text-2') : v('text') }}>
                {z.name}
            </span>
            <span
                style={{
                    ...ellipsis,
                    color: z.stufe === 'rot' ? v('warn-fg') : z.stufe === 'gelb' ? YELLOW : v('text-2'),
                }}
                title={z.text}
            >
                {z.text}
            </span>
        </div>
    );
}

function Spalte({ gruppen }: { gruppen: ReturnType<typeof spalten>['links'] }): React.JSX.Element {
    return (
        <div style={{ minWidth: 0 }}>
            {gruppen.map(g => (
                <React.Fragment key={g.titel}>
                    <div
                        style={{
                            fontSize: 10.5,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: MUTED,
                            fontWeight: 600,
                            padding: '6px 8px 2px',
                            borderBottom: `1px solid ${v('border')}`,
                            marginBottom: 2,
                        }}
                    >
                        {g.titel} · {g.zeilen.length}
                    </div>
                    {g.zeilen.map((z, i) => (
                        <Reihe
                            key={z.key}
                            z={z}
                            odd={i % 2 === 0}
                        />
                    ))}
                </React.Fragment>
            ))}
        </div>
    );
}

function Wert({ zahl, text }: { zahl: string; text: string }): React.JSX.Element {
    return (
        <span style={{ fontSize: 12, color: v('text-2') }}>
            <b style={{ font: `600 18px ${fonts.numbers}`, color: v('text'), marginRight: 3 }}>{zahl}</b>
            {text}
        </span>
    );
}

export function AquariumPopup(p: {
    liste: Zeile[];
    title: string;
    /** time of the last change of the device list */
    stand: number | null;
    onClose: () => void;
}): React.JSX.Element {
    const restart = useAutoClose(p.onClose, 'aquarium');
    React.useEffect(() => restart(IDLE_MS), [restart]);
    const touch = (): void => restart(IDLE_MS);

    const s = zusammenfassung(p.liste);
    const sp = spalten(p.liste);
    const sumStyle: React.CSSProperties =
        s.stufe === 'rot'
            ? { background: v('warn-bg'), border: `1px solid ${v('warn-bd')}` }
            : s.stufe === 'gelb'
              ? { background: 'rgba(242,193,78,.08)', border: `1px solid ${YELLOW}` }
              : { background: v('st-on-bg'), border: `1px solid ${v('st-on-bd')}` };
    const stand = p.stand ? new Date(p.stand).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';

    return (
        <Frame
            kind="AQUARIUM"
            title={p.title}
            label="Aquarium"
            width={760}
            hint=""
            onClose={p.onClose}
        >
            <div
                onPointerDown={touch}
                style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: -4 }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '10px 14px',
                        borderRadius: 14,
                        ...sumStyle,
                    }}
                >
                    <Led stufe={s.stufe} />
                    <b style={{ fontSize: 17 }}>{s.titel}</b>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                        <Wert
                            zahl={s.wasser}
                            text="Wasser"
                        />
                        <Wert
                            zahl={s.co2}
                            text="CO₂"
                        />
                        <Wert
                            zahl={`${s.inOrdnung}/${s.gesamt}`}
                            text="in Ordnung"
                        />
                    </span>
                </div>

                {s.oben.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {s.oben.map(z => (
                            <div
                                key={z.key}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '8px 12px',
                                    borderRadius: 10,
                                    fontSize: 14,
                                    background: z.stufe === 'rot' ? 'rgba(229,72,77,.12)' : 'rgba(242,193,78,.08)',
                                    color: z.stufe === 'rot' ? v('warn-fg') : YELLOW,
                                }}
                            >
                                <Led stufe={z.stufe} />
                                <b style={{ color: v('text'), minWidth: 150 }}>{z.name}</b>
                                <span style={ellipsis}>{z.text}</span>
                            </div>
                        ))}
                    </div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 18px' }}>
                    <Spalte gruppen={sp.links} />
                    <Spalte gruppen={sp.rechts} />
                </div>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 11,
                        color: v('text-2'),
                        borderTop: `1px solid ${v('border')}`,
                        paddingTop: 7,
                    }}
                >
                    <span style={ellipsis}>Letzte Änderung {stand} · nur Anzeige, schaltet nichts</span>
                    <span style={{ whiteSpace: 'nowrap' }}>Bedienung folgt in der Becken-Ansicht</span>
                </div>
            </div>
        </Frame>
    );
}
