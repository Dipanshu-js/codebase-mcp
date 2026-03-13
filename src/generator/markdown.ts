import { ScanResult, FolderNode, ComponentInfo } from '../types';

// ── Main generator ────────────────────────────────────────────────────

export function generateMarkdown(result: ScanResult): string {
  const lines: string[] = [];
  const { meta, stack, structure, components, git, conventions, configs } = result;

  const date = new Date(result.scannedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── Header ──────────────────────────────────────────────────────
  lines.push(`## Project context`);
  lines.push(`Generated: ${date} by [codebase-mcp](https://github.com/yourusername/codebase-mcp)`);
  lines.push('');

  // ── Project ─────────────────────────────────────────────────────
  if (meta.description) {
    lines.push(`**${meta.name}** v${meta.version} — ${meta.description}`);
  } else {
    lines.push(`**${meta.name}** v${meta.version}`);
  }
  lines.push('');

  // ── Stack ────────────────────────────────────────────────────────
  lines.push('## Stack');

  const stackRows: string[] = [];
  if (stack.framework) {
    const ver = stack.frameworkVersion ? ` ${stack.frameworkVersion}` : '';
    stackRows.push(`- Framework: **${stack.framework}${ver}**`);
  }
  stackRows.push(`- Language: **${stack.language}**`);
  if (stack.runtime && stack.runtime !== 'Node.js') {
    stackRows.push(`- Runtime: **${stack.runtime}**`);
  }
  if (stack.buildTool) stackRows.push(`- Build: **${stack.buildTool}**`);
  if (stack.packageManager !== 'unknown') {
    stackRows.push(`- Package manager: **${stack.packageManager}**`);
  }
  if (stack.styling.length) stackRows.push(`- Styling: **${stack.styling.join(', ')}**`);
  if (stack.stateManagement.length) stackRows.push(`- State: **${stack.stateManagement.join(', ')}**`);
  if (stack.testing.length) stackRows.push(`- Testing: **${stack.testing.join(', ')}**`);
  if (stack.nodeVersion) stackRows.push(`- Node: **${stack.nodeVersion}**`);

  lines.push(...stackRows);
  lines.push('');

  // ── Tooling ──────────────────────────────────────────────────────
  const toolingItems: string[] = [];
  if (configs.hasEslint) toolingItems.push('ESLint');
  if (configs.hasPrettier) toolingItems.push('Prettier');
  if (configs.hasEditorConfig) toolingItems.push('EditorConfig');
  if (configs.hasDockerfile) toolingItems.push('Docker');
  if (configs.hasCIConfig && configs.ciPlatform) toolingItems.push(configs.ciPlatform);

  if (toolingItems.length) {
    lines.push(`## Tooling`);
    lines.push(toolingItems.join(' · '));
    lines.push('');
  }

  // ── Structure ────────────────────────────────────────────────────
  lines.push('## Structure');
  lines.push('```');
  lines.push(renderTree(structure));
  lines.push('```');
  lines.push('');

  // ── Components ──────────────────────────────────────────────────
  if (components.length > 0) {
    lines.push('## Components & modules');

    const byType = groupByType(components);
    const typeOrder: ComponentInfo['type'][] = [
      'page', 'layout', 'component', 'hook', 'store', 'api', 'util', 'type'
    ];
    const typeLabels: Record<ComponentInfo['type'], string> = {
      page: 'Pages', layout: 'Layouts', component: 'Components',
      hook: 'Hooks', store: 'State stores', api: 'API routes',
      util: 'Utilities', type: 'Types / interfaces',
    };

    for (const type of typeOrder) {
      const items = byType[type];
      if (!items || items.length === 0) continue;
      const names = items.map(c => c.name).join(', ');
      lines.push(`**${typeLabels[type]}** (${items.length}): ${names}`);
    }
    lines.push('');
  }

  // ── Conventions ──────────────────────────────────────────────────
  lines.push('## Conventions');

  const convLines: string[] = [];
  if (conventions.componentNaming !== 'unknown') {
    convLines.push(`- Components: **${conventions.componentNaming}**`);
  }
  if (conventions.fileNaming !== 'unknown') {
    convLines.push(`- Files: **${conventions.fileNaming}**`);
  }
  if (conventions.testCoLocation) {
    convLines.push(`- Tests: **co-located** alongside source files`);
  }
  if (conventions.barrelExports) {
    convLines.push(`- Barrel exports: **yes** (index.ts per folder)`);
  }
  if (conventions.pathAliases.length) {
    convLines.push(`- Path aliases: ${conventions.pathAliases.map(a => `\`${a}\``).join(', ')}`);
  }

  if (convLines.length === 0) convLines.push('- No strong conventions detected');
  lines.push(...convLines);
  lines.push('');

  // ── Git ──────────────────────────────────────────────────────────
  if (git) {
    lines.push('## Recent changes');
    lines.push(`Branch: **${git.branch}**${git.hasUncommitted ? ' (uncommitted changes)' : ''}`);
    if (git.recentCommits.length > 0) {
      lines.push('');
      git.recentCommits.slice(0, 10).forEach(msg => {
        lines.push(`- ${msg}`);
      });
    }
    lines.push('');
  }

  // ── Footer ───────────────────────────────────────────────────────
  lines.push('---');
  lines.push('*Generated by [codebase-mcp](https://github.com/yourusername/codebase-mcp) — paste this into any AI tool*');

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────

function renderTree(nodes: FolderNode[], prefix = '', isLast = false): string {
  const lines: string[] = [];

  nodes.forEach((node, index) => {
    const last = index === nodes.length - 1;
    const connector = last ? '└── ' : '├── ';
    const childPrefix = last ? '    ' : '│   ';

    if (node.type === 'dir') {
      const countStr = node.count !== undefined ? `  # ${node.count} files` : '';
      lines.push(`${prefix}${connector}${node.name}/${countStr}`);
      if (node.children && node.children.length > 0) {
        lines.push(renderTree(node.children, prefix + childPrefix));
      }
    } else {
      lines.push(`${prefix}${connector}${node.name}`);
    }
  });

  return lines.join('\n');
}

function groupByType(components: ComponentInfo[]): Partial<Record<ComponentInfo['type'], ComponentInfo[]>> {
  const groups: Partial<Record<ComponentInfo['type'], ComponentInfo[]>> = {};
  for (const c of components) {
    if (!groups[c.type]) groups[c.type] = [];
    groups[c.type]!.push(c);
  }
  return groups;
}
