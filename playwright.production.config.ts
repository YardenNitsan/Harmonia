import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:1425',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
