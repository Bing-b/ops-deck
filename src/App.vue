<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import {
  Check,
  Copy,
  Download,
  Edit3,
  FileCode2,
  FolderGit2,
  GitBranch,
  Moon,
  Plus,
  Search,
  Settings,
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
import SettingsModal from './components/SettingsModal.vue';
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
const settingsOpen = ref(false);
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

async function openWorkspaceDir() {
  if (!ensureBridge() || !vault.value.workspacePath) return;
  try {
    const res = await window.opsVault.openPath(vault.value.workspacePath);
    if (!res.ok && res.error) {
      showToast(res.error, 'err');
    }
  } catch (err) {
    showToast(err instanceof Error ? `打开目录失败：${err.message}` : '打开目录失败', 'err');
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
  const idx = vault.value.projects.findIndex((p) => p.id === proj.id);
  if (idx >= 0) {
    vault.value.projects[idx] = proj;
  } else {
    vault.value.projects.push(proj);
  }
  selectedProjectId.value = proj.id;
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
      <div class="brand" aria-label="OpsDeck">
        <svg
          class="brand-mark"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M21.2 9.2A9.6 9.6 0 1 0 21.2 22.8"
            stroke="currentColor"
            stroke-width="3.2"
            stroke-linecap="round"
          />
          <path
            d="M12.5 21.5L25.5 7.5"
            stroke="currentColor"
            stroke-width="2.9"
            stroke-linecap="round"
          />
          <path
            d="M19.5 22L27.5 13.5"
            stroke="var(--color-accent)"
            stroke-width="2.9"
            stroke-linecap="round"
          />
        </svg>
        <div class="brand-lockup">
          <div class="brand-name">Ops<span class="brand-name-deck">Deck</span></div>
          <div class="brand-sub">项目资料与脚本卡片</div>
        </div>
      </div>

      <button type="button" class="search-trigger" @click="paletteOpen = true">
        <Search :size="14" />
        <span>搜索项目、卡片标题、脚本内容、IP...</span>
        <kbd class="kbd mono">Ctrl+K</kbd>
      </button>

      <div class="topbar-actions">
        <button type="button" class="btn btn-sm" @click="transferMode = 'import'">
          <Upload :size="13" />
          导入交接包
        </button>

        <button type="button" class="btn btn-icon btn-sm" title="切换高对比亮色/暗黑模式" @click="toggleTheme">
          <Moon v-if="theme === 'light'" :size="15" />
          <Sun v-else :size="15" />
        </button>

        <button
          type="button"
          class="btn btn-icon btn-sm"
          title="数据与工作区设置"
          @click="settingsOpen = true"
        >
          <Settings :size="15" />
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
            <div class="proj-header-top">
              <div class="proj-title-block">
                <h1 class="proj-title">{{ activeProject.name }}</h1>
                <p v-if="activeProject.description" class="proj-desc">
                  {{ activeProject.description }}
                </p>
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
                  class="btn btn-danger btn-icon btn-sm"
                  title="删除项目"
                  @click="removeProject(activeProject)"
                >
                  <Trash2 :size="13" />
                </button>
              </div>
            </div>

            <div class="spec-strip mono">
              <div class="spec-cell">
                <span class="meta-k">GIT REPOSITORY · 仓库与分支</span>
                <div class="info-values">
                  <template v-if="activeProject.repoUrl">
                    <span class="meta-v">{{ activeProject.repoUrl }}</span>
                    <button
                      type="button"
                      class="inline-copy"
                      title="复制 Git 地址"
                      @click="copyText(activeProject.repoUrl, 'Git 地址')"
                    >
                      <Copy :size="11" />
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    class="empty-val"
                    @click="openEditProject(activeProject)"
                  >
                    地址未配置
                  </button>
                  <span class="sep">/</span>
                  <span v-if="activeProject.gitBranch" class="branch-tag">
                    <GitBranch :size="11" />
                    {{ activeProject.gitBranch }}
                  </span>
                  <button
                    v-else
                    type="button"
                    class="empty-val"
                    @click="openEditProject(activeProject)"
                  >
                    分支未配置
                  </button>
                </div>
              </div>

              <div class="spec-cell">
                <span class="meta-k">DEV · 开发环境</span>
                <div class="info-values">
                  <template v-if="activeProject.devIp">
                    <span class="meta-v">{{ activeProject.devIp }}</span>
                    <button
                      type="button"
                      class="inline-copy"
                      title="复制开发环境 IP"
                      @click="copyText(activeProject.devIp, '开发环境 IP')"
                    >
                      <Copy :size="11" />
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    class="empty-val"
                    @click="openEditProject(activeProject)"
                  >
                    未配置
                  </button>
                </div>
              </div>

              <div class="spec-cell">
                <span class="meta-k">PROD · 生产环境</span>
                <div class="info-values">
                  <template v-if="activeProject.prodIp">
                    <span class="meta-v">{{ activeProject.prodIp }}</span>
                    <button
                      type="button"
                      class="inline-copy"
                      title="复制生产环境 IP"
                      @click="copyText(activeProject.prodIp, '生产环境 IP')"
                    >
                      <Copy :size="11" />
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    class="empty-val"
                    @click="openEditProject(activeProject)"
                  >
                    未配置
                  </button>
                </div>
              </div>
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
                      class="btn btn-icon btn-sm"
                      :class="{ 'is-success': copiedCardId === card.id }"
                      :title="copiedCardId === card.id ? '已复制' : '复制脚本内容'"
                      @click="copyText(card.content, card.title, card.id)"
                    >
                      <Check v-if="copiedCardId === card.id" :size="13" />
                      <Copy v-else :size="13" />
                    </button>
                    <button
                      type="button"
                      class="btn btn-icon btn-sm btn-danger"
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

    <SettingsModal
      :open="settingsOpen"
      :workspace-path="vault.workspacePath"
      @close="settingsOpen = false"
      @pick-workspace="pickWorkspaceDir"
      @open-workspace-folder="openWorkspaceDir"
      @backup="handleBackup"
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
  background: var(--color-paper-2);
}

.topbar {
  height: 54px;
  padding: 0 18px;
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-toolbar);
  backdrop-filter: saturate(180%) blur(16px);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}

.brand-mark {
  width: 28px;
  height: 28px;
  color: var(--color-ink);
  flex-shrink: 0;
}

.brand-lockup {
  display: flex;
  flex-direction: column;
}

.brand-name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.025em;
  line-height: 1.15;
  color: var(--color-ink);
}

