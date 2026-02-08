import { expect, test } from "@playwright/test";
import { ensureAppReady, seedLocalStorage } from "../helpers";

const OVERVIEW_MIN_WIDTH = 250;
const OVERFLOW_TOLERANCE_PX = 2;

test("custom runs pane avoids horizontal overflow at narrow overview width", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewVis: true,
    overviewTab: "RunInstructions",
    overviewWidth: OVERVIEW_MIN_WIDTH,
    overviewTrueWidth: OVERVIEW_MIN_WIDTH,
  });
  await ensureAppReady(page);

  const heading = page.getByRole("heading", { name: "Custom Runs" });
  await expect(heading).toBeVisible();

  // The tab content root should keep its own horizontal overflow hidden.
  const scrollRegion = page.getByTestId("run-instructions-scroll-region");
  await expect(scrollRegion).toBeVisible();

  // Validate both scroll metrics and rendered geometry so content cannot bleed right.
  const overflowInfo = await scrollRegion.evaluate((el) => {
    const styles = getComputedStyle(el);
    const rootRect = el.getBoundingClientRect();
    let maxRightOverflow = 0;

    for (const child of el.querySelectorAll<HTMLElement>("*")) {
      const childRect = child.getBoundingClientRect();
      if (childRect.width <= 0 || childRect.height <= 0) {
        continue;
      }
      maxRightOverflow = Math.max(
        maxRightOverflow,
        childRect.right - rootRect.right,
      );
    }

    return {
      overflowX: styles.overflowX,
      horizontalOverflow: el.scrollWidth - el.clientWidth,
      maxRightOverflow,
    };
  });

  expect(overflowInfo.overflowX).toBe("hidden");
  expect(overflowInfo.horizontalOverflow).toBeLessThanOrEqual(
    OVERFLOW_TOLERANCE_PX,
  );
  expect(overflowInfo.maxRightOverflow).toBeLessThanOrEqual(
    OVERFLOW_TOLERANCE_PX,
  );
});
