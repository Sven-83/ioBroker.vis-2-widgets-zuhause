/*
 * Popup of the ioBroker status tile: watcher state, memory / SD card / processor of the Pi,
 * filter chips and the list of all instances (state, running since, RAM, version, update, errors).
 * Updates are only shown, never installed (decision 14.11.2026).
 * Scripts (15.11.2026): switched-on scripts in their own group, folder dimmed before the name;
 * a script with a problem is listed under "Braucht Aufmerksamkeit". Scripts are never restarted.
 * Kept in its own file, like the star popup.
 */
import React from 'react';

import {
    FILTER,
    type Filter,
    gruppen,
    type Host,
    type Instanz,
    type Liste,
    meters,
    meterStufe,
    seitText,
    zaehlen,
} from '../lib/system';
import { fonts, v } from '../lib/theme';
import { Frame, useAutoClose } from './ControlPopups';
import { ScrollPfeile } from './ScrollPfeile';

/** a list is read, not operated: stay open longer than the control popups */
const IDLE_MS = 90_000;
const COLS = '146px 140px 58px 52px 54px 66px 1fr';
const YELLOW = '#f2c14e';
const MUTED = '#7c7a74';

const LED: Record<string, React.CSSProperties> = {
    ok: { background: v('st-led'), boxShadow: `0 0 6px ${v('st-led')}` },
    gelb: { background: YELLOW, boxShadow: `0 0 6px ${YELLOW}` },
    rot: { background: v('warn-bd'), boxShadow: `0 0 6px ${v('warn-bd')}` },
    aus: { background: '#55555c' },
    info: { background: 'transparent', border: '1.5px solid #6b6b72', boxSizing: 'border-box' },
};

function Led({ stufe }: { stufe: string }): React.JSX.Element {
    return (
        <span
            className={stufe === 'rot' ? 'zh-a-rec' : undefined}
            style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                marginRight: 6,
                verticalAlign: 1,
                flex: 'none',
                ...(LED[stufe] ?? LED.info),
            }}
        />
    );
}

function Tag({ text, neu }: { text: string; neu?: boolean }): React.JSX.Element {
    return (
        <span
            style={{
                display: 'inline-block',
                font: `600 9.5px/15px ${fonts.text}`,
                padding: '0 5px',
                borderRadius: 4,
                marginLeft: 5,
                verticalAlign: 1,
                border: `1px solid ${neu ? YELLOW : '#4a4a52'}`,
                color: neu ? YELLOW : v('text-2'),
            }}
        >
            {text}
        </span>
    );
}

const cell: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const num: React.CSSProperties = { ...cell, color: v('text-2'), fontVariantNumeric: 'tabular-nums' };

function Zeile({ x, now, odd }: { x: Instanz; now: number; odd: boolean }): React.JSX.Element {
    const skript = x.mode === 'skript';
    const m = skript ? null : /^(.*)(\.\d+)$/.exec(x.id);
    const punkt = x.id.lastIndexOf('.');
    const ordner = skript && punkt > 0 ? `${x.id.slice(0, punkt)}/` : '';
    const laeuft = x.en && (x.mode === 'daemon' || skript) && x.alive;
    const bg =
        x.stufe === 'rot'
            ? 'rgba(229,72,77,.09)'
            : x.stufe === 'gelb'
              ? 'rgba(242,193,78,.08)'
              : odd
                ? 'rgba(255,255,255,.018)'
                : 'transparent';
    const farbe =
        x.stufe === 'rot' ? v('warn-fg') : x.stufe === 'gelb' ? YELLOW : x.stufe === 'ok' ? v('text') : v('text-2');
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: COLS,
                alignItems: 'center',
                columnGap: 8,
                padding: '0 8px',
                height: 34,
                borderRadius: 8,
                fontSize: 13,
                background: bg,
            }}
        >
            <span
                style={{ ...cell, fontWeight: 600 }}
                title={skript ? `script.js.${x.id}` : undefined}
            >
                {skript ? <span style={{ color: MUTED, fontWeight: 500 }}>{ordner}</span> : null}
                {skript ? x.id.slice(punkt + 1) : m ? m[1] : x.id}
                <span style={{ color: MUTED, fontWeight: 500 }}>{m ? m[2] : ''}</span>
                {x.eigen ? <Tag text="eigen" /> : null}
                {x.neu ? (
                    <Tag
                        text="neu"
                        neu
                    />
                ) : null}
            </span>
            <span style={{ ...cell, color: farbe }}>
                <Led stufe={x.stufe} />
                {x.text}
            </span>
            <span style={num}>{laeuft ? seitText(x.seit, now) : '—'}</span>
            <span style={num}>{laeuft && x.rss ? `${x.rss} MB` : '—'}</span>
            <span style={num}>{x.ver}</span>
            {x.avail ? (
                <span style={{ ...cell, color: YELLOW, fontWeight: 600 }}>→ {x.avail}</span>
            ) : (
                <span style={{ ...cell, color: MUTED }}>{x.eigen ? 'GitHub' : ''}</span>
            )}
            <span
                style={{ ...cell, color: MUTED, fontSize: 12 }}
                title={x.fehler?.letzte}
            >
                {x.fehler ? (
                    <>
                        <b style={{ color: v('warn-fg'), marginRight: 4 }}>{x.fehler.n}×</b>
                        {x.fehler.letzte}
                    </>
                ) : null}
            </span>
        </div>
    );
}

