import * as fs from 'fs';
import * as path from 'path';
import { ProjectMeta, StackInfo } from '../types';

// ── Framework detection maps ────────────────────────────────────────

const FRAMEWORK_MAP: Record<string, string> = {
  'next': 'Next.js',
  'nuxt': 'Nuxt',
  'remix': 'Remix',
  '@remix-run/node': 'Remix',
  'gatsby': 'Gatsby',
  'astro': 'Astro',
  'svelte': 'Svelte',
  '@sveltejs/kit': 'SvelteKit',
  'vue': 'Vue',
  '@angular/core': 'Angular',
  'react': 'React',
  'express': 'Express',
  'fastify': 'Fastify',
  'hono': 'Hono',
  'koa': 'Koa',
  'nestjs': 'NestJS',
  '@nestjs/core': 'NestJS',
  'electron': 'Electron',
  'expo': 'Expo',
  'react-native': 'React Native',
};

const STYLING_MAP: Record<string, string> = {
  'tailwindcss': 'Tailwind CSS',
  '@tailwindcss/vite': 'Tailwind CSS',
  'styled-components': 'styled-components',
  '@emotion/react': 'Emotion',
  'sass': 'Sass/SCSS',
  'less': 'Less',
  '@mui/material': 'Material UI',
  '@chakra-ui/react': 'Chakra UI',
  'antd': 'Ant Design',
  '@shadcn/ui': 'shadcn/ui',
  'daisyui': 'DaisyUI',
  'bootstrap': 'Bootstrap',
};

const STATE_MAP: Record<string, string> = {
  'zustand': 'Zustand',
  'jotai': 'Jotai',
  'recoil': 'Recoil',
  '@reduxjs/toolkit': 'Redux Toolkit',
  'redux': 'Redux',
  'mobx': 'MobX',
  'valtio': 'Valtio',
  '@tanstack/react-query': 'TanStack Query',
  'react-query': 'React Query',
  'swr': 'SWR',
  'apollo-client': 'Apollo Client',
  '@apollo/client': 'Apollo Client',
  'pinia': 'Pinia',
  'vuex': 'Vuex',
};

const TESTING_MAP: Record<string, string> = {
  'vitest': 'Vitest',
  'jest': 'Jest',
  '@testing-library/react': 'Testing Library',
  'cypress': 'Cypress',
  'playwright': '@playwright/test',
  '@playwright/test': 'Playwright',
  'puppeteer': 'Puppeteer',
  'mocha': 'Mocha',
  'jasmine': 'Jasmine',
};

const BUILD_TOOL_MAP: Record<string, string> = {
  'vite': 'Vite',
  '@vitejs/plugin-react': 'Vite',
  'webpack': 'Webpack',
  'parcel': 'Parcel',
  'rollup': 'Rollup',
  'esbuild': 'esbuild',
  'turbopack': 'Turbopack',
  'tsup': 'tsup',
  'swc': 'SWC',
};

// ── Main scanner ─────────────────────────────────────────────────────

export function scanPackage(rootPath: string): { meta: ProjectMeta; stack: StackInfo } {
  const pkgPath = path.join(rootPath, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    return {
      meta: { name: path.basename(rootPath), version: 'unknown', description: '', author: '' },
      stack: emptyStack(),
    };
  }

  let pkg: Record<string, any> = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return {
      meta: { name: path.basename(rootPath), version: 'unknown', description: '', author: '' },
      stack: emptyStack(),
    };
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };

  const depNames = Object.keys(allDeps);

  // ── Meta ─────────────────────────────────────────────────────────
  const meta: ProjectMeta = {
    name: pkg.name || path.basename(rootPath),
    version: pkg.version || '0.0.0',
    description: pkg.description || '',
    author: typeof pkg.author === 'string' ? pkg.author
          : pkg.author?.name || '',
  };

  // ── Framework ────────────────────────────────────────────────────
  let framework: string | null = null;
  let frameworkVersion: string | null = null;

  for (const [dep, label] of Object.entries(FRAMEWORK_MAP)) {
    if (allDeps[dep]) {
      framework = label;
      frameworkVersion = allDeps[dep].replace(/[\^~>=<]/, '') || null;
      break;
    }
  }

  // ── Language ─────────────────────────────────────────────────────
  const hasTS = depNames.includes('typescript') || fs.existsSync(path.join(rootPath, 'tsconfig.json'));
  const language: StackInfo['language'] = hasTS ? 'TypeScript' : 'JavaScript';

  // ── Styling ──────────────────────────────────────────────────────
  const styling = depNames
    .filter(d => STYLING_MAP[d])
    .map(d => STYLING_MAP[d])
    .filter((v, i, a) => a.indexOf(v) === i);

  // ── State ────────────────────────────────────────────────────────
  const stateManagement = depNames
    .filter(d => STATE_MAP[d])
    .map(d => STATE_MAP[d])
    .filter((v, i, a) => a.indexOf(v) === i);

  // ── Testing ──────────────────────────────────────────────────────
  const testing = depNames
    .filter(d => TESTING_MAP[d])
    .map(d => TESTING_MAP[d])
    .filter((v, i, a) => a.indexOf(v) === i);

  // ── Build tool ───────────────────────────────────────────────────
  let buildTool: string | null = null;
  for (const [dep, label] of Object.entries(BUILD_TOOL_MAP)) {
    if (allDeps[dep]) { buildTool = label; break; }
  }
  // Next.js uses its own bundler
  if (!buildTool && framework === 'Next.js') buildTool = 'Next.js (built-in)';

  // ── Package manager ──────────────────────────────────────────────
  let packageManager: StackInfo['packageManager'] = 'unknown';
  if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
  else if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) packageManager = 'yarn';
  else if (fs.existsSync(path.join(rootPath, 'bun.lockb'))) packageManager = 'bun';
  else if (fs.existsSync(path.join(rootPath, 'package-lock.json'))) packageManager = 'npm';

  // ── Node version ─────────────────────────────────────────────────
  let nodeVersion: string | null = pkg.engines?.node || null;
  if (!nodeVersion) {
    const nvmrcPath = path.join(rootPath, '.nvmrc');
    if (fs.existsSync(nvmrcPath)) {
      nodeVersion = fs.readFileSync(nvmrcPath, 'utf8').trim();
    }
  }

  // ── Runtime ─────────────────────────────────────────────────────
  let runtime: string | null = null;
  if (depNames.includes('bun') || fs.existsSync(path.join(rootPath, 'bunfig.toml'))) runtime = 'Bun';
  else if (depNames.includes('deno') || fs.existsSync(path.join(rootPath, 'deno.json'))) runtime = 'Deno';
  else runtime = 'Node.js';

  return {
    meta,
    stack: {
      framework,
      frameworkVersion,
      language,
      runtime,
      styling,
      stateManagement,
      testing,
      buildTool,
      packageManager,
      nodeVersion,
    },
  };
}

function emptyStack(): StackInfo {
  return {
    framework: null,
    frameworkVersion: null,
    language: 'JavaScript',
    runtime: 'Node.js',
    styling: [],
    stateManagement: [],
    testing: [],
    buildTool: null,
    packageManager: 'unknown',
    nodeVersion: null,
  };
}
