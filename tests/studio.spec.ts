import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const baseURL = process.env.STUDIO_BASE_URL || "http://127.0.0.1:3000";
const analysisId = "5fd07508-ce39-42f0-85f1-26ec42076dbc";
const findingId = "a511c011-5487-481b-99f0-f303139e1652";
const response = { analysisId, projectId: "Test project", sceneId: "Scene 1", summary: "Test comparison returned by intercepted API.", findings: [{ id: findingId, category: "props", description: "Prop changed", referenceEvidence: "Cup", candidateEvidence: "Glass", uncertainty: "Perspective may differ", suggestedAction: "Check prop", status: "unreviewed" }] };
const image = { name: "frame.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=", "base64") };
test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", route => route.fulfill({ json: { geminiConfigured: true, paidAnalysisEnabled: true, model: "test-model", memoryConfigured: false, databaseConfigured: false } }));
  await page.goto(baseURL);
});
async function prepare(page: Page) {
  await page.getByLabel("Project", { exact: true }).fill("Test project");
  await page.getByLabel("Scene", { exact: true }).fill("Scene 1");
  await page.getByLabel("Upload reference frame").setInputFiles(image);
  await page.getByLabel("Upload candidate frame").setInputFiles(image);
  await page.getByLabel("I consent to sending both images and context to Google Gemini.", { exact: true }).check();
  await page.getByLabel("I approve a billable Gemini API call.").check();
}
async function analyze(page: Page) {
  await prepare(page);
  await page.getByRole("button", { name: "Analyze continuity", exact: true }).click();
  await expect(page.getByText("Prop changed", { exact: true })).toBeVisible();
}
async function mockConnections(page: Page, memoryConfigured: boolean, databaseConfigured: boolean) {
  await page.route("**/api/health", route => route.fulfill({ json: { geminiConfigured: true, paidAnalysisEnabled: true, model: "test-model", memoryConfigured, databaseConfigured } }));
  await page.reload();
}

test("truthful empty shell, working navigation, and permissions", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Continuity studio", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No analysis yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze continuity", exact: true })).toBeDisabled();
  await expect(page.getByText("Local playback only.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No comparisons yet" })).toBeVisible();
  await page.getByRole("button", { name: "Scenes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Scene library" })).toBeVisible();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No analysis yet" })).toBeVisible();
  await page.getByRole("button", { name: "Session details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ephemeral by design" })).toBeVisible();
  await expect(page.getByText("No database is connected.", { exact: true })).toBeVisible();
});

test("image validation, real previews, overlay, and remove", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/analyze", route => { calls++; return route.abort(); });
  await page.getByLabel("Upload reference frame").setInputFiles(image);
  await expect(page.getByRole("img", { name: "Reference frame preview" })).toBeVisible();
  await page.getByLabel("Upload candidate frame").setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert", { name: "Upload or analysis error" })).toContainText("JPEG, PNG, or WebP");
  await page.getByLabel("Upload candidate frame").setInputFiles(image);
  await page.getByRole("button", { name: "Overlay", exact: true }).click();
  await expect(page.getByRole("img", { name: "Candidate overlay", exact: true })).toBeVisible();
  await page.getByLabel("Candidate opacity").fill("70");
  await expect(page.getByRole("img", { name: "Candidate overlay", exact: true })).toHaveCSS("opacity", "0.7");
  await page.getByRole("button", { name: "Remove candidate frame" }).click();
  await expect(page.getByRole("button", { name: "Analyze continuity", exact: true })).toBeDisabled();
  expect(calls).toBe(0);
});

