import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type ParamsPerfDebugMetrics = {
  timestampMs: number;
  viewportWidth: number;
  viewportHeight: number;
  totalSectionCount: number;
  visibleSectionCount: number;
  totalParamRowCount: number;
  visibleParamRowCount: number;
};

type PanMutationMetrics = {
  viewportStyleMutationCount: number;
  viewportTransformChanges: number;
  nonViewportStyleMutationCount: number;
  addedParamRows: number;
  removedParamRows: number;
};

type WindowWithPerfDebug = Window & {
  __settaReadParamsPerfDebugMetrics?: () => ParamsPerfDebugMetrics;
  __settaPanPerfObserverStop?: () => PanMutationMetrics;
};

test("All Settings pan keeps param DOM stable in dense param layouts", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();

  await expect
    .poll(
      async () => {
        return await page.locator(".react-flow__node").count();
      },
      { timeout: 20000 },
    )
    .toBeGreaterThan(35);
  await expect
    .poll(
      async () => {
        return await page.locator("[data-param-row='true']").count();
      },
      { timeout: 30000 },
    )
    .toBeGreaterThan(500);

  const baselineMetrics = await readParamsPerfDebugMetrics(page);
  expect(baselineMetrics.totalSectionCount).toBeGreaterThan(35);
  expect(baselineMetrics.totalParamRowCount).toBeGreaterThan(500);
  expect(baselineMetrics.visibleParamRowCount).toBeGreaterThan(120);

  const baselineIconVisibility = await readNodeIconVisibilityCounts(page);
  expect(baselineIconVisibility.total).toBeGreaterThan(200);
  expect(baselineIconVisibility.visible).toBe(0);

  await hoverFirstVisibleSection(page);
  const hoveredIconVisibility = await readHoveredNodeIconVisibilityCounts(page);
  expect(hoveredIconVisibility.total).toBeGreaterThan(0);
  expect(hoveredIconVisibility.visible).toBe(hoveredIconVisibility.total);
  await movePointerOffCanvasNodes(page);

  await startPanMutationObserver(page);
  await dragPaneForPan(page);
  const panMutationMetrics = await stopPanMutationObserver(page);
  const afterPanMetrics = await readParamsPerfDebugMetrics(page);

  // Pan should mutate the viewport transform repeatedly.
  expect(panMutationMetrics.viewportStyleMutationCount).toBeGreaterThan(8);
  expect(panMutationMetrics.viewportTransformChanges).toBeGreaterThan(4);

  // Param rows should not churn in and out of the DOM while panning.
  expect(panMutationMetrics.addedParamRows).toBe(0);
  expect(panMutationMetrics.removedParamRows).toBe(0);

  // Non-viewport style churn should stay modest for this interaction.
  expect(panMutationMetrics.nonViewportStyleMutationCount).toBeLessThan(80);

  expect(afterPanMetrics.totalParamRowCount).toBe(
    baselineMetrics.totalParamRowCount,
  );

  // Icon count should remain stable; non-hover default should keep icons hidden.
  await movePointerOffCanvasNodes(page);
  const iconVisibilityAfterPan = await readNodeIconVisibilityCounts(page);
  expect(iconVisibilityAfterPan.total).toBe(baselineIconVisibility.total);
  expect(iconVisibilityAfterPan.visible).toBe(0);
});

async function readParamsPerfDebugMetrics(
  page: Page,
): Promise<ParamsPerfDebugMetrics> {
  return await page.evaluate(() => {
    const perfWindow = window as WindowWithPerfDebug;
    if (typeof perfWindow.__settaReadParamsPerfDebugMetrics !== "function") {
      throw new Error(
        "Missing __settaReadParamsPerfDebugMetrics helper. Ensure params debug helper is installed in dev mode.",
      );
    }
    return perfWindow.__settaReadParamsPerfDebugMetrics();
  });
}

async function readNodeIconVisibilityCounts(
  page: Page,
): Promise<{ total: number; visible: number }> {
  return await page.evaluate(() => {
    const icons = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".react-flow__node i[class^='gg-'], .react-flow__node i[class*=' gg-'], .react-flow__node svg",
      ),
    );
    let visible = 0;
    for (const icon of icons) {
      const style = window.getComputedStyle(icon);
      const isVisible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity) > 0.01;
      if (isVisible) {
        visible += 1;
      }
    }
    return { total: icons.length, visible };
  });
}

