import { defineConfig } from '@playwright/test';
const baseURL = process.env.STUDIO_BASE_URL || 'http://127.0.0.1:3100';
export default defineConfig({
 testDir: './tests',
 fullyParallel: false,
 workers: 1,
 timeout: 60000,
 use: { baseURL, headless: true, trace: 'retain-on-failure' },
 webServer: {
  command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
  url: baseURL,
  reuseExistingServer: false,
  timeout: 120000,
  env: { ALLOW_PAID_ANALYSIS: 'false', ALLOW_SUPERMEMORY: 'false', ALLOW_DATABASE: 'false' },
 },
});
