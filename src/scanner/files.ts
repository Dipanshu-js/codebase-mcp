import * as fs from 'fs';
import * as path from 'path';
import glob from 'fast-glob';
import { FolderNode, ComponentInfo, ConventionInfo, ConfigFiles } from '../types';

// ── Directories to always skip ───────────────────────────────────────
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit',
  'dist', 'build', 'out', '.cache', '.turbo', 'coverage',
  '.nyc_output', 'storybook-static', '.vercel', '.netlify',
  '__pycache__', '.pytest_cache', 'vendor',
]);

// ── Component/module type detection ─────────────────────────────────
const TYPE_PATTERNS: Array<{ pattern: RegExp; type: ComponentInfo['type'] }> = [
  { pattern: /\/(pages|app)\//i,   type: 'page' },
  { pattern: /\/layouts?\//i,       type: 'layout' },
  { pattern: /\/hooks?\//i,         type: 'hook' },
  { pattern: /\/(stores?|state)\//i,type: 'store' },
  { pattern: /\/(utils?|helpers?|lib)\//i, type: 'util' },
  { pattern: /\/(api|routes?|server)\//i,  type: 'api' },
  { pattern: /\/(types?|interfaces?|models?)\//i, type: 'type' },
];

// ── Build folder tree (max 3 levels deep) ────────────────────────────
export function scanFolderTree(rootPath: string, depth = 0, maxDepth = 3): FolderNode[] {
  if (depth >= maxDepth) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FolderNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') && depth === 0) {
      // show dotfiles at root level (like .env.example)
    }
    if (entry.name.startsWith('.') && depth > 0) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;

    if (entry.isDirectory()) {
      const children = scanFolderTree(path.join(rootPath, entry.name), depth + 1, maxDepth);
      const fileCount = countFiles(path.join(rootPath, entry.name));
      nodes.push({ name: entry.name, type: 'dir', children, count: fileCount });
    } else if (depth <= 1) {
      // only show individual files at top 2 levels to keep output clean
      nodes.push({ name: entry.name, type: 'file' });
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function countFiles(dirPath: string): number {
  try {
    return fs.readdirSync(dirPath).filter(f => !f.startsWith('.')).length;
  } catch {
    return 0;
  }
}

// ── Component inventory ──────────────────────────────────────────────
export async function scanComponents(rootPath: string): Promise<ComponentInfo[]> {
  const patterns = [
    'src/**/*.{tsx,jsx,vue,svelte}',
    'app/**/*.{tsx,jsx}',
    'pages/**/*.{tsx,jsx}',
    'components/**/*.{tsx,jsx,vue,svelte}',
  ];

  let files: string[] = [];
  try {
    files = await glob(patterns, {
      cwd: rootPath,
      ignore: [...IGNORE_DIRS].map(d => `**/${d}/**`),
      absolute: false,
    });
  } catch {
    return [];
  }

  return files.map(filePath => {
    const name = extractComponentName(filePath);
    const type = detectComponentType(filePath);
    return { name, path: filePath, type };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function extractComponentName(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  // handle index files — use parent folder name
  if (base === 'index' || base === 'index.test') {
    return path.basename(path.dirname(filePath));
  }
  return base;
}

function detectComponentType(filePath: string): ComponentInfo['type'] {
  for (const { pattern, type } of TYPE_PATTERNS) {
    if (pattern.test(filePath)) return type;
  }
  return 'component';
}

// ── Naming convention detection ──────────────────────────────────────
export async function scanConventions(rootPath: string): Promise<ConventionInfo> {
  const tsxFiles = await glob('src/**/*.{tsx,jsx}', {
    cwd: rootPath,
    ignore: [...IGNORE_DIRS].map(d => `**/${d}/**`),
  }).catch(() => []);

  const tsFiles = await glob('src/**/*.{ts,js}', {
    cwd: rootPath,
    ignore: [...IGNORE_DIRS].map(d => `**/${d}/**`),
  }).catch(() => []);

  // Component naming — check file names
  const componentNaming = detectNamingConvention(
    tsxFiles.map(f => path.basename(f, path.extname(f)))
  );

  // File naming — check non-component files
  const fileNaming = detectNamingConvention(
    tsFiles.map(f => path.basename(f, path.extname(f)))
  );

  // Check for co-located tests
  const testFiles = await glob('src/**/*.{test,spec}.{ts,tsx,js,jsx}', {
    cwd: rootPath,
    ignore: [...IGNORE_DIRS].map(d => `**/${d}/**`),
  }).catch(() => []);

  const testCoLocation = testFiles.some(f => {
    const dir = path.dirname(f);
    const base = path.basename(f).replace(/\.(test|spec)\.(tsx?|jsx?)$/, '');
    const sourceExists = fs.existsSync(path.join(rootPath, dir, `${base}.tsx`))
                      || fs.existsSync(path.join(rootPath, dir, `${base}.ts`));
    return sourceExists;
  });

  // Barrel exports — check for index.ts files
  const indexFiles = await glob('src/**/index.{ts,tsx,js}', {
    cwd: rootPath,
    ignore: [...IGNORE_DIRS].map(d => `**/${d}/**`),
  }).catch(() => []);
  const barrelExports = indexFiles.length > 2;

  // Path aliases from tsconfig
  const pathAliases: string[] = [];
  try {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(rootPath, 'tsconfig.json'), 'utf8'));
    const paths = tsconfig.compilerOptions?.paths || {};
    for (const alias of Object.keys(paths)) {
      pathAliases.push(alias.replace('/*', ''));
    }
  } catch { /* no tsconfig or no paths */ }

  return { componentNaming, fileNaming, testCoLocation, barrelExports, pathAliases };
}

function detectNamingConvention(
  names: string[]
): ConventionInfo['componentNaming'] {
  if (names.length === 0) return 'unknown';

  let pascal = 0, kebab = 0, camel = 0;

  for (const name of names) {
    if (/^[A-Z][a-zA-Z0-9]+$/.test(name)) pascal++;
    else if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name)) kebab++;
    else if (/^[a-z][a-zA-Z0-9]+$/.test(name)) camel++;
  }

  const total = pascal + kebab + camel;
  if (total === 0) return 'unknown';

  const dominant = Math.max(pascal, kebab, camel);
  const dominance = dominant / total;

  if (dominance < 0.6) return 'mixed';
  if (dominant === pascal) return 'PascalCase';
  if (dominant === kebab) return 'kebab-case';
  return 'camelCase';
}

// ── Config file detection ────────────────────────────────────────────
export function scanConfigs(rootPath: string): ConfigFiles {
  const exists = (file: string) => fs.existsSync(path.join(rootPath, file));

  const hasEslint = exists('.eslintrc') || exists('.eslintrc.json')
                 || exists('.eslintrc.js') || exists('.eslintrc.cjs')
                 || exists('eslint.config.js') || exists('eslint.config.mjs');

  const hasPrettier = exists('.prettierrc') || exists('.prettierrc.json')
                   || exists('.prettierrc.js') || exists('prettier.config.js');

  const hasCIConfig = exists('.github/workflows')
                   || exists('.circleci/config.yml')
                   || exists('.travis.yml')
                   || exists('Jenkinsfile')
                   || exists('.gitlab-ci.yml');

  let ciPlatform: string | null = null;
  if (exists('.github/workflows'))    ciPlatform = 'GitHub Actions';
  else if (exists('.circleci'))       ciPlatform = 'CircleCI';
  else if (exists('.travis.yml'))     ciPlatform = 'Travis CI';
  else if (exists('.gitlab-ci.yml'))  ciPlatform = 'GitLab CI';

  return {
    hasEslint,
    hasPrettier,
    hasEditorConfig: exists('.editorconfig'),
    hasDotenv: exists('.env.example') || exists('.env.local') || exists('.env'),
    hasDockerfile: exists('Dockerfile') || exists('docker-compose.yml'),
    hasCIConfig,
    ciPlatform,
  };
}
