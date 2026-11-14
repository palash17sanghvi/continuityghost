# Product requirements: two-image milestone

## Problem and user

Script supervisors need a second look at visible continuity differences between two stills. ContinuityGhost supports their judgment; it does not decide whether a difference is a mistake or replace script supervision.

**Milestone:** compare one reference image with one candidate image through Gemini, display evidence-backed possible differences, and support session-only human review/export. No database or long-term memory is implemented.

## User flow

1. Start on loopback; select a project label, scene label, optional context, and two stills.
2. Inspect previews; explicitly consent to sending the material and separately approve possible API costs. Owner must also have enabled server paid analysis.
3. Request comparison. Show progress and actionable validation/configuration/provider errors; never generate a fallback AI result.
4. Review possible wardrobe, prop, placement, appearance, action, or background differences. Each item includes reference evidence, candidate evidence, uncertainty, and a suggested next action.
5. Record a human decision and download the available review export. Explain that decisions are session-only and can disappear on reload; export is not server persistence.

## Must-have acceptance criteria

- Exactly two intended inputs; each nonempty JPEG/PNG/WebP no larger than 8 MiB. Validate actual decoded bytes and declared MIME, not extension alone. Reject corrupt, oversized, animated, and excessive-pixel images. Bound the entire multipart body, including chunked uploads.
- No provider call without `GEMINI_API_KEY`, server `ALLOW_PAID_ANALYSIS=true`, browser `costApproved=true`, and browser `consent=true`. Missing approval must not be treated as implicit approval.
- Parse model output against a schema. A valid empty findings list is allowed. Invalid JSON/schema, timeout, or provider error must remain an error, never synthetic success. Model output is untrusted text, not executable instructions or HTML.
- Human-readable evidence and uncertainty are mandatory. No unsupported certainty scores, invented locations/timecodes, or auto-confirmed errors. Human review is authoritative only for this browser session in the current milestone.
- Keyboard-accessible labeled controls, visible focus, clear consent wording, and accessible loading/error feedback. Do not claim real integration verified from mocked tests or provider request construction alone.

## Non-goals

No authentication, public deployment, database, Supermemory calls, persisted media, durable approvals, project collaboration, automatic conflict resolution, video processing, script parsing, or vendor import adapters. TXT/CSV imports are planned; PDF parsing/OCR comes later. Sponsor eligibility does not mean a sponsor integration exists.

## Privacy and safety

Local-only is mandatory because no authentication exists. Loopback binding and same-origin checks are not multi-user authorization. Do not use public tunnels. No application media persistence; approved analysis still transmits normalized images and context to Google. Do not assert Google retention guarantees without separate policy review. Avoid logging uploads, keys, base64 data, or full production notes. Exported files are user-controlled sensitive copies.

## Verification policy

Mocked tests verify validation, consent gates, response parsing, and provider error handling only. A live comparison stays blocked absent a real key, owner cost approval, and explicit browser approvals. Record real execution separately when authorized, including model, request outcome, and observed limitations without storing media or secrets. A proposed screen or acceptance checklist is not a completed test.

## Success and next scope

Success means an authorized local real call produces schema-valid findings (possibly zero), a person can inspect and review them, and session export behaves as labeled. Until that happens, report the milestone as an unverified live integration, even if mocks pass.

Future product work must start with authentication, relational project ownership, explicit retention/deletion policy, and authorization tests before remote deployment or durable memory. See [ARCHITECTURE](ARCHITECTURE.md), [TASKS](TASKS.md), and official API/compatibility research in [SPONSORS](SPONSORS.md).
