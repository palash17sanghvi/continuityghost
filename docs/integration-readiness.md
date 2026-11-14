# Integration readiness: provider blockers and bounded next checks

## Scope and evidence

Documentation-only assessment. No provider, authentication, database, migration, or application-analysis calls were made for this assessment. No environment, code, UI, or existing runbook was changed. Public official documentation and local source/package/image metadata were inspected; credentials and image contents were not displayed. Proposed tests below are **not executed and require separate approval**.

Owner-supplied live observations are distinguished from local inspection. This document supersedes the outdated readiness statements in `INTEGRATION-VERIFICATION.md` and `DEMO.md` that all credentials are absent or all live checks await credentials; those files remain unchanged by scope. Credential presence, a free tier, mocked tests, or one successful document ingestion does not establish end-to-end readiness.

| Integration | Established evidence | Readiness boundary |
| --- | --- | --- |
| Gemini | Owner confirms configured `gemini-3.8-flash` and free-tier access. Existing prompt/schema, 6000 output tokens, temperature 0.2, 45-second timeout and reported retries setting 1 returned HTTP 504 without usage metadata. Older 2.5 attempt returned 404. | Access/configuration established; successful image comparison and structured output **not established**. No fallback to 2.5 or billing changes. |
| Supermemory | Owner reports existing verification document, ingestion `done`, memory generation `dreaming`, and `memories: []`. | Document ingestion established; generated-memory retrieval **not ready**. Empty memories while dreaming do not establish broken search. |
| Tiger Shared Free | Owner reports `verify-full` failing with `SELF_SIGNED_CERT_IN_CHAIN`. | Verified server identity and live database functionality **not established**. Do not weaken TLS to make a demo pass. |

## Gemini: actual local request and timeout boundaries

Inspected `src/lib/continuity.ts`, `src/app/api/analyze/route.ts`, and installed `@google/genai` **3.3.0** (`package.json` requests `^3.3.0`).

- Next route exports `maxDuration = 90`. The handler separately creates an 80-second request signal and deadline. This is not a 90-second provider allowance.
- Image validation/normalization and memory lookup happen before Gemini. Provider allowance is `min(45000, deadline - now - 22000)` milliseconds; under one second remaining, the route exits without generating. An SDK HTTP timeout and abort signal enforce that provider allowance.
- The request uses the configured model (source fallback is still `gemini-2.5-flash`), `responseMimeType: 'application/json'`, the Zod-generated JSON schema, `maxOutputTokens: 6000`, and `temperature: 0.2`. It sets no explicit thinking level.
- The route does not supply `retryOptions`. Installed SDK `dist/node/index.mjs` around lines 13980–14035 executes one attempt when retry options are absent; with options, `attempts` **includes the initial call**, and HTTP timeout is per attempt. Thus `retryOptions: { attempts: 1 }` means one total attempt, not one additional retry. The owner's reported “retries 1” is retained as observed terminology; the exact harness meaning was not independently inspected.
- The route calls memory loading before generation and persistence afterwards, and can attempt a database failure-event write in its catch block. Therefore it is **not** the smallest isolated provider diagnostic and must not be used for the next check.

Google documents HTTP 504 as `DEADLINE_EXCEEDED`: the service could not finish within the deadline; reducing request complexity or extending an appropriate timeout are diagnostic options. It is not proof of invalid credentials, lack of free-tier access, or the exact internal bottleneck. Missing usage metadata is **unknown usage**, not proof that no work, quota consumption, or charge occurred. [1]

### Original local images: metadata only

Located the actual original pair outside the repository at `/Users/palashsanghvi/.hermes/cache/scratch/continuityghost-originals/`. No image was visually inspected or transmitted. Metadata was read with Sharp; the existing normalization recipe was applied in memory only, without writing images.

| File | Original format/dimensions/pages | Original bytes | Normalized JPEG bytes | Base64 characters |
| --- | --- | ---: | ---: | ---: |
| `reference.png` | PNG, 1000 × 700, one page | 27170 | 18879 | 25172 |
| `candidate.png` | PNG, 1000 × 700, one page | 26141 | 17998 | 24000 |

The code accepts nonempty PNG/JPEG/WebP up to 8 MiB per file, with a 24-million-input-pixel decode limit; rotates, bounds to 2048 × 2048 without enlargement, flattens, and emits JPEG quality 90. This pair is small relative to those limits. Image byte volume alone is not a supported explanation for the 504; visual reasoning cost cannot be inferred from file size. Do not regenerate or substitute fixture images for this test.

