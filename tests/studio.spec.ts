import { test, expect } from "@playwright/test";

const baseURL = process.env.STUDIO_BASE_URL || "http://127.0.0.1:3000";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", route => route.fulfill({ json: { geminiConfigured: true, model: "test-model", memoryConfigured: false, databaseConfigured: false } }));
  await page.goto(baseURL);
});
const analysisResponse = { analysisId: "test-analysis", projectId: "Test project", sceneId: "Scene 1", summary: "Comparison", findings: [{ id: "f1", category: "props", description: "Prop changed", referenceEvidence: "Cup", candidateEvidence: "Glass", uncertainty: "Perspective", suggestedAction: "Check", status: "unreviewed" }] };
async function runAnalysis(page: import("@playwright/test").Page, memoryConsent = false) {
  await page.getByLabel("Project", { exact: true }).fill("Test project");
  await page.getByLabel("Scene", { exact: true }).fill("Scene 1");
  await page.getByLabel("Upload reference frame").setInputFiles(image);
  await page.getByLabel("Upload candidate frame").setInputFiles(image);
  await page.getByLabel("I consent to sending both images and context to Google Gemini.", { exact: true }).check();
  await page.getByLabel("I approve a billable Gemini API call.").check();
  if (memoryConsent) await page.getByLabel("I consent to retrieving approved project/scene memory from Supermemory for this analysis.").check();
  await page.getByRole("button", { name: "Analyze continuity" }).click();
  await expect(page.getByText("Prop changed", { exact: true })).toBeVisible();
}
const image = { name: "frame.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=", "base64") };

test("honest empty studio, disclosures, and working session tab", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Every detail. Every take." })).toBeVisible();
  await expect(page.getByText("No analysis yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze continuity" })).toBeDisabled();
  await expect(page.getByLabel("I consent to sending both images and context to Google Gemini.")).toBeVisible();
  await expect(page.getByLabel("I approve a billable Gemini API call.")).toBeVisible();
  await page.getByRole("tab", { name: "Session details" }).click();
  await expect(page.getByRole("heading", { name: "Session details" })).toBeVisible();
  await expect(page.getByText("No database or cross-session memory is connected.")).toBeVisible();
});

test("local image previews and validation without API calls", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/analyze", route => { calls++; return route.abort(); });
  await page.getByLabel("Upload reference frame").setInputFiles(image);
  await expect(page.getByRole("img", { name: "Reference frame preview" })).toBeVisible();
  await page.getByLabel("Upload candidate frame").setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(page.getByRole("alert", { name: "Upload or analysis error" })).toContainText("JPEG, PNG, or WebP");
  await expect(page.getByRole("button", { name: "Analyze continuity" })).toBeDisabled();
  expect(calls).toBe(0);
});

test("multipart analysis, review, export, and input invalidation", async ({ page }) => {
  await page.route("**/api/analyze", async route => {
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    const body = route.request().postDataBuffer()!.toString();
    for (const field of ["reference", "candidate", "projectId", "sceneId", "context", "consent", "costApproved"]) expect(body).toContain(`name="${field}"`);
    await route.fulfill({ json: { analysisId: "test-analysis", projectId: "Test project", sceneId: "Scene 1", summary: "Test response from intercepted endpoint.", findings: [{ id: "f1", category: "props", description: "Test prop discrepancy", referenceEvidence: "Test reference evidence", candidateEvidence: "Test candidate evidence", uncertainty: "Perspective may differ.", suggestedAction: "Check the prop.", status: "unreviewed" }] } });
  });
  await page.getByLabel("Project", { exact: true }).fill("Test project");
  await page.getByLabel("Scene", { exact: true }).fill("Scene 1");
  await page.getByLabel("Upload reference frame").setInputFiles(image);
  await page.getByLabel("Upload candidate frame").setInputFiles(image);
  await page.getByLabel("I consent to sending both images and context to Google Gemini.").check();
  await page.getByLabel("I approve a billable Gemini API call.").check();
  await page.getByRole("button", { name: "Analyze continuity" }).click();
  await expect(page.getByText("Test prop discrepancy")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Review note").fill("Checked against slate");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.getByLabel("Scene", { exact: true }).fill("Scene 2");
  await expect(page.getByText("No analysis yet", { exact: true })).toBeVisible();
  await expect(page.getByText("Test prop discrepancy")).toHaveCount(0);
});

test("durable review needs separate consent and locks scope while saving", async ({ page }) => {
  await page.route("**/api/health", route => route.fulfill({ json: { geminiConfigured: true, model: "test", memoryConfigured: true, databaseConfigured: true } }));
  await page.reload();
  await page.route("**/api/analyze", route => {
    expect(route.request().postDataBuffer()!.toString()).toMatch(/name="memoryConsent"\r\n\r\ntrue/);
    return route.fulfill({ json: { ...analysisResponse, memory: { status: "ready", facts: [{ id: "m1", content: "Cup approved", source: "Scene 1 review" }] }, persistence: { status: "saved" } } });
  });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route("**/api/reviews", async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ analysisId: "test-analysis", findingId: "f1", projectId: "Test project", sceneId: "Scene 1", status: "confirmed", note: "Slate checked", consent: true });
    await pending;
    await route.fulfill({ json: { persisted: true, memory: { status: "queued", warning: "Index pending" } } });
  });
  await runAnalysis(page, true);
  await expect(page.getByText("Cup approved")).toBeVisible();
  await expect(page.getByText("Scene 1 review")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByLabel("Review note").fill("Slate checked");
  expect(calls).toBe(0);
  await expect(page.getByRole("button", { name: "Save decision" })).toBeDisabled();
  await page.getByLabel("I consent to sending this review’s facts and notes to Supermemory.").check();
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByLabel("Project", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Review note")).toBeDisabled();
  release();
  await expect(page.getByText("Decision saved. Memory: queued.")).toBeVisible();
  await expect(page.getByText("Index pending")).toBeVisible();
});

