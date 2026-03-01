import { expect, test } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../../helpers";

test("watch code settings open from the overview rail tab with all options", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  await ensureAppReady(page);

  const watchCodeTab = page.getByTestId("overview-tab-watch-code");
  await expect(watchCodeTab).toBeVisible();
  await watchCodeTab.click();

  const tabContent = page.getByTestId("overview-tab-content-shell");
  await expect(tabContent.getByText("Watch Code")).toBeVisible();
  await expect(page.getByTestId("rf__watch-code-settings")).toHaveCount(0);
  await expect(page.getByTestId("rf__watch-code-settings-portal")).toHaveCount(
    0,
  );

  const toggleButton = tabContent.getByRole("button", {
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
    tabContent.locator('[data-setting-anchor="core.watch_code.enabled"]'),
  ).toBeVisible();
  await expect(
    tabContent.locator('[data-setting-anchor="core.watch_code.folders"]'),
  ).toBeVisible();
  await expect(
    tabContent.locator('[data-setting-anchor="core.watch_code.files"]'),
  ).toBeVisible();
});

test("watch code tab and controls trigger are hidden in deployment mode", async ({
  page,
}) => {
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