function Gruppentitel({ text }: { text: string }): React.JSX.Element {
    return (
        <div
            style={{
                fontSize: 11,
                color: v('text-2'),
                fontWeight: 600,
                padding: '8px 8px 3px',
                letterSpacing: '0.04em',
            }}
        >
            {text}
        </div>
    );
}

export function SystemPopup(p: {
    liste: Liste;
    host: Host | null;
    letztePruefung: number | null;
    letzterEingriff: string;
    steht: boolean;
    now: number;
    onClose: () => void;
}): React.JSX.Element {
    const restart = useAutoClose(p.onClose, 'system');
    const [filter, setFilter] = React.useState<Filter>('alle');
    React.useEffect(() => restart(IDLE_MS), [restart]);
    const touch = (): void => restart(IDLE_MS);
    const listRef = React.useRef<HTMLDivElement>(null);

    const n = zaehlen(p.liste);
    const grp = gruppen(p.liste, filter);
    const ohne = filter === 'alle' || filter === 'upd' ? p.liste.ohneInstanz : [];
    const ms = meters(p.host);
    const pruef = p.letztePruefung
        ? new Date(p.letztePruefung).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '–';
    const stufe = p.steht ? 'rot' : n.prob ? (p.liste.liste.some(x => x.stufe === 'rot') ? 'rot' : 'gelb') : 'ok';

    return (
        <Frame
            kind="SYSTEM"
            title="ioBroker"
            label="ioBroker-Status"
            width={724}
            hint=""
            onClose={p.onClose}
        >
            <div
                onPointerDown={touch}
                onWheel={touch}
                style={{ display: 'flex', flexDirection: 'column', marginTop: -10 }}
            >
                <div style={{ fontSize: 12, color: v('text-2'), marginBottom: 8 }}>
                    <Led stufe={stufe} />
                    {p.steht ? 'Wächter meldet sich nicht' : 'Wächter aktiv'} · letzte Prüfung {pruef}
                    {p.host?.name ? ` · ${p.host.name}` : ''} · {n.alle} Instanzen
                    {n.skripte ? ` · ${n.skripte} Skripte` : ''}
                </div>

                {ms.length ? (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${ms.length}, 1fr)`,
                            gap: 8,
                            marginBottom: 8,
                        }}
                    >
                        {ms.map(m => {
                            const s = meterStufe(m.prozent);
                            return (
                                <div
                                    key={m.titel}
                                    style={{
                                        background: v('sw-off-bg'),
                                        border: `1px solid ${v('border')}`,
                                        borderRadius: 12,
                                        padding: '6px 10px',
                                        minWidth: 0,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'baseline',
                                            fontSize: 11.5,
                                            fontWeight: 600,
                                            color: v('text-2'),
                                        }}
                                    >
                                        <span>{m.titel}</span>
                                        <b style={{ color: v('text'), fontSize: 15, fontFamily: fonts.numbers }}>
                                            {m.prozent} %
                                        </b>
                                    </div>
                                    <div
                                        style={{
                                            height: 6,
                                            borderRadius: 3,
                                            background: '#44444a',
                                            margin: '4px 0 3px',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <i
                                            style={{
                                                display: 'block',
                                                height: '100%',
                                                borderRadius: 3,
                                                width: `${Math.min(100, Math.max(0, m.prozent))}%`,
                                                background:
                                                    s === 'rot' ? v('warn-bd') : s === 'gelb' ? YELLOW : v('st-led'),
                                                transition: 'width .6s',
                                            }}
                                        />
                                    </div>
                                    <small style={{ ...cell, display: 'block', fontSize: 10.5, color: MUTED }}>
                                        {m.unten}
                                        {m.hinweis ? (
                                            <>
                                                {' · '}
                                                <span style={{ color: YELLOW }}>{m.hinweis}</span>
                                            </>
                                        ) : null}
                                    </small>
                                </div>
                            );
                        })}
                    </div>
                ) : null}

                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {FILTER.map(f => {
                        const on = filter === f.key;
                        const warn = f.key === 'prob' && n.prob > 0;
                        return (
                            <button
                                key={f.key}
                                type="button"
                                className="zh-btn"
                                aria-pressed={on}
                                onClick={() => setFilter(f.key)}
                                style={{
                                    height: 36,
                                    padding: '0 12px',
                                    borderRadius: 18,
                                    border: `1px solid ${on ? v('sw-on') : v('sw-off-bd')}`,
                                    background: on ? v('sw-on') : v('sw-off-bg'),
                                    color: on ? v('sw-on-fg') : v('sw-off-fg'),
                                    fontSize: 13,
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                {f.label}
                                <b style={{ color: on ? v('sw-on-fg') : warn ? v('warn-fg') : v('text') }}>
                                    {n[f.key]}
                                </b>
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: COLS,
                                columnGap: 8,
                                padding: '0 8px',
                                height: 22,
                                alignItems: 'center',
                                fontSize: 10.5,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: MUTED,
                                fontWeight: 600,
                                borderBottom: `1px solid ${v('border')}`,
                            }}
                        >
                            <span>Name</span>
                            <span>Zustand</span>
                            <span>seit</span>
                            <span>RAM</span>
                            <span>Version</span>
                            <span>Update</span>
                            <span>Fehler</span>
                        </div>
                        <div
                            ref={listRef}
                            onScroll={touch}
                            style={{
                                height: 'min(330px, calc(100vh - 330px))',
                                minHeight: 140,
                                overflowY: 'auto',
                                overscrollBehavior: 'contain', // no pull-to-refresh of the page when scrolling up
                                scrollbarWidth: 'thin',
                                scrollbarColor: '#44444a transparent',
                            }}
                        >
                            {grp.map(g => (
                                <React.Fragment key={g.titel}>
                                    <Gruppentitel text={`${g.titel} · ${g.zeilen.length}`} />
                                    {g.zeilen.map((x, i) => (
                                        <Zeile
                                            key={x.id}
                                            x={x}
                                            now={p.now}
                                            odd={i % 2 === 1}
                                        />
                                    ))}
                                </React.Fragment>
                            ))}
                            {ohne.length ? (
                                <>
                                    <Gruppentitel text={`Weitere Adapter (Widgets, ohne Instanz) · ${ohne.length}`} />
                                    {ohne.map((x, i) => (
                                        <div
                                            key={x.id}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: COLS,
                                                alignItems: 'center',
                                                columnGap: 8,
                                                padding: '0 8px',
                                                height: 34,
                                                borderRadius: 8,
                                                fontSize: 13,
                                                background: i % 2 ? 'rgba(255,255,255,.018)' : 'transparent',
                                            }}
                                        >
                                            <span style={{ ...cell, fontWeight: 600 }}>{x.id}</span>
                                            <span style={{ ...cell, color: v('text-2') }}>
                                                <Led stufe="info" />
                                                ohne Prozess
                                            </span>
                                            <span style={num}>—</span>
                                            <span style={num}>—</span>
                                            <span style={num}>{x.ver}</span>
                                            <span style={{ ...cell, color: YELLOW, fontWeight: 600 }}>→ {x.avail}</span>
                                            <span />
                                        </div>
                                    ))}
                                </>
                            ) : null}
                            {!grp.length && !ohne.length ? <Gruppentitel text="Nichts in dieser Auswahl." /> : null}
                        </div>
                    </div>
                    <div style={{ display: 'flex', paddingTop: 22 }}>
                        <ScrollPfeile
                            target={listRef}
                            onUse={touch}
                        />
                    </div>
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
                        marginTop: 4,
                    }}
                >
                    <span style={cell}>Letzter Eingriff: {p.letzterEingriff || 'keiner seit Start des Wächters'}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>Updates nur zur Info · Installieren über Admin</span>
                </div>
            </div>
        </Frame>
    );
}
