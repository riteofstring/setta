import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type JSHandle, type Locator, type Page } from "@playwright/test";

import { canvasViewport } from "./workspace-test-helpers.js";

const RECURSIVE_CHILD_MIME = "application/x-setta-workspace-recursive-child";

async function loadRecursiveFixture(page: Page): Promise<Locator> {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load recursive fixture" }).click();
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  const workspace = page.getByRole("region", {
    exact: true,
    name: "Canvas shell workspace",
  });
  await expect(workspace.getByRole("article", { name: "Recursive workspace" })).toBeVisible();
  return workspace;
}

async function setCanvasZoom(page: Page, target: 0.5 | 1 | 2): Promise<void> {
  const reset = page.getByRole("button", { name: "Reset zoom" });
  if (await reset.isEnabled()) {
    await reset.click();
  }
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBe(1);
  if (target === 1) {
    return;
  }
  const control = page.getByRole("button", { name: target === 0.5 ? "Zoom out" : "Zoom in" });
  while (await control.isEnabled()) {
    await control.click();
  }
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBe(target);
}

async function expectSelectionBounds(
  overlay: Locator,
  selectedFrames: readonly Locator[],
): Promise<void> {
  const boxes = await Promise.all(selectedFrames.map((frame) => frame.boundingBox()));
  const measured = boxes.filter((box): box is NonNullable<typeof box> => box !== null);
  if (measured.length !== selectedFrames.length) {
    throw new Error("Every selected recursive frame must expose browser geometry.");
  }
  const left = Math.min(...measured.map((box) => box.x));
  const top = Math.min(...measured.map((box) => box.y));
  const right = Math.max(...measured.map((box) => box.x + box.width));
  const bottom = Math.max(...measured.map((box) => box.y + box.height));
  const overlayBox = await overlay.boundingBox();
  if (!overlayBox) {
    throw new Error("The recursive selection overlay must expose browser geometry.");
  }
  expect(overlayBox.x).toBeCloseTo(left, 0);
  expect(overlayBox.y).toBeCloseTo(top, 0);
  expect(overlayBox.width).toBeCloseTo(right - left, 0);
  expect(overlayBox.height).toBeCloseTo(bottom - top, 0);
}

async function recursiveChildTransfer(page: Page, title: string): Promise<JSHandle<DataTransfer>> {
  return page.evaluateHandle(
    ({ mime, value }) => {
      const transfer = new DataTransfer();
      transfer.setData(mime, value);
      return transfer;
    },
    { mime: RECURSIVE_CHILD_MIME, value: title },
  );
}

