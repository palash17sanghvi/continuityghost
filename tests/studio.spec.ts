import { test, expect, type Page } from '@playwright/test';
import type { VideoAnalysis } from '../src/lib/video-contract';

const analysisId = 'e669f270-bd4a-4bdc-8c48-b003167d6784';
const findingId = '66002f8f-9c62-4d85-a16a-5ef035798745';
let video: Buffer;
let image: Buffer;
function result(): VideoAnalysis {
 return {
  analysisId, projectId: 'my-film', sceneId: 'scene-01', clipName: 'browser-scene.webm', mimeType: 'video/webm', duration: 15.2, createdAt: '2026-11-14T17:00:00.000Z',
  summary: 'Test fixture: sampled watch placement differs; not a live Gemini result.',
  frames: [{ id: 'frame-000', timeSeconds: 2, shotId: 0 }, { id: 'frame-001', timeSeconds: 10, shotId: 1 }],
  pairs: [{ id: 'pair-000', referenceFrameId: 'frame-000', candidateFrameId: 'frame-001', score: 0.8 }],
  findings: [{ id: findingId, pairId: 'pair-000', category: 'props', description: 'Watch changes wrist', referenceEvidence: 'Watch visible on left wrist.', candidateEvidence: 'Watch appears on right wrist.', uncertainty: 'Possible mirrored shot; wrist is partly obscured.', suggestedAction: 'Check source take and intentional mirroring.', status: 'unreviewed' }],
  persistence: { mode: 'local', warning: 'Postgres disabled; server-local durable fallback.' }, memory: { status: 'disabled' },
 };
}
test.beforeAll(async ({ browser }) => {
 const page = await browser.newPage();
 const capture = async (milliseconds: number) => page.evaluate(async ms => {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(12);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => chunks.push(e.data);
  const done = new Promise<Blob>(resolve => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })); });
  let frame = 0;
  const draw = () => { ctx.fillStyle = frame % 2 ? '#40372b' : '#172a23'; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = '#e8e2d6'; ctx.font = '22px sans-serif'; ctx.fillText(`Scene frame ${frame++}`, 35, 90); };
  draw(); const interval = setInterval(draw, 80); recorder.start(200);
  await new Promise(resolve => setTimeout(resolve, ms)); recorder.stop(); clearInterval(interval);
  const blob = await done; stream.getTracks().forEach(track => track.stop());
  return { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), png: canvas.toDataURL('image/png').split(',')[1] };
 }, milliseconds);
 const fixture = await capture(15300);
 video = Buffer.from(fixture.bytes); image = Buffer.from(fixture.png, 'base64');
 await page.close();
});

type MockOptions = { paid?: boolean; body?: unknown; status?: number; delay?: boolean; historyBody?: unknown; reviewFail?: boolean };
async function mockApi(page: Page, options: MockOptions = {}) {
 let stored = result();
 const requests: { url: string; method: string; body: string }[] = [];
 const external: string[] = [];
 await page.route('**/*', async route => {
  const request = route.request(); const url = new URL(request.url());
  if (url.protocol === 'http:' || url.protocol === 'https:') {
   if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.href); return route.abort(); }
  }
  if (!url.pathname.startsWith('/api/')) return route.continue();
  requests.push({ url: url.pathname + url.search, method: request.method(), body: request.postDataBuffer()?.toString('latin1') || '' });
  if (url.pathname === '/api/health') return route.fulfill({ json: { geminiConfigured: true, model: 'test-no-call', paidAnalysisEnabled: options.paid ?? true, memoryConfigured: false, databaseConfigured: false } });
  if (url.pathname === '/api/video/analyze') {
   if (options.delay) await new Promise(resolve => setTimeout(resolve, 2000));
   return route.fulfill({ status: options.status || 200, json: options.body ?? stored }).catch(() => {});
  }
  if (url.pathname === '/api/video/history') return route.fulfill({ json: options.historyBody ?? { analyses: [stored] } });
  if (url.pathname === `/api/video/${analysisId}`) return route.fulfill({ json: stored });
  if (url.pathname === '/api/video/reviews') {
   if (options.reviewFail) return route.fulfill({ status: 503, json: { error: 'Storage unavailable. Review unchanged.' } });
   const body = request.postDataJSON();
   expect(body).toMatchObject({ analysisId, findingId, projectId: 'my-film', sceneId: 'scene-01', consent: false });
   stored = { ...stored, findings: stored.findings.map(f => ({ ...f, status: body.status, note: body.note })) };
   return route.fulfill({ json: { persisted: true, persistence: stored.persistence, memory: stored.memory, analysis: stored } });
  }
  if (url.pathname === `/api/video/${analysisId}/media`) {
   if (url.searchParams.has('frameId')) {
    expect(['frame-000', 'frame-001']).toContain(url.searchParams.get('frameId'));
    return route.fulfill({ contentType: 'image/png', body: image });
   }
   return route.fulfill({ contentType: 'video/webm', body: video, headers: { 'Accept-Ranges': 'bytes' } });
  }
  throw new Error(`Unmocked API request: ${request.method()} ${url.pathname}`);
 });
 return { requests, external, stored: () => stored };
}
async function upload(page: Page, body = video) {
 await page.getByLabel('Upload video', { exact: true }).setInputFiles({ name: 'browser-scene.webm', mimeType: 'video/webm', buffer: body });
 await expect(page.getByRole('button', { name: 'Analyze Continuity', exact: true })).toBeVisible();
}
async function approve(page: Page) {
 await page.getByLabel('I consent to uploading').check();
 await page.getByLabel('I approve potential Gemini cost').check();
}
async function analyze(page: Page) {
 await upload(page); await approve(page);
 await expect(page.getByRole('button', { name: 'Analyze Continuity', exact: true })).toBeEnabled();
 await page.getByRole('button', { name: 'Analyze Continuity', exact: true }).click();
}

