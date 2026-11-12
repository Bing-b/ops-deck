<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import {
  Archive,
  Check,
  Copy,
  Download,
  Edit3,
  FileCode2,
  FolderGit2,
  FolderOpen,
  HardDrive,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload
} from 'lucide-vue-next';
import type { Project, ProjectCard, VaultState } from '../shared/types';
import CardEditorModal from './components/CardEditorModal.vue';
import CommandPaletteModal, { type PaletteTarget } from './components/CommandPaletteModal.vue';
import ConfirmModal from './components/ConfirmModal.vue';
import ExportImportModal from './components/ExportImportModal.vue';
import ProjectFormModal from './components/ProjectFormModal.vue';
import { highlightCodeHtml } from './utils/highlight';

const hasBridge = ref(typeof window !== 'undefined' && Boolean(window.opsVault));

const vault = ref<VaultState>({
  workspacePath: '',
  projects: [],
  cards: []
});

const theme = ref<'light' | 'dark'>(
  (localStorage.getItem('ops-vault-theme') as 'light' | 'dark') || 'light'
);
const selectedProjectId = ref<string>('');

// Modals
const paletteOpen = ref(false);
const projectModalOpen = ref(false);
const editingProject = ref<Project | null>(null);
const cardModalOpen = ref(false);
const editingCard = ref<ProjectCard | null>(null);
const transferMode = ref<'export' | 'import' | null>(null);

const confirmState = reactive<{
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  danger: boolean;
  action: (() => Promise<void>) | null;
}>({
  open: false,
  title: '',
  message: '',
  confirmText: '确认删除',
  danger: true,
  action: null
});

const copiedCardId = ref<string>('');
const toast = ref<{ text: string; tone: 'ok' | 'warn' | 'err' } | null>(null);
let toastTimer: number | null = null;
let offPaletteListener: (() => void) | null = null;

function showToast(text: string, tone: 'ok' | 'warn' | 'err' = 'ok') {
  toast.value = { text, tone };
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = null;
  }, 3600);
}

function ensureBridge(): boolean {
  if (!window.opsVault) {
    showToast('当前未连接本地工作区服务，请运行 pnpm run serve 或 pnpm run start', 'err');
    return false;
  }
  return true;
}

function applyTheme(next: 'light' | 'dark') {
  theme.value = next;
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ops-vault-theme', next);
}

function toggleTheme() {
  const next = theme.value === 'light' ? 'dark' : 'light';
  applyTheme(next);
  showToast(next === 'dark' ? '已切换至高对比暗黑模式' : '已切换至高对比亮色模式');
}

async function refreshVault(preferProjectId?: string) {
  if (!ensureBridge()) return;
  try {
    const data = await window.opsVault.loadVault();
    vault.value = data;
    if (preferProjectId && data.projects.some((p) => p.id === preferProjectId)) {
      selectedProjectId.value = preferProjectId;
    } else if (
      !selectedProjectId.value ||
      !data.projects.some((p) => p.id === selectedProjectId.value)
    ) {
      selectedProjectId.value = data.projects[0]?.id ?? '';
    }
  } catch (err) {
    showToast(err instanceof Error ? `读取工作区失败：${err.message}` : '读取工作区失败', 'err');
  }
}

const activeProject = computed(
  () => vault.value.projects.find((p) => p.id === selectedProjectId.value) ?? null
);

const projectCards = computed(() =>
  vault.value.cards.filter((c) => c.projectId === selectedProjectId.value)
);

function cardCountForProject(projectId: string): number {
  return vault.value.cards.filter((c) => c.projectId === projectId).length;
}

