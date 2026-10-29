// Copies the vite build of src-widgets into widgets/vis-2-widgets-zuhause (what VIS-2 loads), without index.html.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src-widgets', 'build');
const dest = join(root, 'widgets', 'vis-2-widgets-zuhause');

if (!existsSync(join(src, 'customWidgets.js'))) {
    console.error('src-widgets/build/customWidgets.js missing - run the vite build first');
    process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true, filter: p => !p.endsWith('index.html') });
console.log(`copied ${src} -> ${dest}`);
