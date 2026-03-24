import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let statusBarItem: vscode.StatusBarItem;
let watchProcess: ReturnType<typeof execFile> | null = null;

export function activate(context: vscode.ExtensionContext) {
  // ── Status bar ──────────────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'codebase-mcp.generate';
  updateStatusBar('idle');

  const cfg = vscode.workspace.getConfiguration('codebase-mcp');
  if (cfg.get<boolean>('showStatusBar', true)) {
    statusBarItem.show();
  }

  context.subscriptions.push(statusBarItem);

  // ── Commands ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('codebase-mcp.generate', () => runGenerate(false)),
    vscode.commands.registerCommand('codebase-mcp.generateAndCopy', () => runGenerate(true)),
    vscode.commands.registerCommand('codebase-mcp.watch', startWatch),
    vscode.commands.registerCommand('codebase-mcp.stopWatch', stopWatch),
    vscode.commands.registerCommand('codebase-mcp.stats', runStats),
  );

  // ── Auto-watch on startup ────────────────────────────────────────────
  if (cfg.get<boolean>('autoWatch', false)) {
    startWatch();
  }
}

export function deactivate() {
  stopWatch();
}

// ── Helpers ───────────────────────────────────────────────────────────

function getProjectRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getCbmcpBin(): string {
  const root = getProjectRoot();
  if (root) {
    const local = path.join(root, 'node_modules', '.bin', 'codebase-mcp');
    if (fs.existsSync(local)) return local;
  }
  return 'codebase-mcp'; // fall back to global
}

function updateStatusBar(state: 'idle' | 'running' | 'watching' | 'error') {
  const icons: Record<typeof state, string> = {
    idle:     '$(file-code) cbmcp',
    running:  '$(sync~spin) cbmcp',
    watching: '$(eye) cbmcp watching',
    error:    '$(error) cbmcp',
  };
  statusBarItem.text = icons[state];
  statusBarItem.tooltip = 'codebase-mcp — click to regenerate context';
}

function runGenerate(copy: boolean) {
  const root = getProjectRoot();
  if (!root) return vscode.window.showWarningMessage('codebase-mcp: No workspace folder open.');

  const cfg = vscode.workspace.getConfiguration('codebase-mcp');
  const output = cfg.get<string>('outputFile', 'CONTEXT.md');
  const template = cfg.get<string>('templatePath', '');

  const args = ['generate', '--path', root, '--output', output];
  if (copy) args.push('--copy');
  if (template) args.push('--template', template);

  updateStatusBar('running');

  const bin = getCbmcpBin();

  execFile(bin, args, { cwd: root }, (err, stdout, stderr) => {
    if (err) {
      updateStatusBar('error');
      vscode.window.showErrorMessage(`codebase-mcp failed: ${stderr || err.message}`);
      return;
    }
    updateStatusBar('idle');
    const msg = copy ? `CONTEXT.md generated and copied to clipboard` : `CONTEXT.md generated`;
    vscode.window.showInformationMessage(`codebase-mcp: ${msg}`);
  });
}

function startWatch() {
  if (watchProcess) {
    vscode.window.showInformationMessage('codebase-mcp: Watch mode already running.');
    return;
  }

  const root = getProjectRoot();
  if (!root) return vscode.window.showWarningMessage('codebase-mcp: No workspace folder open.');

  const cfg = vscode.workspace.getConfiguration('codebase-mcp');
  const output = cfg.get<string>('outputFile', 'CONTEXT.md');
  const bin = getCbmcpBin();

  watchProcess = execFile(bin, ['watch', '--path', root, '--output', output], { cwd: root });

  updateStatusBar('watching');
  vscode.window.showInformationMessage('codebase-mcp: Watch mode started — CONTEXT.md will auto-update.');
}

function stopWatch() {
  if (!watchProcess) return;
  watchProcess.kill();
  watchProcess = null;
  updateStatusBar('idle');
  vscode.window.showInformationMessage('codebase-mcp: Watch mode stopped.');
}

function runStats() {
  const root = getProjectRoot();
  if (!root) return vscode.window.showWarningMessage('codebase-mcp: No workspace folder open.');

  const bin = getCbmcpBin();
  const channel = vscode.window.createOutputChannel('codebase-mcp stats');

  execFile(bin, ['stats', '--path', root], { cwd: root }, (err, stdout) => {
    if (err) {
      vscode.window.showErrorMessage('codebase-mcp: Stats command failed.');
      return;
    }
    // Strip ANSI colour codes for the output channel
    channel.clear();
    channel.appendLine(stdout.replace(/\x1b\[[0-9;]*m/g, ''));
    channel.show();
  });
}
