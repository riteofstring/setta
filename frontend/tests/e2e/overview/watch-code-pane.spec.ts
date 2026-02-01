import { expect, test } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../helpers";

const MIN_EXPECTED_PADDING = 12;

test("watch code pane has right padding and visible toggle button", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "WatchCode", overviewVis: true });
  await ensureAppReady(page);

  const heading = page.getByRole("heading", { name: "Watch Code" });
  await expect(heading).toBeVisible();

  const paneRoot = heading.locator("xpath=following-sibling::*[1]");
  await expect(paneRoot).toBeVisible();

  const paddingRight = await paneRoot.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).paddingRight),
  );
  expect(paddingRight).toBeGreaterThanOrEqual(MIN_EXPECTED_PADDING);

  const toggleButton = page.getByRole("button", {
    name: /Enable Watch Code|Disable Watch Code/,
  });
  await expect(toggleButton).toBeVisible();

  const [paneBox, buttonBox] = await Promise.all([
    paneRoot.boundingBox(),
    toggleButton.boundingBox(),
  ]);
  if (!paneBox || !buttonBox) {
    throw new Error("Expected watch code pane and toggle button to be visible.");
  }
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
    paneBox.x + paneBox.width,
  );
});
