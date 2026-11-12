<script setup lang="ts">
import { AlertTriangle, X } from 'lucide-vue-next';

defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('cancel')">
    <div class="modal-panel confirm-panel" role="dialog" aria-modal="true" :aria-label="title">
      <div class="modal-head">
        <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px">
          <AlertTriangle v-if="danger" :size="16" style="color: var(--color-prod)" />
          {{ title }}
        </h3>
        <button type="button" class="btn btn-icon" @click="emit('cancel')">
          <X :size="15" />
        </button>
      </div>

      <div class="modal-body">
        <p class="confirm-msg">{{ message }}</p>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn" @click="emit('cancel')">取消</button>
        <button
          type="button"
          class="btn"
          :class="danger ? 'btn-danger' : 'btn-primary'"
          @click="emit('confirm')"
        >
          {{ confirmText || '确认' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-panel {
  max-width: 440px;
}

.confirm-msg {
  margin: 0;
  font-size: 13.5px;
  color: var(--color-ink-2);
  line-height: 1.6;
}
</style>

