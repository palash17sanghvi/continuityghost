# Local demo runbook

## Start safely

1. Run `npm ci`, then `npm run dev -- --hostname 127.0.0.1`; open http://127.0.0.1:3000. No public deployment or tunnels: no authentication exists.
2. Keep `ALLOW_PAID_ANALYSIS=false` for an unconfigured/gated walkthrough. Use two owned or explicitly approved stills; do not upload confidential production material casually.
3. Explain scope: two-image comparison, human evidence review, local export, opt-in database saves, scene-specific memory and SQL analytics. All live sponsor checks remain blocked until approved credentials exist. Video analysis and vendor imports are not implemented. Follow [integration verification](INTEGRATION-VERIFICATION.md) for full before/after walkthrough.

## Walkthrough without a real API call

Show upload/context and consent controls. Leave cost/data approvals unchecked and show the blocked state or configuration error as appropriate. Explain that the server independently requires a key, enabled server cost gate, and both browser approvals. This is a UI/gate walkthrough, **not an AI comparison**.

If showing automated tests, run `npx vitest run` and label the output **mocked provider tests**. Do not present fixture findings, a hard-coded sample response, or screenshots of mocks as real Gemini output. Build/lint success is not live API verification.

## Authorized real comparison only

1. Owner approves possible costs and uses README hidden-input credential setup privately. Set server `ALLOW_PAID_ANALYSIS=true` privately and restart. Never show `.env.local`, keys, or request authorization headers on screen.
2. Choose a reference and candidate still, each nonempty JPEG/PNG/WebP ≤8 MiB. Enter project/scene and optional context. Check data-transmission consent and cost approval explicitly in the browser.
3. Submit once. Show loading, then only the actual provider response or honest error. Invalid output/network failure is a failed run, not a cue to invent findings; do not retry blindly because charges may occur.
4. Inspect reference/candidate evidence and uncertainty. A visible difference may be intended action, lens/lighting variation, or occlusion. Human review decides; a valid zero-findings response is acceptable.
5. Change a review decision and download the available export. Explain that this creates a local copy, not durable server storage. Reload to verify advertised loss behavior using only disposable review data, then restore `ALLOW_PAID_ANALYSIS=false` and restart when finished.

A live call remains **blocked/unverified** until all prerequisites are met and a real result is observed. These instructions are not an execution report.

## If something fails

| Symptom | Action |
| --- | --- |
| Gemini not configured | Keep live demo blocked; configure key privately only with owner permission. |
| Paid analysis disabled / missing approval | Explain independent server + browser gates; do not bypass them. |
| Image validation or request-size error | Use valid smaller stills; do not rename an unsupported file to disguise its type. |
| Provider error or invalid response | Show error honestly; inspect redacted server diagnostics, not uploaded data or secrets. |
| Reload loses decisions | Expected session-only limitation; use local export before leaving page. |

## Submission and pitch

Sunhacks event page lists November 14–15, 2026; dashboard schedule lists projects due November 15 at 11:00 AM Arizona local time. Recheck organizer page before submission. MLH lists Gemini and Tiger Data challenge categories; Supermemory track is unverified even though the organizer lists Supermemory as a sponsor. Full citations: [SPONSORS](SPONSORS.md).

Suggested truthful pitch: “ContinuityGhost is a local two-still continuity review prototype. It is designed to call Gemini only after explicit server and browser approvals, then give humans evidence and uncertainty to review. Durable memory, database analytics, and imports are future work.” If a real call has not succeeded, say so directly; if it has, describe only that observed run.
