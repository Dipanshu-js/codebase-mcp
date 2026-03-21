#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { scan } from './scanner';
import { generateMarkdown } from './generator/markdown';
import { renderTemplate } from './generator/template';
import { scanMonorepo, generateMonorepoMarkdown } from './scanner/monorepo';
import { syncToClaudeProject, resolveSyncOptions } from './commands/sync';
import { startMcpServer } from './mcp/server';

const program = new Command();

// ── ASCII header ──────────────────────────────────────────────────────
function printBanner() {
  console.log('');
  console.log(chalk.cyan.bold('  ╔════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.yellow.bold('  codebase-mcp  ') + chalk.gray('v2.5.0              ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.gray('  Your codebase → AI-ready context      ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╚════════════════════════════════════════╝'));
  console.log('');
}

// ── Main generate command ─────────────────────────────────────────────
program
  .name('codebase-mcp')
  .description('Auto-generate AI-ready context from your codebase — works with any LLM, agent, or MCP tool')
  .version('2.5.0')
  .alias('cbmcp');

program
  .command('generate', { isDefault: true })
  .description('Scan codebase and generate CONTEXT.md')
  .option('-p, --path <path>', 'path to project root', process.cwd())
  .option('-o, --output <file>', 'output file path', 'CONTEXT.md')
  .option('-c, --copy', 'copy output to clipboard', false)
  .option('--print', 'print to stdout instead of writing file', false)
  .option('--no-git', 'skip git history scan')
  .option('--no-components', 'skip component inventory')
  .option('-t, --template <path>', 'use a custom template file (supports {{variable}} placeholders)')
  .option('--monorepo', 'force monorepo mode — scan all workspace packages', false)
  .action(async (options) => {
    printBanner();

    const rootPath = path.resolve(options.path);

    if (!fs.existsSync(rootPath)) {
      console.error(chalk.red(`✗ Path not found: ${rootPath}`));
      process.exit(1);
    }

    const spinner = ora({
      text: chalk.gray('Scanning project...'),
      spinner: 'dots',
    }).start();

    try {
      // ── Monorepo mode ───────────────────────────────────────────
      if (options.monorepo) {
        spinner.text = chalk.gray('Detecting workspace packages...');
        const mono = await scanMonorepo(rootPath);

        if (!mono) {
          spinner.fail(chalk.red('No workspace packages found. Is this a monorepo?'));
          process.exit(1);
        }

        spinner.succeed(chalk.green(`Found ${mono.packages.length} packages`));

        const markdown = generateMonorepoMarkdown(mono);

        if (options.print) {
          console.log('\n' + chalk.gray('─'.repeat(60)) + '\n');
          console.log(markdown);
          return;
        }

        const outputPath = path.resolve(options.output);
        fs.writeFileSync(outputPath, markdown, 'utf8');
        console.log('');
        console.log(chalk.green(`  ✓ Monorepo context written to `) + chalk.bold(options.output));

        if (options.copy) {
          try {
            const clipboardy = require('clipboardy');
            await clipboardy.default.write(markdown);
            console.log(chalk.green('  ✓ Copied to clipboard'));
          } catch {
            console.log(chalk.yellow('  ⚠ Clipboard copy failed — paste from file'));
          }
        }
        console.log('');
        return;
      }

      // ── Run scan ────────────────────────────────────────────────
      spinner.text = chalk.gray('Reading package.json and detecting stack...');
      const result = await scan(rootPath);

      spinner.text = chalk.gray('Analysing components and conventions...');
      await new Promise(r => setTimeout(r, 100)); // let spinner render

      spinner.text = chalk.gray('Generating CONTEXT.md...');
      let markdown: string;
      if (options.template) {
        markdown = renderTemplate(path.resolve(options.template), result);
      } else {
        markdown = generateMarkdown(result);
      }

      spinner.succeed(chalk.green('Scan complete'));
      console.log('');

      // ── Print summary ────────────────────────────────────────────
      printSummary(result);

      // ── Output ───────────────────────────────────────────────────
      if (options.print) {
        console.log('\n' + chalk.gray('─'.repeat(60)) + '\n');
        console.log(markdown);
        return;
      }

      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, markdown, 'utf8');
      console.log('');
      console.log(chalk.green(`  ✓ Written to `) + chalk.bold(options.output));

      // ── Clipboard ────────────────────────────────────────────────
      if (options.copy) {
        try {
          const clipboardy = require('clipboardy');
          await clipboardy.default.write(markdown);
          console.log(chalk.green('  ✓ Copied to clipboard'));
        } catch {
          console.log(chalk.yellow('  ⚠ Clipboard copy failed — paste from file'));
        }
      }

      console.log('');
      console.log(chalk.gray('  Paste CONTEXT.md at the start of any AI session.'));
      console.log(chalk.gray('  Re-run anytime your stack or structure changes.'));
      console.log('');

    } catch (err: any) {
      spinner.fail(chalk.red('Scan failed'));
      console.error(chalk.red(err?.message || String(err)));
      process.exit(1);
    }
  });

