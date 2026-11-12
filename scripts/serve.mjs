import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const serverBundle = path.join(rootDir, 'dist-electron/local-server.cjs');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(serverBundle) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('[ops-deck] 缺少构建产物，请先执行 pnpm run build');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const { startLocalServer } = require(serverBundle);

const port = Number(process.env.OPS_VAULT_PORT) || 5189;
await startLocalServer(distDir, port);
const url = `http://127.0.0.1:${port}`;
console.log(`[ops-deck] 本地桌面服务已启动: ${url}`);
console.log('[ops-deck] 所有项目资料、脚本卡片与交接包导出均在本地运行。');

if (process.platform === 'win32' && !process.argv.includes('--no-open')) {
  const child = spawn('cmd.exe', ['/c', 'start', '""', url], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

