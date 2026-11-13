import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  shell
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ExportOptions } from '../shared/types';
import { VaultStore } from './vault-store';

const isSmokeCheck = process.argv.includes('--smoke-check');

// Allow Chromium renderer/GPU processes to start in environments that restrict
// sandbox (e.g. certain Windows accounts, AppLocker, Hypervisor restrictions).
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

let mainWindow: BrowserWindow | null = null;
const store = new VaultStore();

function logStartup(msg: string): void {
  try {
    const logDir = app.getPath('userData');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'startup.log'), `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch {
    // ignore
  }
}

process.on('uncaughtException', (err) => {
  logStartup(`uncaughtException: ${err?.stack || err}`);
});

process.on('unhandledRejection', (err) => {
  logStartup(`unhandledRejection: ${err instanceof Error ? err.stack : String(err)}`);
});

function createWindow(): void {
  logStartup('createWindow start');
  const iconPath = path.join(__dirname, '../dist/icon.png');
  const winIcon = fs.existsSync(iconPath) ? iconPath : undefined;

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: !isSmokeCheck,
    title: 'OpsDeck · 项目与脚本卡片工作台',
    backgroundColor: '#fafbfd',
    autoHideMenuBar: true,
    icon: winIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    logStartup('ready-to-show');
    if (!isSmokeCheck) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  mainWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    dialog.showErrorBox(
      'OpsDeck 预加载脚本异常',
      `桌面桥接脚本加载失败：${preloadPath}\n${err?.message || String(err)}`
    );
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3) return;
    dialog.showErrorBox(
      'OpsDeck 页面加载失败',
      `无法加载界面（${code}：${desc}）\n目标地址：${url}`
    );
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function focusAndOpenPalette(): void {
  if (!mainWindow) {
    createWindow();
  }
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('ops-vault:open-palette');
}

function registerShortcuts(): void {
  for (const acc of ['CommandOrControl+Shift+O', 'Alt+Space']) {
    try {
      globalShortcut.register(acc, focusAndOpenPalette);
    } catch {
      // 快捷键已被占用时忽略
    }
  }
}

function showOpenModal(options: Electron.OpenDialogOptions) {
  return mainWindow
    ? dialog.showOpenDialog(mainWindow, options)
    : dialog.showOpenDialog(options);
}

function showSaveModal(options: Electron.SaveDialogOptions) {
  return mainWindow
    ? dialog.showSaveDialog(mainWindow, options)
    : dialog.showSaveDialog(options);
}

function registerIpcHandlers(): void {
  ipcMain.handle('vault:getWorkspaceInfo', () => store.getWorkspaceInfo());

  ipcMain.handle('vault:selectWorkspace', async () => {
    const res = await showOpenModal({
      title: '选择 OpsDeck 本地数据工作区文件夹',
      properties: ['openDirectory', 'createDirectory']
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { canceled: true };
    }
    await store.setWorkspacePath(res.filePaths[0]);
    return { canceled: false, workspacePath: res.filePaths[0] };
  });

  ipcMain.handle('vault:loadVault', () => store.loadVault());
  ipcMain.handle('vault:saveProject', (_e, input) => store.saveProject(input));
  ipcMain.handle('vault:deleteProject', (_e, projectId) => store.deleteProject(projectId));
  ipcMain.handle('vault:saveCard', (_e, input) => store.saveCard(input));
  ipcMain.handle('vault:deleteCard', (_e, cardId) => store.deleteCard(cardId));

  ipcMain.handle('vault:copyText', (_e, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('vault:openPath', async (_e, targetPath: string) => {
    if (!targetPath) {
      return { ok: false, error: '未配置本地路径' };
    }
    const normalized = path.normalize(targetPath);
    if (!fs.existsSync(normalized)) {
      return { ok: false, error: `目录或文件不存在：${normalized}` };
    }
    const errMsg = await shell.openPath(normalized);
    return errMsg ? { ok: false, error: `打开失败：${errMsg}` } : { ok: true };
  });

  ipcMain.handle('vault:exportHandover', async (_e, options: ExportOptions) => {
    const vault = await store.loadVault();
    const project = vault.projects.find((p) => p.id === options.projectId);
    const defaultName = `${project ? project.slug : 'project'}-handover-${new Date().toISOString().slice(0, 10)}.zip`;
    const saveRes = await showSaveModal({
      title: '导出工作交接包 (.zip)',
      defaultPath: defaultName,
      filters: [{ name: 'ZIP 压缩归档', extensions: ['zip'] }]
    });
    if (saveRes.canceled || !saveRes.filePath) {
      return { canceled: true };
    }
    const stats = await store.exportHandoverZip(options, saveRes.filePath);
    return {
      canceled: false,
      outputPath: saveRes.filePath,
      ...stats
    };
  });

  ipcMain.handle('vault:importHandover', async () => {
    const res = await showOpenModal({
      title: '选择 OpsDeck 交接包 (.zip)',
      properties: ['openFile'],
      filters: [{ name: 'ZIP 归档', extensions: ['zip'] }]
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { canceled: true };
    }
    return store.importHandoverZip(res.filePaths[0]);
  });

  ipcMain.handle('vault:createBackupSnapshot', () => store.createBackupSnapshot());

  ipcMain.handle('vault:pickFolder', async () => {
    const res = await showOpenModal({
      title: '选择文件夹',
      properties: ['openDirectory']
    });
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
  });
}

app.whenReady().then(async () => {
  logStartup(`whenReady isPackaged=${app.isPackaged} execPath=${process.execPath}`);
  try {
    await store.init();
    logStartup('store.init ok');
    registerIpcHandlers();
    createWindow();
  } catch (err) {
    logStartup(`startup error: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    dialog.showErrorBox(
      'OpsDeck 启动失败',
      err instanceof Error ? err.stack || err.message : String(err)
    );
    app.quit();
    return;
  }

  if (isSmokeCheck && mainWindow) {
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 300));
        const ok = await mainWindow?.webContents.executeJavaScript(
          'Boolean(window.opsVault && document.querySelectorAll("button").length > 0)'
        );
        app.exit(ok ? 0 : 1);
      } catch {
        app.exit(1);
      }
    });
    return;
  }

  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