// ── Watch command ─────────────────────────────────────────────────────
program
  .command('watch')
  .description('Watch for changes and auto-regenerate CONTEXT.md')
  .option('-p, --path <path>', 'path to project root', process.cwd())
  .option('-o, --output <file>', 'output file path', 'CONTEXT.md')
  .action(async (options) => {
    printBanner();
    const rootPath = path.resolve(options.path);

    console.log(chalk.cyan('  Watching for changes... (Ctrl+C to stop)\n'));

    const regenerate = async () => {
      const spinner = ora({ text: 'Regenerating...', spinner: 'dots' }).start();
      try {
        const result = await scan(rootPath);
        const markdown = generateMarkdown(result);
        fs.writeFileSync(path.resolve(options.output), markdown, 'utf8');
        spinner.succeed(chalk.green(`CONTEXT.md updated — ${new Date().toLocaleTimeString()}`));
      } catch (err: any) {
        spinner.fail(chalk.red('Regeneration failed: ' + err?.message));
      }
    };

    await regenerate();

    // Watch package.json and src folder for changes
    const watchPaths = [
      path.join(rootPath, 'package.json'),
      path.join(rootPath, 'src'),
    ].filter(p => fs.existsSync(p));

    watchPaths.forEach(watchPath => {
      fs.watch(watchPath, { recursive: true }, async (event, filename) => {
        if (filename && !filename.includes('node_modules')) {
          await regenerate();
        }
      });
    });
  });

// ── Stats command ─────────────────────────────────────────────────────
program
  .command('stats')
  .description('Show project stats without generating a file')
  .option('-p, --path <path>', 'path to project root', process.cwd())
  .action(async (options) => {
    printBanner();
    const rootPath = path.resolve(options.path);
    const spinner = ora({ text: 'Scanning...', spinner: 'dots' }).start();

    try {
      const result = await scan(rootPath);
      spinner.stop();
      printSummary(result);
    } catch (err: any) {
      spinner.fail(chalk.red('Failed: ' + err?.message));
    }
  });

// ── Sync command ──────────────────────────────────────────────────────
program
  .command('sync')
  .description('Sync CONTEXT.md to a Claude Project (auto-updates project instructions)')
  .option('-p, --path <path>', 'path to project root', process.cwd())
  .option('-o, --output <file>', 'context file to sync', 'CONTEXT.md')
  .option('--project <id>', 'Claude Project UUID (or set CLAUDE_PROJECT_ID env var)')
  .option('--generate', 'regenerate CONTEXT.md before syncing', false)
  .action(async (options) => {
    printBanner();

    const rootPath = path.resolve(options.path);

    const spinner = ora({ text: chalk.gray('Preparing sync...'), spinner: 'dots' }).start();

    try {
      // Optionally regenerate first
      if (options.generate) {
        spinner.text = chalk.gray('Generating fresh CONTEXT.md...');
        const result = await scan(rootPath);
        const markdown = generateMarkdown(result);
        fs.writeFileSync(path.resolve(rootPath, options.output), markdown, 'utf8');
      }

      const syncOpts = resolveSyncOptions(rootPath, options.output, options.project);

      spinner.text = chalk.gray('Uploading to Claude Project...');
      await syncToClaudeProject(syncOpts);

      spinner.succeed(chalk.green('Context synced to Claude Project'));
      console.log('');
      console.log(chalk.gray('  CONTEXT.md is now active in your Claude Project.'));
      console.log(chalk.gray('  Every new conversation will have your full codebase context.'));
      console.log('');
    } catch (err: any) {
      spinner.fail(chalk.red('Sync failed'));
      console.error(chalk.red('  ' + (err?.message || String(err))));
      console.log('');
      process.exit(1);
    }
  });

