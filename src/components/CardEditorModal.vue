<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { nginx } from '@codemirror/legacy-modes/mode/nginx';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { Check, Copy, X } from 'lucide-vue-next';
import type { CardLanguage, ProjectCard } from '../../shared/types';
import { CARD_LANGUAGE_OPTIONS } from '../utils/highlight';
import UiSelect from './UiSelect.vue';

const props = defineProps<{
  open: boolean;
  projectId: string;
  card: ProjectCard | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [card: ProjectCard];
  copy: [text: string, label: string];
}>();

const title = ref('');
const language = ref<CardLanguage>('bash');
const content = ref('');
const saving = ref(false);
const errorMsg = ref('');
const copied = ref(false);

const titleInputRef = ref<HTMLInputElement | null>(null);
const editorHostRef = ref<HTMLDivElement | null>(null);

let view: EditorView | null = null;
const langCompartment = new Compartment();

function getLanguageExtension(lang: CardLanguage): Extension {
  switch (lang) {
    case 'bash':
      return StreamLanguage.define(shell);
    case 'nginx':
      return StreamLanguage.define(nginx);
    case 'yaml':
      return yaml();
    case 'json':
      return json();
    case 'sql':
      return sql();
    case 'javascript':
      return javascript({ typescript: true });
    case 'python':
      return python();
    case 'markdown':
      return markdown();
    case 'plaintext':
    default:
      return [];
  }
}

function destroyEditor() {
  if (view) {
    view.destroy();
    view = null;
  }
}

function mountEditor() {
  destroyEditor();
  if (!editorHostRef.value) return;

  const startState = EditorState.create({
    doc: content.value,
    extensions: [
      basicSetup,
      keymap.of([indentWithTab]),
      oneDark,
      langCompartment.of(getLanguageExtension(language.value)),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          content.value = update.state.doc.toString();
        }
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '13px',
          fontFamily: 'var(--font-mono)'
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.6'
        },
        '.cm-content': {
          padding: '10px 0'
        }
      })
    ]
  });

  view = new EditorView({
    state: startState,
    parent: editorHostRef.value
  });
}

watch(
  () => [props.open, props.card] as const,
  async ([isOpen, c]) => {
    if (!isOpen) {
      destroyEditor();
      return;
    }
    errorMsg.value = '';
    copied.value = false;
    title.value = c?.title ?? '';
    language.value = c?.language ?? 'bash';
    content.value = c?.content ?? '';

    await nextTick();
    mountEditor();
    if (!c) {
      titleInputRef.value?.focus();
    } else {
      view?.focus();
    }
  },
  { immediate: true }
);

watch(language, (nextLang) => {
  if (!view) return;
  view.dispatch({
    effects: langCompartment.reconfigure(getLanguageExtension(nextLang))
  });
});

onUnmounted(() => {
  destroyEditor();
});

function handleCopyAll() {
  const txt = view ? view.state.doc.toString() : content.value;
  emit('copy', txt, title.value || '脚本内容');
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1500);
}

async function submit() {
  errorMsg.value = '';
  const currentContent = view ? view.state.doc.toString() : content.value;
  if (!props.projectId) {
    errorMsg.value = '请先选择或新建一个项目';
    return;
  }
  if (!title.value.trim()) {
    errorMsg.value = '请输入卡片标题';
    titleInputRef.value?.focus();
    return;
  }
  if (!currentContent.trim()) {
    errorMsg.value = '请输入脚本或记录内容';
    view?.focus();
    return;
  }

  saving.value = true;
  try {
    const saved = await window.opsVault.saveCard({
      id: props.card?.id,
      projectId: props.projectId,
      title: title.value.trim(),
      language: language.value,
      content: currentContent
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
    <div class="modal-panel editor-modal" role="dialog" aria-modal="true" aria-label="脚本卡片编辑器">
      <div class="modal-head">
        <h3 class="modal-title">{{ card ? '编辑卡片' : '新增卡片' }}</h3>
        <button type="button" class="btn btn-icon" @click="emit('close')">
          <X :size="15" />
        </button>
      </div>

      <div class="modal-body editor-body">
        <div class="title-row">
          <input
            ref="titleInputRef"
            v-model="title"
            type="text"
            class="field-input"
            style="flex: 1; font-weight: 600"
            placeholder="输入卡片标题，例如：生产发布脚本 / Nginx 配置"
          />
          <UiSelect
            v-model="language"
            :options="CARD_LANGUAGE_OPTIONS"
            style="width: 154px; flex-shrink: 0"
          />
        </div>

        <div class="editor-shell">
          <div class="editor-toolbar">
            <span class="mono editor-hint">支持代码高亮 · Ctrl+C / Ctrl+V 复制粘贴 · Ctrl+Z 撤销</span>
            <button
              type="button"
              class="btn btn-sm"
              :class="{ 'is-success': copied }"
              @click="handleCopyAll"
            >
              <Check v-if="copied" :size="12" />
              <Copy v-else :size="12" />
              {{ copied ? '已复制' : '复制全文' }}
            </button>
          </div>
          <div ref="editorHostRef" class="cm-host"></div>
        </div>

        <div v-if="errorMsg" class="err-box">{{ errorMsg }}</div>
      </div>

      <div class="modal-foot">
        <button type="button" class="btn" @click="emit('close')">取消</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="submit">
          {{ saving ? '保存中...' : '保存卡片' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-modal {
  max-width: 820px;
  height: 78vh;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.editor-shell {
  flex: 1;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-code-border);
  border-radius: var(--radius-card);
  overflow: hidden;
  background: #282c34;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--color-code-bg);
  border-bottom: 1px solid var(--color-code-border);
}

.editor-hint {
  font-size: 11.5px;
  color: var(--color-code-muted);
}

.cm-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
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

