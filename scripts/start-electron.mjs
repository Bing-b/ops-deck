import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

if (
  !fs.existsSync(path.join(rootDir, 'dist/index.html')) ||
  !fs.existsSync(path.join(rootDir, 'dist-electron/main.cjs'))
) {
  console.error('[ops-deck] 请先执行 pnpm run build 构建桌面产物');
  process.exit(1);
}

const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
delete cleanEnv.VITE_DEV_SERVER_URL;
delete cleanEnv.CHROME_CRASHPAD_PIPE_NAME;
for (const key of Object.keys(cleanEnv)) {
  if (key.startsWith('VSCODE_')) {
    delete cleanEnv[key];
  }
}

const extraArgs = process.argv.slice(2);
const child = spawn(String(electronPath), ['.', ...extraArgs], {
  cwd: rootDir,
  stdio: 'inherit',
  env: cleanEnv
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[ops-deck] 桌面进程退出，退出码: ${code} (0x${((code ?? 0) >>> 0).toString(16)})`);
    if (code === 2147483651 || code === -2147483645) {
      console.error('[ops-deck] 当前终端处于受限/低权限环境，Chromium 窗口被系统拦截。');
      console.error('[ops-deck] 解决方式 1：改在系统独立 PowerShell / Windows Terminal 中执行 pnpm run start');
      console.error('[ops-deck] 解决方式 2：直接执行 pnpm run serve（启用本地 Node 服务，所有功能同样 100% 可用）');
    }
  }
  process.exit(code ?? 0);
});
