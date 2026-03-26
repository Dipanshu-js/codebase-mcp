# codebase-mcp

**Auto-generate AI-ready context from your codebase — works with any LLM, agent, or MCP tool.**

```bash
npx codebase-mcp
```

Stop re-explaining your stack every AI session. One command reads your entire codebase and outputs a structured `CONTEXT.md` — paste it into Claude, Cursor, ChatGPT, or any MCP-compatible agent instantly.

[![npm version](https://img.shields.io/npm/v/codebase-mcp)](https://www.npmjs.com/package/codebase-mcp)
[![GitHub stars](https://img.shields.io/github/stars/Dipanshu-js/codebase-mcp)](https://github.com/Dipanshu-js/codebase-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## The problem

Every AI session starts with the same ritual:

> *"I'm using Next.js 14, TypeScript strict mode, Tailwind, Zustand, React Query, components are PascalCase, tests are co-located..."*

**Every. Single. Session.**

`codebase-mcp` reads your actual codebase and writes that context file for you — automatically, accurately, and in a format every AI tool understands.

---

## Install

```bash
# Zero install — run directly
npx codebase-mcp

# Global install
npm install -g codebase-mcp

# Short alias
cbmcp
```

---

## Usage

```bash
codebase-mcp              # generate CONTEXT.md in current dir
codebase-mcp --copy       # generate + copy to clipboard
codebase-mcp --print      # print to stdout
codebase-mcp watch        # auto-regenerate on file changes
codebase-mcp stats        # show project summary, no file written
codebase-mcp --path /x    # scan a different directory
codebase-mcp --template ./my-template.md  # use a custom template
codebase-mcp --monorepo   # scan all workspace packages
codebase-mcp sync         # push CONTEXT.md to Claude Projects
codebase-mcp serve        # start MCP server (stdio)
```

---

## Example output

```markdown
## Project context
Generated: March 14, 2025 by codebase-mcp

**my-saas-app** v2.4.1 — Customer analytics dashboard

## Stack
- Framework: **Next.js 14.1.0**
- Language: **TypeScript**
- Package manager: **pnpm**
- Styling: **Tailwind CSS**
- State: **Zustand, TanStack Query**
- Testing: **Vitest, Playwright**

## Structure
├── app/                  # Next.js App Router
├── components/           # 34 files
├── hooks/                # 12 files
└── stores/               # 4 files

## Components & modules
**Pages** (12): analytics, billing, dashboard...
**Components** (34): Button, Chart, DataTable, Modal...
**Hooks** (12): useAuth, useAnalytics...

## Conventions
- Components: **PascalCase**
- Tests: **co-located** alongside source files
- Path aliases: `@/components`, `@/lib`, `@/hooks`

## Recent changes
Branch: **main**
- Add Google OAuth provider
- Migrate DataTable to server components
- Fix race condition in useAuth hook
```

---

## What gets scanned

| Source | What's extracted |
|---|---|
| `package.json` | Framework, styling, state, testing, build tool |
| `tsconfig.json` | TypeScript config, path aliases |
| Folder structure | Directory tree (3 levels deep) |
| `src/**/*.tsx` | Component inventory, type classification |
| Git log | Branch, last 15 commits, uncommitted changes |
| Config files | ESLint, Prettier, Docker, CI platform |
| Naming patterns | PascalCase vs kebab-case, co-located tests |

**Detects 40+ frameworks and libraries:** Next.js · Nuxt · Remix · Astro · SvelteKit · Vue · Angular · Express · Fastify · NestJS · Expo · Tailwind · MUI · Zustand · Jotai · Redux · TanStack Query · Vitest · Jest · Playwright · Cypress and more.

---

## Works with

| Tool | How |
|---|---|
| **Claude** | Paste `CONTEXT.md` into Project Instructions — active every session |
| **Cursor / Windsurf** | Add to `.cursorrules` |
| **ChatGPT / Gemini** | Paste at start of conversation |
| **Any MCP agent** | `cbmcp --print | your-agent` |
| **Aider / Continue** | Include as context file |

---

## MCP server mode

`codebase-mcp serve` exposes your codebase as a full **Model Context Protocol server** — any MCP-compatible agent (Claude Desktop, Cursor, Windsurf, Continue) can query it at runtime.

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "codebase": {
      "command": "codebase-mcp",
      "args": ["serve", "--path", "/path/to/project"]
    }
  }
}
```

**Available tools**

| Tool | Description |
|---|---|
| `get_context` | Full CONTEXT.md — primary source of truth |
| `get_stack` | Framework, language, deps, build setup |
| `get_structure` | Folder tree (3 levels deep) |
| `search_components` | Search component inventory by name or type |
| `get_git_history` | Branch, recent commits, uncommitted state |
| `get_conventions` | Naming rules, aliases, test co-location |

---

## GitHub Action — keep context always fresh

```yaml
name: Update codebase context
on:
  push:
    branches: [main]
jobs:
  context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx codebase-mcp
      - run: git diff --quiet CONTEXT.md || (git add CONTEXT.md && git commit -m "chore: update codebase context" && git push)
```

---

## Roadmap

- [x] v1.0 — Core scanner, 40+ frameworks, git history, conventions
- [x] v1.5 — Watch mode, custom templates, monorepo support
- [x] v2.0 — VS Code extension, Claude Projects auto-sync
- [x] v2.5 — Full MCP server mode

---

## License

MIT © Dipanshu Singh

---

*If `codebase-mcp` saves you time, a ⭐ helps others find it.*
