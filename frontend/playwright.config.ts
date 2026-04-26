import { defineConfig } from "@playwright/test";
import { getCanvasFlowChromiumLaunchOptions } from "./tests/e2e/browserLaunch";

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
    launchOptions: getCanvasFlowChromiumLaunchOptions(),
    viewport: { width: 1400, height: 900 },
    storageState: "./tests/e2e/.storageState.json",
  },
});
