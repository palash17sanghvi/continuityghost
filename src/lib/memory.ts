import { createHash } from 'node:crypto';
import { z } from 'zod';

export type MemoryFact = { id: string; content: string; source: 'supermemory'; decisionId?: string };
type Scope = { projectId: string; sceneId: string };
const nonblank = z.string().refine(value => value.trim().length > 0);
const scopeSchema = z.object({ projectId: nonblank, sceneId: nonblank });
const decisionSchema = scopeSchema.extend({ id: nonblank.max(255), decisionId: nonblank.max(255), content: nonblank });
const querySchema = scopeSchema.extend({ query: nonblank });
const ingestionStatus = z.enum(['unknown', 'queued', 'extracting', 'chunking', 'embedding', 'indexing', 'done', 'failed']);
const ingestionSchema = z.object({ id: nonblank, status: ingestionStatus });
const metadataValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const searchResultSchema = z.object({
  id: nonblank,
  memory: z.string().optional(),
  chunk: z.string().optional(),
  similarity: z.number(),
  metadata: z.record(z.string(), metadataValue),
  isLatest: z.boolean(),
  isInference: z.boolean(),
  system: z.object({ updatedAt: z.string(), createdAt: z.string().optional() }),
}).refine(value => Boolean(value.memory?.trim() || value.chunk?.trim()));
const searchSchema = z.object({ results: z.array(searchResultSchema), searchTime: z.number() });
export type RememberDecisionResult = {
  id: string;
  status: z.infer<typeof ingestionStatus> | 'disabled' | 'unavailable';
  warning?: string;
};
export type RetrieveMemoriesResult = {
  facts: MemoryFact[];
  status: 'disabled' | 'ready' | 'unavailable';
  warning?: string;
};
const unavailableWarning = 'Supermemory unavailable; no remote memory result was confirmed.';

/** Server-only. Exact IDs are preserved; JSON framing prevents delimiter aliases. */
export function memoryNamespace(projectId: string, sceneId: string): string {
  if (!scopeSchema.safeParse({ projectId, sceneId }).success) throw new Error('Invalid memory scope');
  return `cg_${createHash('sha256').update(JSON.stringify([projectId, sceneId])).digest('hex')}`;
}

export function memoryEnabled(): boolean {
  return process.env.ALLOW_SUPERMEMORY === 'true' && Boolean(process.env.SUPERMEMORY_API_KEY?.trim());
}

// One request only: even a timed-out write may already have been accepted/charged.
async function request(namespace: string, operation: 'document' | 'search', body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.supermemory.ai/ns/${namespace}/${operation}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SUPERMEMORY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Memory request failed');
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Caller must authorize project/scene and obtain human approval before calling. */
export async function rememberDecision(input: Scope & { id: string; decisionId: string; content: string }): Promise<RememberDecisionResult> {
  if (!memoryEnabled()) return { id: input.id, status: 'disabled' };
  try {
    const { projectId, sceneId, decisionId, content } = decisionSchema.parse(input);
    const namespace = memoryNamespace(projectId, sceneId);
    return ingestionSchema.parse(await request(namespace, 'document', {
      id: decisionId, content, taskType: 'memory', dreaming: 'dynamic',
      metadata: { source: 'human_decision', scope: namespace, decisionId },
    }));
  } catch {
    return { id: input.id, status: 'unavailable', warning: unavailableWarning };
  }
}

export async function retrieveMemories(input: Scope & { query: string }): Promise<RetrieveMemoriesResult> {
  if (!memoryEnabled()) return { facts: [], status: 'disabled' };
  try {
    const { projectId, sceneId, query } = querySchema.parse(input);
    const namespace = memoryNamespace(projectId, sceneId);
    const response = searchSchema.parse(await request(namespace, 'search', {
      query, searchMode: 'hybrid', limit: 10, threshold: 0.6,
      rerank: 'none', rewriteQuery: false,
      include: { documents: false, related: false, forgotten: false },
      filter: { operator: 'and', operands: [
        { field: 'source', operator: 'eq', value: 'human_decision' },
        { field: 'scope', operator: 'eq', value: namespace },
      ] },
    }));
    const facts: MemoryFact[] = response.results
      .filter(hit => hit.isLatest && !hit.isInference && hit.metadata.source === 'human_decision' && hit.metadata.scope === namespace)
      .map(hit => ({ id: hit.id, content: hit.memory?.trim() ? hit.memory : hit.chunk!, source: 'supermemory', ...(typeof hit.metadata.decisionId === 'string' ? {decisionId: hit.metadata.decisionId} : {}) }));
    return { facts, status: 'ready' };
  } catch {
    return { facts: [], status: 'unavailable', warning: unavailableWarning };
  }
}
