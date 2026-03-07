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
  await expect(
    portal.getByRole("heading", { name: "Watch Code" }),
  ).toBeVisible();
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
  const initialPressed = await toggleButton.getAttribute("aria-pressed");
  expect(initialPressed === "true" || initialPressed === "false").toBeTruthy();
  await toggleButton.click();
  if (initialPressed) {
    await expect(toggleButton).toHaveAttribute(
      "aria-pressed",
      initialPressed === "true" ? "false" : "true",
    );
  }
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

test("watch code portal does not reopen from persisted visibility state", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "Overview",
    overviewVis: true,
    watchCodePortalOpen: true,
  });
  await ensureAppReady(page);

  await expect(page.getByTestId("rf__watch-code-settings-portal")).toHaveCount(
    0,
  );
  await expect(page.getByTestId("rf__watch-code-settings")).toBeVisible();
});

test("watch code portal stays clamped after content grows post-open", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await page.route("**/api/setWatchCodeInputs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await ensureAppReady(page);

  const watchCodeSettingsButton = page.getByTestId("rf__watch-code-settings");
  await watchCodeSettingsButton.click();

  const portal = page.getByTestId("rf__watch-code-settings-portal");
  const caret = page.getByTestId("rf__watch-code-settings-caret");
  await expect(portal).toBeVisible();
  await expect(caret).toBeVisible();

  const addFolderButton = portal.getByRole("button", { name: "Add Folder" });
  for (let index = 0; index < 8; index += 1) {
    await addFolderButton.click();
  }

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const [portalRect, caretRect] = await Promise.all([
    portal.boundingBox(),
    caret.boundingBox(),
  ]);
  expect(portalRect).not.toBeNull();
  expect(caretRect).not.toBeNull();
  if (!viewport || !portalRect || !caretRect) {
    throw new Error("Expected watch code portal geometry after growth.");
  }

  expect(portalRect.y).toBeGreaterThanOrEqual(0);
  expect(portalRect.y + portalRect.height).toBeLessThanOrEqual(viewport.height);
  expect(caretRect.y).toBeGreaterThanOrEqual(portalRect.y);
  expect(caretRect.y + caretRect.height).toBeLessThanOrEqual(
    portalRect.y + portalRect.height,
  );
});
