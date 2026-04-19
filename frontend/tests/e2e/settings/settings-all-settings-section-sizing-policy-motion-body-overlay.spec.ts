import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

const TARGET_SECTION_ID = "settings-section__sectionSizingPolicy";

type MotionBodyState = {
  hiddenBodyCount: number;
  section: {
    hidden: boolean;
    root: boolean;
    sectionId: string;
    visibility: string;
  };
};

type BlankPanePoint = {
  x: number;
  y: number;
};

test("section sizing policy body hides during viewport zoom and restores afterward", async ({
  page,
}, testInfo) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();
  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__node").length > 13,
  );
  await clickFitViewIfVisible(page);
  await page.waitForFunction(
    (sectionId) =>
      document.querySelector(
        `section[data-section-id="${sectionId}"] [data-canvas-owned-motion-body-root="true"]`,
      ) !== null,
    TARGET_SECTION_ID,
  );

  const initialState = await readMotionBodyState(page, TARGET_SECTION_ID);
  expect(initialState.hiddenBodyCount).toBe(0);
  expect(initialState.section.root).toBe(true);
  expect(initialState.section.hidden).toBe(false);

  const blankPoint = await findBlankPanePoint(page);
  await page.mouse.click(blankPoint.x, blankPoint.y);
  await page.waitForFunction(
    (sectionId) => {
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      return section?.dataset.sectionActive !== "true";
    },
    TARGET_SECTION_ID,
    {
      timeout: 5_000,
    },
  );

  const zoomStates = await dispatchPaneWheelZoomAndReadMotionBodyState(page, {
    blankPoint,
    deltaY: -160,
    sectionId: TARGET_SECTION_ID,
  });
  expect(zoomStates.during.hiddenBodyCount).toBeGreaterThanOrEqual(1);
  expect(zoomStates.during.section.hidden).toBe(true);
  expect(zoomStates.during.section.visibility).toBe("hidden");

  expect(zoomStates.after.hiddenBodyCount).toBe(0);
  expect(zoomStates.after.section.hidden).toBe(false);

  await testInfo.attach("section-sizing-policy-motion-body-overlay", {
    body: JSON.stringify(
      {
        blankPoint,
        initialState,
        restoredState: zoomStates.after,
        targetSectionId: TARGET_SECTION_ID,
        duringState: zoomStates.during,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

async function clickFitViewIfVisible(page: Page): Promise<void> {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button")
    .filter({ has: page.locator(".icon-fitview") })
    .first();
  if (await fitView.isVisible().catch(() => false)) {
    await fitView.click();
  }
}

async function findBlankPanePoint(page: Page): Promise<BlankPanePoint> {
  return page.evaluate((): BlankPanePoint => {
    const pane = document.querySelector<HTMLElement>(".react-flow__pane");
    if (!(pane instanceof HTMLElement)) {
      throw new Error("Missing .react-flow__pane");
    }

    const paneRect = pane.getBoundingClientRect();
    const nodeRects = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node"),
    ).map((node) => node.getBoundingClientRect());

    for (let y = paneRect.top + 24; y < paneRect.bottom - 24; y += 24) {
      for (let x = paneRect.left + 24; x < paneRect.right - 24; x += 24) {
        const overlapsNode = nodeRects.some(
          (rect) =>
            x >= rect.left - 8 &&
            x <= rect.right + 8 &&
            y >= rect.top - 8 &&
            y <= rect.bottom + 8,
        );
        if (!overlapsNode) {
          return { x, y };
        }
      }
    }

    throw new Error("Unable to find a blank pane point for panning.");
  });
}

async function readMotionBodyState(
  page: Page,
  sectionId: string,
): Promise<MotionBodyState> {
  return page.evaluate((targetSectionId): MotionBodyState => {
    const body = document.querySelector<HTMLElement>(
      `section[data-section-id="${targetSectionId}"] [data-canvas-owned-motion-body-root="true"]`,
    );
    if (!(body instanceof HTMLElement)) {
      throw new Error(`Missing motion body root for ${targetSectionId}`);
    }

    return {
      hiddenBodyCount: document.querySelectorAll(
        '[data-canvas-owned-motion-body-hidden="true"]',
      ).length,
      section: {
        hidden: body.dataset.canvasOwnedMotionBodyHidden === "true",
        root: body.dataset.canvasOwnedMotionBodyRoot === "true",
        sectionId: targetSectionId,
        visibility: window.getComputedStyle(body).visibility,
      },
    };
  }, sectionId);
}

async function dispatchPaneWheelZoomAndReadMotionBodyState(
  page: Page,
  {
    blankPoint,
    deltaY,
    sectionId,
  }: {
    blankPoint: BlankPanePoint;
    deltaY: number;
    sectionId: string;
  },
): Promise<{ after: MotionBodyState; during: MotionBodyState }> {
  return page.evaluate(
    async ({
      blankPoint: start,
      deltaY: wheelDeltaY,
      sectionId: targetSectionId,
    }) => {
      const renderer = document.querySelector<HTMLElement>(".react-flow__renderer");
      if (!(renderer instanceof HTMLElement)) {
        throw new Error("Missing .react-flow__renderer");
      }

      const readState = (): MotionBodyState => {
        const body = document.querySelector<HTMLElement>(
          `section[data-section-id="${targetSectionId}"] [data-canvas-owned-motion-body-root="true"]`,
        );
        if (!(body instanceof HTMLElement)) {
          throw new Error(`Missing motion body root for ${targetSectionId}`);
        }

        return {
          hiddenBodyCount: document.querySelectorAll(
            '[data-canvas-owned-motion-body-hidden="true"]',
          ).length,
          section: {
            hidden: body.dataset.canvasOwnedMotionBodyHidden === "true",
            root: body.dataset.canvasOwnedMotionBodyRoot === "true",
            sectionId: targetSectionId,
            visibility: window.getComputedStyle(body).visibility,
          },
        };
      };

      renderer.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: start.x,
          clientY: start.y,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          deltaY: wheelDeltaY,
        }),
      );
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const during = readState();

      await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      return {
        after: readState(),
        during,
      };
    },
    {
      blankPoint,
      deltaY,
      sectionId,
    },
  );
}
