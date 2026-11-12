<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
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
  gitBranch: '',
  devIp: '',
  prodIp: ''
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
    form.gitBranch = p?.gitBranch ?? '';
    form.devIp = p?.devIp ?? '';
    form.prodIp = p?.prodIp ?? '';
  },
  { immediate: true }
);

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
      gitBranch: form.gitBranch,
      devIp: form.devIp,
      prodIp: form.prodIp
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
          <input v-model="form.name" class="field-input" placeholder="例如：核心网关 / 图平台" />
        </div>

        <div class="form-row">
          <label class="field-label">说明</label>
          <textarea v-model="form.description" class="field-textarea" placeholder="项目简介或关键注意事项..." />
        </div>

        <div class="git-row">
          <div class="form-row">
            <label class="field-label">Git 地址</label>
            <input v-model="form.repoUrl" class="field-input mono" placeholder="https://git.company.com/team/app.git" />
          </div>
          <div class="form-row">
            <label class="field-label">分支</label>
            <input v-model="form.gitBranch" class="field-input mono" placeholder="main / v5.7" />
          </div>
        </div>

        <div class="two-col">
          <div class="form-row">
            <label class="field-label">Dev 环境</label>
            <input v-model="form.devIp" class="field-input mono" placeholder="192.168.10.105" />
          </div>
          <div class="form-row">
            <label class="field-label">生产环境</label>
            <input v-model="form.prodIp" class="field-input mono" placeholder="192.168.10.21" />
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

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.git-row {
  display: grid;
  grid-template-columns: 1fr 150px;
  gap: 10px;
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
