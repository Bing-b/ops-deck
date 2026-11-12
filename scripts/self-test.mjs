import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { build } from 'esbuild';

const rootDir = path.resolve(import.meta.dirname, '..');
const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'ops-deck-test-'));

try {
  // 1. 校验构建产物完整性
  for (const rel of [
    'dist/index.html',
    'dist-electron/main.cjs',
    'dist-electron/preload.cjs',
    'dist-electron/local-server.cjs'
  ]) {
    await fs.access(path.join(rootDir, rel));
  }

  // 2. 校验 preload.ts 与 main.ts 的 IPC 通道完全一致
  const preloadSrc = await fs.readFile(path.join(rootDir, 'electron/preload.ts'), 'utf8');
  const mainSrc = await fs.readFile(path.join(rootDir, 'electron/main.ts'), 'utf8');
  const invoked = new Set(
    [...preloadSrc.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((m) => m[1])
  );
  const handled = new Set(
    [...mainSrc.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map((m) => m[1])
  );
  for (const ch of invoked) {
    assert.ok(handled.has(ch), `缺少 IPC 处理器: ${ch}`);
  }

  // 3. 编译 VaultStore 与 highlight 工具验证完整业务流程
  const stubPath = path.join(tmpBase, 'electron-stub.mjs');
  const userDataDir = path.join(tmpBase, 'userData');
  const workspaceDir = path.join(tmpBase, 'workspace');
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });
  process.env.OPS_VAULT_DATA_DIR = userDataDir;

  await fs.writeFile(
    stubPath,
    `export const app = { getPath: () => ${JSON.stringify(tmpBase)} };\n`
  );

  const storeBundle = path.join(tmpBase, 'vault-store.cjs');
  const hlBundle = path.join(tmpBase, 'highlight.mjs');
  await build({
    entryPoints: [path.join(rootDir, 'electron/vault-store.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: storeBundle,
    alias: { electron: stubPath }
  });
  await build({
    entryPoints: [path.join(rootDir, 'src/utils/highlight.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: hlBundle
  });

  const require = createRequire(import.meta.url);
  const { VaultStore } = require(storeBundle);
  const { highlightCodeHtml } = await import(`file:///${hlBundle.replace(/\\/g, '/')}`);

  // 代码高亮输出验证
  const html = highlightCodeHtml('# 部署脚本\nif [ -f ".env" ]; then echo "ok"; fi', 'bash');
  assert.ok(html.includes('hljs-'));

  // 初始化并校验 4 张示例卡片
  const store = new VaultStore();
  await store.setWorkspacePath(workspaceDir);
  const initial = await store.loadVault();
  assert.equal(initial.projects.length, 1);
  assert.equal(initial.cards.length, 4);

  // 新建项目与脚本卡片增改删
  const proj = await store.saveProject({ name: '订单中心', description: '核心交易服务' });
  const card = await store.saveCard({
    projectId: proj.id,
    title: '重启订单容器',
    language: 'bash',
    content: 'docker compose restart order-api\ndocker compose ps'
  });
  assert.equal(card.title, '重启订单容器');

  const updatedCard = await store.saveCard({
    id: card.id,
    projectId: proj.id,
    title: '重启并查看订单日志',
    language: 'bash',
    content: 'docker compose restart order-api\ndocker logs -f --tail 100 order-api'
  });
  assert.equal(updatedCard.title, '重启并查看订单日志');

  // 交接包导出与导入还原
  const zipPath = path.join(tmpBase, 'handover.zip');
  await store.exportHandoverZip({ projectId: proj.id, includeOfflineHtml: true }, zipPath);
  const importRes = await store.importHandoverZip(zipPath);
  assert.equal(importRes.projectName, '订单中心');
  assert.equal(importRes.cardCount, 1);

  const snap = await store.createBackupSnapshot();
  await fs.access(snap.path);

  await store.deleteCard(card.id);
  await store.deleteProject(proj.id);

  // 4. 测试本地 HTTP API 路由（/api/health、/api/rpc/saveCard、/api/export-handover）
  const { createApiHandler } = require(path.join(rootDir, 'dist-electron/local-server.cjs'));
  const apiHandler = createApiHandler(store);

  async function callApi(method, url, bodyObj) {
    const req = new PassThrough();
    req.method = method;
    req.url = url;
    const chunks = [];
    let statusCode = 200;
    const res = {
      writeHead(code) {
        statusCode = code;
      },
      end(data) {
        if (data !== undefined) {
          chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
        }
        res._done();
      }
    };
    const donePromise = new Promise((resolve) => {
      res._done = resolve;
    });
    const handlePromise = apiHandler(req, res);
    if (bodyObj !== undefined) {
      req.end(Buffer.from(JSON.stringify(bodyObj), 'utf8'));
    } else {
      req.end();
    }
    const handled = await handlePromise;
    assert.equal(handled, true);
    await donePromise;
    return { statusCode, body: Buffer.concat(chunks) };
  }

  const health = await callApi('GET', '/api/health');
  assert.equal(health.statusCode, 200);
  assert.equal(JSON.parse(health.body.toString('utf8')).ok, true);

  const saveProjResp = await callApi('POST', '/api/rpc/saveProject', { name: 'HTTP卡片项目' });
  assert.equal(saveProjResp.statusCode, 200);
  const httpProj = JSON.parse(saveProjResp.body.toString('utf8'));

  const saveCardResp = await callApi('POST', '/api/rpc/saveCard', {
    projectId: httpProj.id,
    title: 'Nginx 重载配置',
    language: 'bash',
    content: 'nginx -t && nginx -s reload'
  });
  assert.equal(saveCardResp.statusCode, 200);

  const expResp = await callApi('POST', '/api/export-handover', {
    projectId: httpProj.id,
    includeOfflineHtml: true
  });
  assert.equal(expResp.statusCode, 200);
  assert.ok(expResp.body.byteLength > 100);

  await callApi('POST', '/api/rpc/deleteProject', { projectId: httpProj.id });

  console.log('[ops-deck] 全部自测项通过（IPC 通道、卡片增删改、代码高亮、示例数据、交接包导出导入、本地 HTTP 接口）');
} finally {
  await fs.rm(tmpBase, { recursive: true, force: true });
}
