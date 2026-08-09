import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { canvasViewport } from "./workspace-test-helpers.js";

type BrowserPoint = Readonly<{ x: number; y: number }>;

async function rootPositions(page: Page): Promise<Record<string, BrowserPoint>> {
  const value = await page.getByTestId("canvas-shell-document").inputValue();
  const document = JSON.parse(value) as {
    rootSections: readonly { position: BrowserPoint; sectionId: string }[];
  };
  return Object.fromEntries(
    document.rootSections.map(({ position, sectionId }) => [sectionId, position]),
  );
}

async function changeCount(page: Page): Promise<number> {
  return Number(await page.getByTestId("canvas-shell-change-count").textContent());
}

async function setCanvasZoom(page: Page, zoom: 0.5 | 1 | 2): Promise<void> {
  const reset = page.getByRole("button", { name: "Reset zoom" });
  if (await reset.isEnabled()) {
    await reset.click();
  }
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBe(1);
  if (zoom === 1) {
    return;
  }
  const zoomControl = page.getByRole("button", { name: zoom < 1 ? "Zoom out" : "Zoom in" });
  while (await zoomControl.isEnabled()) {
    await zoomControl.click();
  }
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBe(zoom);
}

async function blankPanePoint(page: Page): Promise<BrowserPoint> {
  return page.locator(".react-flow__pane").evaluate((pane) => {
    const paneBounds = pane.getBoundingClientRect();
    const candidates = [12, 24, 48, 72].flatMap((offset) => [
      { x: paneBounds.left + offset, y: paneBounds.top + offset },
      { x: paneBounds.right - offset, y: paneBounds.top + offset },
      { x: paneBounds.left + offset, y: paneBounds.bottom - offset },
      { x: paneBounds.right - offset, y: paneBounds.bottom - offset },
    ]);
    const candidate = candidates.find((point) =>
      pane.ownerDocument.elementFromPoint(point.x, point.y)?.classList.contains("react-flow__pane"),
    );
    if (!candidate) {
      throw new Error("No blank canvas point is available for selection clearing.");
    }
    return candidate;
  });
}

async function marqueeAroundRootFrames(
  page: Page,
): Promise<Readonly<{ end: BrowserPoint; start: BrowserPoint }>> {
  return page.locator(".react-flow__pane").evaluate((pane) => {
    const paneBounds = pane.getBoundingClientRect();
    const nodeBounds = [
      ...pane.ownerDocument.querySelectorAll<HTMLElement>(".react-flow__node"),
    ].map((node) => node.getBoundingClientRect());
    if (nodeBounds.length === 0) {
      throw new Error("The canvas has no measured root frames for marquee selection.");
    }
    const contentBounds = {
      bottom: Math.max(...nodeBounds.map(({ bottom }) => bottom)),
      left: Math.min(...nodeBounds.map(({ left }) => left)),
      right: Math.max(...nodeBounds.map(({ right }) => right)),
      top: Math.min(...nodeBounds.map(({ top }) => top)),
    };
    const candidates = [8, 12, 16, 24, 32, 48, 64].flatMap((offset) => [
      { x: paneBounds.left + offset, y: paneBounds.top + offset },
      { x: paneBounds.right - offset, y: paneBounds.top + offset },
      { x: paneBounds.left + offset, y: paneBounds.bottom - offset },
      { x: paneBounds.right - offset, y: paneBounds.bottom - offset },
    ]);
    const start = candidates.find(
      (point) =>
        (point.x < contentBounds.left || point.x > contentBounds.right) &&
        (point.y < contentBounds.top || point.y > contentBounds.bottom) &&
        pane.ownerDocument
          .elementFromPoint(point.x, point.y)
          ?.classList.contains("react-flow__pane"),
    );
    if (!start) {
      throw new Error("No blank canvas corner can enclose the measured root frames.");
    }
    return {
      end: {
        x: start.x < contentBounds.left ? contentBounds.right + 4 : contentBounds.left - 4,
        y: start.y < contentBounds.top ? contentBounds.bottom + 4 : contentBounds.top - 4,
      },
      start,
    };
  });
}

