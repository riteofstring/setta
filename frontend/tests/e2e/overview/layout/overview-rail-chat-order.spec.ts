import { expect, test } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../../helpers";

test("overview rail shows project ai chat as the top icon", async ({ page }) => {
  await seedLocalStorage(page, {
    overviewVis: true,
  });
  await ensureAppReady(page);

  const orderedTabIds = await page.getByTestId("overview-icon-rail").evaluate((rail) =>
    Array.from(rail.querySelectorAll<HTMLButtonElement>("button[data-testid]"))
      .map((button) => button.dataset.testid ?? "")
      .filter((testId) => testId.startsWith("overview-tab-")),
  );

  expect(orderedTabIds[0]).toBe("overview-tab-project-ai-chat");
  expect(orderedTabIds[1]).toBe("overview-tab-overview");
});