test("local-only review and analysis warnings stay honest", async ({ page }) => {
  await page.route("**/api/analyze", route => route.fulfill({ json: { ...analysisResponse, memory: { status: "unavailable", facts: [], warning: "Memory offline" }, persistence: { status: "failed", warning: "Database offline" } } }));
  await runAnalysis(page);
  await expect(page.getByText("Memory offline")).toBeVisible();
  await expect(page.getByText("Database offline")).toBeVisible();
  await expect(page.getByText("Local-only review: database is not enabled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save decision" })).toBeDisabled();
});

test("project analytics shows real counts and handles unavailable service", async ({ page }) => {
  await page.route("**/api/analytics?*", route => {
    expect(new URL(route.request().url()).searchParams.get("projectId")).toBe("Test project");
    return route.fulfill({ json: { categories: [{ category: "props", count: 7 }], outcomes: [{ status: "confirmed", count: 4 }], trends: [{ bucket: "2026-11-14", count: 2 }], totals: { analyses: 3, findings: 7, reviews: 4 }, timeSeriesMode: "postgres" } });
  });
  await page.getByLabel("Project", { exact: true }).fill("Test project");
  await page.getByRole("tab", { name: "Session details" }).click();
  await page.getByRole("button", { name: "Load analytics" }).click();
  await expect(page.getByText("Analyses: 3 · Findings: 7 · Reviews: 4")).toBeVisible();
  await expect(page.getByText("props: 7")).toBeVisible();
  await expect(page.getByText("confirmed: 4")).toBeVisible();
  await expect(page.getByText("2026-11-14: 2")).toBeVisible();
  await expect(page.getByText("Time series: postgres")).toBeVisible();
  await page.route("**/api/analytics?*", route => route.fulfill({ status: 503, json: { error: "Analytics unavailable" } }));
  await page.getByRole("button", { name: "Load analytics" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Analytics unavailable" })).toBeVisible();
  await expect(page.getByText("Analyses: 3 · Findings: 7 · Reviews: 4")).toHaveCount(0);
});


test("saving locks the review note and editing after saving clears confirmation", async ({ page }) => {
  await page.route("**/api/health", route => route.fulfill({ json: { geminiConfigured: true, model: "test", memoryConfigured: false, databaseConfigured: true } }));
  await page.reload();
  await page.route("**/api/analyze", route => route.fulfill({ json: analysisResponse }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/reviews", async route => {
    await pending;
    await route.fulfill({ json: { persisted: true, memory: { status: "disabled" } } });
  });
  await runAnalysis(page);
  const note = page.getByLabel("Review note");
  await note.fill("Original note");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const request = page.waitForRequest("**/api/reviews");
  await page.getByRole("button", { name: "Save decision" }).click();
  await request;
  try {
    await expect(note).toBeDisabled();
  } finally {
    release();
  }
  const confirmation = page.getByText("Decision saved. Memory: disabled.");
  await expect(confirmation).toBeVisible();
  await expect(note).toBeEnabled();
  await note.fill("Revised note");
  await expect(confirmation).toBeHidden();
});

test("database-only review sends false memory-sharing consent", async ({ page }) => {
  await page.route("**/api/health", route => route.fulfill({ json: { geminiConfigured: true, model: "test", memoryConfigured: false, databaseConfigured: true } }));
  await page.reload();
  await page.route("**/api/analyze", route => route.fulfill({ json: analysisResponse }));
  await page.route("**/api/reviews", route => route.fulfill({ json: { persisted: true, memory: { status: "disabled" } } }));
  await runAnalysis(page);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const request = page.waitForRequest("**/api/reviews");
  await page.getByRole("button", { name: "Save decision" }).click();
  expect((await request).postDataJSON().consent).toBe(false);
  await expect(page.getByText("Decision saved. Memory: disabled.")).toBeVisible();
});

test("database-only saves need no memory consent and failed writes retain edits", async ({ page }) => {
  await page.route("**/api/health", route => route.fulfill({ json: { geminiConfigured: true, model: "test", memoryConfigured: false, databaseConfigured: true } }));
  await page.reload();
  await page.route("**/api/analyze", route => {
    expect(route.request().postDataBuffer()!.toString()).toMatch(/name="memoryConsent"\r\n\r\nfalse/);
    return route.fulfill({ json: analysisResponse });
  });
  await page.route("**/api/reviews", route => route.fulfill({ status: 503, json: { error: "Database unavailable" } }));
  await runAnalysis(page);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByLabel("Review note").fill("Keep this note");
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText("Database unavailable")).toBeVisible();
  await expect(page.getByLabel("Review note")).toHaveValue("Keep this note");
  await page.route("**/api/reviews", route => route.fulfill({ json: { persisted: true, memory: { status: "disabled" } } }));
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText("Decision saved. Memory: disabled.")).toBeVisible();
  await page.getByLabel("Review note").fill("Changed after saving");
  await expect(page.getByText("Decision saved. Memory: disabled.")).toHaveCount(0);
});
