import { createApp } from 'vue';
import './styles/tokens.css';
import './styles/main.css';
import { ensureOpsVaultBridge } from './api/bridge';
import App from './App.vue';

async function bootstrap() {
  const mode = await ensureOpsVaultBridge();
  (window as Window & { __OPS_VAULT_MODE__?: string }).__OPS_VAULT_MODE__ = mode;
  createApp(App).mount('#app');
}

void bootstrap();
