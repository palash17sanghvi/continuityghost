# Public media provenance

These are evidence assets, not generated product claims. Public JPEGs contain newly encoded RGB pixels with EXIF/XMP/comments omitted. Originals remain outside Git.

## Award photographs

The user supplied four individual JPG attachments in this session. No `ContinuityGhost_SunHacks_Photos.zip` was available. The attachment names do not match every proposed original filename, so the supplied stage image is not asserted to be `IMG_6439.jpg`.

| Public asset | Supplied attachment suffix | Processing / use |
| --- | --- | --- |
| [Stage team](awards/sunhacks-2026-gemini-winners.jpg) | `a3629477_6440.jpg` | EXIF orientation applied; empty upper curtain/rigging and lower floor cropped. All four people, shoes, and certificates retained. README award image. |
| [Certificate](awards/sunhacks-2026-gemini-certificate.jpg) | `0973c5e3_0187.jpg` | EXIF orientation applied, then a further 90° counterclockwise rotation. No content edits or added wording. Linked evidence. |
| [Alternate team](awards/sunhacks-2026-winning-team.jpg) | `93ecb013_6446.jpg` | EXIF orientation applied; full composition retained. Linked alternate for later use. |

Longest edge is 1600 px. Faces, expressions, certificate text/artwork, and people were not altered. The fourth supplied stage image (`35ac1a38_6442.jpg`) was inspected but not committed; it duplicated the primary scene.

Certificate wording: “best use of Gemini API,” “is awarded to,” “Continuity Ghost,” “15 November 2026.” The supplied photos and owner's event attribution support a team category award, not an overall win or a separate claim that Google issued the certificate. No teammate identities were inferred from faces.

## Product screenshot

[Analysis studio](screenshots/analysis-studio-offline-fixture.jpg) is an optimized copy of the existing [Playwright screenshot](../overnight-screenshots/evidence-navigation-desktop.png). Its generation is documented in [the UI test suite](../../tests/studio.spec.ts) and [historical polish report](../overnight-website-report.md). The actual app renders browser-generated synthetic video and intercepted fixture responses. The visible finding is explicitly labeled as a test fixture, not live Gemini output. Do not crop away that distinction or relabel this as a live provider result.

### Focused README crops

The follow-up keeps the original full screenshot above unchanged and adds two direct crops from its 985 × 1800 pixels. No UI elements, findings, labels, or data were edited or composited.

- [Evidence and review](screenshots/review-evidence-offline-fixture.jpg): rectangle `(406, 1030, 940, 1710)`, producing **534 × 680** pixels. Shows the watch fixture, reference/candidate frames, 2/10-second timestamps, uncertainty, and review actions.
- [Playback and timeline](screenshots/video-timeline-offline-fixture.jpg): rectangle `(96, 602, 952, 780)`, producing **856 × 178** pixels. Shows playback controls and the selected finding marker at 10 seconds.

Bounds use `(left, top, right, bottom)` with exclusive right/bottom edges. Fresh RGB JPEG encoding removes metadata; README places an explicit synthetic-video/mocked-findings disclosure immediately below the primary crop and retains a full-size screenshot link. These are views of the same offline fixture, not live inference.

## Project video

[Thumbnail](project-video-thumbnail.jpg) was retrieved from YouTube's `https://i.ytimg.com/vi/6cv2eZ5ibYQ/hqdefault.jpg`, matching the oEmbed response for [the owner's exact URL](https://www.youtube.com/watch?v=6cv2eZ5ibYQ). It links to that video, not another upload.

YouTube metadata lists *Demo Video*, author Johan Jagalur, approximately 123 seconds. Metadata and player availability were checked. Playback/content could not be fully independently reviewed, so README uses neutral project-video wording and makes no live-output claim. The thumbnail shows a presenter, not the app; product UI is shown separately.
