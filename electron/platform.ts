import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface ElectronAppLike {
  getPath: (name: 'userData' | 'documents') => string;
}

interface ElectronSafeStorageLike {
  isEncryptionAvailable: () => boolean;
  encryptString: (plain: string) => Buffer;
  decryptString: (buf: Buffer) => string;
}

function loadElectronApis(): {
  app?: ElectronAppLike;
  safeStorage?: ElectronSafeStorageLike;
} {
  if (!process.versions.electron) return {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const elec = require('electron') as {
      app?: ElectronAppLike;
      safeStorage?: ElectronSafeStorageLike;
    };
    return elec || {};
  } catch {
    return {};
  }
}

export function getAppPath(name: 'userData' | 'documents'): string {
  if (name === 'userData' && process.env.OPS_VAULT_DATA_DIR) {
    return process.env.OPS_VAULT_DATA_DIR;
  }
  const { app } = loadElectronApis();
  if (app && typeof app.getPath === 'function') {
    return app.getPath(name);
  }
  if (name === 'userData') {
    const base =
      process.env.APPDATA ||
      path.join(os.homedir(), process.platform === 'win32' ? 'AppData/Roaming' : '.config');
    return path.join(base, 'ops-vault');
  }
  return path.join(os.homedir(), 'Documents');
}

function getOrCreateLocalKey(): Buffer {
  const userDataDir = getAppPath('userData');
  fs.mkdirSync(userDataDir, { recursive: true });
  const keyFile = path.join(userDataDir, '.vault-master.key');
  if (fs.existsSync(keyFile)) {
    const hex = fs.readFileSync(keyFile, 'utf8').trim();
    const buf = Buffer.from(hex, 'hex');
    if (buf.length === 32) return buf;
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, key.toString('hex'), { encoding: 'utf8', mode: 0o600 });
  return key;
}

export function isOsSafeStorageAvailable(): boolean {
  const { safeStorage } = loadElectronApis();
  return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
}

export function osProtectString(plain: string): Buffer | null {
  const { safeStorage } = loadElectronApis();
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plain);
  }
  return null;
}

export function osUnprotectBuffer(buf: Buffer): string {
  const { safeStorage } = loadElectronApis();
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new Error('当前运行环境无法解密系统 DPAPI 凭据，请在桌面窗口查看或重新设置密码');
  }
  return safeStorage.decryptString(buf);
}

export function localKeyEncrypt(plain: string): string {
  const key = getOrCreateLocalKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function localKeyDecrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('本地加密凭据格式无效');
  }
  const key = getOrCreateLocalKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final()
  ]).toString('utf8');
}