test('one browser-generated video, one action, scoped multipart, timestamp evidence and persisted review reload', async ({ page }) => {
 const mock = await mockApi(page); await page.goto('/');
 await upload(page);
 expect(mock.requests.filter(r => r.url === '/api/video/analyze')).toHaveLength(0);
 await expect(page.getByRole('button', { name: 'Analyze Continuity', exact: true })).toBeDisabled();
 await expect(page.getByRole('button', { name: /Use current as/ })).toHaveCount(0);
 await expect(page.locator('input[type=file]')).toHaveCount(1);
 await approve(page); await page.getByRole('button', { name: 'Analyze Continuity', exact: true }).click();
 await expect(page.getByText('1 potential continuity issue', { exact: true })).toBeVisible();
 const post = mock.requests.filter(r => r.url === '/api/video/analyze'); expect(post).toHaveLength(1);
 for (const name of ['video', 'projectId', 'sceneId', 'context', 'consent', 'costApproved', 'memoryConsent']) expect(post[0].body).toContain(`name="${name}"`);
 for (const name of ['reference', 'candidate']) expect(post[0].body).not.toContain(`name="${name}"`);
 await expect(page.getByText('Local persistent fallback', { exact: false })).toBeVisible();
 await expect(page.getByText('Automatic sampled comparisons may miss mistakes.', { exact: false })).toBeVisible();
 await expect(page.locator('video')).toHaveAttribute('src', `/api/video/${analysisId}/media`);
 await expect(page.getByRole('button', { name: 'Issue 1 at 00:10' })).toBeVisible();
 await page.getByRole('button', { name: 'Issue 1 at 00:10' }).click();
 await expect.poll(() => page.locator('video').evaluate(v => (v as HTMLVideoElement).currentTime)).toBeCloseTo(10, 0);
 await expect(page.getByAltText('Reference evidence at 00:02')).toBeVisible();
 await expect(page.getByAltText('Candidate evidence at 00:10')).toBeVisible();
 await expect(page.getByText('Watch visible on left wrist.', { exact: true })).toBeVisible();
 await expect(page.getByText('Possible mirrored shot; wrist is partly obscured.', { exact: true })).toBeVisible();
 await page.getByLabel('Review outcome').selectOption('intentional'); await page.getByLabel('Review note', { exact: true }).fill('Intentional mirrored insert.');
 await page.getByRole('button', { name: 'Save review', exact: true }).click();
 await expect(page.getByRole('status')).toContainText('Review saved to server');
 expect(mock.stored().findings[0].note).toBe('Intentional mirrored insert.');
 const local = await page.evaluate(() => JSON.parse(localStorage.getItem('continuityghost.video.selection') || '{}'));
 expect(local).toEqual({ projectId: 'my-film', sceneId: 'scene-01', analysisId });
 const downloadPromise = page.waitForEvent('download');
 await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
 const download = await downloadPromise;
 expect(download.suggestedFilename()).toBe(`continuity-${analysisId}.json`);
 await page.reload();
 await expect(page.getByText('1 potential continuity issue', { exact: true })).toBeVisible();
 await expect(page.getByLabel('Review outcome')).toHaveValue('intentional');
 await expect(page.getByLabel('Review note', { exact: true })).toHaveValue('Intentional mirrored insert.');
 await page.getByRole('button', { name: 'Saved analyses', exact: true }).click();
 await expect(page.getByRole('button', { name: /browser-scene.webm/ })).toBeVisible();
 expect(mock.requests.some(r => r.url === '/api/video/history?projectId=my-film&sceneId=scene-01')).toBe(true);
 await page.getByRole('button', { name: /browser-scene.webm/ }).click();
 await expect(page.getByText('1 potential continuity issue', { exact: true })).toBeVisible();
 expect(mock.external).toEqual([]);
 expect(mock.requests.filter(r => r.url.includes('memory'))).toHaveLength(0);
});

