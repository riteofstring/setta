import { expect, test } from "@playwright/test";

import {
  ensureAppReady,
  getCurrentProjectConfigId,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type AppSpecResponse = {
  appSpec: unknown | null;
  appConfig: unknown | null;
};

test("app config pane can save a default spec and show preview", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  await page.getByRole("button", { name: "Create Default" }).click();
  const saveButton = page.getByRole("button", { name: "Save" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  const projectConfigId = await getCurrentProjectConfigId(page);
  const response = await postBackend<AppSpecResponse>(page, "/getAppSpec", {
    projectConfigId,
  });
  expect(response?.appSpec).not.toBeNull();

  const showPreviewButton = page.getByRole("button", { name: "Show Preview" });
  if (await showPreviewButton.isVisible()) {
    await showPreviewButton.click();
  }

  await expect(page.getByText("App Preview")).toBeVisible();
  await expect(page.getByText("App Inputs")).toBeVisible();
});
