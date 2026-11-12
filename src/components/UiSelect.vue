<script setup lang="ts" generic="T extends string = string">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}

const props = defineProps<{
  modelValue: T;
  options: SelectOption<T>[];
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: T];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const highlightedIndex = ref(-1);

const selectedOption = computed(() =>
  props.options.find((o) => o.value === props.modelValue)
);

function toggle() {
  open.value = !open.value;
  if (open.value) {
    const idx = props.options.findIndex((o) => o.value === props.modelValue);
    highlightedIndex.value = idx >= 0 ? idx : 0;
  }
}

function selectValue(val: T) {
  emit('update:modelValue', val);
  open.value = false;
}

function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open.value) {
      toggle();
      return;
    }
    const len = props.options.length;
    if (len === 0) return;
    highlightedIndex.value =
      e.key === 'ArrowDown'
        ? (highlightedIndex.value + 1) % len
        : (highlightedIndex.value - 1 + len) % len;
  } else if (e.key === 'Enter' || e.key === ' ') {
    if (open.value && highlightedIndex.value >= 0) {
      e.preventDefault();
      const opt = props.options[highlightedIndex.value];
      if (opt) selectValue(opt.value);
    }
  } else if (e.key === 'Escape' && open.value) {
    e.preventDefault();
    e.stopPropagation();
    open.value = false;
  }
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return;
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onDocClick);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocClick);
});
</script>

<template>
  <div ref="rootRef" class="ui-select">
    <button
      type="button"
      class="ui-select-trigger"
      :class="{ 'is-open': open }"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="ui-select-value">
        {{ selectedOption?.label || placeholder || '请选择' }}
      </span>
      <ChevronDown :size="14" class="ui-select-arrow" :class="{ 'is-rotated': open }" />
    </button>

    <div v-if="open" class="ui-select-menu" role="listbox">
      <button
        v-for="(opt, idx) in options"
        :key="opt.value"
        type="button"
        role="option"
        :aria-selected="opt.value === modelValue"
        class="ui-select-option"
        :class="{
          'is-selected': opt.value === modelValue,
          'is-highlighted': idx === highlightedIndex
        }"
        @mouseenter="highlightedIndex = idx"
        @click="selectValue(opt.value)"
      >
        <span>{{ opt.label }}</span>
        <Check v-if="opt.value === modelValue" :size="13" class="ui-select-check" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ui-select {
  position: relative;
  width: 100%;
}

.ui-select-trigger {
  width: 100%;
  height: var(--control-h);
  padding: 0 11px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-input);
  background: var(--color-paper);
  color: var(--color-ink);
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  outline: none;
  box-shadow: none;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.ui-select-trigger:hover {
  border-color: var(--color-accent);
  background: var(--color-paper);
}

.ui-select-trigger:focus,
.ui-select-trigger:focus-visible,
.ui-select-trigger.is-open {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--color-accent) 18%, transparent);
  background: var(--color-paper);
}

.ui-select-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-select-arrow {
  color: var(--color-ink-muted);
  flex-shrink: 0;
  transition: transform var(--dur-fast) var(--ease-out);
}

.ui-select-arrow.is-rotated {
  transform: rotate(180deg);
  color: var(--color-accent);
}

.ui-select-menu {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  right: 0;
  min-width: 150px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid var(--color-rule);
  background: var(--color-paper);
  box-shadow: var(--shadow-modal);
  z-index: 90;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ui-select-option {
  width: 100%;
  height: 32px;
  padding: 0 9px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-ink-2);
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  text-align: left;
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.ui-select-option.is-highlighted {
  background: var(--color-paper-3);
  color: var(--color-ink);
}

.ui-select-option.is-selected {
  background: var(--color-accent-bg);
  color: var(--color-accent);
  font-weight: 600;
}

.ui-select-check {
  color: var(--color-accent);
  flex-shrink: 0;
}
</style>