.brand-name-deck {
  color: var(--color-accent);
  font-weight: 700;
}

.brand-sub {
  font-size: 11px;
  color: var(--color-ink-muted);
}

.search-trigger {
  flex: 1;
  min-width: 160px;
  max-width: 420px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-input);
  background: var(--color-paper-2);
  color: var(--color-ink-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12.5px;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.search-trigger:hover {
  border-color: var(--color-rule-strong);
  background: var(--color-paper);
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
  font-size: 10.5px;
  padding: 2px 7px;
  border: 1px solid var(--color-rule);
  border-radius: 999px;
  background: var(--color-paper-2);
  color: var(--color-ink-2);
  flex-shrink: 0;
}

.topbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.bridge-banner {
  padding: 9px 18px;
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
  padding: 14px 16px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-ink-muted);
}

.project-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-item {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: var(--radius-input);
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  background: transparent;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.project-item:hover {
  background: var(--color-paper-3);
}

.project-item.is-selected {
  background: var(--color-accent-bg);
  border-color: oklch(86% 0.05 264);
  border-left-color: var(--color-accent);
}

.project-item.is-selected .project-item-title {
  color: var(--color-accent);
}

.project-item-title {
  font-weight: 600;
  font-size: 13.5px;
  letter-spacing: -0.01em;
}

.project-item-meta {
  margin-top: 3px;
  font-size: 11.5px;
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
  background: var(--color-paper-2);
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
  padding: 20px 28px 18px;
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-paper);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.proj-header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.proj-title-block {
  flex: 1;
  min-width: 0;
}

.proj-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.25;
}

.proj-desc {
  margin: 6px 0 0;
  font-size: 13.5px;
  color: var(--color-ink-2);
  line-height: 1.55;
}

.spec-strip {
  display: grid;
  grid-template-columns: 1.65fr 1fr 1fr;
  border: 1px solid var(--color-rule);
  border-radius: 10px;
  background: var(--color-paper-2);
  overflow: hidden;
}

.spec-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  font-size: 12px;
  min-width: 0;
  border-right: 1px solid var(--color-rule);
}

.spec-cell:last-child {
  border-right: none;
}

@media (max-width: 1120px) {
  .spec-strip {
    grid-template-columns: 1fr;
  }
  .spec-cell {
    border-right: none;
    border-bottom: 1px solid var(--color-rule);
  }
  .spec-cell:last-child {
    border-bottom: none;
  }
}

.info-values {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.meta-k {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--color-ink-muted);
  letter-spacing: 0.03em;
}

.meta-v {
  font-weight: 600;
  color: var(--color-ink);
  word-break: break-all;
}

.sep {
  color: var(--color-ink-muted);
}

.empty-val {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 11.5px;
  color: var(--color-ink-muted);
  cursor: pointer;
}

.empty-val:hover {
  color: var(--color-accent);
  text-decoration: underline;
}

.branch-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--color-accent);
  background: var(--color-accent-bg);
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 600;
}

.inline-copy {
  border: 1px solid var(--color-rule);
  background: var(--color-paper);
  border-radius: 5px;
  padding: 2px 5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  color: var(--color-ink-2);
  box-shadow: var(--shadow-btn);
}

.inline-copy:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
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
  padding: 20px 24px 48px;
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

/* Xiaohongshu-style responsive masonry waterfall with Apple tactile cards */
.masonry-waterfall {
  column-width: 320px;
  column-gap: 16px;
}

.masonry-card {
  break-inside: avoid;
  margin-bottom: 16px;
  min-height: 120px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper);
  padding: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: var(--shadow-card);
  transition:
    border-color var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.masonry-card:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-2px);
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
  letter-spacing: -0.01em;
  line-height: 1.4;
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
  border-radius: var(--radius-code);
  border: 1px solid var(--color-code-border);
  background: var(--color-code-bg);
  box-shadow: inset 0 1px 0 oklch(100% 0 0 / 0.04);
}

.code-preview {
  margin: 0;
  padding: 11px 13px;
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
  padding: 14px 10px 6px;
  background: linear-gradient(to bottom, transparent, var(--color-code-bg) 58%);
  color: var(--color-code-muted);
  font-size: 11px;
  text-align: right;
}

.toast {
  position: fixed;
  right: 22px;
  bottom: 22px;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid oklch(100% 0 0 / 0.12);
  background: oklch(18% 0.014 256 / 0.94);
  backdrop-filter: blur(12px);
  color: #f8fafc;
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--shadow-modal);
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
