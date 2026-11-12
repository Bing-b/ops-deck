<script setup lang="ts">
import { ref, watch } from 'vue';
import { Download, Upload, X } from 'lucide-vue-next';
import type { Project } from '../../shared/types';

const props = defineProps<{
  mode: 'export' | 'import' | null;
  project: Project | null;
}>();

const emit = defineEmits<{
  close: [];
  exported: [message: string];
  imported: [message: string];
}>();

const includeOfflineHtml = ref(true);
const busy = ref(false);
const errorMsg = ref('');

watch(
  () => props.mode,
  () => {
    includeOfflineHtml.value = true;
    busy.value = false;
    errorMsg.value = '';
  }
);

async function runExport() {
  if (!props.project) return;
  errorMsg.value = '';
  busy.value = true;
  try {
    const res = await window.opsVault.exportHandover({
      projectId: props.project.id,
      includeOfflineHtml: includeOfflineHtml.value
    });
    if (res.canceled) return;
    emit('exported', `交接包已导出 → ${res.outputPath}`);
    emit('close');
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function runImport() {
  errorMsg.value = '';
  busy.value = true;
  try {
    const res = await window.opsVault.importHandover();
    if (res.canceled) return;
    if (res.error) {
      errorMsg.value = res.error;
      return;
    }
    emit('imported', `已导入项目「${res.projectName}」（含 ${res.cardCount ?? 0} 张卡片）`);
    emit('close');
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="mode" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-panel" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3 class="modal-title">
          {{ mode === 'export' ? `导出工作交接包 · ${project?.name ?? ''}` : '导入 OpsDeck 工作交接包' }}
        </h3>
        <button type="button" class="btn btn-icon" @click="emit('close')">
          <X :size="15" />
        </button>
      </div>

      <div v-if="mode === 'export'" class="modal-body">
        <div class="info-box">
          将导出包含 <code class="mono">README_交接总览.md</code> 与结构化数据 <code class="mono">ops-deck-bundle.json</code> 的压缩包，方便发送给接手同事直接查阅或整包导入。
        </div>
        <label class="check-row">
          <input v-model="includeOfflineHtml" type="checkbox" />
          <span>同时生成独立离线 <code class="mono">handover.html</code>（浏览器双击即搜即看，无需安装软件）</span>
        </label>
        <div v-if="errorMsg" class="err-box">{{ errorMsg }}</div>
      </div>

      <div v-else class="modal-body">
        <div class="info-box">
          支持导入由 OpsDeck 导出的 <code class="mono">.zip</code> 交接包，将自动还原项目及全部脚本卡片至当前工作区。
        </div>
        <div v-if="errorMsg" class="err-box">{{ errorMsg }}</div>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn" @click="emit('close')">取消</button>
        <button
          v-if="mode === 'export'"
          type="button"
          class="btn btn-primary"
          :class="{ 'is-loading': busy }"
          :disabled="busy"
          @click="runExport"
        >
          <Download :size="14" />
          {{ busy ? '正在打包...' : '导出交接包 (.zip)' }}
        </button>
        <button
          v-else
          type="button"
          class="btn btn-primary"
          :class="{ 'is-loading': busy }"
          :disabled="busy"
          @click="runImport"
        >
          <Upload :size="14" />
          {{ busy ? '正在导入...' : '选择交接包 (.zip)' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.info-box {
  padding: 12px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-input);
  background: var(--color-paper-2);
  font-size: 13px;
  color: var(--color-ink-2);
}

.err-box {
  padding: 10px 12px;
  border: 1px solid var(--color-prod-border);
  background: var(--color-prod-bg);
  color: var(--color-prod);
  border-radius: var(--radius-input);
  font-size: 13px;
  font-weight: 600;
}
</style>