### Existing prompt/schema complexity

`analyzeImages` constructs five parts: instruction/context text, REFERENCE label, reference image, CANDIDATE label, candidate image. Instructions cover observable differences, six categories, evidence from both images, uncertainty, suggested action, camera/lighting/occlusion, untrusted context/images, approved-memory exceptions and conflicts. Context can be up to 12000 characters at the route boundary; the prompt also serializes scope and memories. The actual failed request's context/memory payload was not available, so its exact token count is unknown.

The locally generated schema is **868 characters**, an object with required `summary` and `findings`; findings are capped at 30. Each finding requires six fields: one six-value category enum plus five nonblank strings capped at 3000 characters. Summary is also nonblank and capped at 3000 characters. Objects disallow additional properties. The schema is bounded and not deeply recursive, but up to 30 evidence-rich findings and implicit thinking can still take time. Google's structured-output support is a subset of JSON Schema; very complex schemas may be rejected, and successful JSON structure does not establish semantic correctness. No local evidence establishes this schema as the cause of the 504. [2]

### Smallest next test — proposal only, one standalone call

After explicit approval, make **one total** direct SDK `generateContent` call with the same configured `gemini-3.8-flash`, the same original image pair normalized locally as above, and **no route, pipeline, memory lookup, database access, or persistence imports**. Do not switch models, enable billing, change environment values, or edit production code to run it.

Recommended diagnostic envelope:

- Set both SDK HTTP timeout and independent total abort deadline to **60000 ms**; explicitly set `retryOptions: { attempts: 1 }`. Stop after the response, timeout, or error. No fallback, retry loop, batch, or chained follow-up.
- Request one short observable comparison: concise summary and **zero or one** potential difference, retaining evidence from both images, uncertainty, and a suggested human review action. Use a standalone reduced schema with the same field names/categories but `findings.maxItems = 1` and short text bounds. This is a diagnostic variant, **not** an unapproved edit to the application prompt/schema.
- Bound output to **1024 tokens** and explicitly use `thinkingConfig: { thinkingLevel: 'LOW' }` (SDK enum `ThinkingLevel.LOW` if preferred). Gemini 3.8 Flash supports low/medium/high, defaults to medium, and **does not support minimal**. Do not copy `minimal` or a Gemini 2.5 `thinkingBudget: 0` recipe. [3][4]
- Do not assume the existing `temperature: 0.2` is recommended for 3.8. Google's 3.8 migration guidance says to remove deprecated sampling parameters, including temperature, in its Interactions-oriented guidance. This repository uses `generateContent`, not Interactions; omit the explicit temperature override for the isolated diagnostic rather than inventing a required numeric value or changing API families. Record omission as a changed test variable, not a proven fix or proof that this parameter caused the 504. [4]
- Capture only elapsed time, safe status/error code, finish reason, response validation outcome, and returned usage metadata if present. Never log credentials, authorization headers, image/base64 payloads, raw SDK errors that may embed inputs, or private context.

Success requires a real nonempty schema-valid response with an acceptable finish reason; a truncated `MAX_TOKENS` response is not a pass. With several deliberately reduced settings, success would show basic same-model multimodal structured generation, **not** identify the original root cause or verify the unchanged application pipeline. A 504 again is a stop-and-report blocker; no automatic escalation. This is the smallest bounded liveness test, not a promise that 60 seconds or 1024 tokens will suffice.

## Supermemory: separate ingestion from memory readiness

Preserve the existing identifiers exactly:

- Document: `cg-verification-3f24739f-decc-4118-becf-1254997fd86f`
- Namespace: `cg_7459af2b33c6d03376ff02a9dfac9021f040dd9f9ef63321a3a9e96b92299e1f`

Official documentation distinguishes `system.status: 'done'` (document processing/searchability) from `system.dreamingStatus: 'done'` (memory generation finished, or no memories needed). Dynamic dreaming batches related documents, so ingestion may finish before memories exist. `dreaming` plus `memories: []` is **not generated-memory readiness**, but it also does not establish a permanent failure. Even both statuses `done` can legitimately accompany no memories. [5]

Its production adapter performs `searchMode: 'hybrid'` retrieval, accepting scoped, non-inferred current hits and reconciling decision IDs against active database rules. Its `ready` return denotes a successfully parsed search response, not a separately checked memory-generation lifecycle. A chunk/hybrid hit proves retrieval of that content, not completion of extracted-memory generation. Search modes are distinct in official documentation. [6]

