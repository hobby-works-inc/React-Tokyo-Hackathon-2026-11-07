import { defineConfig } from '@playwright/test';

const PORT = 3100;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1300, height: 900 } },
  webServer: {
    command: `npm run build:sandbox && npx waku dev --port ${PORT}`,
    url: `http://localhost:${PORT}/mode`,
    reuseExistingServer: false,
    timeout: 120_000,
    // E2E は API キーなしの mock モードで行う
    env: { LLM_MODE: 'mock', OPENCODE_API_KEY: '' },
    stdout: 'pipe',
  },
});
