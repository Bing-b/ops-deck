import type { OpsVaultApi } from '../shared/types';

declare global {
  interface Window {
    opsVault: OpsVaultApi;
  }
}

export {};

