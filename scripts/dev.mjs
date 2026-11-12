import { build, context } from 'esbuild';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import electronPath from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function start() {
  const sharedEsbuild = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron'],
    sourcemap: true
  };

  await build({
    ...sharedEsbuild,
    entryPoints: [path.resolve(rootDir, 'electron/preload.ts')],
    outfile: path.resolve(rootDir, 'dist-electron/preload.cjs')
  });

  const localServerOut = path.resolve(rootDir, 'dist-electron/local-server.cjs');
  await build({
    ...sharedEsbuild,
    entryPoints: [path.resolve(rootDir, 'server/local-server.ts')],
    outfile: localServerOut
  });

  const require = createRequire(import.meta.url);
  const { createApiHandler, VaultStore } = (() => {
    const mod = require(localServerOut);
    return mod;
  })();

  // Also mount VaultStore API right inside Vite dev server so browser mode works seamlessly
  const storeOut = path.resolve(rootDir, 'dist-electron/vault-store-dev.cjs');
  await build({
    ...sharedEsbuild,
    entryPoints: [path.resolve(rootDir, 'electron/vault-store.ts')],
    outfile: storeOut
  });
  const { VaultStore: DevVaultStore } = require(storeOut);
  const devStore = new DevVaultStore();
  await devStore.init();
  const handleApi = createApiHandler(devStore);

  const viteServer = await createServer({
    configFile: path.resolve(rootDir, 'vite.config.ts')
  });
  viteServer.middlewares.use(async (req, res, next) => {
    try {
      const handled = await handleApi(req, res);
      if (!handled) next();
    } catch (err) {
      next(err);
    }
  });
  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5188;
  const devUrl = `http://localhost:${port}`;
  console.log(`[ops-deck] 开发服务已就绪: ${devUrl}（支持 Electron 窗口及本地浏览器访问）`);

  let electronProcess = null;
  let restarting = false;

  const launchElectron = () => {
    if (electronProcess) {
      electronProcess.kill();
      electronProcess = null;
    }
    const cleanEnv = { ...process.env, VITE_DEV_SERVER_URL: devUrl };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    delete cleanEnv.CHROME_CRASHPAD_PIPE_NAME;
    for (const key of Object.keys(cleanEnv)) {
      if (key.startsWith('VSCODE_')) {
        delete cleanEnv[key];
      }
    }

    electronProcess = spawn(String(electronPath), ['.'], {
      cwd: rootDir,
      stdio: 'inherit',
      env: cleanEnv
    });
    electronProcess.on('error', (err) => {
      console.error('[ops-deck] 启动 Electron 失败，可直接访问上方本地地址使用：', err.message);
    });
    electronProcess.on('close', (code) => {
      if (code !== null && code !== 0 && !restarting) {
        console.log(
          `[ops-deck] Electron 窗口未能拉起（退出码: ${code}），你可直接用浏览器打开 ${devUrl} 使用全部功能`
        );
      }
    });
  };

  const mainCtx = await context({
    ...sharedEsbuild,
    entryPoints: [path.resolve(rootDir, 'electron/main.ts')],
    outfile: path.resolve(rootDir, 'dist-electron/main.cjs'),
    plugins: [
      {
        name: 'restart-electron',
        setup(buildApi) {
          buildApi.onEnd((result) => {
            if (result.errors.length === 0) {
              restarting = true;
              launchElectron();
              setTimeout(() => {
                restarting = false;
              }, 400);
            }
          });
        }
      }
    ]
  });

  await mainCtx.watch();

  const cleanup = async () => {
    if (electronProcess) electronProcess.kill();
    await mainCtx.dispose();
    await viteServer.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