test("multipart, review, export, session library, and invalidation", async ({ page }) => {
  await page.route("**/api/analyze", async route => {
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    const body = route.request().postDataBuffer()!.toString();
    for (const field of ["reference", "candidate", "projectId", "sceneId", "context", "consent", "costApproved", "memoryConsent"]) expect(body).toContain(`name="${field}"`);
    expect(body).toContain('name="memoryConsent"\r\n\r\nfalse');
    await route.fulfill({ json: response });
  });
  await analyze(page);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByLabel("Review note", { exact: true }).fill("Check with script supervisor.");
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open 0", exact: true }).click();
  await expect(page.getByText("No findings in this filter.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reviewed 1", exact: true }).click();
  await expect(page.getByText("Prop changed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save decision", exact: true })).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toBe("continuityghost-report.json");
  const report = JSON.parse(await readFile((await artifact.path())!, "utf8"));
  expect(report.findings[0].status).toBe("confirmed");
  expect(report.findings[0].note).toBe("Check with script supervisor.");
  expect(report.sourceFiles.reference.name).toBe("frame.png");
  expect(report.sourceFiles.reference.size).toBe(image.buffer.length);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test project", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /SESSION PROJECT Test project/ }).click();
  await expect(page.getByRole("heading", { name: "Scene library" })).toBeVisible();
  await page.getByRole("button", { name: "Review", exact: true }).last().click();
  await expect(page.getByRole("img", { name: "Review reference frame" })).toBeVisible();
  await expect(page.getByLabel("Review note", { exact: true })).toHaveValue("Check with script supervisor.");
  await page.getByRole("button", { name: "Inspect in Studio" }).click();
  await page.getByLabel("Scene", { exact: true }).fill("Scene 2");
  await expect(page.getByRole("heading", { name: "No analysis yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export JSON", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Review", exact: true }).first().click();
  await page.getByLabel("Select comparison to review").selectOption(analysisId);
  await expect(page.getByText("Prop changed", { exact: true })).toBeVisible();
});

test("non-2xx API error shown without fabricated results", async ({ page }) => {
  await page.route("**/api/analyze", route => route.fulfill({ status: 502, json: { error: { code: "provider_error", message: "Provider unavailable" } } }));
  await prepare(page);
  await page.getByRole("button", { name: "Analyze continuity", exact: true }).click();
  await expect(page.getByRole("alert", { name: "Upload or analysis error" })).toContainText("Provider unavailable");
  await expect(page.getByRole("heading", { name: "No analysis yet" })).toBeVisible();
});

test("cancel prevents late response and leaves clear billing disclosure", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/analyze", async route => { await gate; await route.fulfill({ json: response }).catch(() => {}); });
  await prepare(page);
  await page.getByRole("button", { name: "Analyze continuity", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel analysis" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  release();
  await expect(page.getByText(/Analysis cancelled locally/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "No analysis yet" })).toBeVisible();
  await expect(page.getByText("Prop changed", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Scene", { exact: true })).toBeEnabled();
});

for (const [name, payload] of [
  ["bad structure", { summary: "Incomplete", findings: [] }],
  ["missing evidence", { ...response, findings: [{ id: findingId, category: "props", description: "Bad", status: "unreviewed" }] }],
  ["duplicate finding IDs", { ...response, findings: [response.findings[0], response.findings[0]] }],
  ["unsafe memory shape", { ...response, memory: { status: "ok", facts: [{}] } }],
  ["mismatched project", { ...response, projectId: "Different project" }],
  ["non-string warning", { ...response, persistence: { status: "saved", warning: {} } }],
] as const) test(`reject malformed analysis: ${name}`, async ({ page }) => {
  await page.route("**/api/analyze", route => route.fulfill({ json: payload }));
  await prepare(page);
  await page.getByRole("button", { name: "Analyze continuity", exact: true }).click();
  await expect(page.getByRole("alert", { name: "Upload or analysis error" })).toContainText("incomplete");
  await expect(page.getByRole("heading", { name: "No analysis yet" })).toBeVisible();
});

test("paid analysis gate cannot be bypassed with approvals", async ({ page }) => {
  await page.route("**/api/health", route => route.fulfill({ json: { geminiConfigured: true, paidAnalysisEnabled: false, model: "test", memoryConfigured: false, databaseConfigured: false } }));
  await page.reload(); await prepare(page);
  await expect(page.getByRole("button", { name: "Analyze continuity", exact: true })).toBeDisabled();
  await expect(page.getByText(/Paid analysis is disabled on this server/)).toBeVisible();
});

test("oversize image is blocked locally before any analysis request", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/analyze", route => { calls++; return route.abort(); });
  await page.getByLabel("Upload reference frame").setInputFiles({ name: "oversize.png", mimeType: "image/png", buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
  await expect(page.getByRole("alert", { name: "Upload or analysis error" })).toContainText("8 MiB");
  await expect(page.getByRole("img", { name: "Reference frame preview" })).toHaveCount(0);
  expect(calls).toBe(0);
});

test("unreadable API response does not become empty success", async ({ page }) => {
  await page.route("**/api/analyze", route => route.fulfill({ contentType: "text/html", body: "<html>Proxy error</html>" }));
  await prepare(page);
  await page.getByRole("button", { name: "Analyze continuity", exact: true }).click();
  await expect(page.getByRole("alert", { name: "Upload or analysis error" })).toContainText("unreadable response");
  await expect(page.getByRole("heading", { name: "No analysis yet" })).toBeVisible();
});

test("approved retrieval plus successful durable review preserves memory warning", async ({ page }) => {
  await mockConnections(page, true, true);
  await page.route("**/api/analyze", async route => {
    expect(route.request().postDataBuffer()!.toString()).toContain('name="memoryConsent"\r\n\r\ntrue');
    await route.fulfill({ json: { ...response, memory: { status: "retrieved", facts: [{ id: "fact", content: "Approved continuity fact", source: "Script supervisor" }], warning: "Some memory results were unavailable." }, persistence: { status: "saved" } } });
  });
  await page.route("**/api/reviews", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ analysisId, findingId, projectId: "Test project", sceneId: "Scene 1", status: "intentional", consent: true });
    await route.fulfill({ json: { persisted: true, memory: { status: "failed", warning: "Memory write failed; database decision retained." } } });
  });
  await prepare(page);
  await page.getByLabel("I consent to retrieving approved project/scene memory from Supermemory for this analysis.").check();
  await page.getByRole("button", { name: "Analyze continuity", exact: true }).click();
  await expect(page.getByText("Approved continuity fact", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Intentional", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save decision", exact: true })).toBeDisabled();
  await page.getByLabel("I consent to sending this review’s facts and notes to Supermemory.").check();
  await page.getByRole("button", { name: "Save decision", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Decision saved. Memory: failed." })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Memory write failed; database decision retained." })).toBeVisible();
});