for (const malformed of ['pair', 'duration', 'frame', 'scope', 'duplicate'] as const) {
 test(`reject malformed ${malformed} before showing evidence`, async ({ page }) => {
  const bad = result();
  if (malformed === 'pair') bad.findings[0].pairId = 'pair-missing';
  if (malformed === 'duration') bad.duration = 61;
  if (malformed === 'frame') bad.pairs[0].candidateFrameId = 'frame-missing';
  if (malformed === 'scope') bad.sceneId = 'other-scene';
  if (malformed === 'duplicate') bad.frames[1].id = bad.frames[0].id;
  await mockApi(page, { body: bad }); await page.goto('/'); await analyze(page);
  await expect(page.locator('.error[role=alert]')).toContainText('Invalid video analysis response');
  await expect(page.getByRole('button', { name: 'Issue 1 at 00:10' })).toHaveCount(0);
  await expect(page.getByLabel('I approve potential Gemini cost')).not.toBeChecked();
 });
}

test('browser known short duration blocks upload and changing clip resets cost approval', async ({ page }) => {
 const mock = await mockApi(page); await page.goto('/'); await upload(page); await approve(page);
 await page.locator('video').evaluate(video => {
  Object.defineProperty(video, 'duration', { configurable: true, value: 2 });
  video.dispatchEvent(new Event('loadedmetadata'));
 });
 await expect(page.locator('.error[role=alert]')).toContainText('15–60 seconds');
 await expect(page.getByRole('button', { name: 'Analyze Continuity', exact: true })).toBeDisabled();
 expect(mock.requests.filter(r => r.url === '/api/video/analyze')).toHaveLength(0);
 await upload(page);
 await expect(page.getByLabel('I approve potential Gemini cost')).not.toBeChecked();
});

test('paid disabled never sends an analysis request' , async ({ page }) => {
 const mock = await mockApi(page, { paid: false }); await page.goto('/'); await upload(page); await approve(page);
 await expect(page.getByRole('button', { name: 'Analyze Continuity', exact: true })).toBeDisabled();
 await expect(page.getByText('Paid analysis disabled by server.', { exact: false })).toBeVisible();
 expect(mock.requests.filter(r => r.url === '/api/video/analyze')).toHaveLength(0);
});

test('server error keeps clip and requires fresh per-request cost approval', async ({ page }) => {
 await mockApi(page, { status: 422, body: { error: 'No comparable sampled frames. Try another clip.' } }); await page.goto('/'); await analyze(page);
 await expect(page.locator('.error[role=alert]')).toContainText('No comparable sampled frames');
 await expect(page.getByLabel('I approve potential Gemini cost')).not.toBeChecked();
 await expect(page.locator('video')).toHaveAttribute('src', /^blob:/);
 await expect(page.getByRole('button', { name: 'Analyze Continuity', exact: true })).toBeDisabled();
});

test('cancel ignores late result and does not claim a cost refund', async ({ page }) => {
 await mockApi(page, { delay: true }); await page.goto('/'); await analyze(page);
 await page.getByRole('button', { name: 'Cancel request' }).click();
 await expect(page.getByRole('status')).toContainText('cancellation does not guarantee a cost refund');
 await page.waitForTimeout(2200);
 await expect(page.getByText('1 potential continuity issue', { exact: true })).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Analyze Continuity', exact: true })).toBeDisabled();
});

test('failed review preserves edits, reload protection and no success claim', async ({ page }) => {
 await mockApi(page, { reviewFail: true }); await page.goto('/'); await analyze(page);
 await page.getByRole('button', { name: 'Issue 1 at 00:10' }).click();
 await page.getByLabel('Review outcome').selectOption('confirmed'); await page.getByLabel('Review note', { exact: true }).fill('Check reshoot.');
 await page.getByRole('button', { name: 'Save review', exact: true }).click();
 await expect(page.locator('.error[role=alert]')).toContainText('Storage unavailable');
 await expect(page.getByLabel('Review note', { exact: true })).toHaveValue('Check reshoot.');
 await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Save review', exact: true })).toBeEnabled();
});

test('rejects MIME and oversized video before upload', async ({ page }) => {
 const mock = await mockApi(page); await page.goto('/');
 await page.getByLabel('Upload video', { exact: true }).setInputFiles({ name: 'not-video.txt', mimeType: 'text/plain', buffer: Buffer.from('no') });
 await expect(page.locator('.error[role=alert]')).toContainText('at most 64 MiB');
 await page.getByLabel('Upload video', { exact: true }).evaluate(input => {
  const file = new File([new Uint8Array(64 * 1024 ** 2 + 1)], 'huge.webm', { type: 'video/webm' });
  const transfer = new DataTransfer(); transfer.items.add(file); (input as HTMLInputElement).files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
 });
 await expect(page.locator('.error[role=alert]')).toContainText('at most 64 MiB');
 expect(mock.requests.filter(r => r.url === '/api/video/analyze')).toHaveLength(0);
});

test('mobile upload, markers and evidence have no horizontal overflow', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 }); await mockApi(page); await page.goto('/'); await analyze(page);
 await page.getByRole('button', { name: 'Issue 1 at 00:10' }).click();
 await expect(page.getByAltText('Candidate evidence at 00:10')).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await expect(page.getByRole('button', { name: 'Save review', exact: true })).toBeVisible();
 await page.screenshot({ path: 'test-results/video-studio-mobile.png', fullPage: true });
});
