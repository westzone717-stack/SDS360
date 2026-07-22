// Copies pdfjs-dist's worker script into public/ so it's served as a plain
// static file — never passed through webpack/Terser, which chokes on its
// top-level import/export syntax in production builds. Runs before every
// build so it can't silently go stale after a react-pdf/pdfjs-dist bump.
import { copyFile } from 'fs/promises';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const dest = path.resolve(__dirname, '../public/pdf.worker.min.mjs');

await copyFile(src, dest);
console.log(`[copy-pdf-worker] ${src} -> ${dest}`);
