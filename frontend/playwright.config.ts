import { defineConfig } from "@playwright/test";

function resolveHeadlessDefault(): boolean {
  const rawValue = process.env.PLAYWRIGHT_HEADLESS;
  if (rawValue == null) {
    return true;
  }

  switch (rawValue.toLowerCase()) {
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return true;
  }
}

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
    headless: resolveHeadlessDefault(),
    viewport: { width: 1400, height: 900 },
    storageState: "./tests/e2e/.storageState.json",
  },
});
