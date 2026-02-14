import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("custom runs pane does not horizontally overflow on narrow viewports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLocalStorage(page, {
    overviewTab: "RunInstructions",
    overviewVis: true,
  });
  await ensureAppReady(page);

  await expect(page.getByText("Custom Runs")).toBeVisible();

  const overflowCheck = await page.evaluate(() => {
    const overviewPane = document.querySelector("#OverviewPane aside");
    if (!overviewPane) {
      return { missing: true, offenders: [] as string[] };
    }

    const paneRect = overviewPane.getBoundingClientRect();
    const candidateRows = Array.from(
      overviewPane.querySelectorAll("div.flex-wrap.items-center.gap-2"),
    ).filter((node) => {
      return (
        node.querySelector("select") !== null ||
        node.querySelector('[role="combobox"]') !== null
      );
    });

    const offenders = candidateRows
      .filter((node) => {
        const element = node as HTMLElement;
        if (element.clientWidth === 0 || element.clientHeight === 0) {
          return false;
        }
        if (element.offsetParent === null) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const overflowsLeft = paneRect.left - rect.left > 2;
        const overflowsRight = rect.right - paneRect.right > 2;
        return overflowsLeft || overflowsRight;
      })
      .slice(0, 10)
      .map((element) => {
        const text = (element.textContent ?? "").trim().replace(/\s+/g, " ");
        return text.slice(0, 120);
      });

    return { missing: false, offenders };
  });

  expect(overflowCheck.missing).toBe(false);
  expect(overflowCheck.offenders).toEqual([]);
});