async function readHoveredNodeIconVisibilityCounts(
  page: Page,
): Promise<{ total: number; visible: number }> {
  return await page.evaluate(() => {
    const hoveredNode = document.querySelector<HTMLElement>(
      ".react-flow__node:hover",
    );
    if (!hoveredNode) {
      return { total: 0, visible: 0 };
    }
    const icons = Array.from(
      hoveredNode.querySelectorAll<HTMLElement>(
        "i[class^='gg-'], i[class*=' gg-'], svg",
      ),
    );
    let visible = 0;
    for (const icon of icons) {
      const style = window.getComputedStyle(icon);
      const isVisible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity) > 0.01;
      if (isVisible) {
        visible += 1;
      }
    }
    return { total: icons.length, visible };
  });
}

async function hoverFirstVisibleSection(page: Page): Promise<void> {
  const target = await page.evaluate(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node"),
    );
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
      if (!visible) {
        continue;
      }
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height / 2, 24),
      };
    }
    return null;
  });
  if (!target) {
    throw new Error("Unable to locate a visible section node to hover.");
  }
  await page.mouse.move(target.x, target.y);
}

async function movePointerOffCanvasNodes(page: Page): Promise<void> {
  await page.mouse.move(4, 4);
}

async function startPanMutationObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const perfWindow = window as WindowWithPerfDebug;
    const viewport = document.querySelector<HTMLElement>(
      ".react-flow__viewport",
    );
    if (!viewport) {
      throw new Error("Missing .react-flow__viewport.");
    }

    let viewportStyleMutationCount = 0;
    let viewportTransformChanges = 0;
    let nonViewportStyleMutationCount = 0;
    let addedParamRows = 0;
    let removedParamRows = 0;
    let lastTransform = viewport.style.transform;

    const countParamRows = (nodes: NodeList) => {
      let count = 0;
      for (const node of Array.from(nodes)) {
        if (!(node instanceof Element)) {
          continue;
        }
        if (node.matches("[data-param-row='true']")) {
          count += 1;
        }
        count += node.querySelectorAll("[data-param-row='true']").length;
      }
      return count;
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const targetElement = mutation.target;
          if (!(targetElement instanceof Element)) {
            continue;
          }
          if (mutation.attributeName !== "style") {
            continue;
          }
          if (targetElement === viewport) {
            viewportStyleMutationCount += 1;
            const nextTransform = viewport.style.transform;
            if (nextTransform !== lastTransform) {
              viewportTransformChanges += 1;
              lastTransform = nextTransform;
            }
          } else {
            nonViewportStyleMutationCount += 1;
          }
          continue;
        }
        if (mutation.type === "childList") {
          addedParamRows += countParamRows(mutation.addedNodes);
          removedParamRows += countParamRows(mutation.removedNodes);
        }
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style"],
    });

    perfWindow.__settaPanPerfObserverStop = () => {
      observer.disconnect();
      return {
        viewportStyleMutationCount,
        viewportTransformChanges,
        nonViewportStyleMutationCount,
        addedParamRows,
        removedParamRows,
      };
    };
  });
}

async function stopPanMutationObserver(
  page: Page,
): Promise<PanMutationMetrics> {
  return await page.evaluate(() => {
    const perfWindow = window as WindowWithPerfDebug;
    const stop = perfWindow.__settaPanPerfObserverStop;
    if (!stop) {
      throw new Error("Missing pan perf observer stop callback.");
    }
    const result = stop();
    delete perfWindow.__settaPanPerfObserverStop;
    return result;
  });
}

async function dragPaneForPan(page: Page): Promise<void> {
  const pane = page.locator(".react-flow__pane");
  await expect(pane).toBeVisible();
  const box = await pane.boundingBox();
  if (!box) {
    throw new Error("Unable to resolve .react-flow__pane bounding box.");
  }

  const startX = box.x + box.width * 0.6;
  const startY = box.y + box.height * 0.5;
  const deltaX = 170;

  for (let dragIndex = 0; dragIndex < 6; dragIndex += 1) {
    const directionalSign = dragIndex % 2 === 0 ? -1 : 1;
    const endX = startX + directionalSign * deltaX;
    const endY = startY + (dragIndex % 3 === 0 ? 24 : -18);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 16 });
    await page.mouse.up();
  }
}
