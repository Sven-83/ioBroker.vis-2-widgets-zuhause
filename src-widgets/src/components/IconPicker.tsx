/*
 * Attribute field "icon" in the VIS-2 editor: grid with a preview of every icon of the register.
 */
import React from 'react';

import { ICONS, PICKER_ICONS } from '../lib/icons';

export function IconPicker({
    value,
    onChange,
}: {
    value: string;
    onChange: (name: string) => void;
}): React.JSX.Element {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))',
                gap: 4,
                width: '100%',
                maxHeight: 220,
                overflowY: 'auto',
            }}
        >
            {PICKER_ICONS.map(name => {
                const selected = name === value;
                return (
                    <button
                        key={name}
                        type="button"
                        title={name}
                        onClick={() => onChange(name)}
                        style={{
                            height: 34,
                            padding: 0,
                            borderRadius: 6,
                            cursor: 'pointer',
                            border: selected ? '2px solid #f2c14e' : '1px solid rgba(128,128,128,.35)',
                            background: selected ? 'rgba(242,193,78,.18)' : 'transparent',
                            color: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width={22}
                            height={22}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.7}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                        >
                            <path d={ICONS[name]} />
                        </svg>
                    </button>
                );
            })}
        </div>
    );
}
