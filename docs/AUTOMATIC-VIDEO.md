# Automatic video workflow

## Product flow

Upload one 15–60-second clip, enter its project/scene and approve analysis. Backend extracts timestamped evidence, selects frame pairs automatically and makes one Gemini request. No manual frame assignment is part of the primary workflow. Returned findings refer to real extracted frame/pair IDs; the application assigns timestamps from those frames, not model-generated timecodes.

Timeline markers identify the sampled candidate frames, **not frame-perfect onset times**. Clicking a marker shows both supporting frames, evidence and uncertainty. Confirm, dismiss or mark intentional, save, then reload to retrieve the persisted decision.

## Boundaries

- Automatic sampling and visual similarity/shot heuristics are not exhaustive semantic video understanding. Short, clearly visible changes are the hackathon target; occluded, brief or unselected evidence may be missed. No finding is automatically a confirmed error.
- Video stays on this local application server; only chosen keyframes and consented context/rules go to Gemini. Local media and reports persist on disk for reload support. Do not submit footage without permission.
- Local-only app has no user authentication. Bind loopback; never publish or tunnel it. Project/scene namespaces isolate context, not users.
- The legacy two-still comparison engine remains available internally. It is not the primary product flow.

## External service approval

Do not call Gemini/Supermemory, connect to Tiger Data, change TLS or incur charges without explicit approval. Existing credentials do not grant blanket permission. Server gates and per-request disclosures remain required; uncheck remote-memory consent to keep optional Supermemory calls off. No hidden generation retries.

PostgreSQL uses the existing connection architecture. Current hackathon deployment has an explicitly owner-approved Tiger-only certificate-verification bypass (`sslmode=no-verify`), retaining TLS encryption; restore full verification before production. A clearly labeled on-disk local fallback supports reload persistence when PostgreSQL is disabled/unavailable. That fallback is **not live Tiger Data**. Approved human scene facts/rules are retrieved for subsequent analyses; unreviewed AI guesses never become approved memory.

## Verification labels

Offline unit/integration/browser tests intercept the provider boundary and do not prove genuine AI detection. A separate owner-approved live browser run now verifies the automatic pipeline: `gemini-3.6-flash`, one 15-second synthetic clip, 30 extracted frames, three visual shot groups, one automatically selected pair (0 and 9 seconds), and one missing-watch finding. HTTP 200 in 11.901 seconds, exactly one Gemini call. Review was confirmed, saved to local disk, reopened after page reload with matching note/status, and exported. Both supporting JPEGs loaded; no browser errors. Supermemory and PostgreSQL/Tiger Data stayed disabled. Analysis ID: `42744539-1346-4efd-93fa-e1019cd83ab2`. Synthetic fixture is an original geometric clip, not production footage; model finding was real, not injected.

## Live Supermemory verification

Owner separately approved enabling and testing Supermemory. `ALLOW_SUPERMEMORY=true` is set locally; Tiger Data/PostgreSQL remains disabled. One already-reviewed synthetic watch finding was shared through the real review API with explicit memory consent. Supermemory accepted it as queued, then exact document GET returned HTTP 200 with matching content, scoped namespace and decision ID `7f385256-a439-49d0-9175-a8931ce841d9`. Semantic recall returned `ready` with a real Supermemory hit (`3495894f35f13a2e9c6cc2`) referencing that decision. Scoped rule reconciliation returned the canonical human-approved fact. No Gemini generation or Tiger connection was made during this memory test. UI must still obtain separate per-request retrieval/sharing consent.

## Live Tiger Data verification

Owner approved encrypted demo access without server-certificate verification for Tiger Data only. Real TLS 1.3 connection succeeded, all three versioned migrations committed and were read back, then the application's real review endpoint saved existing synthetic analysis `42744539-1346-4efd-93fa-e1019cd83ab2` remotely. Direct SQL confirmed 30 keyframes, one pair, one finding, three review decisions and current confirmed status; application reload returned `mode: postgres`. No Gemini or Supermemory calls were needed. All three services are now enabled/live-verified individually; media bytes remain local while metadata, findings and decisions are in Tiger Data.

## Repeatable local fixture

```bash
npx tsx scripts/create-video-fixture.ts /absolute/native/path/watch-change.mp4
```

This creates an original silent 15-second geometric scene: watch present for 0–5 seconds, unrelated cutaway for 5–8 seconds, then the original view without the watch. Actual FFmpeg extraction was exercised: 30 sampled frames, three visual shot segments, and an automatic comparison spanning 0 to 9 seconds. Those are media/selection results, not AI findings. The fixture generator makes no external request. On Windows use `C:/Users/.../watch-change.mp4`, not an MSYS `/c/...` argument to native programs.

PostgreSQL video migration is `migrations/003_video.sql`; offline PGlite tests execute the actual migration and read/write SQL without connecting to Tiger Data. Local fallback lives under ignored `.continuityghost/videos/` (or `CONTINUITY_DATA_DIR/videos/`) and stores clip, JPEG evidence, manifest, decision history and approved rules. Back up that folder if local persistence matters; deleting it removes local evidence/history.
