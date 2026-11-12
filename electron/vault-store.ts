import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import type {
  ExportOptions,
  ImportResult,
  Project,
  ProjectBundleData,
  ProjectCard,
  VaultState
} from '../shared/types';
import { buildOfflineHandoverHtml, buildProjectReadme } from './handover';
import { getAppPath } from './platform';

interface AppConfig {
  workspacePath?: string;
}

interface HandoverManifest {
  formatVersion: 2;
  exportedAt: string;
  bundle: ProjectBundleData;
}

interface LegacyProjectBundle {
  project: Project & { tags?: string[] };
  cards?: ProjectCard[];
  servers?: Array<{
    id: string;
    env: string;
    name: string;
    host: string;
    privateIp?: string;
    port: number;
    username: string;
    domain?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  scripts?: Array<{
    id: string;
    env: string;
    title: string;
    command: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  runbooks?: Array<{
    id: string;
    env: string;
    title: string;
    errorKeywords?: string;
    symptom?: string;
    resolution?: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function toSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii || `proj-${crypto.randomUUID().slice(0, 6)}`;
}

async function writeAtomic(filePath: string, content: string | Buffer): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${crypto.randomUUID().slice(0, 6)}.tmp`;
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, filePath);
}

function normalizeLegacyBundle(raw: LegacyProjectBundle): ProjectBundleData {
  const project: Project = {
    id: raw.project.id,
    slug: raw.project.slug,
    name: raw.project.name,
    description: raw.project.description || '',
    repoUrl: raw.project.repoUrl || '',
    localRepoPath: raw.project.localRepoPath || '',
    createdAt: raw.project.createdAt,
    updatedAt: raw.project.updatedAt
  };

  if (Array.isArray(raw.cards)) {
    return { project, cards: raw.cards };
  }

  // 自动兼容迁移旧版 servers / scripts / runbooks 为卡片
  const cards: ProjectCard[] = [];
  for (const s of raw.servers || []) {
    const lines = [
      `# [${s.env.toUpperCase()}] ${s.name}`,
      `ssh ${s.port && s.port !== 22 ? `-p ${s.port} ` : ''}${s.username}@${s.host}`,
      s.privateIp ? `内网 IP: ${s.privateIp}` : '',
      s.domain ? `域名: ${s.domain}` : '',
      s.notes || ''
    ].filter(Boolean);
    cards.push({
      id: s.id.startsWith('card_') ? s.id : `card_${s.id}`,
      projectId: project.id,
      title: `服务器 · ${s.name}`,
      language: 'bash',
      content: lines.join('\n'),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    });
  }
  for (const sc of raw.scripts || []) {
    cards.push({
      id: sc.id.startsWith('card_') ? sc.id : `card_${sc.id}`,
      projectId: project.id,
      title: sc.title,
      language: 'bash',
      content: sc.description ? `# ${sc.description}\n${sc.command}` : sc.command,
      createdAt: sc.createdAt,
      updatedAt: sc.updatedAt
    });
  }
  for (const rb of raw.runbooks || []) {
    const content = [
      rb.errorKeywords ? `关键词: ${rb.errorKeywords}` : '',
      rb.symptom ? `## 故障现象\n${rb.symptom}` : '',
      rb.resolution ? `## 排查与处理\n${rb.resolution}` : ''
    ]
      .filter(Boolean)
      .join('\n\n');
    cards.push({
      id: rb.id.startsWith('card_') ? rb.id : `card_${rb.id}`,
      projectId: project.id,
      title: `排障 · ${rb.title}`,
      language: 'markdown',
      content,
      createdAt: rb.createdAt,
      updatedAt: rb.updatedAt
    });
  }

  return { project, cards };
}

export class VaultStore {
  private configPath: string;
  private workspacePath: string;
  private isDefaultWorkspace = true;

  constructor() {
    this.configPath = path.join(getAppPath('userData'), 'config.json');
    const docsDir = getAppPath('documents');
    const deckDir = path.join(docsDir, 'OpsDeck');
    const legacyDir = path.join(docsDir, 'OpsVault');
    this.workspacePath =
      !fs.existsSync(deckDir) && fs.existsSync(legacyDir) ? legacyDir : deckDir;
  }

