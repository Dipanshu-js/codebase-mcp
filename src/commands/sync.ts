import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// ── Claude Projects auto-sync ─────────────────────────────────────────
// Uploads CONTEXT.md to a Claude Project so it's active every session.
//
// Requires:
//   ANTHROPIC_API_KEY — your Anthropic API key
//   CLAUDE_PROJECT_ID — the project UUID to sync to (or pass via --project flag)

export interface SyncOptions {
  contextFile: string;   // path to CONTEXT.md
  projectId: string;     // Claude Project UUID
  apiKey: string;        // Anthropic API key
}

interface AnthropicError {
  error?: { message?: string };
}

// ── API helpers ───────────────────────────────────────────────────────

function anthropicRequest<T>(
  method: string,
  urlPath: string,
  apiKey: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;

    const options: https.RequestOptions = {
      hostname: 'api.anthropic.com',
      path: urlPath,
      method,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'projects-2025-01',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as T;
          if ((res.statusCode ?? 0) >= 400) {
            const err = parsed as AnthropicError;
            reject(new Error(err?.error?.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── List project documents ────────────────────────────────────────────

interface ProjectDoc {
  id: string;
  filename: string;
  created_at: string;
}

interface ListDocsResponse {
  data: ProjectDoc[];
}

async function listProjectDocs(projectId: string, apiKey: string): Promise<ProjectDoc[]> {
  const res = await anthropicRequest<ListDocsResponse>(
    'GET',
    `/v1/projects/${projectId}/docs`,
    apiKey
  );
  return res.data ?? [];
}

// ── Upload / update project document ─────────────────────────────────

async function upsertProjectDoc(
  projectId: string,
  apiKey: string,
  content: string,
  existingDocId?: string
): Promise<void> {
  if (existingDocId) {
    // Update in place
    await anthropicRequest(
      'PUT',
      `/v1/projects/${projectId}/docs/${existingDocId}`,
      apiKey,
      { content }
    );
  } else {
    // Create new document
    await anthropicRequest(
      'POST',
      `/v1/projects/${projectId}/docs`,
      apiKey,
      { filename: 'CONTEXT.md', content, media_type: 'text/markdown' }
    );
  }
}

// ── Main sync function ────────────────────────────────────────────────

export async function syncToClaudeProject(opts: SyncOptions): Promise<void> {
  const { contextFile, projectId, apiKey } = opts;

  if (!fs.existsSync(contextFile)) {
    throw new Error(`Context file not found: ${contextFile}\nRun 'codebase-mcp generate' first.`);
  }

  const content = fs.readFileSync(contextFile, 'utf8');

  // Check for existing CONTEXT.md in project docs
  const docs = await listProjectDocs(projectId, apiKey);
  const existing = docs.find(d => d.filename === 'CONTEXT.md');

  await upsertProjectDoc(projectId, apiKey, content, existing?.id);
}

// ── Resolve sync options from environment + CLI flags ─────────────────

export function resolveSyncOptions(
  rootPath: string,
  outputFile: string,
  projectIdFlag?: string
): SyncOptions {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set.\n' +
      'Export it before running: export ANTHROPIC_API_KEY=sk-ant-...'
    );
  }

  const projectId = projectIdFlag || process.env['CLAUDE_PROJECT_ID'];
  if (!projectId) {
    throw new Error(
      'Claude Project ID is required.\n' +
      'Pass it with --project <id> or set CLAUDE_PROJECT_ID environment variable.\n\n' +
      'Find your Project ID at: https://claude.ai — open a Project → Settings → copy the UUID from the URL.'
    );
  }

  return {
    contextFile: path.resolve(rootPath, outputFile),
    projectId,
    apiKey,
  };
}
