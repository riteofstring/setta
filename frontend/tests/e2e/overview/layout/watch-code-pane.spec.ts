import { expect, test } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../../helpers";

test("watch code settings open from controls portal with all options", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByTestId("overview-tab-watch-code")).toHaveCount(0);

  const watchCodeSettingsButton = page.getByTestId("rf__watch-code-settings");
  await expect(watchCodeSettingsButton).toBeVisible();
  await watchCodeSettingsButton.click();

  const portal = page.getByTestId("rf__watch-code-settings-portal");
  await expect(portal).toBeVisible();
  await expect(portal.getByRole("heading", { name: "Watch Code" })).toBeVisible();
  const caret = page.getByTestId("rf__watch-code-settings-caret");
  await expect(caret).toBeVisible();

  const [buttonRect, portalRect] = await Promise.all([
    watchCodeSettingsButton.boundingBox(),
    portal.boundingBox(),
  ]);
  expect(buttonRect).not.toBeNull();
  expect(portalRect).not.toBeNull();
  if (buttonRect && portalRect) {
    // The portal should open close to the watch-code trigger button.
    expect(portalRect.y).toBeLessThan(buttonRect.y + 400);
  }

  const toggleButton = portal.getByRole("button", {
    name: /Enable Watch Code|Disable Watch Code/,
  });
  await expect(toggleButton).toBeVisible();
  await expect(
    portal.locator('[data-setting-anchor="core.watch_code.enabled"]'),
  ).toBeVisible();
  await expect(
    portal.locator('[data-setting-anchor="core.watch_code.folders"]'),
  ).toBeVisible();
  await expect(
    portal.locator('[data-setting-anchor="core.watch_code.files"]'),
  ).toBeVisible();
});
