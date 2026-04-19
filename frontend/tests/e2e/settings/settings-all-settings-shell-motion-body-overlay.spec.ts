import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

const SHELL_TARGETS = [
  {
    sectionId: "settings-section__callableSectionDefault",
  },
  {
    sectionId: "settings-section__dictSectionDefault",
  },
  {
    sectionId: "settings-section__globalVariablesSectionDefault",
  },
] as const;

type MotionBodyState = {
  hiddenBodyCount: number;
  sections: Array<{
    hidden: boolean;
    root: boolean;
    sectionId: string;
    visibility: string;
  }>;
};

type BlankPanePoint = {
  x: number;
  y: number;
};

test("shared shell section bodies hide during viewport zoom and restore afterward", async ({
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
    ({ sectionIds }) =>
      sectionIds.every(
        (sectionId) =>
          document.querySelector(
            `section[data-section-id="${sectionId}"] [data-canvas-owned-motion-body-root="true"]`,
          ) !== null,
      ),
    {
      sectionIds: SHELL_TARGETS.map(({ sectionId }) => sectionId),
    },
  );

  const initialState = await readMotionBodyState(
    page,
    SHELL_TARGETS.map(({ sectionId }) => sectionId),
  );
  expect(initialState.hiddenBodyCount).toBe(0);
  for (const section of initialState.sections) {
    expect(section.root).toBe(true);
    expect(section.hidden).toBe(false);
  }

  const blankPoint = await findBlankPanePoint(page);
  await page.mouse.click(blankPoint.x, blankPoint.y);
  await page.waitForFunction(
    ({ sectionIds }) =>
      sectionIds.every((sectionId) => {
        const section = document.querySelector<HTMLElement>(
          `section[data-section-id="${sectionId}"]`,
        );
        return section?.dataset.sectionActive !== "true";
      }),
    {
      sectionIds: SHELL_TARGETS.map(({ sectionId }) => sectionId),
    },
    {
      timeout: 5_000,
    },
  );
  const zoomStates = await dispatchPaneWheelZoomAndReadMotionBodyState(page, {
    blankPoint,
    deltaY: -160,
    sectionIds: SHELL_TARGETS.map(({ sectionId }) => sectionId),
  });
  const motionState = zoomStates.during;
  expect(motionState.hiddenBodyCount).toBeGreaterThanOrEqual(
    SHELL_TARGETS.length,
  );
  for (const section of motionState.sections) {
    expect(section.hidden).toBe(true);
    expect(section.visibility).toBe("hidden");
  }

  const restoredState = zoomStates.after;
  expect(restoredState.hiddenBodyCount).toBe(0);
  for (const section of restoredState.sections) {
    expect(section.hidden).toBe(false);
  }

  const attachment = {
    blankPoint,
    initialState,
    motionState,
    restoredState,
    targetSectionIds: SHELL_TARGETS.map(({ sectionId }) => sectionId),
  };
  await testInfo.attach("shell-motion-body-overlay", {
    body: JSON.stringify(attachment, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_SHELL_MOTION_BODY_OVERLAY ${JSON.stringify(
      attachment,
      null,
      2,
    )}`,
  );
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
  sectionIds: string[],
): Promise<MotionBodyState> {
  return page.evaluate((targetSectionIds): MotionBodyState => {
    const sections = targetSectionIds.map((sectionId) => {
      const body = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"] [data-canvas-owned-motion-body-root="true"]`,
      );
      if (!(body instanceof HTMLElement)) {
        throw new Error(`Missing motion body root for ${sectionId}`);
      }
      return {
        hidden: body.dataset.canvasOwnedMotionBodyHidden === "true",
        root: body.dataset.canvasOwnedMotionBodyRoot === "true",
        sectionId,
        visibility: window.getComputedStyle(body).visibility,
      };
    });

    return {
      hiddenBodyCount: document.querySelectorAll(
        '[data-canvas-owned-motion-body-hidden="true"]',
      ).length,
      sections,
    };
  }, sectionIds);
}

async function dispatchPaneWheelZoomAndReadMotionBodyState(
  page: Page,
  {
    blankPoint,
    deltaY,
    sectionIds,
  }: {
    blankPoint: BlankPanePoint;
    deltaY: number;
    sectionIds: string[];
  },
): Promise<{ after: MotionBodyState; during: MotionBodyState }> {
  return page.evaluate(
    async ({
      blankPoint: start,
      deltaY: wheelDeltaY,
      sectionIds: targetSectionIds,
    }) => {
      const renderer = document.querySelector<HTMLElement>(".react-flow__renderer");
      if (!(renderer instanceof HTMLElement)) {
        throw new Error("Missing .react-flow__renderer");
      }

      const readState = (): MotionBodyState => {
        const sections = targetSectionIds.map((sectionId) => {
          const body = document.querySelector<HTMLElement>(
            `section[data-section-id="${sectionId}"] [data-canvas-owned-motion-body-root="true"]`,
          );
          if (!(body instanceof HTMLElement)) {
            throw new Error(`Missing motion body root for ${sectionId}`);
          }
          return {
            hidden: body.dataset.canvasOwnedMotionBodyHidden === "true",
            root: body.dataset.canvasOwnedMotionBodyRoot === "true",
            sectionId,
            visibility: window.getComputedStyle(body).visibility,
          };
        });

        return {
          hiddenBodyCount: document.querySelectorAll(
            '[data-canvas-owned-motion-body-hidden="true"]',
          ).length,
          sections,
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
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
      const during = readState();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const after = readState();
      return { after, during };
    },
    {
      blankPoint,
      deltaY,
      sectionIds,
    },
  );
}
