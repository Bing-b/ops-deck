import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { VaultStore } from '../electron/vault-store';
import type { ExportOptions } from '../shared/types';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

async function readBody(req: http.IncomingMessage, maxBytes = 64 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson<T>(req: http.IncomingMessage): Promise<T> {
  const buf = await readBody(req);
  if (buf.length === 0) return {} as T;
  return JSON.parse(buf.toString('utf8')) as T;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function pickFolderViaWindows(title: string): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog;',
      `$d.Description = '${title.replace(/'/g, "''")}';`,
      '$d.UseDescriptionForTitle = $true;',
      'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }'
    ].join(' ');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', script],
      { timeout: 60_000 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const out = stdout.trim();
        resolve(out || null);
      }
    );
  });
}

function openWithOsDefault(targetPath: string): void {
  const normalized = path.normalize(targetPath);
  if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/c', 'start', '""', normalized], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  }
}

export function createApiHandler(store: VaultStore) {
  let initialized = false;
  async function ensureInit() {
    if (!initialized) {
      await store.init();
      initialized = true;
    }
  }

  return async function handleApi(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<boolean> {
    const urlStr = req.url || '/';
    const urlPath = urlStr.split('?')[0];
    if (!urlPath.startsWith('/api/')) return false;

    try {
      await ensureInit();

      if (req.method === 'GET' && urlPath === '/api/health') {
        sendJson(res, 200, { ok: true, mode: 'local-server' });
        return true;
      }

      if (req.method === 'POST' && urlPath === '/api/export-handover') {
        const options = await readJson<ExportOptions>(req);
        const result = await store.buildHandoverZipBuffer(options);
        const fileName = `${result.slug}-handover-${new Date().toISOString().slice(0, 10)}.zip`;
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': String(result.buffer.byteLength),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          'X-File-Name': encodeURIComponent(fileName)
        });
        res.end(result.buffer);
        return true;
      }

      if (req.method === 'POST' && urlPath === '/api/import-handover') {
        const body = await readJson<{ dataBase64: string }>(req);
        const buf = Buffer.from(body.dataBase64 || '', 'base64');
        const result = await store.importHandoverBuffer(buf);
        sendJson(res, 200, result);
        return true;
      }

      if (req.method === 'POST' && urlPath.startsWith('/api/rpc/')) {
        const method = urlPath.slice('/api/rpc/'.length);
        const payload = await readJson<Record<string, unknown>>(req);

        switch (method) {
          case 'getWorkspaceInfo':
            sendJson(res, 200, store.getWorkspaceInfo());
            return true;
          case 'setWorkspacePath': {
            const p = String(payload.workspacePath || '').trim();
            if (!p) throw new Error('工作区路径不能为空');
            await store.setWorkspacePath(p);
            sendJson(res, 200, { workspacePath: p });
            return true;
          }
          case 'pickFolder': {
            const picked = await pickFolderViaWindows(
              String(payload.title || '选择本地文件夹')
            );
            sendJson(res, 200, { path: picked });
            return true;
          }
          case 'loadVault':
            sendJson(res, 200, await store.loadVault());
            return true;
          case 'saveProject':
            sendJson(res, 200, await store.saveProject(payload as never));
            return true;
          case 'deleteProject':
            await store.deleteProject(String(payload.projectId));
            sendJson(res, 200, { ok: true });
            return true;
          case 'saveCard':
            sendJson(res, 200, await store.saveCard(payload as never));
            return true;
          case 'deleteCard':
            await store.deleteCard(String(payload.cardId));
            sendJson(res, 200, { ok: true });
            return true;
          case 'openPath': {
            const target = String(payload.targetPath || '');
            if (!target) {
              sendJson(res, 200, { ok: false, error: '未配置本地路径' });
              return true;
            }
            const normalized = path.normalize(target);
            if (!fs.existsSync(normalized)) {
              sendJson(res, 200, { ok: false, error: `目录或文件不存在：${normalized}` });
              return true;
            }
            openWithOsDefault(normalized);
            sendJson(res, 200, { ok: true });
            return true;
          }
          case 'createBackupSnapshot':
            sendJson(res, 200, await store.createBackupSnapshot());
            return true;
          default:
            sendJson(res, 404, { error: `未知接口方法: ${method}` });
            return true;
        }
      }

      sendJson(res, 404, { error: '接口不存在' });
      return true;
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err)
      });
      return true;
    }
  };
}

export async function startLocalServer(distDir: string, port = 5189): Promise<http.Server> {
  const store = new VaultStore();
  await store.init();
  const handleApi = createApiHandler(store);

  const server = http.createServer(async (req, res) => {
    const handled = await handleApi(req, res);
    if (handled) return;

    const reqPath = (req.url || '/').split('?')[0];
    const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    let filePath = path.resolve(distDir, rel);
    const insideDist = filePath.startsWith(path.resolve(distDir));
    const exists = insideDist && fs.existsSync(filePath) && fs.statSync(filePath).isFile();

    if (!exists) {
      // Never fall back missing static assets (.js/.css/fonts/images) to index.html,
      // otherwise stale cached HTML gets HTML with text/html MIME for module scripts -> blank screen.
      if (rel.startsWith('assets/') || path.extname(rel)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      filePath = path.join(distDir, 'index.html');
    }
    try {
      const data = await fsp.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        ...(ext === '.html'
          ? { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
          : { 'Cache-Control': 'public, max-age=31536000, immutable' })
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  return server;
}
