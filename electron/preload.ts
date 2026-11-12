import { contextBridge, ipcRenderer } from 'electron';
import type { OpsVaultApi } from '../shared/types';

const api: OpsVaultApi = {
  getWorkspaceInfo: () => ipcRenderer.invoke('vault:getWorkspaceInfo'),
  selectWorkspace: () => ipcRenderer.invoke('vault:selectWorkspace'),
  loadVault: () => ipcRenderer.invoke('vault:loadVault'),
  saveProject: (input) => ipcRenderer.invoke('vault:saveProject', input),
  deleteProject: (projectId) => ipcRenderer.invoke('vault:deleteProject', projectId),
  saveCard: (input) => ipcRenderer.invoke('vault:saveCard', input),
  deleteCard: (cardId) => ipcRenderer.invoke('vault:deleteCard', cardId),
  copyText: (text) => ipcRenderer.invoke('vault:copyText', text),
  openPath: (targetPath) => ipcRenderer.invoke('vault:openPath', targetPath),
  exportHandover: (options) => ipcRenderer.invoke('vault:exportHandover', options),
  importHandover: () => ipcRenderer.invoke('vault:importHandover'),
  createBackupSnapshot: () => ipcRenderer.invoke('vault:createBackupSnapshot'),
  pickFolder: () => ipcRenderer.invoke('vault:pickFolder'),
  onOpenPalette: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('ops-vault:open-palette', handler);
    return () => ipcRenderer.removeListener('ops-vault:open-palette', handler);
  }
};

contextBridge.exposeInMainWorld('opsVault', api);
