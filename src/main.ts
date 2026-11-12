import { createApp } from 'vue';
import './styles/tokens.css';
import './styles/main.css';
import { ensureOpsVaultBridge } from './api/bridge';
import App from './App.vue';

async function bootstrap() {
  try {
    const mode = await ensureOpsVaultBridge();
    (window as Window & { __OPS_VAULT_MODE__?: string }).__OPS_VAULT_MODE__ = mode;
    createApp(App).mount('#app');
  } catch (err) {
    console.error('[ops-deck] bootstrap failed:', err);
    const root = document.getElementById('app');
    if (root) {
      root.innerHTML = `<div style="padding:24px;font-family:system-ui,sans-serif;color:#b91c1c;">
        <h3 style="margin:0 0 8px">OpsDeck 启动失败</h3>
        <pre style="white-space:pre-wrap;font-size:13px">${err instanceof Error ? err.message : String(err)}</pre>
      </div>`;
    }
  }
}

void bootstrap();