  async init(): Promise<void> {
    try {
      const raw = await fsp.readFile(this.configPath, 'utf8');
      const cfg = JSON.parse(raw) as AppConfig;
      if (cfg.workspacePath) {
        this.workspacePath = cfg.workspacePath;
        this.isDefaultWorkspace = false;
      }
    } catch {
      // 首次启动使用默认文档目录
    }
    await this.ensureWorkspaceInitialized();
  }

  getWorkspaceInfo(): { workspacePath: string; isDefault: boolean } {
    return {
      workspacePath: this.workspacePath,
      isDefault: this.isDefaultWorkspace
    };
  }

  async setWorkspacePath(newPath: string): Promise<void> {
    this.workspacePath = newPath;
    this.isDefaultWorkspace = false;
    await writeAtomic(
      this.configPath,
      JSON.stringify({ workspacePath: newPath } satisfies AppConfig, null, 2)
    );
    await this.ensureWorkspaceInitialized();
  }

  private projectsRoot(): string {
    return path.join(this.workspacePath, 'projects');
  }

  private projectDir(slug: string): string {
    return path.join(this.projectsRoot(), slug);
  }

  private projectJsonPath(slug: string): string {
    return path.join(this.projectDir(slug), 'project.json');
  }

  private async ensureWorkspaceInitialized(): Promise<void> {
    await fsp.mkdir(this.projectsRoot(), { recursive: true });
    await fsp.mkdir(path.join(this.workspacePath, 'backups'), { recursive: true });

    const metaPath = path.join(this.workspacePath, 'vault.meta.json');
    let metaExists = false;
    try {
      await fsp.access(metaPath);
      metaExists = true;
    } catch {
      metaExists = false;
    }

    if (!metaExists) {
      await writeAtomic(
        metaPath,
        JSON.stringify({ app: 'OpsDeck', schemaVersion: 2, createdAt: nowIso() }, null, 2)
      );
      const entries = await fsp.readdir(this.projectsRoot());
      if (entries.length === 0) {
        await this.seedStarterProject();
      }
    }
  }

  private async seedStarterProject(): Promise<void> {
    const now = nowIso();
    const project: Project = {
      id: 'proj_starter',
      slug: 'gateway-core',
      name: '示例项目 · 核心网关服务',
      description: '点击任意卡片即可用高亮编辑器修改或复制，右上角「新增卡片」随时记录。',
      repoUrl: 'https://git.internal.local/infra/gateway-core',
      localRepoPath: '',
      createdAt: now,
      updatedAt: now
    };

    const cards: ProjectCard[] = [
      {
        id: 'card_demo_ssh',
        projectId: project.id,
        title: '生产服务器连接信息',
        language: 'bash',
        content: [
          '# 线上主节点 (8C16G / Ubuntu 22.04)',
          'ssh -J bastion.internal.local -p 22 opsadmin@192.168.10.21',
          '# 内网 IP: 10.0.12.21 | 部署目录: /opt/gateway'
        ].join('\n'),
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'card_demo_deploy',
        projectId: project.id,
        title: '滚动发布与日志查看脚本',
        language: 'bash',
        content: [
          'cd /opt/gateway',
          'docker compose pull gateway',
          'docker compose up -d --remove-orphans',
          'docker compose ps',
          '',
          '# 实时查看最近 200 行错误日志',
          'docker logs -f --tail 200 gateway-core | grep -i ERROR'
        ].join('\n'),
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'card_demo_nginx',
        projectId: project.id,
        title: 'Nginx 反向代理核心配置',
        language: 'nginx',
        content: [
          'upstream gateway_backend {',
          '    server 127.0.0.1:8080 max_fails=3 fail_timeout=15s;',
          '    keepalive 64;',
          '}',
          '',
          'server {',
          '    listen 443 ssl http2;',
          '    server_name api.example.com;',
          '',
          '    location / {',
          '        proxy_pass http://gateway_backend;',
          '        proxy_http_version 1.1;',
          '        proxy_set_header Connection "";',
          '        proxy_set_header Host $host;',
          '        proxy_set_header X-Real-IP $remote_addr;',
          '    }',
          '}'
        ].join('\n'),
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'card_demo_502',
        projectId: project.id,
        title: '502 Bad Gateway 快速排查',
        language: 'bash',
        content: [
          '# 1. 检查后端容器是否发生 OOM 重启',
          'docker inspect --format="{{.State.OOMKilled}}" gateway-core',
          '',
          '# 2. 确认 Nginx keepalive_timeout >= 后端空闲超时 (65s)',
          '# 3. 临时扩容后端实例缓解峰值',
          'docker compose up -d --scale gateway=2'
        ].join('\n'),
        createdAt: now,
        updatedAt: now
      }
    ];

    await this.writeProjectBundle({ project, cards });
  }

