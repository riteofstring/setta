import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const storageStatePath = path.join(configDir, "tests/e2e/.auth/state.json");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  expect: {
    timeout: 10000,
  },
  globalSetup: path.join(configDir, "tests/e2e/global-setup"),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    headless: true,
    storageState: storageStatePath,
    viewport: { width: 1400, height: 900 },
  },
});
