export type CardLanguage =
  | 'bash'
  | 'yaml'
  | 'json'
  | 'sql'
  | 'nginx'
  | 'javascript'
  | 'python'
  | 'markdown'
  | 'plaintext';

export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  repoUrl: string;
  localRepoPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCard {
  id: string;
  projectId: string;
  title: string;
  language: CardLanguage;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBundleData {
  project: Project;
  cards: ProjectCard[];
}

export interface VaultState {
  workspacePath: string;
  projects: Project[];
  cards: ProjectCard[];
}

export interface ExportOptions {
  projectId: string;
  includeOfflineHtml: boolean;
}

export interface ExportResult {
  canceled?: boolean;
  outputPath?: string;
  totalBytes?: number;
}

export interface ImportResult {
  canceled?: boolean;
  projectName?: string;
  cardCount?: number;
  error?: string;
}

export interface OpsVaultApi {
  getWorkspaceInfo: () => Promise<{ workspacePath: string; isDefault: boolean }>;
  selectWorkspace: () => Promise<{ canceled: boolean; workspacePath?: string }>;
  loadVault: () => Promise<VaultState>;
  saveProject: (input: Partial<Project> & { name: string }) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
  saveCard: (
    input: Partial<ProjectCard> & { projectId: string; title: string; content: string }
  ) => Promise<ProjectCard>;
  deleteCard: (cardId: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  openPath: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  exportHandover: (options: ExportOptions) => Promise<ExportResult>;
  importHandover: () => Promise<ImportResult>;
  createBackupSnapshot: () => Promise<{ path: string }>;
  pickFolder: () => Promise<string | null>;
  onOpenPalette: (cb: () => void) => () => void;
}
