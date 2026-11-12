import type { OpsVaultApi } from '../../shared/types';

async function rpc<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/rpc/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `接口请求失败 (${res.status})`);
  }
  return data;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function pickBrowserFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => {
      finish(input.files?.[0] ?? null);
    });
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!settled && !input.files?.[0]) {
            finish(null);
          }
        }, 350);
      },
      { once: true }
    );
    input.click();
  });
}

function createHttpBridge(): OpsVaultApi {
  return {
    getWorkspaceInfo: () => rpc('getWorkspaceInfo'),
    selectWorkspace: async () => {
      const picked = await rpc<{ path: string | null }>('pickFolder', {
        title: '选择 OpsDeck 本地数据工作区文件夹'
      });
      if (picked.path) {
        await rpc('setWorkspacePath', { workspacePath: picked.path });
        return { canceled: false, workspacePath: picked.path };
      }
      const typed = window.prompt('请输入本地工作区文件夹绝对路径（例如 D:\\OpsDeck）：');
      if (!typed || !typed.trim()) return { canceled: true };
      await rpc('setWorkspacePath', { workspacePath: typed.trim() });
      return { canceled: false, workspacePath: typed.trim() };
    },
    loadVault: () => rpc('loadVault'),
    saveProject: (input) => rpc('saveProject', input),
    deleteProject: (projectId) => rpc('deleteProject', { projectId }),
    saveCard: (input) => rpc('saveCard', input),
    deleteCard: (cardId) => rpc('deleteCard', { cardId }),
    copyText: async (text) => {
      await navigator.clipboard.writeText(text);
    },
    openPath: (targetPath) => rpc('openPath', { targetPath }),
    exportHandover: async (options) => {
      const res = await fetch('/api/export-handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || '导出交接包失败');
      }
      const blob = await res.blob();
      const fileName = decodeURIComponent(res.headers.get('X-File-Name') || 'handover.zip');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return {
        canceled: false,
        outputPath: `浏览器下载目录/${fileName}`,
        totalBytes: blob.size
      };
    },
    importHandover: async () => {
      const file = await pickBrowserFile('.zip');
      if (!file) return { canceled: true };
      const dataBase64 = await fileToBase64(file);
      const res = await fetch('/api/import-handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataBase64 })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '导入交接包失败');
      }
      return data;
    },
    createBackupSnapshot: () => rpc('createBackupSnapshot'),
    pickFolder: async () => {
      const res = await rpc<{ path: string | null }>('pickFolder', { title: '选择本地文件夹' });
      if (res.path) return res.path;
      const typed = window.prompt('请输入本地文件夹路径：');
      return typed?.trim() || null;
    },
    onOpenPalette: () => () => {}
  };
}

export async function ensureOpsVaultBridge(): Promise<'electron' | 'local-server' | 'none'> {
  if (typeof window !== 'undefined' && window.opsVault) {
    return 'electron';
  }
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (res.ok) {
      window.opsVault = createHttpBridge();
      return 'local-server';
    }
  } catch {
    // 非本地服务环境
  }
  return 'none';
}