test("review save failure retains local state and never claims success", async ({ page }) => {
  await mockConnections(page, false, true);
  await page.route("**/api/analyze", route => route.fulfill({ json: response }));
  await page.route("**/api/reviews", route => route.fulfill({ status: 503, json: { error: { message: "Database write failed. Local review retained." } } }));
  await analyze(page);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: "Save decision", exact: true }).click();
  await expect(page.getByText("Database write failed. Local review retained.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Decision saved/)).toHaveCount(0);
});

test("optional analytics render only validated database values", async ({ page }) => {
  await page.route("**/api/analytics?**", route => route.fulfill({ json: { categories: [{ category: "props", count: 2 }], outcomes: [{ status: "confirmed", count: 1 }], trends: [{ bucket: "2026-10-01", count: 2 }], totals: { analyses: 3, findings: 2, reviews: 1 }, timeSeriesMode: "postgres" } }));
  await page.getByLabel("Project", { exact: true }).fill("Test project");
  await page.getByRole("button", { name: "Session details", exact: true }).click();
  await page.getByRole("button", { name: "Load analytics", exact: true }).click();
  await expect(page.getByLabel("Project analytics")).toContainText("Analyses: 3 · Findings: 2 · Reviews: 1");
  await expect(page.getByLabel("Project analytics")).toContainText("props: 2");
  await page.route("**/api/analytics?**", route => route.fulfill({ json: { totals: { analyses: 999 } } }));
  await page.getByRole("button", { name: "Load analytics", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid analytics response" })).toBeVisible();
  await expect(page.getByLabel("Project analytics")).toHaveCount(0);
});

test("local video scrub captures two real frames and exports real source times", async ({ page }) => {
  // Browser-generated WebM fixture: no external files, fake player, runtime API, or paid calls.
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 90;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(20);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks: Blob[] = [];
    const done = new Promise<Blob>(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" })); });
    recorder.start();
    for (let i = 0; i < 20; i++) { ctx.fillStyle = i < 10 ? "#d8a65c" : "#5c8fd8"; ctx.fillRect(0, 0, 160, 90); await new Promise(r => setTimeout(r, 50)); }
    recorder.stop(); const blob = await done; stream.getTracks().forEach(t => t.stop());
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ""; bytes.forEach(b => { binary += String.fromCharCode(b); }); return btoa(binary);
  });
  await page.route("**/api/analyze", async route => {
    const body = route.request().postDataBuffer()!.toString();
    expect(body).toContain("image/jpeg"); expect(body).not.toContain("video/webm");
    await route.fulfill({ json: response });
  });
  await page.getByLabel("Import local video").setInputFiles({ name: "local-test.webm", mimeType: "video/webm", buffer: Buffer.from(base64, "base64") });
  await expect(page.getByRole("button", { name: "Set reference frame", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Set reference frame", exact: true }).click();
  await expect(page.getByRole("img", { name: "Reference frame preview", exact: true })).toBeVisible();
  // MediaRecorder WebM may not contain a finite duration header. Native player can still seek.
  await page.getByLabel("Local video player").evaluate((element: HTMLVideoElement) => { element.currentTime = 0.7; });
  await expect(page.getByRole("button", { name: "Set candidate frame", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Set candidate frame", exact: true }).click();
  await expect(page.getByRole("img", { name: "Candidate frame preview", exact: true })).toBeVisible();
  await page.getByLabel("Project", { exact: true }).fill("Test project");
  await page.getByLabel("Scene", { exact: true }).fill("Scene 1");
  await page.getByLabel("I consent to sending both images and context to Google Gemini.", { exact: true }).check();
  await page.getByLabel("I approve a billable Gemini API call.").check();
  await page.getByRole("button", { name: "Analyze continuity", exact: true }).click();
  await expect(page.getByText("Prop changed", { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const report = JSON.parse(await readFile((await (await downloaded).path())!, "utf8"));
  expect(report.sourceFiles.reference.video.name).toBe("local-test.webm");
  expect(report.sourceFiles.reference.video.timeSeconds).toBeCloseTo(0, 1);
  expect(report.sourceFiles.candidate.video.timeSeconds).toBeCloseTo(0.7, 1);
  expect(report.sourceFiles.candidate.type).toBe("image/jpeg");
});

test("narrow viewport stays inside screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Continuity studio", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});