// ── Serve command (MCP server mode) ──────────────────────────────────
program
  .command('serve')
  .description('Start as a Model Context Protocol (MCP) server — exposes codebase tools over stdio')
  .option('-p, --path <path>', 'path to project root', process.cwd())
  .action((options) => {
    const rootPath = path.resolve(options.path);

    if (!fs.existsSync(rootPath)) {
      process.stderr.write(`codebase-mcp: path not found: ${rootPath}\n`);
      process.exit(1);
    }

    // MCP servers must not write non-JSON to stdout — skip the banner
    process.stderr.write(`codebase-mcp MCP server v2.5.0 — serving ${rootPath}\n`);
    startMcpServer(rootPath);
  });

// ── Summary printer ───────────────────────────────────────────────────
function printSummary(result: any) {
  const { meta, stack, components, git, conventions } = result;

  console.log(chalk.bold('  ' + meta.name) + chalk.gray(' v' + meta.version));
  if (meta.description) console.log(chalk.gray('  ' + meta.description));
  console.log('');

  // Stack
  console.log(chalk.bold('  Stack'));
  if (stack.framework) console.log(`    ${chalk.cyan('framework')}    ${stack.framework}${stack.frameworkVersion ? ' ' + stack.frameworkVersion : ''}`);
  console.log(`    ${chalk.cyan('language')}     ${stack.language}`);
  if (stack.buildTool) console.log(`    ${chalk.cyan('build')}        ${stack.buildTool}`);
  if (stack.styling.length) console.log(`    ${chalk.cyan('styling')}      ${stack.styling.join(', ')}`);
  if (stack.stateManagement.length) console.log(`    ${chalk.cyan('state')}        ${stack.stateManagement.join(', ')}`);
  if (stack.testing.length) console.log(`    ${chalk.cyan('testing')}      ${stack.testing.join(', ')}`);
  console.log(`    ${chalk.cyan('pkg manager')}  ${stack.packageManager}`);
  console.log('');

  // Components
  if (components.length > 0) {
    const byType = components.reduce((acc: any, c: any) => {
      acc[c.type] = (acc[c.type] || 0) + 1;
      return acc;
    }, {});
    console.log(chalk.bold('  Components') + chalk.gray(` (${components.length} total)`));
    for (const [type, count] of Object.entries(byType)) {
      console.log(`    ${chalk.cyan(String(type).padEnd(12))} ${count}`);
    }
    console.log('');
  }

  // Conventions
  console.log(chalk.bold('  Conventions'));
  console.log(`    ${chalk.cyan('components')}   ${conventions.componentNaming}`);
  console.log(`    ${chalk.cyan('files')}        ${conventions.fileNaming}`);
  console.log(`    ${chalk.cyan('test style')}   ${conventions.testCoLocation ? 'co-located' : 'separate'}`);
  if (conventions.pathAliases.length) {
    console.log(`    ${chalk.cyan('aliases')}      ${conventions.pathAliases.join(', ')}`);
  }
  console.log('');

  // Git
  if (git) {
    console.log(chalk.bold('  Git'));
    console.log(`    ${chalk.cyan('branch')}       ${git.branch}${git.hasUncommitted ? chalk.yellow(' (dirty)') : ''}`);
    if (git.recentCommits.length > 0) {
      console.log(`    ${chalk.cyan('last commit')}  ${git.recentCommits[0]}`);
    }
    console.log('');
  }
}

program.parse(process.argv);
