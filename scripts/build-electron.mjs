import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const sharedEsbuild = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  minify: false,
  sourcemap: false
};

await build({
  ...sharedEsbuild,
  entryPoints: [path.resolve(rootDir, 'electron/main.ts')],
  outfile: path.resolve(rootDir, 'dist-electron/main.cjs')
});

await build({
  ...sharedEsbuild,
  entryPoints: [path.resolve(rootDir, 'electron/preload.ts')],
  outfile: path.resolve(rootDir, 'dist-electron/preload.cjs')
});

await build({
  ...sharedEsbuild,
  entryPoints: [path.resolve(rootDir, 'server/local-server.ts')],
  outfile: path.resolve(rootDir, 'dist-electron/local-server.cjs')
});

console.log('[ops-deck] Electron main, preload & local-server built.');