async function requiredBoundingBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${label} must expose browser geometry.`);
  }
  return box;
}

test("recursive frames share all-depth selection, geometry, focus, and fit", async ({ page }) => {
  const resizeObserverErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message.includes("ResizeObserver")) {
      resizeObserverErrors.push(error.message);
    }
  });
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  const root = workspace.getByRole("article", { name: "Recursive workspace" });
  const nestedAlpha = workspace.getByRole("article", { name: "Nested Alpha" });
  const nestedRow = workspace.getByRole("article", { name: "Nested row" });
  const deepContainer = workspace.getByRole("article", { name: "Deep container" });
  const nestedGamma = workspace.getByRole("article", { name: "Nested Gamma" });
  const emptyContainer = workspace.getByRole("article", { name: "Empty container" });

  await expect(root).toHaveAttribute("data-workspace-depth", "0");
  await expect(nestedAlpha).toHaveAttribute("data-workspace-depth", "1");
  await expect(nestedAlpha).toHaveAttribute("data-workspace-parent-section-id", "recursive-root");
  await expect(nestedRow).toHaveAttribute("data-workspace-depth", "1");
  await expect(deepContainer).toHaveAttribute("data-workspace-depth", "2");
  await expect(nestedGamma).toHaveAttribute("data-workspace-depth", "3");
  await expect(nestedGamma).toHaveAttribute("data-workspace-parent-section-id", "deep-container");
  await expect(emptyContainer.getByText("Drop a section here", { exact: true })).toBeVisible();
  await expect(
    root.getByRole("group", { name: "Recursive workspace child sections" }),
  ).toHaveAttribute("data-workspace-child-orientation", "vertical");
  await expect(
    nestedRow.getByRole("region", { name: "Nested row child sections" }),
  ).toHaveAttribute("data-workspace-child-orientation", "horizontal");
  await expect(root.getByRole("button", { name: "Move Recursive workspace" })).toBeEnabled();
  await expect(nestedAlpha.getByRole("button", { name: "Move Nested Alpha" })).toBeDisabled();

  const selectAlpha = nestedAlpha.getByRole("button", { name: "Select Nested Alpha" });
  const selectGamma = nestedGamma.getByRole("button", { name: "Select Nested Gamma" });
  await nestedRow.getByRole("heading", { name: "Nested row" }).click();
  await expect(nestedRow).toHaveAttribute("data-workspace-selected", "true");
  await selectAlpha.click();
  await selectGamma.click({ modifiers: ["Shift"] });
  const overlay = workspace.locator(".setta-workspace__selection-overlay");
  await expect(overlay).toHaveAttribute(
    "data-workspace-selection-roots",
    "nested-alpha,nested-gamma",
  );
  for (const zoom of [0.5, 1, 2] as const) {
    await setCanvasZoom(page, zoom);
    await expectSelectionBounds(overlay, [nestedAlpha, nestedGamma]);
  }

  await setCanvasZoom(page, 1);
  const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
  await canvas.focus();
  await page.keyboard.press("Escape");
  const rootBox = await root.boundingBox();
  const alphaBox = await nestedAlpha.boundingBox();
  if (!rootBox || !alphaBox) {
    throw new Error("Recursive marquee verification requires measured root and nested frames.");
  }
  const marqueeStart = { x: rootBox.x - 8, y: alphaBox.y - 8 };
  const marqueeEnd = { x: alphaBox.x + alphaBox.width + 2, y: alphaBox.y + alphaBox.height + 2 };
  const startsOnPane = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.classList.contains("react-flow__pane"),
    marqueeStart,
  );
  expect(startsOnPane).toBe(true);
  await page.keyboard.down("Shift");
  await page.mouse.move(marqueeStart.x, marqueeStart.y);
  await page.mouse.down();
  await page.mouse.move(marqueeEnd.x, marqueeEnd.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(selectAlpha).toHaveAttribute("aria-pressed", "true");
  await expect(selectGamma).toHaveAttribute("aria-pressed", "false");
  await expect(overlay).toHaveAttribute("data-workspace-selection-roots", "nested-alpha");
  await selectGamma.click({ modifiers: ["Shift"] });

  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  await expect(page.getByRole("status")).toContainText("Fit recursive descendants: applied.");
  await expect(workspace).toHaveScreenshot("recursive-section-tree.png");

  await page.getByRole("button", { name: "Focus Nested Gamma" }).click();
  await expect(nestedGamma).toBeFocused();
  await expect(selectGamma).toHaveAttribute("aria-pressed", "true");
  await expect(selectAlpha).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("status")).toContainText("Focus Nested Gamma: applied.");

  await canvas.focus();
  await page.keyboard.press("Control+a");
  await expect(workspace.locator("[data-workspace-selection-announcement]")).toHaveText(
    "7 sections selected.",
  );
  await expect(overlay).toHaveAttribute("data-workspace-selection-roots", "recursive-root");

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
  expect(resizeObserverErrors).toEqual([]);
});

test("minimizing a recursive container preserves descendants and narrow reflow", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const workspace = await loadRecursiveFixture(page);
  const root = workspace.getByRole("article", { name: "Recursive workspace" });
  const nestedGamma = workspace.getByRole("article", { name: "Nested Gamma" });
  await root.getByRole("button", { name: "Select Recursive workspace" }).click();
  const minimize = root.getByRole("button", { name: "Minimize Recursive workspace" });
  const contentId = await minimize.getAttribute("aria-controls");
  if (!contentId) {
    throw new Error("The recursive container minimize control must own its host content.");
  }
  await minimize.click();

  await expect(root.locator(`[id="${contentId}"]`)).toBeHidden();
  await expect(nestedGamma).toBeVisible();
  await expect(root.getByRole("button", { name: "Expand Recursive workspace" })).toBeFocused();
  await expect(
    root.getByRole("button", {
      name: "Arrange Recursive workspace child sections horizontally",
    }),
  ).toBeEnabled();

  await page.setViewportSize({ height: 720, width: 320 });
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("container orientation and overflow switch stably and preserve child order", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
  const nestedRow = workspace.getByRole("article", { name: "Nested row" });
  const childRegion = nestedRow.getByRole("region", { name: "Nested row child sections" });
  await expect(childRegion).toHaveAttribute("data-workspace-child-overflow", "scroll");
  await expect(childRegion).toHaveAttribute("data-workspace-scrollable", "true");
  await expect(childRegion).toHaveAttribute("data-workspace-prevent-wheel", "true");
  await expect(childRegion).toHaveAttribute("tabindex", "0");
  const scrollMetrics = await childRegion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);

  const regionBox = await requiredBoundingBox(childRegion, "The scrollable child region");
  const viewportBeforeWheel = await canvasViewport(page);
  await page.mouse.move(regionBox.x + regionBox.width / 2, regionBox.y + 6);
  await page.mouse.wheel(220, 0);
  await expect.poll(() => childRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await canvasViewport(page)).toEqual(viewportBeforeWheel);

  await nestedRow.getByRole("button", { name: "Select Nested row" }).click();
  const header = nestedRow.locator(":scope > .setta-workspace__section-header");
  const actions = header.locator(":scope > .setta-workspace__section-actions");
  const [headerBox, actionsBox] = await Promise.all([
    requiredBoundingBox(header, "The selected container header"),
    requiredBoundingBox(actions, "The selected container actions"),
  ]);
  expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
  const orientationControl = header.locator(
    '[data-workspace-section-layout-control="orientation"]',
  );
  await expect(orientationControl).toHaveAccessibleName(
    "Arrange Nested row child sections vertically",
  );
  await expect(orientationControl).toHaveAttribute("data-workspace-next-orientation", "vertical");
  const browserSession = await page.context().newCDPSession(page);
  await browserSession.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect(orientationControl).toBeVisible();
  await browserSession.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  const directChildIds = () =>
    childRegion
      .locator(":scope > [data-workspace-section-id]")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-workspace-section-id")),
      );
  expect(await directChildIds()).toEqual(["nested-beta", "deep-container"]);
  await orientationControl.click();
  await expect(orientationControl).toBeFocused();
  await expect(childRegion).toHaveAttribute("data-workspace-child-orientation", "vertical");
  await expect(
    nestedRow.getByRole("button", {
      name: "Arrange Nested row child sections horizontally",
    }),
  ).toBeVisible();
  await expect(workspace.locator("[data-workspace-container-orientation-announcement]")).toHaveText(
    "Nested row child sections are arranged vertically.",
  );
  expect(await directChildIds()).toEqual(["nested-beta", "deep-container"]);
  const nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  const deepContainer = workspace.getByRole("article", { name: "Deep container" });
  const [verticalBetaBox, verticalDeepBox] = await Promise.all([
    requiredBoundingBox(nestedBeta, "Nested Beta in the vertical orientation fixture"),
    requiredBoundingBox(deepContainer, "Deep container in the vertical orientation fixture"),
  ]);
  expect(verticalBetaBox.y).toBeLessThan(verticalDeepBox.y);

  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(childRegion).toHaveAttribute("data-workspace-child-orientation", "horizontal");
  await page.keyboard.press("Control+Shift+z");
  await expect(childRegion).toHaveAttribute("data-workspace-child-orientation", "vertical");
  await page.keyboard.press("Control+z");
  await expect(childRegion).toHaveAttribute("data-workspace-child-orientation", "horizontal");
  await workspace.evaluate((element) => element.setAttribute("dir", "rtl"));
  const [rtlBetaBox, rtlDeepBox] = await Promise.all([
    requiredBoundingBox(nestedBeta, "Nested Beta in the right-to-left orientation fixture"),
    requiredBoundingBox(deepContainer, "Deep container in the right-to-left orientation fixture"),
  ]);
  expect(rtlBetaBox.x).toBeGreaterThan(rtlDeepBox.x);
  expect(await directChildIds()).toEqual(["nested-beta", "deep-container"]);
  await workspace.evaluate((element) => element.setAttribute("dir", "ltr"));

  const overflowControl = nestedRow.getByRole("button", {
    name: "Scroll Nested row child sections",
  });
  await expect(overflowControl).toHaveAttribute("aria-pressed", "true");
  await overflowControl.click();
  await expect(nestedRow).toHaveAttribute("data-workspace-child-overflow", "grow");
  await expect(nestedRow.getByRole("group", { name: "Nested row child sections" })).toBeVisible();
  const grownBox = await requiredBoundingBox(nestedRow, "The growing child container");

  await expect(overflowControl).toHaveAttribute("aria-pressed", "false");
  await overflowControl.click();
  await expect(overflowControl).toBeFocused();
  await expect(overflowControl).toHaveAttribute("aria-pressed", "true");
  await expect(nestedRow).toHaveAttribute("data-workspace-child-overflow", "scroll");
  const recapturedBox = await requiredBoundingBox(nestedRow, "The recaptured scroll container");
  expect(recapturedBox.width).toBeCloseTo(grownBox.width, 0);
  const moveControl = nestedRow.getByRole("button", { name: "Move Nested row" });
  await expect(moveControl).toBeVisible();
  expect(
    await moveControl.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const inlineEndElement = document.elementFromPoint(
        rect.right - 2,
        rect.top + rect.height / 2,
      );
      return inlineEndElement === element || element.contains(inlineEndElement);
    }),
  ).toBe(true);
  await expect(workspace.locator("[data-workspace-container-layout-announcement]")).toHaveText(
    "Nested row is scrolling its child sections.",
  );

  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(nestedRow).toHaveAttribute("data-workspace-child-overflow", "grow");
  await page.keyboard.press("Control+Shift+z");
  await expect(nestedRow).toHaveAttribute("data-workspace-child-overflow", "scroll");

  const emptyContainer = workspace.getByRole("article", { name: "Empty container" });
  const emptyTarget = emptyContainer.locator("[data-workspace-empty-child-container]");
  const emptyBox = await requiredBoundingBox(emptyTarget, "The empty child target");
  const point = { x: emptyBox.x + emptyBox.width / 2, y: emptyBox.y + emptyBox.height / 2 };
  const transfer = await recursiveChildTransfer(page, "External child");
  const eventInit = { clientX: point.x, clientY: point.y, dataTransfer: transfer };
  await emptyTarget.dispatchEvent("dragenter", eventInit);
  await emptyTarget.dispatchEvent("dragover", eventInit);
  await expect(canvas).toHaveAttribute("data-workspace-external-drop-state", "valid");
  await expect(
    workspace.locator('[data-workspace-external-drop-target="empty-container"]'),
  ).toHaveAttribute("data-workspace-external-drop-valid", "true");
  await emptyTarget.dispatchEvent("drop", eventInit);

  await expect(emptyContainer.locator("[data-workspace-empty-child-container]")).toHaveCount(0);
  await expect(emptyContainer.getByRole("article", { name: "External child" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("External child added to Empty container.");
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(workspace).toHaveScreenshot("recursive-container-overflow.png");
});
