import { expect, test } from "@playwright/test";
import { ensureAppReady, postBackend } from "../helpers";

type SettingsState = {
  backend?: { autobackup?: boolean };
};

test("autobackup defaults to true", async ({ page }) => {
  await ensureAppReady(page);
  const settings = await postBackend<SettingsState>(page, "/loadSettings", {});
  expect(settings?.backend?.autobackup).toBe(true);
});

