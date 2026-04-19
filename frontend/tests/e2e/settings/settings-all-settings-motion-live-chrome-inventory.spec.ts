import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const CANONICAL_SECTION_IDS = [
  "settings-section__browserSectionDefault",
  "settings-section__promptSectionDefault",
  "settings-section__languageServer",
] as const;

type BlankPanePoint = {
  x: number;
  y: number;
};

type SectionChromeSummary = {
  buttonCount: number;
  inputCount: number;
  incrementerButtonCount: number;
  incrementerRootCount: number;
  menuTriggerCount: number;
  motionBodyHidden: boolean;
  motionHeaderControlsHidden: boolean;
  roleSwitchCount: number;
  sectionId: string;
  textareaCount: number;
  totalTrackedChromeElementCount: number;
};

type MotionChromeSnapshot = {
  canonicalSections: SectionChromeSummary[];
  graphSurfaceButtonCount: number;
  graphSurfaceInputCount: number;
  graphSurfaceIncrementerButtonCount: number;
  graphSurfaceIncrementerRootCount: number;
  graphSurfaceMenuTriggerCount: number;
  graphSurfaceRoleSwitchCount: number;
  graphSurfaceTextareaCount: number;
  hiddenBodyCount: number;
  hiddenHeaderControlsCount: number;
  topSectionsByTrackedChrome: SectionChromeSummary[];
  totalTrackedChromeElementCount: number;
};

type MotionLiveChromeInventory = {
  blankPanePoint: BlankPanePoint;
  beforeMotion: MotionChromeSnapshot;
  flowNodeCount: number;
  frameSamples: number;
  framesWithHiddenBodies: number;
  mountedSectionCount: number;
  peakHiddenBodyCount: number;
  peakMotion: MotionChromeSnapshot;
  settledMotion: MotionChromeSnapshot;
  totalMotionBodyRootCount: number;
  visibleFlowNodeCount: number;
};

test("settings All Settings motion live chrome inventory isolates the remaining graph-surface chrome during viewport interaction", async ({
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
  await page.waitForFunction(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node"),
    );
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const visibleNodeCount = nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right >= 0 &&
        rect.bottom >= 0 &&
        rect.left <= windowWidth &&
        rect.top <= windowHeight
      );
    }).length;
    return visibleNodeCount > 20;
  });

  const blankPanePoint = await findBlankPanePoint(page);
  await page.mouse.click(blankPanePoint.x, blankPanePoint.y);
  await page.waitForTimeout(250);

  const inventory = await measureMotionLiveChromeInventory(page, blankPanePoint);
  await testInfo.attach("all-settings-motion-live-chrome-inventory", {
    body: JSON.stringify(inventory, null, 2),
    contentType: "application/json",
  });
  console.log(
    `ALL_SETTINGS_MOTION_LIVE_CHROME_INVENTORY ${JSON.stringify(
      inventory,
      null,
      2,
    )}`,
  );

  expect(inventory.flowNodeCount).toBeGreaterThan(13);
  expect(inventory.visibleFlowNodeCount).toBeGreaterThan(20);
  expect(inventory.mountedSectionCount).toBeGreaterThan(20);
  expect(inventory.totalMotionBodyRootCount).toBeGreaterThan(0);
  expect(inventory.framesWithHiddenBodies).toBeGreaterThan(0);
  expect(inventory.peakHiddenBodyCount).toBeGreaterThan(0);
  expect(
    inventory.beforeMotion.canonicalSections.find(
      (section) =>
        section.sectionId === "settings-section__browserSectionDefault",
    ),
  ).toBeDefined();
  expect(
    inventory.peakMotion.canonicalSections.find(
      (section) =>
        section.sectionId === "settings-section__browserSectionDefault",
    )?.motionBodyHidden,
  ).toBe(true);
  expect(inventory.settledMotion.hiddenBodyCount).toBe(0);
});

async function clickFitViewIfVisible(page: Page): Promise<void> {
  const fitView = page
    .getByTestId("rf__controls")
    .getByRole("button", { name: "fit view" });
  if (await fitView.isVisible()) {
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

    throw new Error("Unable to find a blank pane point for motion probe.");
  });
}