function lineCount(content: string): number {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

async function copyText(text: string, label: string, cardId?: string) {
  try {
    if (window.opsVault) {
      await window.opsVault.copyText(text);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    if (cardId) {
      copiedCardId.value = cardId;
      window.setTimeout(() => {
        if (copiedCardId.value === cardId) copiedCardId.value = '';
      }, 1400);
    }
    showToast(`已复制：${label}`);
  } catch (err) {
    showToast(err instanceof Error ? `复制失败：${err.message}` : '复制失败', 'err');
  }
}

async function pickWorkspaceDir() {
  if (!ensureBridge()) return;
  try {
    const res = await window.opsVault.selectWorkspace();
    if (!res.canceled) {
      await refreshVault();
      showToast(`工作区已切换至：${res.workspacePath}`);
    }
  } catch (err) {
    showToast(err instanceof Error ? `切换工作区失败：${err.message}` : '切换工作区失败', 'err');
  }
}

async function handleBackup() {
  if (!ensureBridge()) return;
  try {
    const res = await window.opsVault.createBackupSnapshot();
    showToast(`已生成本地快照备份：${res.path}`);
  } catch (err) {
    showToast(err instanceof Error ? `备份失败：${err.message}` : '快照备份失败', 'err');
  }
}

async function openLocalPath(target: string) {
  if (!ensureBridge()) return;
  try {
    const res = await window.opsVault.openPath(target);
    if (!res.ok && res.error) {
      showToast(res.error, 'err');
    }
  } catch (err) {
    showToast(err instanceof Error ? `打开路径失败：${err.message}` : '打开路径失败', 'err');
  }
}

function askConfirm(opts: {
  title: string;
  message: string;
  action: () => Promise<void>;
}) {
  confirmState.title = opts.title;
  confirmState.message = opts.message;
  confirmState.confirmText = '确认删除';
  confirmState.danger = true;
  confirmState.action = opts.action;
  confirmState.open = true;
}

async function runConfirmAction() {
  const fn = confirmState.action;
  confirmState.open = false;
  confirmState.action = null;
  if (!fn) return;
  try {
    await fn();
  } catch (err) {
    showToast(err instanceof Error ? `操作失败：${err.message}` : '操作失败', 'err');
  }
}

function removeProject(p: Project) {
  if (!ensureBridge()) return;
  askConfirm({
    title: '删除项目',
    message: `确定删除项目「${p.name}」及其全部记录卡片吗？此操作不可撤销。`,
    action: async () => {
      await window.opsVault.deleteProject(p.id);
      await refreshVault();
      showToast(`已删除项目：${p.name}`, 'warn');
    }
  });
}

function removeCard(card: ProjectCard) {
  if (!ensureBridge()) return;
  askConfirm({
    title: '删除卡片',
    message: `确定删除卡片「${card.title}」吗？`,
    action: async () => {
      await window.opsVault.deleteCard(card.id);
      await refreshVault(selectedProjectId.value);
      showToast(`已删除卡片：${card.title}`, 'warn');
    }
  });
}

function openNewProject() {
  if (!ensureBridge()) return;
  editingProject.value = null;
  projectModalOpen.value = true;
}

function openEditProject(p: Project) {
  if (!ensureBridge()) return;
  editingProject.value = p;
  projectModalOpen.value = true;
}

function openNewCard() {
  if (!ensureBridge() || !activeProject.value) return;
  editingCard.value = null;
  cardModalOpen.value = true;
}

function openEditCard(card: ProjectCard) {
  if (!ensureBridge()) return;
  editingCard.value = card;
  cardModalOpen.value = true;
}

async function onProjectSaved(proj: Project) {
  await refreshVault(proj.id);
  showToast(`已保存项目「${proj.name}」`);
}

async function onCardSaved(card: ProjectCard) {
  await refreshVault(card.projectId);
  showToast(`已保存卡片「${card.title}」`);
}

function handlePaletteNavigate(target: PaletteTarget) {
  selectedProjectId.value = target.projectId;
  paletteOpen.value = false;
  if (target.kind === 'card') {
    const found = vault.value.cards.find((c) => c.id === target.id);
    if (found) {
      openEditCard(found);
    }
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    paletteOpen.value = !paletteOpen.value;
  }
}

onMounted(async () => {
  applyTheme(theme.value);
  if (hasBridge.value) {
    await refreshVault();
    offPaletteListener = window.opsVault.onOpenPalette(() => {
      paletteOpen.value = true;
    });
  }
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  if (offPaletteListener) offPaletteListener();
});
</script>

<template>
  <div class="app-shell">
    <!-- Top Instrument Bar -->
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">OD</span>
        <div>
          <div class="brand-name">OpsDeck</div>
          <div class="brand-sub">项目资料与脚本卡片</div>
        </div>
      </div>

      <button type="button" class="search-trigger" @click="paletteOpen = true">
        <Search :size="14" />
        <span>搜索项目、卡片标题、脚本内容、IP...</span>
        <kbd class="kbd mono">Ctrl+K</kbd>
      </button>

      <div class="topbar-actions">
        <button
          type="button"
          class="btn btn-sm"
          :title="`当前本地工作区：${vault.workspacePath || '未挂载'}（点击切换目录）`"
          @click="pickWorkspaceDir"
        >
          <HardDrive :size="13" />
          <span class="ws-path mono">{{ vault.workspacePath || '选择工作区' }}</span>
        </button>

        <button type="button" class="btn btn-sm" @click="transferMode = 'import'">
          <Upload :size="13" />
          导入交接包
        </button>

        <button type="button" class="btn btn-sm" title="立即创建工作区快照" @click="handleBackup">
          <Archive :size="13" />
          快照备份
        </button>

        <button type="button" class="btn btn-icon" title="切换高对比亮色/暗黑模式" @click="toggleTheme">
          <Moon v-if="theme === 'light'" :size="15" />
          <Sun v-else :size="15" />
        </button>

        <button type="button" class="btn btn-primary btn-sm" @click="openNewProject">
          <Plus :size="14" />
          新建项目
        </button>
      </div>
    </header>

    <div v-if="!hasBridge" class="bridge-banner">
      未检测到本地工作区服务。请在项目目录执行 <code class="mono">pnpm run serve</code> 或 <code class="mono">pnpm run start</code> 启动。
    </div>

    <!-- Main Workbench -->
    <div class="workbench">
      <!-- Left Rail -->
      <aside class="sidebar">
        <div class="rail-header mono">项目列表 ({{ vault.projects.length }})</div>

        <div class="project-list">
          <button
            v-for="p in vault.projects"
            :key="p.id"
            type="button"
            class="project-item"
            :class="{ 'is-selected': p.id === selectedProjectId }"
            @click="selectedProjectId = p.id"
          >
            <div class="project-item-title">{{ p.name }}</div>
            <div class="project-item-meta mono">
              <span>{{ cardCountForProject(p.id) }} 张卡片</span>
            </div>
          </button>

          <div v-if="vault.projects.length === 0" class="empty-rail">
            暂无项目，点击右上角「新建项目」
          </div>
        </div>
      </aside>

      <!-- Right Cards Waterfall -->
      <main class="content-pane">
        <div v-if="!activeProject" class="empty-stage">
          <FolderGit2 :size="36" />
          <h2>还没有选中项目</h2>
          <p>点击右上角「新建项目」，或直接导入同事的交接包 (.zip)。</p>
          <button type="button" class="btn btn-primary" @click="openNewProject">
            <Plus :size="15" />
            创建第一个项目
          </button>
        </div>

        <template v-else>
          <!-- Project Header -->
          <section class="proj-header">
            <div class="proj-title-block">
              <div class="proj-title-row">
                <h1 class="proj-title">{{ activeProject.name }}</h1>
                <span class="badge mono">{{ activeProject.slug }}</span>
              </div>
              <p v-if="activeProject.description" class="proj-desc">
                {{ activeProject.description }}
              </p>
              <div v-if="activeProject.repoUrl || activeProject.localRepoPath" class="proj-links mono">
                <span v-if="activeProject.repoUrl">代码仓库：{{ activeProject.repoUrl }}</span>
                <button
                  v-if="activeProject.localRepoPath"
                  type="button"
                  class="link-btn mono"
                  @click="openLocalPath(activeProject.localRepoPath)"
                >
                  <FolderOpen :size="12" />
                  {{ activeProject.localRepoPath }}
                </button>
              </div>
            </div>

            <div class="proj-actions">
              <button type="button" class="btn btn-primary btn-sm" @click="openNewCard">
                <Plus :size="14" />
                新增卡片
              </button>
              <button type="button" class="btn btn-sm" @click="transferMode = 'export'">
                <Download :size="14" />
                导出交接包
              </button>
              <button type="button" class="btn btn-sm" @click="openEditProject(activeProject)">
                <Edit3 :size="13" />
                编辑项目
              </button>
              <button
                type="button"
                class="btn btn-danger btn-sm"
                title="删除项目"
                @click="removeProject(activeProject)"
              >
                <Trash2 :size="13" />
              </button>
            </div>
          </section>

          <!-- Masonry Waterfall Grid -->
          <div class="cards-scroll">
            <div v-if="projectCards.length === 0" class="empty-cards">
              <FileCode2 :size="32" />
              <div>当前项目还没有记录卡片</div>
              <button type="button" class="btn btn-primary btn-sm" @click="openNewCard">
                <Plus :size="14" />
                新增第一张脚本卡片
              </button>
            </div>

            <div v-else class="masonry-waterfall">
              <article
                v-for="card in projectCards"
                :key="card.id"
                class="masonry-card"
                @click="openEditCard(card)"
              >
                <div class="card-head">
                  <div class="card-title-wrap">
                    <h3 class="card-title">{{ card.title }}</h3>
                  </div>
                  <div class="card-actions" @click.stop>
                    <button
                      type="button"
                      class="btn btn-sm"
                      :class="{ 'is-success': copiedCardId === card.id }"
                      title="复制脚本内容"
                      @click="copyText(card.content, card.title, card.id)"
                    >
                      <Check v-if="copiedCardId === card.id" :size="12" />
                      <Copy v-else :size="12" />
                      {{ copiedCardId === card.id ? '已复制' : '复制' }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-icon btn-danger"
                      title="删除卡片"
                      @click="removeCard(card)"
                    >
                      <Trash2 :size="13" />
                    </button>
                  </div>
                </div>

                <div
                  class="code-preview-wrap"
                  :class="{ 'is-tall': lineCount(card.content) > 11 }"
                >
                  <pre class="code-preview hljs"><code v-html="highlightCodeHtml(card.content, card.language)"></code></pre>
                  <div v-if="lineCount(card.content) > 11" class="fade-cap mono">
                    共 {{ lineCount(card.content) }} 行 · 点击查看全文
                  </div>
                </div>
              </article>
            </div>
          </div>
        </template>
      </main>
    </div>

    <!-- Modals -->
    <CommandPaletteModal
      :open="paletteOpen"
      :vault="vault"
      @close="paletteOpen = false"
      @navigate="handlePaletteNavigate"
      @copy="(txt, lbl) => copyText(txt, lbl)"
    />

    <ProjectFormModal
      :open="projectModalOpen"
      :project="editingProject"
      @close="projectModalOpen = false"
      @saved="onProjectSaved"
    />

    <CardEditorModal
      :open="cardModalOpen"
      :project-id="selectedProjectId"
      :card="editingCard"
      @close="cardModalOpen = false"
      @saved="onCardSaved"
      @copy="(txt, lbl) => copyText(txt, lbl)"
    />

    <ExportImportModal
      :mode="transferMode"
      :project="activeProject"
      @close="transferMode = null"
      @exported="(msg) => showToast(msg)"
      @imported="(msg) => { refreshVault(); showToast(msg); }"
    />

    <ConfirmModal
      :open="confirmState.open"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-text="confirmState.confirmText"
      :danger="confirmState.danger"
      @cancel="confirmState.open = false"
      @confirm="runConfirmAction"
    />

    <!-- Toast -->
    <div v-if="toast" class="toast" :class="`toast-${toast.tone}`">
      {{ toast.text }}
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-paper);
}

.topbar {
  height: 52px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-paper);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  background: var(--color-ink);
  color: var(--color-paper);
  font-family: var(--font-mono);
  font-weight: 800;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.brand-name {
  font-weight: 800;
  font-size: 14px;
  line-height: 1.1;
}

.brand-sub {
  font-size: 10.5px;
  color: var(--color-ink-muted);
}

.search-trigger {
  flex: 1;
  min-width: 150px;
  max-width: 420px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-input);
  background: var(--color-paper-2);
  color: var(--color-ink-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12.5px;
}

.search-trigger:hover {
  border-color: var(--color-rule-strong);
  color: var(--color-ink);
}

.search-trigger span {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kbd {
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid var(--color-rule);
  border-radius: 4px;
  background: var(--color-paper);
  color: var(--color-ink-2);
  flex-shrink: 0;
}

.topbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ws-path {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11.5px;
}

.bridge-banner {
  padding: 9px 16px;
  border-bottom: 1px solid var(--color-prod-border);
  background: var(--color-prod-bg);
  color: var(--color-prod);
  font-size: 13px;
  font-weight: 600;
}

.workbench {
  flex: 1;
  min-height: 0;
  display: flex;
}

.sidebar {
  width: 248px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-rule);
  background: var(--color-paper-2);
  display: flex;
  flex-direction: column;
}

.rail-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-rule);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--color-ink-muted);
}