**Prepared next check; not executed:**

1. After approval, make **one read** of the exact existing document in the exact namespace, including memories and the raw lifecycle fields. Do not recreate it or submit new content. Keep document content private; report only safe lifecycle fields and memory count.
2. **Only if that read confirms both processing and dreaming `done`,** make at most **two explicitly bounded, read-only semantic searches** in that namespace with `searchMode: 'memories'`: one query targeting the already approved verification fact, and one paraphrase of that same fact. Use the existing verification fixture privately to select queries, not invented content. Verify returned scope and relevance; report actual results, including zero hits. No chunks/hybrid substitution.
3. If still dreaming, unknown, failed, or otherwise not ready, stop after that single read. No polling, sleeps, loops, writes, profiles, or re-ingestion. A later check needs fresh approval. Do not claim readiness from elapsed time alone.

## Tiger Shared Free: encryption is not verified identity

The observed `SELF_SIGNED_CERT_IN_CHAIN` is a certificate trust-chain failure under the attempted verified connection. No authenticated CA was established by this assessment. The pool in `src/lib/database.ts` passes `connectionString` directly to `pg`; it does not supply a separate authenticated CA or explicit SSL override. Its connection timeout is 2000 ms and query/statement timeouts are 1500 ms. No database operation was attempted here.

Tiger's official strict-SSL documentation states that default connections use `require`, and that server identity verification needs `verify-ca` or `verify-full` and a trusted certificate chain. It explicitly says **“Free services do not supply SSL certificates.”** The same page describes an initial self-signed-to-signed replacement, usually within 30 minutes, for services that receive signed certificates; that paragraph is **not a promise that Shared Free will become verify-full-ready by waiting**. [7]

PostgreSQL `require` requires encryption, but should not be treated as proof of hostname/server identity; `verify-full` checks the trust chain and requested hostname. Libpq can additionally validate CA under `require` when a root certificate exists, so encryption-only shorthand is not universal client behavior. Node-postgres uses Node TLS and warns that SSL-related connection-string options can replace an explicit `ssl` object. Do not assume libpq and this `pg` stack configure identically. [8][9]

Decision boundary:

- Keep verified identity as the security requirement. Do **not** silently use `sslmode=require`, `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `no-verify`, or an opportunistically downloaded server certificate to bypass the failure. A supported encrypted mode is not equivalent to the required authenticated connection.
- Ask Tiger support, through the owner's normal authenticated support channel, whether this **Shared Free** service supports an authenticated CA chain and hostname-valid certificate, and how they securely distribute it. This is a proposed support question, not a support/auth endpoint call performed here. A certificate captured from the failing connection is not independently authenticated trust material.
- If supported, separately approve a secure plan using provider-authenticated CA material, hostname checking and rejection of unauthorized certificates; review node-postgres URL/SSL precedence before any code/env edit. Confirm the exact tier's capability first. No automatic upgrade, purchase, or inference from paid-tier docs.
- If unsupported, the practical secure development path is **local PostgreSQL**, restricted to local access and using appropriate local authentication (and TLS if crossing a trust boundary), under a separately approved setup. It is a development substitute only: **not Tiger live verification, a Timescale/Tiger feature proof, or a Tiger prize-integration claim**. A different remote verified-identity solution requires a separately approved secure plan; no upgrade is assumed.

Until an approved verified connection succeeds, migrations, hypertables, audit persistence, analytics, and the live Tiger end-to-end flow remain unverified. Existing local/PGlite tests do not change that status.

## Sources

Official public documentation retrieved for this assessment; no authenticated endpoints used.

[1] https://ai.google.dev/gemini-api/docs/api-errors

[2] https://ai.google.dev/gemini-api/docs/structured-output

[3] https://aistudio.google.com/docs/models/gemini-3.8-flash

[4] https://aistudio.google.com/docs/whats-new-gemini-3.8

[5] https://supermemory.ai/docs/ingestion/document-operations

[6] https://supermemory.ai/docs/recall/search

[7] https://www.tigerdata.com/docs/deploy/tiger-cloud/tiger-cloud-aws/security/strict-ssl

[8] https://www.postgresql.org/docs/current/libpq-ssl.html

[9] https://node-postgres.com/features/ssl
