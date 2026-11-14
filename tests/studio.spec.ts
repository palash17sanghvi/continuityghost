import { test, expect } from "@playwright/test";

const baseURL = process.env.STUDIO_BASE_URL || "http://127.0.0.1:3000";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/health", route => route.fulfill({ json: { geminiConfigured: true, model: "test-model", memoryConfigured: false, databaseConfigured: false } }));
  await page.goto(baseURL);
});
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
  await page.getByLabel("Project").fill("Test project");
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
