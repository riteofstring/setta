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

test("watch code controls are hidden in deployment mode", async ({ page }) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await ensureAppReady(page);

  await page.evaluate(async () => {
    const { useShareSession } = await import("/src/state/definitions.ts");
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: null,
    });
  });

  await expect(page.getByTestId("overview-tab-watch-code")).toHaveCount(0);
  await expect(page.getByTestId("rf__watch-code-settings")).toHaveCount(0);
  await expect(page.getByTestId("rf__watch-code-settings-portal")).toHaveCount(
    0,
  );
});
