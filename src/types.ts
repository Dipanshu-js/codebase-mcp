// ── Core types shared across all ContextCraft modules ──────────────

export interface ProjectMeta {
  name: string;
  version: string;
  description: string;
  author: string;
}

export interface StackInfo {
  framework: string | null;
  frameworkVersion: string | null;
  language: 'TypeScript' | 'JavaScript' | 'Mixed';
  runtime: string | null;
  styling: string[];
  stateManagement: string[];
  testing: string[];
  buildTool: string | null;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';
  nodeVersion: string | null;
}

export interface FolderNode {
  name: string;
  type: 'file' | 'dir';
  children?: FolderNode[];
  count?: number; // for dirs: child file count
}

export interface ComponentInfo {
  name: string;
  path: string;
  type: 'component' | 'page' | 'layout' | 'hook' | 'util' | 'store' | 'api' | 'type';
}

export interface GitInfo {
  branch: string;
  recentCommits: string[];
  hasUncommitted: boolean;
  remoteUrl: string | null;
}

export interface ConventionInfo {
  componentNaming: 'PascalCase' | 'kebab-case' | 'camelCase' | 'mixed' | 'unknown';
  fileNaming: 'PascalCase' | 'kebab-case' | 'camelCase' | 'mixed' | 'unknown';
  testCoLocation: boolean;
  barrelExports: boolean;
  pathAliases: string[];
}

export interface ConfigFiles {
  hasEslint: boolean;
  hasPrettier: boolean;
  hasEditorConfig: boolean;
  hasDotenv: boolean;
  hasDockerfile: boolean;
  hasCIConfig: boolean;
  ciPlatform: string | null;
}

export interface ScanResult {
  meta: ProjectMeta;
  stack: StackInfo;
  structure: FolderNode[];
  components: ComponentInfo[];
  git: GitInfo | null;
  conventions: ConventionInfo;
  configs: ConfigFiles;
  scannedAt: string;
  rootPath: string;
}
