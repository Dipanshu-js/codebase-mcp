import * as fs from 'fs';
import { ScanResult, ComponentInfo } from '../types';

// ── Template variable map ─────────────────────────────────────────────
// Supports {{variable}} placeholders in user-supplied template files.

export function renderTemplate(templatePath: string, result: ScanResult): string {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  return applyTemplate(template, result);
}

export function applyTemplate(template: string, result: ScanResult): string {
  const { meta, stack, structure, components, git, conventions, configs } = result;

  const date = new Date(result.scannedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── Component groups ──────────────────────────────────────────────
  const byType = groupByType(components);
  const componentSummary = Object.entries(byType)
    .map(([type, items]) => `${capitalize(type)}s (${items.length}): ${items.map(c => c.name).join(', ')}`)
    .join('\n');

  // ── Folder tree (flat lines) ──────────────────────────────────────
  const structureLines: string[] = [];
  function flatTree(nodes: any[], prefix = '') {
    nodes.forEach((node, i) => {
      const last = i === nodes.length - 1;
      structureLines.push(`${prefix}${last ? '└── ' : '├── '}${node.name}${node.type === 'dir' ? '/' : ''}`);
      if (node.children?.length) flatTree(node.children, prefix + (last ? '    ' : '│   '));
    });
  }
  flatTree(structure);

  // ── Tooling list ──────────────────────────────────────────────────
  const tools: string[] = [];
  if (configs.hasEslint) tools.push('ESLint');
  if (configs.hasPrettier) tools.push('Prettier');
  if (configs.hasEditorConfig) tools.push('EditorConfig');
  if (configs.hasDockerfile) tools.push('Docker');
  if (configs.hasCIConfig && configs.ciPlatform) tools.push(configs.ciPlatform);

  const vars: Record<string, string> = {
    project_name: meta.name,
    project_version: meta.version,
    project_description: meta.description || '',
    author: meta.author || '',
    date,
    framework: stack.framework || 'none',
    framework_version: stack.frameworkVersion || '',
    language: stack.language,
    runtime: stack.runtime || 'Node.js',
    build_tool: stack.buildTool || '',
    package_manager: stack.packageManager,
    styling: stack.styling.join(', '),
    state_management: stack.stateManagement.join(', '),
    testing: stack.testing.join(', '),
    node_version: stack.nodeVersion || '',
    tooling: tools.join(', '),
    structure: structureLines.join('\n'),
    components: componentSummary,
    component_count: String(components.length),
    component_naming: conventions.componentNaming,
    file_naming: conventions.fileNaming,
    test_colocation: conventions.testCoLocation ? 'yes' : 'no',
    barrel_exports: conventions.barrelExports ? 'yes' : 'no',
    path_aliases: conventions.pathAliases.join(', '),
    git_branch: git?.branch || '',
    git_dirty: git?.hasUncommitted ? 'yes' : 'no',
    recent_commits: git?.recentCommits.slice(0, 10).map(m => `- ${m}`).join('\n') || '',
    remote_url: git?.remoteUrl || '',
    scanned_at: result.scannedAt,
    root_path: result.rootPath,
  };

  // Replace {{var}} and {{ var }} (with optional spaces)
  return template.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`;
  });
}

function groupByType(components: ComponentInfo[]): Record<string, ComponentInfo[]> {
  const groups: Record<string, ComponentInfo[]> = {};
  for (const c of components) {
    if (!groups[c.type]) groups[c.type] = [];
    groups[c.type].push(c);
  }
  return groups;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
