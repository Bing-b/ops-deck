<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import MiniSearch from 'minisearch';
import { Copy, FileCode2, FolderGit2, Search } from 'lucide-vue-next';
import type { VaultState } from '../../shared/types';
import { languageLabel } from '../utils/highlight';

export interface PaletteTarget {
  kind: 'project' | 'card';
  id: string;
  projectId: string;
  projectName: string;
  badge?: string;
  title: string;
  subtitle: string;
  searchBlob: string;
  copyText?: string;
}

const props = defineProps<{
  open: boolean;
  vault: VaultState;
}>();

const emit = defineEmits<{
  close: [];
  navigate: [target: PaletteTarget];
  copy: [text: string, label: string];
}>();

const query = ref('');
const activeIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

const allItems = computed<PaletteTarget[]>(() => {
  const projectMap = new Map(props.vault.projects.map((p) => [p.id, p]));
  const list: PaletteTarget[] = [];

  for (const p of props.vault.projects) {
    list.push({
      kind: 'project',
      id: p.id,
      projectId: p.id,
      projectName: p.name,
      title: p.name,
      subtitle: p.description || p.slug,
      searchBlob: [
        p.name,
        p.slug,
        p.description,
        p.repoUrl,
        p.gitBranch,
        p.devIp,
        p.prodIp
      ].join(' ')
    });
  }

  for (const c of props.vault.cards) {
    const pName = projectMap.get(c.projectId)?.name ?? '';
    const firstLine = c.content.split(/\r?\n/).find((l) => l.trim()) || '';
    list.push({
      kind: 'card',
      id: c.id,
      projectId: c.projectId,
      projectName: pName,
      badge: languageLabel(c.language),
      title: c.title,
      subtitle: `${pName} · ${firstLine}`,
      searchBlob: [c.title, c.content, c.language, pName].join(' '),
      copyText: c.content
    });
  }

  return list;
});

const miniSearch = computed(() => {
  const ms = new MiniSearch<PaletteTarget>({
    fields: ['title', 'subtitle', 'searchBlob'],
    storeFields: ['id'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2
    }
  });
  ms.addAll(allItems.value);
  return ms;
});

const results = computed<PaletteTarget[]>(() => {
  const q = query.value.trim();
  if (!q) {
    return allItems.value.slice(0, 18);
  }
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const substringHits = new Set(
    allItems.value
      .filter((item) => {
        const hay = `${item.title} ${item.subtitle} ${item.searchBlob}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .map((i) => i.id)
  );

  const msHits = miniSearch.value.search(q).map((r) => String(r.id));
  const orderedIds = Array.from(new Set([...substringHits, ...msHits]));
  const map = new Map(allItems.value.map((i) => [i.id, i]));
  return orderedIds
    .map((id) => map.get(id))
    .filter((v): v is PaletteTarget => Boolean(v))
    .slice(0, 24);
});

watch(
  () => props.open,
  async (val) => {
    if (val) {
      query.value = '';
      activeIndex.value = 0;
      await nextTick();
      inputRef.value?.focus();
    }
  }
);

watch(results, () => {
  activeIndex.value = 0;
});

function handleKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (results.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % results.value.length;
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (results.value.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length;
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = results.value[activeIndex.value];
    if (target) {
      emit('navigate', target);
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-panel palette-panel" role="dialog" aria-modal="true" aria-label="全局快速检索">
      <div class="palette-search-bar">
        <Search :size="16" class="palette-icon" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          class="palette-input"
          placeholder="搜索项目、卡片标题、脚本内容、IP、关键词..."
        />
        <kbd class="kbd-hint">ESC</kbd>
      </div>

      <div class="palette-list">
        <div v-if="results.length === 0" class="palette-empty">
          未找到与「{{ query }}」匹配的项目或卡片
        </div>

        <div
          v-for="(item, idx) in results"
          :key="item.kind + item.id"
          role="button"
          tabindex="0"
          class="palette-row"
          :class="{ 'is-active': idx === activeIndex }"
          @mouseenter="activeIndex = idx"
          @click="emit('navigate', item)"
          @keydown.enter.prevent="emit('navigate', item)"
        >
          <span class="row-kind">
            <FolderGit2 v-if="item.kind === 'project'" :size="15" />
            <FileCode2 v-else :size="15" />
          </span>

          <div class="row-main">
            <div class="row-title">
              <span v-if="item.badge" class="badge">{{ item.badge }}</span>
              <span>{{ item.title }}</span>
            </div>
            <div class="row-sub mono">{{ item.subtitle }}</div>
          </div>

          <button
            v-if="item.copyText"
            type="button"
            class="btn btn-sm"
            title="直接复制"
            @click.stop="emit('copy', item.copyText!, item.title)"
          >
            <Copy :size="12" />
            复制
          </button>
        </div>
      </div>

      <div class="palette-foot">
        <span><kbd class="kbd-hint">↑↓</kbd> 选择</span>
        <span><kbd class="kbd-hint">Enter</kbd> 打开卡片</span>
        <span><kbd class="kbd-hint">Ctrl+K</kbd> 快速呼出</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-panel {
  max-width: 720px;
  max-height: 76vh;
}

.palette-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-paper);
}

.palette-icon {
  color: var(--color-accent);
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  outline: none;
}

.palette-list {
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.palette-empty {
  padding: 36px 16px;
  text-align: center;
  color: var(--color-ink-muted);
}

.palette-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border-radius: var(--radius-input);
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
}

.palette-row.is-active {
  background: var(--color-paper-2);
  border-color: var(--color-rule-strong);
}

.row-kind {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-rule);
  background: var(--color-paper);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-ink-2);
  flex-shrink: 0;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13.5px;
}

.row-sub {
  font-size: 11.5px;
  color: var(--color-ink-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.palette-foot {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--color-rule);
  background: var(--color-paper-2);
  font-size: 12px;
  color: var(--color-ink-muted);
}

.kbd-hint {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--color-rule);
  background: var(--color-paper);
  color: var(--color-ink-2);
}
</style>
