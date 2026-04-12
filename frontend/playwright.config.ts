import { defineConfig } from "@playwright/test";

const PLAYWRIGHT_EXECUTABLE_PATH =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 120000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    headless: true,
    launchOptions: PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: PLAYWRIGHT_EXECUTABLE_PATH }
      : undefined,
    viewport: { width: 1400, height: 900 },
    storageState: "./tests/e2e/.storageState.json",
  },
});