.project-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.project-item {
  width: 100%;
  text-align: left;
  padding: 10px 11px;
  border-radius: var(--radius-card);
  border: 1px solid var(--color-rule);
  border-left: 3px solid transparent;
  background: var(--color-paper);
  cursor: pointer;
}

.project-item:hover {
  border-color: var(--color-rule-strong);
}

.project-item.is-selected {
  border-color: var(--color-rule-strong);
  border-left-color: var(--color-accent);
}

.project-item-title {
  font-weight: 700;
  font-size: 13.5px;
}

.project-item-meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-ink-muted);
}

.empty-rail {
  padding: 24px 12px;
  text-align: center;
  color: var(--color-ink-muted);
  font-size: 12.5px;
}

.content-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-paper);
}

.empty-stage {
  margin: auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--color-ink-2);
}

.proj-header {
  padding: 16px 22px;
  border-bottom: 1px solid var(--color-rule);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.proj-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.proj-title {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.proj-desc {
  margin: 5px 0 0;
  font-size: 13px;
  color: var(--color-ink-2);
}

.proj-links {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 11.5px;
  color: var(--color-ink-muted);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 11.5px;
}

.link-btn:hover {
  text-decoration: underline;
}

.proj-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.cards-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px 48px;
  background: var(--color-paper-2);
}

.empty-cards {
  padding: 56px 20px;
  border: 1.5px dashed var(--color-rule-strong);
  border-radius: var(--radius-card);
  background: var(--color-paper);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--color-ink-muted);
}