  private async readAllBundles(): Promise<ProjectBundleData[]> {
    const root = this.projectsRoot();
    await fsp.mkdir(root, { recursive: true });
    const dirs = await fsp.readdir(root, { withFileTypes: true });
    const bundles: ProjectBundleData[] = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const jsonPath = path.join(root, d.name, 'project.json');
      try {
        const raw = await fsp.readFile(jsonPath, 'utf8');
        const parsed = JSON.parse(raw) as LegacyProjectBundle;
        bundles.push(normalizeLegacyBundle(parsed));
      } catch {
        // 忽略无效目录
      }
    }
    bundles.sort((a, b) => a.project.name.localeCompare(b.project.name, 'zh-CN'));
    return bundles;
  }

  private async writeProjectBundle(bundle: ProjectBundleData): Promise<void> {
    const dir = this.projectDir(bundle.project.slug);
    await fsp.mkdir(dir, { recursive: true });
    await writeAtomic(this.projectJsonPath(bundle.project.slug), JSON.stringify(bundle, null, 2));
    await writeAtomic(path.join(dir, 'README.md'), buildProjectReadme(bundle));
  }

  private async findBundleByProjectId(projectId: string): Promise<ProjectBundleData> {
    const all = await this.readAllBundles();
    const found = all.find((b) => b.project.id === projectId);
    if (!found) {
      throw new Error(`未找到项目 (${projectId})`);
    }
    return found;
  }

  async loadVault(): Promise<VaultState> {
    const bundles = await this.readAllBundles();
    const projects: Project[] = [];
    const cards: ProjectCard[] = [];

    for (const b of bundles) {
      projects.push(b.project);
      cards.push(...b.cards);
    }

    return {
      workspacePath: this.workspacePath,
      projects,
      cards
    };
  }

  async saveProject(input: Partial<Project> & { name: string }): Promise<Project> {
    const bundles = await this.readAllBundles();
    const now = nowIso();

    if (input.id) {
      const existing = bundles.find((b) => b.project.id === input.id);
      if (existing) {
        const updated: Project = {
          ...existing.project,
          name: input.name.trim(),
          description: input.description ?? existing.project.description,
          repoUrl: input.repoUrl ?? existing.project.repoUrl,
          localRepoPath: input.localRepoPath ?? existing.project.localRepoPath,
          updatedAt: now
        };
        existing.project = updated;
        await this.writeProjectBundle(existing);
        return updated;
      }
    }

    let slug = toSlug(input.slug || input.name);
    const existingSlugs = new Set(bundles.map((b) => b.project.slug));
    if (existingSlugs.has(slug)) {
      slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;
    }

    const project: Project = {
      id: newId('proj'),
      slug,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      repoUrl: input.repoUrl?.trim() ?? '',
      localRepoPath: input.localRepoPath?.trim() ?? '',
      createdAt: now,
      updatedAt: now
    };

    await this.writeProjectBundle({ project, cards: [] });
    return project;
  }

  async deleteProject(projectId: string): Promise<void> {
    const bundle = await this.findBundleByProjectId(projectId);
    await fsp.rm(this.projectDir(bundle.project.slug), { recursive: true, force: true });
  }

  async saveCard(
    input: Partial<ProjectCard> & { projectId: string; title: string; content: string }
  ): Promise<ProjectCard> {
    const bundle = await this.findBundleByProjectId(input.projectId);
    const now = nowIso();

    if (input.id) {
      const idx = bundle.cards.findIndex((c) => c.id === input.id);
      if (idx >= 0) {
        const prev = bundle.cards[idx];
        const updated: ProjectCard = {
          ...prev,
          title: input.title.trim(),
          language: input.language ?? prev.language,
          content: input.content,
          updatedAt: now
        };
        bundle.cards[idx] = updated;
        await this.writeProjectBundle(bundle);
        return updated;
      }
    }

    const created: ProjectCard = {
      id: newId('card'),
      projectId: input.projectId,
      title: input.title.trim(),
      language: input.language ?? 'bash',
      content: input.content,
      createdAt: now,
      updatedAt: now
    };
    bundle.cards.unshift(created);
    await this.writeProjectBundle(bundle);
    return created;
  }

  async deleteCard(cardId: string): Promise<void> {
    const bundles = await this.readAllBundles();
    for (const b of bundles) {
      const next = b.cards.filter((c) => c.id !== cardId);
      if (next.length !== b.cards.length) {
        b.cards = next;
        await this.writeProjectBundle(b);
        return;
      }
    }
  }

  async buildHandoverZipBuffer(
    options: ExportOptions
  ): Promise<{ buffer: Buffer; totalBytes: number; slug: string }> {
    const bundle = await this.findBundleByProjectId(options.projectId);
    const zip = new JSZip();

    const manifest: HandoverManifest = {
      formatVersion: 2,
      exportedAt: nowIso(),
      bundle
    };

    zip.file('ops-deck-bundle.json', JSON.stringify(manifest, null, 2));
    zip.file('README_交接总览.md', buildProjectReadme(bundle));

    if (options.includeOfflineHtml) {
      zip.file('handover.html', buildOfflineHandoverHtml(bundle));
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    return {
      buffer: zipBuffer,
      totalBytes: zipBuffer.byteLength,
      slug: bundle.project.slug
    };
  }

  async exportHandoverZip(
    options: ExportOptions,
    outputPath: string
  ): Promise<{ totalBytes: number }> {
    const { buffer, totalBytes } = await this.buildHandoverZipBuffer(options);
    await writeAtomic(outputPath, buffer);
    return { totalBytes };
  }

  async importHandoverBuffer(data: Buffer): Promise<ImportResult> {
    const zip = await JSZip.loadAsync(data);
    const manifestEntry =
      zip.file('ops-deck-bundle.json') ?? zip.file('ops-vault-bundle.json');
    if (!manifestEntry) {
      return { error: '该压缩包不是有效的 OpsDeck 交接包（缺少 ops-deck-bundle.json）' };
    }

    const parsed = JSON.parse(await manifestEntry.async('text')) as {
      bundle: LegacyProjectBundle;
    };
    const normalized = normalizeLegacyBundle(parsed.bundle);

    const existing = await this.readAllBundles();
    const existingSlugs = new Set(existing.map((b) => b.project.slug));
    let slug = toSlug(normalized.project.slug || normalized.project.name);
    if (existingSlugs.has(slug)) {
      slug = `${slug}-import-${crypto.randomUUID().slice(0, 4)}`;
    }

    const newProjectId = newId('proj');
    const now = nowIso();
    const project: Project = {
      ...normalized.project,
      id: newProjectId,
      slug,
      updatedAt: now
    };

    const cards: ProjectCard[] = normalized.cards.map((c) => ({
      ...c,
      id: newId('card'),
      projectId: newProjectId
    }));

    await this.writeProjectBundle({ project, cards });
    return {
      projectName: project.name,
      cardCount: cards.length
    };
  }

  async importHandoverZip(zipPath: string): Promise<ImportResult> {
    const data = await fsp.readFile(zipPath);
    return this.importHandoverBuffer(data);
  }

  async createBackupSnapshot(): Promise<{ path: string }> {
    const backupsDir = path.join(this.workspacePath, 'backups');
    await fsp.mkdir(backupsDir, { recursive: true });
    const zip = new JSZip();
    const bundles = await this.readAllBundles();

    for (const b of bundles) {
      const prefix = `projects/${b.project.slug}`;
      zip.file(`${prefix}/project.json`, JSON.stringify(b, null, 2));
      zip.file(`${prefix}/README.md`, buildProjectReadme(b));
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = path.join(backupsDir, `snapshot-${stamp}.zip`);
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await writeAtomic(outPath, buf);

    const files = (await fsp.readdir(backupsDir))
      .filter((f) => f.startsWith('snapshot-') && f.endsWith('.zip'))
      .sort()
      .reverse();
    for (const old of files.slice(20)) {
      await fsp.rm(path.join(backupsDir, old), { force: true });
    }

    return { path: outPath };
  }
}
