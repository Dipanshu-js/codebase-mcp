# Contributing to codebase-mcp

Thanks for helping make `codebase-mcp` better.

## Setup

```bash
git clone https://github.com/yourusername/codebase-mcp
cd codebase-mcp
npm install
```

## Development

```bash
# Run CLI against a project
npm run dev -- stats --path /your/project

# Run CLI and generate CONTEXT.md
npm run dev -- generate --path /your/project --print

# Build
npm run build
```

## Adding framework detection

Open `src/scanner/package.ts` and add your entry to the relevant map:

```ts
// FRAMEWORK_MAP
'your-framework': 'Your Framework',

// STYLING_MAP, STATE_MAP, TESTING_MAP, BUILD_TOOL_MAP — same pattern
```

## Adding a new scanner

1. Create `src/scanner/yourscanner.ts`
2. Export an async function that returns typed data
3. Add your type to `src/types.ts`
4. Import and call it in `src/scanner/index.ts`
5. Render it in `src/generator/markdown.ts`

## Pull requests

- One feature or fix per PR
- Keep it focused — no unrelated refactors
- Test against a real project before submitting
