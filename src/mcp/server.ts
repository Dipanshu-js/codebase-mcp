/**
 * codebase-mcp — MCP server mode
 *
 * Implements the Model Context Protocol (JSON-RPC 2.0 over stdio).
 * Any MCP-compatible agent (Claude Desktop, Cursor, Windsurf, etc.) can
 * point at this server and query your codebase at runtime.
 *
 * Config snippet for Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "codebase": {
 *       "command": "codebase-mcp",
 *       "args": ["serve", "--path", "/path/to/your/project"]
 *     }
 *   }
 * }
 */

import * as readline from 'readline';
import { scan } from '../scanner';
import { generateMarkdown } from '../generator/markdown';
import { ScanResult } from '../types';

// ── JSON-RPC types ────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Tool definitions ──────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_context',
    description: 'Return the full AI-ready CONTEXT.md for the project. Use this as your primary source of truth about the codebase.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_stack',
    description: 'Return detailed stack information: framework, language, styling, state management, testing tools, build setup.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_structure',
    description: 'Return the folder tree of the project (3 levels deep, ignoring node_modules and build artifacts).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_components',
    description: 'Search the component/module inventory by name or type.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term — matched against component name (case-insensitive)',
        },
        type: {
          type: 'string',
          enum: ['component', 'page', 'layout', 'hook', 'util', 'store', 'api', 'type'],
          description: 'Filter by component type',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_git_history',
    description: 'Return recent git commits, current branch, and uncommitted-change status.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent commits to return (default: 15, max: 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_conventions',
    description: 'Return naming conventions, test co-location policy, path aliases, and barrel export patterns.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ── Cache — re-scan at most once per 30 s ─────────────────────────────

let cachedResult: ScanResult | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 30_000;

async function getResult(rootPath: string): Promise<ScanResult> {
  const now = Date.now();
  if (cachedResult && now - cacheTime < CACHE_TTL_MS) return cachedResult;
  cachedResult = await scan(rootPath);
  cacheTime = now;
  return cachedResult;
}

// ── Tool handlers ─────────────────────────────────────────────────────

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  rootPath: string
): Promise<unknown> {
  const result = await getResult(rootPath);

  switch (name) {
    case 'get_context': {
      return { content: generateMarkdown(result) };
    }

    case 'get_stack': {
      const { stack, meta } = result;
      return {
        project: `${meta.name} v${meta.version}`,
        framework: stack.framework,
        frameworkVersion: stack.frameworkVersion,
        language: stack.language,
        runtime: stack.runtime,
        buildTool: stack.buildTool,
        packageManager: stack.packageManager,
        styling: stack.styling,
        stateManagement: stack.stateManagement,
        testing: stack.testing,
        nodeVersion: stack.nodeVersion,
      };
    }

    case 'get_structure': {
      function flattenTree(nodes: any[], prefix = ''): string[] {
        const lines: string[] = [];
        nodes.forEach((node, i) => {
          const last = i === nodes.length - 1;
          lines.push(`${prefix}${last ? '└── ' : '├── '}${node.name}${node.type === 'dir' ? '/' : ''}`);
          if (node.children?.length) {
            lines.push(...flattenTree(node.children, prefix + (last ? '    ' : '│   ')));
          }
        });
        return lines;
      }
      return { tree: flattenTree(result.structure).join('\n') };
    }

    case 'search_components': {
      const query = typeof args['query'] === 'string' ? args['query'].toLowerCase() : '';
      const typeFilter = typeof args['type'] === 'string' ? args['type'] : null;

      let matches = result.components;
      if (query) matches = matches.filter(c => c.name.toLowerCase().includes(query));
      if (typeFilter) matches = matches.filter(c => c.type === typeFilter);

      return {
        count: matches.length,
        components: matches.map(c => ({ name: c.name, type: c.type, path: c.path })),
      };
    }

    case 'get_git_history': {
      if (!result.git) return { available: false };
      const limit = Math.min(Number(args['limit'] ?? 15), 50);
      return {
        branch: result.git.branch,
        hasUncommitted: result.git.hasUncommitted,
        remoteUrl: result.git.remoteUrl,
        recentCommits: result.git.recentCommits.slice(0, limit),
      };
    }

    case 'get_conventions': {
      return {
        componentNaming: result.conventions.componentNaming,
        fileNaming: result.conventions.fileNaming,
        testCoLocation: result.conventions.testCoLocation,
        barrelExports: result.conventions.barrelExports,
        pathAliases: result.conventions.pathAliases,
      };
    }

    default:
      throw { code: -32601, message: `Unknown tool: ${name}` };
  }
}

// ── Request dispatcher ────────────────────────────────────────────────

async function handleRequest(
  req: JsonRpcRequest,
  rootPath: string
): Promise<JsonRpcResponse> {
  const id = req.id ?? null;

  try {
    switch (req.method) {
      // MCP handshake
      case 'initialize':
        return {
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'codebase-mcp', version: '2.5.0' },
          },
        };

      case 'notifications/initialized':
        return { jsonrpc: '2.0', id, result: {} };

      // Tool discovery
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

      // Tool execution
      case 'tools/call': {
        const params = req.params ?? {};
        const toolName = params['name'] as string;
        const toolArgs = (params['arguments'] ?? {}) as Record<string, unknown>;

        if (!toolName) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name' } };
        }

        const toolResult = await handleToolCall(toolName, toolArgs, rootPath);
        return {
          jsonrpc: '2.0', id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
          },
        };
      }

      // Ping / health
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      default:
        return {
          jsonrpc: '2.0', id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        };
    }
  } catch (err: any) {
    const code = typeof err?.code === 'number' ? err.code : -32603;
    const message = err?.message || String(err);
    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}

// ── Start the server ──────────────────────────────────────────────────

export function startMcpServer(rootPath: string): void {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  // MCP uses newline-delimited JSON over stdio
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed);
    } catch {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
      return;
    }

    const response = await handleRequest(req, rootPath);
    // Notifications (id === undefined) don't need a response
    if (req.id !== undefined) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  });

  rl.on('close', () => process.exit(0));
}
