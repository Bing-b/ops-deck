<script setup lang="ts">
import { Archive, FolderOpen, HardDrive, X } from 'lucide-vue-next';

defineProps<{
  open: boolean;
  workspacePath: string;
}>();

const emit = defineEmits<{
  close: [];
  pickWorkspace: [];
  openWorkspaceFolder: [];
  backup: [];
}>();
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-panel settings-panel" role="dialog" aria-modal="true" aria-label="数据与工作区设置">
      <div class="modal-head">
        <h3 class="modal-title">数据与工作区设置</h3>
        <button type="button" class="btn btn-icon" @click="emit('close')">
          <X :size="15" />
        </button>
      </div>

      <div class="modal-body">
        <div class="setting-block">
          <div class="setting-title">
            <HardDrive :size="14" />
            本地数据存放目录
          </div>
          <p class="setting-desc">
            所有项目与脚本卡片均以明文 JSON 与 Markdown 形式保存在此目录中，方便自主备份或同步。
          </p>
          <div class="path-box mono">{{ workspacePath || '未挂载' }}</div>
          <div class="setting-actions">
            <button type="button" class="btn btn-sm" @click="emit('openWorkspaceFolder')">
              <FolderOpen :size="13" />
              打开目录
            </button>
            <button type="button" class="btn btn-primary btn-sm" @click="emit('pickWorkspace')">
              切换存放目录
            </button>
          </div>
        </div>

        <div class="setting-block">
          <div class="setting-title">
            <Archive :size="14" />
            工作区快照备份
          </div>
          <p class="setting-desc">
            将当前全部项目与卡片打包为时间戳 <code class="mono">.zip</code> 快照，保存在工作区的 <code class="mono">backups/</code> 目录（自动保留最近 20 份）。
          </p>
          <div class="setting-actions">
            <button type="button" class="btn btn-sm" @click="emit('backup')">
              <Archive :size="13" />
              立即生成快照备份
            </button>
          </div>
        </div>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  max-width: 520px;
}

.setting-block {
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-card);
  padding: 12px 14px;
  background: var(--color-paper-2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 13.5px;
}

.setting-desc {
  margin: 0;
  font-size: 12.5px;
  color: var(--color-ink-2);
  line-height: 1.5;
}

.path-box {
  padding: 8px 10px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-input);
  background: var(--color-paper);
  font-size: 12px;
  word-break: break-all;
}

.setting-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>

