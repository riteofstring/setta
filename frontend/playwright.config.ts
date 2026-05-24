import { defineConfig } from "@playwright/test";

import {
  resolveBrowserLaunchArgs,
  resolveChromeExecutablePath,
} from "./tests/e2e/browserLaunch";

const chromeExecutablePath = resolveChromeExecutablePath();
const browserLaunchArgs = resolveBrowserLaunchArgs();

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
    viewport: { width: 1400, height: 900 },
    storageState: "./tests/e2e/.storageState.json",
    launchOptions: {
      ...(chromeExecutablePath ? { executablePath: chromeExecutablePath } : {}),
      args: browserLaunchArgs,
    },
  },
});
