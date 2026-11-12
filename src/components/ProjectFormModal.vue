<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { FolderOpen, X } from 'lucide-vue-next';
import type { Project } from '../../shared/types';

const props = defineProps<{
  open: boolean;
  project: Project | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [project: Project];
}>();

const saving = ref(false);
const errorMsg = ref('');

const form = reactive({
  id: '',
  name: '',
  description: '',
  repoUrl: '',
  localRepoPath: ''
});

watch(
  () => [props.open, props.project] as const,
  ([isOpen, p]) => {
    if (!isOpen) return;
    errorMsg.value = '';
    form.id = p?.id ?? '';
    form.name = p?.name ?? '';
    form.description = p?.description ?? '';
    form.repoUrl = p?.repoUrl ?? '';
    form.localRepoPath = p?.localRepoPath ?? '';
  },
  { immediate: true }
);

async function pickLocalRepo() {
  try {
    const dir = await window.opsVault.pickFolder();
    if (dir) form.localRepoPath = dir;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '选择文件夹失败';
  }
}

async function submit() {
  errorMsg.value = '';
  if (!form.name.trim()) {
    errorMsg.value = '请输入项目名称';
    return;
  }
  saving.value = true;
  try {
    const saved = await window.opsVault.saveProject({
      id: form.id || undefined,
      name: form.name.trim(),
      description: form.description,
      repoUrl: form.repoUrl,
      localRepoPath: form.localRepoPath
    });
    emit('saved', saved);
    emit('close');
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-panel" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3 class="modal-title">{{ form.id ? '编辑项目' : '新建项目' }}</h3>
        <button type="button" class="btn btn-icon" @click="emit('close')">
          <X :size="15" />
        </button>
      </div>

      <div class="modal-body">
        <div class="form-row">
          <label class="field-label">项目名称 *</label>
          <input v-model="form.name" class="field-input" placeholder="例如：核心网关 / 订单中台" />
        </div>
        <div class="form-row">
          <label class="field-label">项目说明</label>
          <textarea v-model="form.description" class="field-textarea" placeholder="架构简述、负责人、关键注意事项..." />
        </div>
        <div class="form-row">
          <label class="field-label">Git 仓库地址</label>
          <input v-model="form.repoUrl" class="field-input mono" placeholder="https://git.company.com/..." />
        </div>
        <div class="form-row">
          <label class="field-label">本机代码目录（支持一键打开）</label>
          <div style="display: flex; gap: 8px">
            <input v-model="form.localRepoPath" class="field-input mono" placeholder="E:\codes\my-project" />
            <button type="button" class="btn" @click="pickLocalRepo">
              <FolderOpen :size="14" />
              选择
            </button>
          </div>
        </div>
        <div v-if="errorMsg" class="err-box">{{ errorMsg }}</div>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn" @click="emit('close')">取消</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="submit">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-ink-2);
}

.err-box {
  padding: 9px 12px;
  border: 1px solid var(--color-prod-border);
  background: var(--color-prod-bg);
  color: var(--color-prod);
  border-radius: var(--radius-input);
  font-size: 13px;
  font-weight: 600;
}
</style>