/* Xiaohongshu-style responsive masonry waterfall */
.masonry-waterfall {
  column-width: 320px;
  column-gap: 14px;
}

.masonry-card {
  break-inside: avoid;
  margin-bottom: 14px;
  min-height: 120px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper);
  padding: 12px 13px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.masonry-card:hover {
  border-color: var(--color-accent);
  transform: translateY(-1px);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.card-title-wrap {
  min-width: 0;
  flex: 1;
}

.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  word-break: break-word;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.code-preview-wrap {
  position: relative;
  min-height: 58px;
  max-height: 250px;
  overflow: hidden;
  border-radius: var(--radius-card);
  border: 1px solid var(--color-code-border);
  background: var(--color-code-bg);
}

.code-preview {
  margin: 0;
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.58;
  color: var(--color-code-ink);
  white-space: pre-wrap;
  word-break: break-word;
}

.code-preview code {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.code-preview-wrap.is-tall .code-preview {
  padding-bottom: 28px;
}

.fade-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 10px 5px;
  background: linear-gradient(to bottom, transparent, var(--color-code-bg) 55%);
  color: var(--color-code-muted);
  font-size: 11px;
  text-align: right;
}

.toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  padding: 10px 14px;
  border-radius: var(--radius-input);
  border: 1px solid var(--color-ink);
  background: var(--color-ink);
  color: var(--color-paper);
  font-size: 13px;
  font-weight: 600;
  z-index: 80;
  max-width: 520px;
  word-break: break-all;
}

.toast-warn {
  border-color: var(--color-warn);
  background: var(--color-warn);
  color: #fff;
}

.toast-err {
  border-color: var(--color-prod);
  background: var(--color-prod);
  color: #fff;
}
</style>
