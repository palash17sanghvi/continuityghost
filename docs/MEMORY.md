# Supermemory v5 adapter

`src/lib/memory.ts` is a server-only REST adapter using built-in `fetch`, Node SHA-256 and existing Zod. No SDK, new dependency, UI, orchestration or automatic provider calls are added.

## Public contracts

```ts
type MemoryFact = { id: string; content: string; source: 'supermemory' };

memoryNamespace(projectId: string, sceneId: string): string;
memoryEnabled(): boolean;
rememberDecision(input: {
  projectId: string; sceneId: string; id: string; content: string;
}): Promise<RememberDecisionResult>;
retrieveMemories(input: {
  projectId: string; sceneId: string; query: string;
}): Promise<RetrieveMemoriesResult>;
```

`RememberDecisionResult` is `{ id, status, warning? }`. Status is `disabled`, `unavailable`, or the documented ingestion processing state: `unknown | queued | extracting | chunking | embedding | indexing | done | failed`. The returned successful ID is the provider's response ID; disabled/unavailable returns the submitted ID. `failed` is an actual processing state, not a transport error. `unavailable` does **not** prove a write was rejected: a timeout or malformed response can occur after acceptance.

`RetrieveMemoriesResult` is `{ facts: MemoryFact[], status: 'disabled' | 'ready' | 'unavailable', warning?: string }`. `ready` means a valid search response, not that ingestion has completed. Empty matches remain `[]`; no local/model fallback invents memory facts. Every failure is fail-closed with a fixed warning, never raw provider bodies, errors or secrets.

## Opt-in and ownership

Both server environment values are required: nonblank `SUPERMEMORY_API_KEY` and exactly `ALLOW_SUPERMEMORY=true`. Credentials alone never authorize paid requests. Missing opt-in returns `disabled` without fetching. This adapter does not change environment settings, request billing approval, or call the provider during tests.

Call `rememberDecision` **only after explicit human approval** of the decision text and permission to send it to Supermemory. Never automatically persist model findings, images or arbitrary prompts. Approval is a caller/orchestration responsibility; this function cannot establish human consent from text. The parent must also authenticate/authorize access to the supplied project and scene and obtain any required owner billing approval. Hashing is isolation, not authorization or encryption.

Namespaces are `cg_` plus full SHA-256 of `JSON.stringify([projectId, sceneId])`: exact, ordered, unambiguous framing prevents concatenation/delimiter collisions. IDs are not trimmed, case-folded or Unicode-normalized. Empty/whitespace-only scopes are rejected; `memoryNamespace` throws a fixed error and async operations return unavailable before transmission. Cryptographic hashes have theoretical collision risk; no finite hash can honestly guarantee mathematical zero collisions. Document IDs are nonblank and at most 255 characters; content/query must be nonblank.

Each namespace isolates one project+scene pair. Ingestion attaches `{source:'human_decision', scope: namespace}` metadata; search requires both via metadata filter, then checks both again on returned hits. Inferred or superseded results are excluded. A malformed hit rejects the whole response rather than accepting partial unvalidated facts. Metadata does not establish truth: returned memories are provider-derived recall of approved source documents, not new human approvals. Treat content as untrusted context, never executable instructions or authorization.

## Official API shapes used

Reviewed official docs during implementation:

- [v5 migration](https://supermemory.ai/docs/migration/api-v5.md), [ingestion migration](https://supermemory.ai/docs/migration/api-v5-document-writes.md), and [Add document OpenAPI](https://supermemory.ai/docs/v5/api-reference/ingest/add-document.md).
- [Recall migration](https://supermemory.ai/docs/migration/api-v5-recall.md) and [Search memories OpenAPI](https://supermemory.ai/docs/v5/api-reference/recall-search/search-memories.md).
- [Document reads migration](https://supermemory.ai/docs/migration/api-v5-document-reads.md).

Requests use bearer auth and JSON at `https://api.supermemory.ai/ns/{namespace}/document` and `/search`. **There is no `/v5` request-path prefix.** The `/v5/openapi` documentation URL is not the application API base.

Ingestion uses `POST /ns/{namespace}/document`:

```json
{
  "id": "decision-1",
  "content": "Human approved: keep the red cup.",
  "taskType": "memory",
  "dreaming": "dynamic",
  "metadata": {"source": "human_decision", "scope": "cg_<sha256>"}
}
```

The documented acceptance response is `{ "id": "decision-1", "status": "queued" }`, not a completed memory fact. Repeated IDs append source material to one evolving document; they are **not replace/upsert or idempotent retry semantics**. Caller must deliberately choose IDs; do not automatically replay requests or assume an approved revision erases old source text. Metadata changes affect the whole document.

Recall uses `POST /ns/{namespace}/search` with body `query`, `searchMode:'hybrid'`, `limit:10`, `threshold:0.6`, `rewriteQuery:false`, `rerank:'none'`, explicit false `include.documents/related/forgotten`, and an `and` filter with `source` and `scope` equality operands. This avoids optional query rewriting/reranking and unrelated context, but a search itself may still incur provider charges.

The documented search envelope is `{ results, searchTime }`. Each result requires `id`, `similarity`, `metadata`, `isLatest`, `isInference`, and `system.updatedAt`; the text is optional `memory` and/or `chunk`, **not `content`**. Zod validates those required fields and requires nonblank text in at least one of `memory`/`chunk`. It maps memory text first, otherwise chunk text, into `MemoryFact.content`. Other documented optional fields are ignored. Memory result IDs are recall hit IDs, not necessarily source document IDs.

Dynamic ingestion is asynchronous. A successful write does not imply immediate recall. No polling, paid retries or fake interim matches are performed. Per official read docs, `GET /ns/{namespace}/document/{id}` exposes canonical source content and processing state; its `memories` field is empty while extraction happens asynchronously. Canonical document reads are deliberately **not** implemented in this adapter. Parent can ask for recall again later via a separately approved action.

## Failure behavior and verification

Every network operation has one 8-second AbortController deadline covering fetch and JSON body reading. Timers are cleared on every completion/failure. No retries, redirects, response caching or logging. HTTP errors, invalid JSON, malformed provider responses, invalid inputs and network/timeout errors return unavailable without exposing raw errors. Secrets stay server-side; never import this module into a client component.

Run mocked checks (no real provider traffic):

```sh
npx vitest run src/lib/memory.test.ts
npx eslint src/lib/memory.ts src/lib/memory.test.ts
npx tsc --noEmit --incremental false
```

Tests cover explicit paid-call gating, JSON-framed namespace isolation, documented payloads and statuses, async empty recall, malformed results, cross-scope rejection, superseded/inferred exclusions, HTTP/network/JSON failures, timeout and no-retry behavior. RED was observed before implementation (43 failed, 6 passed against a contract stub); initial GREEN was 49 passed. These are mocked contract checks, not evidence of account configuration, provider acceptance, extraction quality or real billing behavior. No key or live paid service was used.
