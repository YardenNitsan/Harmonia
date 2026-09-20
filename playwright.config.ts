import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:1425',
    headless: true,
    viewport: { width: 1440, height: 960 },
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:1425',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
