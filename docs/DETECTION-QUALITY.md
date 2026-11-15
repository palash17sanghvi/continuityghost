# Backend-only detection quality pass

Branch: `improve/continuity-evidence`, based on `8dad3b7` (`origin/main`). Running main checkout, frontend, credentials and service settings are unchanged.

## Issues found

- Pair ranking rewarded elapsed time and large image changes. This could favor endpoints, ordinary motion or exposure changes rather than settled comparable shot evidence.
- Whole-image-average duplicate thresholds could erase small accessory/prop changes. Same-shot grouping could also suppress distinct evidence states while duplicate views consumed the comparison budget.
- Batch instructions did not explicitly distinguish anatomical hand switching from screen-side reversal, visible differences from suspected continuity errors, or observation confidence from error probability.
- Provider output silently discarded extra timestamps/frame fields and allowed repeated evidence to become multiple findings.

## Two targeted changes

1. **Shot-aware evidence selection.** Rank comparable revisited views using local stability and shot interior position instead of long-gap/large-motion preference. Select diverse visual groups before filling distinct evidence states. Deduplication now checks both average difference and local pixel residuals so a tiny watch change is not automatically treated as identical. Extraction stays bounded at 40 sampled frames; at most four pairs/eight unique images reach the existing single generation request.
2. **Evidence-first instructions and output handling.** Prompt explicitly checks comparable identities/views, props/wardrobe/accessories/environment, mirroring/occlusion/intentional action alternatives, and allows zero findings. Internal provider fields distinguish `observed_difference` from `suspected_continuity_error` and qualitative visual-evidence confidence (`low`, `moderate`, `high`, `insufficient`). Public response keys are unchanged: interpretation is displayed in `description`, confidence and limitations in `uncertainty`, and server-owned sample times/frame IDs are prefixed to both evidence strings. Missing confidence is not established; low/insufficient confidence cannot upgrade an observation to a suspected error. Strict parsing rejects invented timestamp/frame properties and invalid confidence values. Repeated normalized evidence is collapsed; independently supported changes remain separate.

## Compatibility and cost

No frontend/API-route/shared public-schema changes. Existing `pairId` links and `frames`/`pairs` arrays remain authoritative. All findings stay unreviewed. Existing provider model, one-call/no-retry policy, timeout and 10,000-output-token ceiling are unchanged; no increase to image/comparison caps. Prompt is somewhat longer, so equal configured caps do not guarantee identical actual token usage. No live provider calls, credentials, production resources, billing or new infrastructure were used/changed.

## Verification

- 227 unit/integration tests passed (baseline 205).
- 13 existing browser tests passed with provider APIs intercepted and service gates disabled.
- ESLint, TypeScript and production build passed in an isolated worktree.
- Real FFmpeg fixtures cover unchanged static footage, disappearing accessory, cutaway/revisited shot, timestamps and deterministic selection. Descriptor fixtures cover transient changes, visual diversity, tiny local changes, lighting/movement and duplicate views.
- Provider mocks cover no issue, one issue, multiple independent changes, ambiguous observations, duplicate findings, malformed output, unknown/invented temporal/frame references, invalid confidence, quota failures and timeouts without retries.

## Remaining limits

These are deterministic regression checks, not measured Gemini precision/recall improvements; live evaluation needs separate approval. Shot grouping/visual comparability remain heuristics: similar backgrounds may hide different subjects, and true changes during motion or brief unsampled events may be missed. Qualitative confidence is model self-assessment, not calibration. Exact normalized evidence deduplication cannot merge arbitrary paraphrases, and indistinguishable generic evidence may collapse distinct objects; instructions ask for specific identity and location. Sample timestamps identify supporting evidence, not exact mistake onset. Real provider acceptance of added internal enum fields is not live-verified; no main merge/deployment was performed.
