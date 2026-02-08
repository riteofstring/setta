import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("app preview content stays inside left/right rail safe area", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  const toggleButton = page.getByRole("button", {
    name: /Show Preview|Hide Preview/,
  });
  await expect(toggleButton).toBeVisible();
  const toggleLabel = (await toggleButton.textContent()) ?? "";
  if (toggleLabel.includes("Show Preview")) {
    await toggleButton.click();
  }

  const previewLabel = page.getByText("App Preview", { exact: true });
  await expect(previewLabel).toBeVisible();

  const box = await previewLabel.boundingBox();
  if (!box) {
    throw new Error("Missing app preview label bounding box.");
  }

  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error("Missing viewport size.");
  }

  // Rails are 40px each; keep preview content inside that area with margin.
  expect(box.x).toBeGreaterThanOrEqual(46);
  expect(viewport.width - (box.x + box.width)).toBeGreaterThanOrEqual(46);
});
