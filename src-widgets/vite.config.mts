// Builds the widget set as a module federation remote for VIS-2 (layout of ioBroker.vis-2-widgets-react-template).
// React comes from VIS-2 as shared singleton, the bundle only holds the widgets themselves.
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/types-vis-2/modulefederation.vis.config';

export default {
    plugins: [
        federation({
            manifest: true,
            name: 'vis2Zuhause',
            filename: 'customWidgets.js',
            exposes: {
                './ZuhauseKachel': './src/widgets/ZuhauseKachel',
                './ZuhausePin': './src/widgets/ZuhausePin',
                './ZuhauseWetter': './src/widgets/ZuhauseWetter',
                './ZuhauseWerte': './src/widgets/ZuhauseWerte',
                './ZuhauseSchule': './src/widgets/ZuhauseSchule',
                './ZuhauseKarte': './src/widgets/ZuhauseKarte',
                './translations': './src/translations',
            },
            remotes: {},
            // only React is used at runtime; MUI and gui-components are installed for the vis-2 types only
            shared: moduleFederationShared(['react', 'react-dom']),
            dts: false,
        }),
        react(),
    ],
    base: './',
    resolve: {
        dedupe: ['react', 'react-dom'],
    },
    build: {
        target: 'chrome89',
        outDir: './build',
        rollupOptions: {
            onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
                // "Module level directives cause errors when bundled" ("use client" in dependencies)
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
            output: {
                // federation chunks are named after their virtual module (> 140 chars), too long for Windows paths
                chunkFileNames: (chunk: { name: string }): string =>
                    chunk.name.startsWith('_virtual_mf') ? 'assets/mf-[hash].js' : 'assets/[name]-[hash].js',
            },
        },
    },
};