async function measureMotionLiveChromeInventory(
  page: Page,
  blankPanePoint: BlankPanePoint,
): Promise<MotionLiveChromeInventory> {
  return page.evaluate(
    async ({
      canonicalSectionIds,
      targetPoint,
    }): Promise<MotionLiveChromeInventory> => {
      const SETTINGS_SECTION_SELECTOR =
        'section[data-section-id^="settings-section__"]';
      const viewport =
        document.querySelector<HTMLElement>(".react-flow__viewport");
      if (!(viewport instanceof HTMLElement)) {
        throw new Error("Missing .react-flow__viewport");
      }

      const renderer =
        document.querySelector<HTMLElement>(".react-flow__renderer");
      if (!(renderer instanceof HTMLElement)) {
        throw new Error("Missing .react-flow__renderer");
      }

      const flowNodes = Array.from(
        document.querySelectorAll<HTMLElement>(".react-flow__node"),
      );
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const visibleFlowNodeCount = flowNodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right >= 0 &&
          rect.bottom >= 0 &&
          rect.left <= windowWidth &&
          rect.top <= windowHeight
        );
      }).length;

      const isMotionVisible = (element: Element | null): element is HTMLElement => {
        if (!(element instanceof HTMLElement) || !element.isConnected) {
          return false;
        }
        if (
          element.closest('[data-canvas-owned-motion-body-hidden="true"]') !==
            null ||
          element.closest(
            '[data-canvas-owned-motion-header-controls-hidden="true"]',
          ) !== null
        ) {
          return false;
        }
        const computed = window.getComputedStyle(element);
        return computed.display !== "none" && computed.visibility !== "hidden";
      };

      const buildChromeSummary = (section: HTMLElement): SectionChromeSummary => {
        const sectionId = section.dataset.sectionId ?? "";
        const buttons = Array.from(section.querySelectorAll("button")).filter(
          isMotionVisible,
        );
        const inputs = Array.from(section.querySelectorAll("input")).filter(
          isMotionVisible,
        );
        const textareas = Array.from(
          section.querySelectorAll("textarea"),
        ).filter(isMotionVisible);
        const roleSwitches = Array.from(
          section.querySelectorAll('[role="switch"]'),
        ).filter(isMotionVisible);
        const menuTriggers = Array.from(
          section.querySelectorAll(
            '[data-canvas-owned-lightweight-menu-trigger="true"]',
          ),
        ).filter(isMotionVisible);
        const incrementerRoots = Array.from(
          section.querySelectorAll('[data-section-incrementer-root="true"]'),
        ).filter(isMotionVisible);
        const incrementerButtons = buttons.filter(
          (button) =>
            button.closest('[data-section-incrementer-root="true"]') !== null,
        );
        const trackedChromeElements = new Set<Element>([
          ...buttons,
          ...inputs,
          ...textareas,
          ...roleSwitches,
          ...menuTriggers,
          ...incrementerRoots,
        ]);

        return {
          buttonCount: buttons.length,
          inputCount: inputs.length,
          incrementerButtonCount: incrementerButtons.length,
          incrementerRootCount: incrementerRoots.length,
          menuTriggerCount: menuTriggers.length,
          motionBodyHidden:
            section.querySelector('[data-canvas-owned-motion-body-hidden="true"]') !==
            null,
          motionHeaderControlsHidden:
            section.querySelector(
              '[data-canvas-owned-motion-header-controls-hidden="true"]',
            ) !== null,
          roleSwitchCount: roleSwitches.length,
          sectionId,
          textareaCount: textareas.length,
          totalTrackedChromeElementCount: trackedChromeElements.size,
        };
      };

      const readSnapshot = (): MotionChromeSnapshot => {
        const sections = Array.from(
          document.querySelectorAll<HTMLElement>(SETTINGS_SECTION_SELECTOR),
        );
        const sectionSummaries = sections.map(buildChromeSummary);
        const topSectionsByTrackedChrome = [...sectionSummaries]
          .sort(
            (left, right) =>
              right.totalTrackedChromeElementCount -
              left.totalTrackedChromeElementCount,
          )
          .slice(0, 10);
        const trackedChromeElements = new Set<Element>();

        for (const section of sections) {
          for (const selector of [
            "button",
            "input",
            "textarea",
            '[role="switch"]',
            '[data-canvas-owned-lightweight-menu-trigger="true"]',
            '[data-section-incrementer-root="true"]',
          ]) {
            const elements = Array.from(section.querySelectorAll(selector)).filter(
              isMotionVisible,
            );
            for (const element of elements) {
              trackedChromeElements.add(element);
            }
          }
        }

        return {
          canonicalSections: canonicalSectionIds
            .map((sectionId) =>
              sectionSummaries.find((summary) => summary.sectionId === sectionId),
            )
            .filter((summary): summary is SectionChromeSummary => summary !== undefined),
          graphSurfaceButtonCount: Array.from(
            document.querySelectorAll<HTMLElement>(
              `${SETTINGS_SECTION_SELECTOR} button`,
            ),
          ).filter(isMotionVisible).length,
          graphSurfaceInputCount: Array.from(
            document.querySelectorAll<HTMLElement>(
              `${SETTINGS_SECTION_SELECTOR} input`,
            ),
          ).filter(isMotionVisible).length,
          graphSurfaceIncrementerButtonCount: Array.from(
            document.querySelectorAll<HTMLElement>(
              `${SETTINGS_SECTION_SELECTOR} [data-section-incrementer-root="true"] button`,
            ),
          ).filter(isMotionVisible).length,
          graphSurfaceIncrementerRootCount: Array.from(
            document.querySelectorAll<HTMLElement>(
              `${SETTINGS_SECTION_SELECTOR} [data-section-incrementer-root="true"]`,
            ),
          ).filter(isMotionVisible).length,
          graphSurfaceMenuTriggerCount: Array.from(
            document.querySelectorAll<HTMLElement>(
              `${SETTINGS_SECTION_SELECTOR} [data-canvas-owned-lightweight-menu-trigger="true"]`,
            ),
          ).filter(isMotionVisible).length,
          graphSurfaceRoleSwitchCount: Array.from(
            document.querySelectorAll<HTMLElement>(
              `${SETTINGS_SECTION_SELECTOR} [role="switch"]`,
            ),
          ).filter(isMotionVisible).length,
          graphSurfaceTextareaCount: Array.from(
            document.querySelectorAll<HTMLElement>(
              `${SETTINGS_SECTION_SELECTOR} textarea`,
            ),
          ).filter(isMotionVisible).length,
          hiddenBodyCount: document.querySelectorAll(
            '[data-canvas-owned-motion-body-hidden="true"]',
          ).length,
          hiddenHeaderControlsCount: document.querySelectorAll(
            '[data-canvas-owned-motion-header-controls-hidden="true"]',
          ).length,
          topSectionsByTrackedChrome,
          totalTrackedChromeElementCount: trackedChromeElements.size,
        };
      };

      const beforeMotion = readSnapshot();
      const totalMotionBodyRootCount = document.querySelectorAll(
        '[data-canvas-owned-motion-body-root="true"]',
      ).length;
      let frameSamples = 0;
      let framesWithHiddenBodies = 0;
      let peakHiddenBodyCount = 0;
      let peakMotion = beforeMotion;

      await new Promise<void>((resolve) => {
        let frame = 0;
        const totalFrames = 120;

        const step = () => {
          const snapshot = readSnapshot();
          frameSamples += 1;
          if (snapshot.hiddenBodyCount > 0) {
            framesWithHiddenBodies += 1;
          }
          peakHiddenBodyCount = Math.max(
            peakHiddenBodyCount,
            snapshot.hiddenBodyCount,
          );
          if (
            snapshot.hiddenBodyCount > 0 &&
            (snapshot.hiddenBodyCount > peakMotion.hiddenBodyCount ||
              (snapshot.hiddenBodyCount === peakMotion.hiddenBodyCount &&
                snapshot.totalTrackedChromeElementCount >=
                  peakMotion.totalTrackedChromeElementCount))
          ) {
            peakMotion = snapshot;
          }

          const cycle = frame % 12;
          const deltaY = cycle < 6 ? -160 : 160;
          renderer.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: targetPoint.x,
              clientY: targetPoint.y,
              deltaMode: WheelEvent.DOM_DELTA_PIXEL,
              deltaY,
            }),
          );

          frame += 1;
          if (frame < totalFrames) {
            window.requestAnimationFrame(step);
            return;
          }
          resolve();
        };

        window.requestAnimationFrame(step);
      });

      await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), 260);
      });
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      return {
        blankPanePoint: targetPoint,
        beforeMotion,
        flowNodeCount: flowNodes.length,
        frameSamples,
        framesWithHiddenBodies,
        mountedSectionCount: document.querySelectorAll(SETTINGS_SECTION_SELECTOR)
          .length,
        peakHiddenBodyCount,
        peakMotion,
        settledMotion: readSnapshot(),
        totalMotionBodyRootCount,
        visibleFlowNodeCount,
      };
    },
    {
      canonicalSectionIds: [...CANONICAL_SECTION_IDS],
      targetPoint: blankPanePoint,
    },
  );
}
