# Portfolio verification receipt

This documentation/media pass was based on `e944f1b` on `main`, on branch `docs/sunhacks-portfolio-polish`. It changes no application source, dependency manifest/lockfile, migrations, or service configuration. No credentials were read, no paid calls or external database writes were made, and nothing was deployed.

## Checks actually executed

Environment: macOS, Node.js **25.8.1**, npm **11.11.0**, FFmpeg/ffprobe **9.0.2**. The repository does not pin a Node runtime.

| Command / check | Result | Scope |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Passed | Installed lockfile dependencies in a fresh isolated clone; lifecycle scripts suppressed |
| `npm run lint` | Passed | ESLint; exit 0 |
| `npm audit --omit=dev --json` | Passed: **0 production vulnerabilities reported** | Registry advisory snapshot, not a security certification; install reported two low-severity advisories including development dependencies |
| `npm test` | Passed: **18 files, 227 tests** | Vitest unit/route tests; real synthetic FFmpeg/filesystem fixtures and embedded PGlite SQL; external providers mocked |
| `npm run build` | Passed | Next.js production compilation, TypeScript build stage, route generation; not a deployment |
| `npm run typecheck` | Passed | `tsc --noEmit` after build generated Next.js types |
| `npx playwright install chromium` | Passed | Local browser prerequisite |
| `npm run test:e2e` | Passed: **27 tests** | Chromium desktop/mobile workflows, synthetic video, intercepted API fixture responses; all three service flags disabled by Playwright config |
| `python3 -m unittest discover -s scripts -p 'test_*.py'` | Passed: **16 tests** | Credential-helper safety tests in temporary directories; not interactive setup or live verification |

The browser suite regenerates existing tracked screenshots. Those generated copies were restored from an outside-repository backup so this PR does not include unrelated screenshot churn. The new README screenshot is optimized from the preexisting labeled fixture capture; it is not presented as live output.

## Presentation checks

- Rendered the README with a GitHub-like Markdown preview in local Chromium at desktop and mobile widths; all three inline images loaded. Visual inspection covered the hero, screenshot, diagram and team photo.
- Parsed and rendered the Mermaid diagram with Mermaid, not just a code-fence inspection.
- Checked **106** repository-relative Markdown destinations and heading anchors across **17** current project documentation files: zero broken destinations. Historical vendor/source links are references, not freshly certified APIs.
- Verified the supplied YouTube URL through oEmbed metadata and player availability; title *Demo Video*, author Johan Jagalur, approximately 123 seconds. Full playback/content could not be independently reviewed. The thumbnail is YouTube's matching image; README makes no live-output claim.
- Inspected all four supplied photos. Committed three optimized derivatives, not the duplicate fourth stage photo. Confirmed upright certificate, intact people/certificates in the primary crop, and no EXIF/XMP/comments in committed JPEGs.
- Reviewed the documentation-only diff, checked whitespace with `git diff --check`, and scanned changed public text for credential-shaped tokens. No private environment files or source media are included.
- The first pass found no verified project-specific Devpost URL. The follow-up verified the owner-supplied canonical [Continuity Ghost submission](https://devpost.com/software/continuity-ghost): matching product, video/frame workflow, stack, and four creators. Later direct requests encountered Devpost's bot check; the initial extracted page was readable. No individual contribution claims were inferred.

## Portfolio/CI follow-up

Baseline `40fc225` includes merged PR #1. New work uses `improvement/portfolio-ci-and-media`; original award assets, full screenshot, app source, lockfile and security controls remain unchanged.

Fresh local checks used **Node.js 24.22.3 LTS**: `npm ci`, lint, **227 Vitest tests / 18 files**, production build, typecheck, **16 Python helper tests**, and **27 Playwright tests** passed. All service flags were false and provider/database keys blank. Python's dotenv roundtrip initially failed because blank inherited keys override synthetic fixture files; the workflow unsets just those three key/URL variables for the Python process while keeping service flags false. Rerun passed without changing tests or application code.

The workflow `.github/workflows/ci.yml` runs on PRs to `main`, pushes to `main`, and manual dispatch. Separate quality/browser jobs use Ubuntu 24.04, Node 24 LTS, npm lockfile caching, immutable official action SHAs, read-only contents permission, no persisted checkout credentials, 15-minute job limits, and concurrency cancellation. Quality installs FFmpeg, runs lint/tests/build/typecheck/Python. Build precedes typecheck because Next generates clean-checkout type contracts. Browser installs Chromium/OS dependencies and uses the existing loopback/intercepted fixture setup. No production secrets, migrations, external service jobs, deployment, artifact upload, or tunnel are configured.

`actionlint` 1.7.12 validates workflow syntax/expressions. The [first hosted run](https://github.com/palash17sanghvi/continuityghost/actions/runs/43914067635) completed successfully for commit `14255b7`: both quality and browser jobs passed on Ubuntu. Local checks alone were not treated as hosted success. The README status badge was added after that successful GitHub run; its URL tracks `main`, so before merge it may show no status for the new workflow on that branch.

The Devpost canonical page matched the product and names four creators. README links it near the top and in project links; no contributions are attributed from that listing. YouTube oEmbed still resolves to the exact supplied video, titled *Demo Video* by Johan Jagalur. Full-content verification limits remain in this receipt and media provenance instead of the README opening.

Current install advisory snapshot reported **seven moderate advisories** including development dependencies; `npm audit --omit=dev --json` reported **zero production vulnerabilities**. No dependency changes were made in this scoped follow-up.

## Historical live evidence is separate

The earlier 15-second/30-frame/three-group missing-watch observation and **11.901-second** response are recorded in [automatic-video documentation](AUTOMATIC-VIDEO.md#verification-labels), introduced with commit `8dad3b7`. This is a repository evidence trail, not raw live-provider output freshly reproduced here. Later evidence-selection changes mean its exact pair selection is not a benchmark for current code.

The [integration ledger](INTEGRATION-VERIFICATION.md) distinguishes individually recorded Gemini, Supermemory, and Tiger Data checks from a combined three-service acceptance run. Embedded SQL tests do not prove current Tiger Data access or live TimescaleDB behavior. The historical certificate-verification exception remains a security limitation, not a production recommendation.

## Remaining acceptance gaps

- No new paid/provider integration verification, measured accuracy dataset, representative production-footage evaluation, or general latency benchmark.
- Devpost is now linked to its official team listing; individual contribution ownership remains unverified.
- The expected ZIP and exact proposed `IMG_6439.jpg` / `IMG_6444.jpg` originals were not attached; available individual JPGs were used with their actual provenance.
- Local-only application: authentication, authorization, media retention/deletion, and verified production TLS are not resolved by this portfolio pass. Dependency audit reported **two low-severity advisories** during install; dependency updates are outside this docs-only scope.