test("selects top-level roots and moves the selected block once", async ({ page }) => {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  const showHostExtensions = page.getByRole("checkbox", { name: "Show host extensions" });
  await showHostExtensions.uncheck();

  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const selectAlpha = page.getByRole("button", { name: "Select Alpha frame" });
  const selectBeta = page.getByRole("button", { name: "Select Beta frame" });
  const moveAlpha = page.getByRole("button", { name: "Move Alpha frame" });
  const selectionAnnouncement = workspace.locator("[data-workspace-selection-announcement]");
  const movementAnnouncement = workspace.locator("[data-workspace-movement-announcement]");

  const selectionTarget = await selectAlpha.boundingBox();
  expect(selectionTarget?.width).toBeGreaterThanOrEqual(40);
  expect(selectionTarget?.height).toBeGreaterThanOrEqual(40);

  await selectAlpha.click();
  await selectBeta.click({ modifiers: ["Shift"] });
  await expect(selectAlpha).toHaveAttribute("aria-pressed", "true");
  await expect(selectBeta).toHaveAttribute("aria-pressed", "true");
  await expect(selectionAnnouncement).toHaveText("2 sections selected.");
  await expect(workspace.locator("[data-workspace-selection-roots]")).toHaveAttribute(
    "data-workspace-selection-roots",
    "alpha,beta",
  );
  expect(await changeCount(page)).toBe(0);

  const beforeKeyboard = await rootPositions(page);
  await moveAlpha.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => rootPositions(page))
    .toEqual({
      alpha: { x: 504, y: 80 },
      beta: { x: 1_164, y: 120 },
      gamma: beforeKeyboard.gamma,
    });
  await expect.poll(() => changeCount(page)).toBe(1);
  await expect(movementAnnouncement).toHaveText("Alpha frame and 1 more moved to 504, 80.");
  await expect(moveAlpha).toBeFocused();

  for (const zoom of [0.5, 1, 2] as const) {
    await setCanvasZoom(page, zoom);
    await page.getByRole("button", { name: "Focus Alpha" }).click();
    await expect(selectAlpha).toHaveAttribute("aria-pressed", "true");
    await expect(selectBeta).toHaveAttribute("aria-pressed", "false");
    await selectBeta.dispatchEvent("click", { shiftKey: true });
    await expect(selectBeta).toHaveAttribute("aria-pressed", "true");
    const beforePointer = await rootPositions(page);
    const beforeAlpha = beforePointer.alpha;
    const beforeBeta = beforePointer.beta;
    if (!beforeAlpha || !beforeBeta) {
      throw new Error("The selected block is missing a canonical root position.");
    }
    const beforePointerCount = await changeCount(page);
    await moveAlpha.hover();
    const handleBounds = await moveAlpha.boundingBox();
    if (!handleBounds) {
      throw new Error("The selected block movement handle has no browser bounds.");
    }
    const start = {
      x: handleBounds.x + handleBounds.width / 2,
      y: handleBounds.y + handleBounds.height / 2,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 48 * zoom, start.y + 24 * zoom, { steps: 6 });
    await expect(page.getByRole("article", { name: "Alpha frame" })).toHaveAttribute(
      "data-workspace-moving",
      "true",
    );
    await expect(page.getByRole("article", { name: "Beta frame" })).toHaveAttribute(
      "data-workspace-moving",
      "true",
    );
    expect(await rootPositions(page)).toEqual(beforePointer);
    await page.mouse.up();

    const expectedAlpha = {
      x: Math.round((beforeAlpha.x + 48) / 24) * 24,
      y: Math.round((beforeAlpha.y + 24) / 24) * 24,
    };
    const delta = {
      x: expectedAlpha.x - beforeAlpha.x,
      y: expectedAlpha.y - beforeAlpha.y,
    };
    await expect
      .poll(() => rootPositions(page))
      .toEqual({
        alpha: expectedAlpha,
        beta: { x: beforeBeta.x + delta.x, y: beforeBeta.y + delta.y },
        gamma: beforePointer.gamma,
      });
    await expect.poll(() => changeCount(page)).toBe(beforePointerCount + 1);
    await expect(movementAnnouncement).toHaveText(
      `Alpha frame and 1 more moved to ${String(expectedAlpha.x)}, ${String(expectedAlpha.y)}.`,
    );
    await expect(selectAlpha).toHaveAttribute("aria-pressed", "true");
    await expect(selectBeta).toHaveAttribute("aria-pressed", "true");
  }

  await setCanvasZoom(page, 0.5);
  await showHostExtensions.focus();
  await page.mouse.move(1, 1);
  await expect
    .poll(() =>
      workspace
        .locator(".setta-workspace__toolbar-tooltip")
        .evaluateAll((tooltips) =>
          tooltips.every((tooltip) => getComputedStyle(tooltip).visibility === "hidden"),
        ),
    )
    .toBe(true);
  await expect(workspace).toHaveScreenshot("canvas-selection-block.png");
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("supports full-containment marquee, select-all, Escape, and blank-pane clearing", async ({
  page,
}) => {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  await page.getByRole("button", { name: "Fit navigation fixture" }).click();

  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const marquee = await marqueeAroundRootFrames(page);
  await page.keyboard.down("Shift");
  await page.mouse.move(marquee.start.x, marquee.start.y);
  await page.mouse.down();
  await page.mouse.move(marquee.end.x, marquee.end.y, { steps: 8 });
  await expect(workspace.locator("[data-workspace-marquee]")).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up("Shift");

  for (const title of ["Alpha frame", "Beta frame", "Gamma frame"]) {
    await expect(page.getByRole("button", { name: `Select ${title}` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await expect(workspace.locator("[data-workspace-selection-roots]")).toHaveAttribute(
    "data-workspace-selection-roots",
    "alpha,beta,gamma",
  );

  await page.getByRole("button", { name: "Select Alpha frame" }).focus();
  await page.keyboard.press("Escape");
  await expect(workspace.locator("[data-workspace-selection-roots]")).toHaveCount(0);
  await page.keyboard.press("Control+A");
  for (const title of ["Alpha frame", "Beta frame", "Gamma frame"]) {
    await expect(page.getByRole("button", { name: `Select ${title}` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  expect(await changeCount(page)).toBe(1);

  await page.keyboard.press("Escape");
  await expect(workspace.locator("[data-workspace-selection-roots]")).toHaveCount(0);
  await page.getByText("Measured host renderer for alpha.").click();
  await expect(page.getByRole("button", { name: "Select Alpha frame" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const blankPoint = await blankPanePoint(page);
  await page.mouse.click(blankPoint.x, blankPoint.y);
  await expect(page.getByRole("button", { name: "Select Alpha frame" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(workspace.locator("[data-workspace-selection-announcement]")).toHaveText(
    "Selection cleared.",
  );
});
