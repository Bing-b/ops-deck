import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browserBin = fs.existsSync(chromePath) ? chromePath : edgePath;

function createSvgHtml(size) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${size}px;
    height: ${size}px;
    overflow: hidden;
    background: transparent;
  }
  .wrap {
    width: ${size}px;
    height: ${size}px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  svg {
    width: ${Math.round(size * 0.88)}px;
    height: ${Math.round(size * 0.88)}px;
    filter: drop-shadow(0 0 1.2px rgba(255, 255, 255, 0.55)) drop-shadow(0 1px 2px rgba(17, 24, 39, 0.2));
  }
</style>
</head>
<body>
<div class="wrap">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <path
    d="M21.2 9.2A9.6 9.6 0 1 0 21.2 22.8"
    stroke="#111827"
    stroke-width="3.2"
    stroke-linecap="round"
  />
  <path
    d="M12.5 21.5L25.5 7.5"
    stroke="#111827"
    stroke-width="2.9"
    stroke-linecap="round"
  />
  <path
    d="M19.5 22L27.5 13.5"
    stroke="#3B66F5"
    stroke-width="2.9"
    stroke-linecap="round"
  />
</svg>
</div>
</body>
</html>`;
}

function renderPng(size, outPngPath) {
  const tmpHtml = path.join(rootDir, 'node_modules/.cache', `icon_${size}.html`);
  fs.mkdirSync(path.dirname(tmpHtml), { recursive: true });
  fs.writeFileSync(tmpHtml, createSvgHtml(size), 'utf8');

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${outPngPath}`,
    `file:///${tmpHtml.replace(/\\/g, '/')}`
  ];

  const res = spawnSync(browserBin, args);
  if (!fs.existsSync(outPngPath)) {
    throw new Error(`Failed to render PNG at size ${size}: status=${res.status}, err=${res.stderr?.toString()}`);
  }
}

function buildIco(pngBuffers) {
  // pngBuffers: Array<{ size: number, buffer: Buffer }>
  const count = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + count * entrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4); // count

  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    const w = item.size >= 256 ? 0 : item.size;
    const h = item.size >= 256 ? 0 : item.size;
    entry.writeUInt8(w, 0);
    entry.writeUInt8(h, 1);
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // image size
    entry.writeUInt32LE(offset, 12); // image offset

    offset += item.buffer.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buffer)]);
}

async function main() {
  console.log('[build-icon] Generating application icons from logo.svg...');
  const buildDir = path.join(rootDir, 'build');
  fs.mkdirSync(buildDir, { recursive: true });

  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const pngPath = path.join(buildDir, `icon_${size}.png`);
    renderPng(size, pngPath);
    const buf = fs.readFileSync(pngPath);
    pngBuffers.push({ size, buffer: buf });
    console.log(`  ✓ Rendered ${size}x${size} PNG (${buf.length} bytes)`);
  }

  // Also write 256x256 as build/icon.png
  fs.copyFileSync(path.join(buildDir, 'icon_256.png'), path.join(buildDir, 'icon.png'));

  // Also write into src/assets/icon.png & dist for window icon
  fs.copyFileSync(path.join(buildDir, 'icon_256.png'), path.join(rootDir, 'src/assets/icon.png'));

  // Build ICO
  const icoBuf = buildIco(pngBuffers);
  const icoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuf);
  console.log(`[build-icon] Created ${icoPath} (${icoBuf.length} bytes)`);

  const publicDir = path.join(rootDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.copyFileSync(icoPath, path.join(publicDir, 'icon.ico'));
  fs.copyFileSync(path.join(buildDir, 'icon.png'), path.join(publicDir, 'icon.png'));

  const distDir = path.join(rootDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(icoPath, path.join(distDir, 'icon.ico'));
  fs.copyFileSync(path.join(buildDir, 'icon.png'), path.join(distDir, 'icon.png'));
}

main().catch((err) => {
  console.error('[build-icon] Error:', err);
  process.exit(1);
});
