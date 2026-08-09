import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type JSHandle, type Locator, type Page } from "@playwright/test";

import {
  canvasViewport,
  dragHandleToPoint,
  loadRecursiveFixture,
  recursiveChangeCount,
  requiredBoundingBox,
  setCanvasZoom,
  visibleCanvasTargetPoint,
} from "./workspace-test-helpers.js";

const RECURSIVE_CHILD_MIME = "application/x-setta-workspace-recursive-child";

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

async function scrollRegionHorizontallyWithWheel(page: Page, region: Locator): Promise<void> {
  const box = await requiredBoundingBox(region, "The scrollable child region");
  await region.hover({
    position: {
      x: box.width / 2,
      y: Math.min(6, box.height / 2),
    },
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.mouse.wheel(220, 0);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    if ((await region.evaluate((element) => element.scrollLeft)) > 0) {
      return;
    }
  }
  throw new Error("The scrollable child region must consume a native horizontal wheel gesture.");
}

async function recursiveDocument(page: Page): Promise<{
  rootSections: readonly { sectionId: string }[];
  sections: Readonly<
    Record<string, { childLayout: { sectionIds: readonly string[] } | null; id: string }>
  >;
}> {
  const value = await page.getByTestId("canvas-shell-document").inputValue();
  return JSON.parse(value) as Awaited<ReturnType<typeof recursiveDocument>>;
}

async function openSelectionActions(page: Page, trigger: Locator): Promise<Locator> {
  await trigger.focus();
  await page.keyboard.press("Shift+F10");
  const dialog = page.getByRole("dialog", { name: "Selection actions" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function blankPanePoint(page: Page): Promise<{ x: number; y: number }> {
  return page.locator(".react-flow__pane").evaluate((pane) => {
    const bounds = pane.getBoundingClientRect();
    const offsets = [128, 96, 64];
    const candidates = offsets.flatMap((offset) => [
      { x: bounds.left + offset, y: bounds.top + offset },
      { x: bounds.right - offset, y: bounds.top + offset },
      { x: bounds.left + offset, y: bounds.bottom - offset },
      { x: bounds.right - offset, y: bounds.bottom - offset },
    ]);
    const point = candidates.find((candidate) =>
      pane.ownerDocument
        .elementFromPoint(candidate.x, candidate.y)
        ?.classList.contains("react-flow__pane"),
    );
    if (!point) {
      throw new Error("Recursive movement needs a measurable blank canvas point.");
    }
    return point;
  });
}

async function dispatchTouchDrag({
  onActivated,
  onBeforeEnd,
  page,
  source,
  target,
}: {
  page: Page;
  onActivated(): Promise<void>;
  onBeforeEnd(): Promise<void>;
  source: { x: number; y: number };
  target: { x: number; y: number };
}) {
  const cdp = await page.context().newCDPSession(page);
  const touchPoint = (x: number, y: number) => ({
    force: 1,
    id: 81,
    radiusX: 1,
    radiusY: 1,
    x,
    y,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    touchPoints: [touchPoint(source.x, source.y)],
    type: "touchStart",
  });
  await page.waitForTimeout(300);
  await onActivated();
  for (let index = 1; index <= 8; index += 1) {
    const progress = index / 8;
    await cdp.send("Input.dispatchTouchEvent", {
      touchPoints: [
        touchPoint(
          source.x + (target.x - source.x) * progress,
          source.y + (target.y - source.y) * progress,
        ),
      ],
      type: "touchMove",
    });
  }
  await onBeforeEnd();
  await cdp.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });
  await cdp.detach();
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
  const nestedRowChildren = nestedRow.getByRole("region", {
    name: "Nested row child sections",
  });
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
  await expect(emptyContainer.getByText("Drop sections here", { exact: true })).toBeVisible();
  await expect(
    root.getByRole("group", { name: "Recursive workspace child sections" }),
  ).toHaveAttribute("data-workspace-child-orientation", "vertical");
  await expect(nestedRowChildren).toHaveAttribute("data-workspace-child-orientation", "horizontal");
  await expect(root.getByRole("button", { name: "Move Recursive workspace" })).toBeEnabled();
  await expect(nestedAlpha.getByRole("button", { name: "Move Nested Alpha" })).toBeEnabled();

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

  await nestedRowChildren.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = 0;
  });
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  await expect(page.locator(".announcement")).toContainText("Fit recursive descendants: applied.");
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
  await expect(workspace).toHaveScreenshot("recursive-section-tree.png", {
    maxDiffPixels: 20,
  });

  await page.getByRole("button", { name: "Focus Nested Gamma" }).click();
  await expect(nestedGamma).toBeFocused();
  await expect(selectGamma).toHaveAttribute("aria-pressed", "true");
  await expect(selectAlpha).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".announcement")).toContainText("Focus Nested Gamma: applied.");

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

test("structural interaction ownership excludes XYFlow and viewport competitors", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
  const mode = page.getByRole("combobox", { name: "Section movement" });
  const root = workspace.getByRole("article", { name: "Recursive workspace" });
  const nested = workspace.getByRole("article", { name: "Nested Alpha" });
  const nestedHandle = nested.getByRole("button", { name: "Move Nested Alpha" });
  const rootHandle = root.getByRole("button", { name: "Move Recursive workspace" });
  const rootPositioning = root.locator(
    ':scope > .setta-workspace__section-header [data-workspace-section-layout-control="positioning"]',
  );
  const announcement = workspace.locator("[data-workspace-structure-movement-announcement]");
  const baselineChanges = await recursiveChangeCount(page);
  const viewportBeforeStructure = await canvasViewport(page);
  await workspace.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  const nestedHandleBox = await requiredBoundingBox(nestedHandle, "Nested structural handle");

  await page.mouse.move(
    nestedHandleBox.x + nestedHandleBox.width / 2,
    nestedHandleBox.y + nestedHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    nestedHandleBox.x + nestedHandleBox.width / 2 + 12,
    nestedHandleBox.y + nestedHandleBox.height / 2 + 12,
    { steps: 4 },
  );
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "section-structure");
  await expect(canvas).toHaveAttribute("data-workspace-section-move-input", "pointer");
  await expect(canvas).toHaveAttribute("data-workspace-structural-move-mode", "sort");
  await expect(nested).toHaveAttribute("data-workspace-moving", "true");
  await expect(rootHandle).toBeDisabled();
  await expect(announcement).toHaveText("Nested Alpha sorting movement started.");

  await page.mouse.wheel(0, 180);
  expect(await canvasViewport(page)).toEqual(viewportBeforeStructure);
  await mode.selectOption("free");
  await expect(canvas).toHaveAttribute("data-workspace-section-move-mode", "free");
  await expect(canvas).toHaveAttribute("data-workspace-structural-move-mode", "sort");
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "section-structure");
  await page.mouse.up();

  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
  await expect(canvas).toHaveAttribute("data-workspace-structural-move-mode", "none");
  await expect(nested).toHaveAttribute("data-workspace-moving", "false");
  await expect(announcement).toHaveText(
    "Nested Alpha did not move. The section block is already at this location.",
  );
  expect(await recursiveChangeCount(page)).toBe(baselineChanges);

  await mode.selectOption("sort");
  const rootHandleBox = await requiredBoundingBox(rootHandle, "Root spatial handle");
  await page.mouse.move(
    rootHandleBox.x + rootHandleBox.width / 2,
    rootHandleBox.y + rootHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    rootHandleBox.x + rootHandleBox.width / 2 + 48,
    rootHandleBox.y + rootHandleBox.height / 2 + 24,
    { steps: 6 },
  );
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "root-layout");
  await expect(nestedHandle).toBeDisabled();
  await mode.selectOption("free");
  await expect(canvas).toHaveAttribute("data-workspace-section-move-mode", "free");
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "root-layout");
  await expect(rootHandle).toHaveAttribute("data-workspace-section-drag-mode", "spatial");
  await expect(rootHandle).toBeEnabled();
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
  await expect.poll(() => recursiveChangeCount(page)).toBe(baselineChanges + 1);
  await expect(page.locator(".announcement")).toContainText("Document change: section-move.");

  await mode.selectOption("sort");
  await nestedHandle.focus();
  await expect(rootPositioning).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "section-structure");
  await expect(canvas).toHaveAttribute("data-workspace-section-move-input", "keyboard");
  await expect(announcement).toHaveText(
    "Nested Alpha sorting started. Use the arrow keys to move, Enter to finish, or Escape to cancel.",
  );
  await expect(page.locator(".announcement")).toContainText("Document change: section-move.");
  await mode.selectOption("free");
  await expect(canvas).toHaveAttribute("data-workspace-structural-move-mode", "sort");
  await expect(page.locator(".announcement")).toContainText("Document change: section-move.");
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
  await expect(nestedHandle).toBeFocused();
  await expect(announcement).toHaveText("Nested Alpha movement canceled.");
  expect(await canvasViewport(page)).toEqual(viewportBeforeStructure);
  expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);

  await rootHandle.focus();
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "section-structure");
  await expect(canvas).toHaveAttribute("data-workspace-structural-move-mode", "free");
  await page.keyboard.press("Escape");
  await expect(rootHandle).toBeFocused();
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("structural previews commit exact sort and free-move plans", async ({ page }) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  await setCanvasZoom(page, 0.5);
  const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
  const mode = page.getByRole("combobox", { name: "Section movement" });
  const root = workspace.getByRole("article", { name: "Recursive workspace" });
  const rootChildren = root.getByRole("group", {
    name: "Recursive workspace child sections",
  });
  const nestedAlpha = workspace.getByRole("article", { name: "Nested Alpha" });
  const nestedRow = workspace.getByRole("article", { name: "Nested row" });
  const emptyContainer = workspace.getByRole("article", { name: "Empty container" });
  const alphaHandle = nestedAlpha.getByRole("button", { name: "Move Nested Alpha" });
  const baselineChanges = await recursiveChangeCount(page);
  const directChildIds = (region: Locator) =>
    region
      .locator(
        ":scope > [data-workspace-child-surface] > [data-workspace-child-placement] > [data-workspace-section-id]",
      )
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-workspace-section-id")),
      );

  await workspace.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  const canvasBox = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
  });
  const nestedRowBox = await requiredBoundingBox(nestedRow, "Nested row sort target");
  const sortTargetY = Math.min(
    nestedRowBox.y + nestedRowBox.height - 8,
    canvasBox.y + canvasBox.height - 32,
  );
  expect(sortTargetY).toBeGreaterThan(nestedRowBox.y + nestedRowBox.height / 2);
  await dragHandleToPoint(page, alphaHandle, {
    x: nestedRowBox.x + Math.min(80, nestedRowBox.width / 2),
    y: sortTargetY,
  });
  const nestedPreview = workspace.locator(
    '[data-workspace-section-move-destination-parent="recursive-root"]',
  );
  await expect(nestedPreview).toHaveAttribute("data-workspace-section-move-destination-index", "1");
  await expect(
    workspace.locator("[data-workspace-section-move-preview-announcement]"),
  ).toContainText("Preview: Nested Alpha will move to Recursive workspace, position 2 of 3.");
  await expect(nestedAlpha).toHaveAttribute("data-workspace-section-move-preview-transform", /.+/);
  await expect(nestedRow).toHaveAttribute("data-workspace-section-move-preview-transform", /.+/);
  await expect(emptyContainer).not.toHaveAttribute(
    "data-workspace-section-move-preview-transform",
    /.+/,
  );
  expect(await directChildIds(rootChildren)).toEqual([
    "nested-alpha",
    "nested-row",
    "empty-container",
  ]);
  await expect(workspace.locator(".setta-workspace__selection-overlay")).toHaveCount(0);
  await expect(canvas).toHaveScreenshot("recursive-section-movement-preview.png");
  await page.mouse.up();

  await expect
    .poll(() => directChildIds(rootChildren))
    .toEqual(["nested-row", "nested-alpha", "empty-container"]);
  await expect(nestedAlpha).not.toHaveAttribute(
    "data-workspace-section-move-preview-transform",
    /.+/,
  );
  await expect(nestedRow).not.toHaveAttribute(
    "data-workspace-section-move-preview-transform",
    /.+/,
  );
  await expect(workspace.locator(".setta-workspace__selection-overlay")).toHaveAttribute(
    "data-workspace-selection-roots",
    "nested-alpha",
  );
  await expect(alphaHandle).toBeFocused();
  await expect(workspace.locator("[data-workspace-structure-movement-announcement]")).toHaveText(
    "Nested Alpha moved to Recursive workspace, position 2 of 3.",
  );
  expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);

  await mode.selectOption("free");
  const canvasPoint = await blankPanePoint(page);
  await dragHandleToPoint(page, alphaHandle, canvasPoint);
  const canvasPreview = workspace.locator(
    '[data-workspace-section-move-destination-parent="canvas"]',
  );
  await expect(canvasPreview).toHaveAttribute(
    "data-workspace-section-move-destination-placement",
    "freeform",
  );
  await expect(canvasPreview).not.toHaveAttribute("data-workspace-section-move-destination-index");
  await expect(
    canvasPreview.locator(".setta-workspace__section-move-placeholder--canvas"),
  ).toBeVisible();
  await page.mouse.up();

  await expect(nestedAlpha).toHaveAttribute("data-workspace-depth", "0");
  await expect(nestedAlpha).not.toHaveAttribute("data-workspace-parent-section-id", /.+/);
  await expect(alphaHandle).toBeFocused();
  expect(await recursiveChangeCount(page)).toBe(baselineChanges + 2);

  const emptyTarget = emptyContainer.locator("[data-workspace-empty-child-container]");
  const emptyBox = await requiredBoundingBox(emptyTarget, "Empty structural destination");
  await dragHandleToPoint(page, alphaHandle, {
    x: emptyBox.x + emptyBox.width / 2,
    y: emptyBox.y + emptyBox.height / 2,
  });
  const emptyPreview = workspace.locator(
    '[data-workspace-section-move-destination-parent="empty-container"]',
  );
  await expect(emptyPreview).toHaveAttribute("data-workspace-section-move-destination-index", "0");
  await expect(
    emptyPreview.locator(".setta-workspace__section-move-placeholder--empty"),
  ).toBeVisible();
  await page.mouse.up();

  await expect(nestedAlpha).toHaveAttribute("data-workspace-depth", "2");
  await expect(nestedAlpha).toHaveAttribute("data-workspace-parent-section-id", "empty-container");
  await expect(alphaHandle).toBeFocused();
  expect(await recursiveChangeCount(page)).toBe(baselineChanges + 3);

  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(nestedAlpha).toHaveAttribute("data-workspace-depth", "0");
  await page.keyboard.press("Control+Shift+z");
  await expect(nestedAlpha).toHaveAttribute("data-workspace-parent-section-id", "empty-container");
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("structural move rejection is preflighted, visible, and host-controlled", async ({ page }) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  await setCanvasZoom(page, 0.5);
  await page.getByRole("combobox", { name: "Section movement" }).selectOption("free");
  const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
  const root = workspace.getByRole("article", { name: "Recursive workspace" });
  const nestedAlpha = workspace.getByRole("article", { name: "Nested Alpha" });
  const nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  const deepContainer = workspace.getByRole("article", { name: "Deep container" });
  const emptyContainer = workspace.getByRole("article", { name: "Empty container" });
  const alphaHandle = nestedAlpha.getByRole("button", { name: "Move Nested Alpha" });
  const structureAnnouncement = workspace.locator(
    "[data-workspace-structure-movement-announcement]",
  );
  const previewAnnouncement = workspace.locator(
    "[data-workspace-section-move-preview-announcement]",
  );
  const invalidFeedback = workspace.locator('[data-workspace-section-move-feedback="invalid"]');
  const invalidIndicator = workspace.locator('[data-workspace-section-move-placeholder="invalid"]');

  await page.getByRole("checkbox", { name: "Reserve empty container from section moves" }).check();
  await workspace.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  const emptyTarget = emptyContainer.locator("[data-workspace-empty-child-container]");
  const emptyTargetPoint = await visibleCanvasTargetPoint(
    canvas,
    emptyTarget,
    "Reserved empty container target",
  );
  await dragHandleToPoint(page, alphaHandle, emptyTargetPoint);

  await expect(invalidFeedback.locator("strong")).toHaveText("Move unavailable");
  await expect(invalidFeedback.locator("span")).toHaveText(
    "Host policy keeps Empty container reserved.",
  );
  await expect(invalidIndicator).toBeVisible();
  await expect(previewAnnouncement).toHaveText("Host policy keeps Empty container reserved.");
  await expect(canvas).toHaveScreenshot("recursive-section-move-rejected.png");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");

  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  await setCanvasZoom(page, 0.5);
  await workspace.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  const completionTargetPoint = await visibleCanvasTargetPoint(
    canvas,
    emptyTarget,
    "Reserved empty container completion target",
  );
  const baselineChanges = await recursiveChangeCount(page);
  await dragHandleToPoint(page, alphaHandle, completionTargetPoint);
  await expect(previewAnnouncement).toHaveText("Host policy keeps Empty container reserved.");
  await page.mouse.up();

  await expect(structureAnnouncement).toHaveText(
    "Nested Alpha did not move. Host policy keeps Empty container reserved.",
  );
  await expect(nestedAlpha).toHaveAttribute("data-workspace-parent-section-id", "recursive-root");
  expect(await recursiveChangeCount(page)).toBe(baselineChanges);

  const rootHandle = root.getByRole("button", { name: "Move Recursive workspace" });
  const deepChildRegion = deepContainer.getByRole("group", {
    name: "Deep container child sections",
  });
  const deepRegionPoint = await visibleCanvasTargetPoint(
    canvas,
    deepChildRegion,
    "Descendant move target",
  );
  await dragHandleToPoint(page, rootHandle, deepRegionPoint);

  await expect(invalidFeedback).toContainText(
    "A section cannot move into itself or one of its descendants.",
  );
  await expect(invalidIndicator).toBeVisible();
  await page.mouse.up();
  await expect(structureAnnouncement).toHaveText(
    "Recursive workspace did not move. A section cannot move into itself or one of its descendants.",
  );
  expect(await recursiveChangeCount(page)).toBe(baselineChanges);

  await nestedAlpha.getByRole("button", { name: "Select Nested Alpha" }).click();
  await nestedBeta
    .getByRole("button", { name: "Select Nested Beta" })
    .click({ modifiers: ["Shift"] });
  await expect(workspace.locator("[data-workspace-selection-announcement]")).toHaveText(
    "2 sections selected.",
  );
  const betaHandle = nestedBeta.getByRole("button", { name: "Move Nested Beta" });
  await expect(alphaHandle).toBeEnabled();
  await expect(betaHandle).toBeEnabled();

  await nestedBeta.getByRole("button", { name: "Select Nested Beta" }).click();
  await nestedBeta.getByRole("button", { name: "Lock Nested Beta" }).click();
  await expect(nestedBeta).toContainText("Locked");
  await expect(betaHandle).toBeDisabled();
  const betaMoveDescriptionId = await betaHandle.getAttribute("aria-describedby");
  expect(betaMoveDescriptionId).toBeTruthy();
  await expect(workspace.locator(`#${String(betaMoveDescriptionId)}`)).toHaveText(
    "Movement unavailable because this section is locked.",
  );

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

async function groupNestedRowChildren(page: Page, workspace: Locator) {
  const nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  const deepContainer = workspace.getByRole("article", { name: "Deep container" });
  const selectBeta = nestedBeta.getByRole("button", { name: "Select Nested Beta" });
  const selectDeep = deepContainer.getByRole("button", { name: "Select Deep container" });
  await selectBeta.click();
  await selectDeep.click({ modifiers: ["Shift"] });
  const dialog = await openSelectionActions(page, selectBeta);
  await dialog.getByRole("menuitem", { name: "Group sections", exact: true }).click();
  const group = workspace.getByRole("article", { name: "Group 1 (2 sections)" });
  const selectGroup = group.getByRole("button", { name: "Select Group 1 (2 sections)" });
  await expect(group).toBeVisible();
  return { deepContainer, group, nestedBeta, selectBeta, selectDeep, selectGroup };
}

test("nested grouping rejects mixed parents and restores focus to the accepted group", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  const workspace = await loadRecursiveFixture(page);
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
  const nestedAlpha = workspace.getByRole("article", { name: "Nested Alpha" });
  const nestedBeta = workspace.getByRole("article", { name: "Nested Beta" });
  const selectAlpha = nestedAlpha.getByRole("button", { name: "Select Nested Alpha" });
  const selectBeta = nestedBeta.getByRole("button", { name: "Select Nested Beta" });
  const actionAnnouncement = workspace.locator("[data-workspace-selection-action-announcement]");
  const baselineChanges = await recursiveChangeCount(page);

  await selectAlpha.click();
  await selectBeta.click({ modifiers: ["Shift"] });
  const dialog = await openSelectionActions(page, selectAlpha);
  const mixedParentGroup = dialog.locator('[data-workspace-selection-action="group"]');
  await expect(mixedParentGroup).toHaveAttribute("aria-disabled", "true");
  await expect(mixedParentGroup).toContainText(
    "Selected sections must share one parent to be grouped.",
  );
  await mixedParentGroup.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  expect(await recursiveChangeCount(page)).toBe(baselineChanges);
  await dialog.getByRole("button", { name: "Close selection actions" }).click();

  const {
    deepContainer,
    group,
    nestedBeta: groupedBeta,
    selectGroup,
  } = await groupNestedRowChildren(page, workspace);
  await expect(group).toHaveAttribute("data-workspace-depth", "2");
  await expect(group).toHaveAttribute("data-workspace-parent-section-id", "nested-row");
  await expect(groupedBeta).toHaveAttribute("data-workspace-depth", "3");
  await expect(groupedBeta).toHaveAttribute(
    "data-workspace-parent-section-id",
    "navigation-group-1",
  );
  await expect(deepContainer).toHaveAttribute("data-workspace-depth", "3");
  await expect(selectGroup).toHaveAttribute("aria-pressed", "true");
  await expect(selectGroup).toBeFocused();
  await expect(actionAnnouncement).toHaveText("The 2 selected sections were grouped.");
  await expect.poll(() => recursiveChangeCount(page)).toBe(baselineChanges + 1);
  const document = await recursiveDocument(page);
  expect(document.sections["nested-row"]?.childLayout?.sectionIds).toEqual(["navigation-group-1"]);
  expect(document.sections["navigation-group-1"]?.childLayout?.sectionIds).toEqual([
    "nested-beta",
    "deep-container",
  ]);
  await expect(canvas).toHaveScreenshot("recursive-section-nested-group.png");

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test.describe("coarse-pointer structural ownership", () => {
  test.use({ hasTouch: true });

  test("touch structural movement has the same exclusive owner and completion cleanup", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 1_000, width: 1_440 });
    const workspace = await loadRecursiveFixture(page);
    await page.getByRole("button", { name: "Fit recursive descendants" }).click();
    const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
    const nested = workspace.getByRole("article", { name: "Nested Alpha" });
    const handle = nested.getByRole("button", { name: "Move Nested Alpha" });
    await handle.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "center" }),
    );
    const box = await requiredBoundingBox(handle, "Touch structural handle");
    const source = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const baselineChanges = await recursiveChangeCount(page);
    const baselineViewport = await canvasViewport(page);

    await dispatchTouchDrag({
      onActivated: async () => {
        await expect(canvas).toHaveAttribute(
          "data-workspace-interaction-owner",
          "section-structure",
        );
        await expect(canvas).toHaveAttribute("data-workspace-section-move-input", "touch");
      },
      onBeforeEnd: async () => {
        await expect(nested).toHaveAttribute("data-workspace-moving", "true");
        expect(await canvasViewport(page)).toEqual(baselineViewport);
      },
      page,
      source,
      target: { x: source.x + 36, y: source.y + 72 },
    });

    await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
    await expect(nested).toHaveAttribute("data-workspace-moving", "false");
    expect(await recursiveChangeCount(page)).toBe(baselineChanges);
  });
});

test("body and subtree minimize scopes preserve their distinct recursive contracts", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const workspace = await loadRecursiveFixture(page);
  const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
  const root = workspace.getByRole("article", { name: "Recursive workspace" });
  const nestedRow = workspace.getByRole("article", { name: "Nested row" });
  const nestedGamma = workspace.getByRole("article", { name: "Nested Gamma" });
  await nestedRow.getByRole("button", { name: "Select Nested row" }).click();
  const minimizeBody = nestedRow.getByRole("button", { name: "Minimize Nested row" });
  const bodyContentId = await minimizeBody.getAttribute("aria-controls");
  if (!bodyContentId || bodyContentId.includes(" ")) {
    throw new Error("Body-only minimization must control exactly one stable host-content target.");
  }
  await minimizeBody.press("Space");
  await expect(nestedRow.locator(`[id="${bodyContentId}"]`)).toBeHidden();
  await expect(nestedGamma).toBeVisible();
  const expandBody = nestedRow.getByRole("button", { name: "Expand Nested row" });
  await expect(expandBody).toBeFocused();
  await expandBody.press("Space");
  await expect(nestedGamma).toBeVisible();

  const selectGamma = nestedGamma.getByRole("button", { name: "Select Nested Gamma" });
  await selectGamma.click();
  const staleActions = await openSelectionActions(page, selectGamma);
  await root
    .locator(
      ':scope > .setta-workspace__section-header [data-workspace-section-state-control="minimize"]',
    )
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(staleActions).toHaveCount(0);
  await expect(workspace.getByRole("article")).toHaveCount(1);
  await expect(root).toHaveAttribute("data-workspace-selected", "true");
  await root
    .locator(
      ':scope > .setta-workspace__section-header [data-workspace-section-state-control="minimize"]',
    )
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(nestedGamma).toBeVisible();

  await root.getByRole("button", { name: "Select Recursive workspace" }).click();
  const minimize = root.getByRole("button", {
    name: "Minimize Recursive workspace and descendant sections",
  });
  const targetIds = (await minimize.getAttribute("aria-controls"))?.split(" ") ?? [];
  if (targetIds.length !== 2) {
    throw new Error("Subtree minimization must control stable body and descendant targets.");
  }
  const baselineChanges = await recursiveChangeCount(page);
  await minimize.press("Space");

  await expect.poll(() => recursiveChangeCount(page)).toBe(baselineChanges + 1);
  await expect(root).toHaveAttribute("data-workspace-minimize-scope", "subtree");
  await expect(root).toHaveAttribute("data-workspace-descendants-collapsed", "true");
  await expect(root.locator(`[id="${targetIds[0] as string}"]`)).toBeHidden();
  await expect(root.locator(`[id="${targetIds[1] as string}"]`)).toBeHidden();
  await expect(workspace.getByRole("article")).toHaveCount(1);
  await expect(nestedGamma).toHaveCount(0);
  await expect(root).toContainText("Minimized subtree");
  const expand = root.getByRole("button", {
    name: "Expand Recursive workspace and descendant sections",
  });
  await expect(expand).toBeFocused();
  await expect(workspace.locator("[data-workspace-section-state-announcement]")).toHaveText(
    "Recursive workspace minimized with its descendant sections collapsed.",
  );
  await canvas.focus();
  await page.keyboard.press("Control+a");
  await expect(workspace.locator("[data-workspace-selection-announcement]")).toHaveText(
    "Recursive workspace selected.",
  );

  await page.getByRole("button", { name: "Focus Nested Gamma" }).click();
  await expect(page.locator(".announcement")).toContainText(
    "Focus Nested Gamma: rejected (section-descendants-collapsed).",
  );
  await page.getByRole("button", { name: "Fit recursive descendants" }).click();
  await expect(page.locator(".announcement")).toContainText(
    "Fit recursive descendants: rejected (section-descendants-collapsed).",
  );
  await expect(root).toHaveAttribute("data-workspace-selected", "true");

  await page.setViewportSize({ height: 720, width: 320 });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(workspace).toHaveScreenshot("recursive-section-subtree-minimized.png");
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);

  await expand.press("Space");
  await expect(root).toHaveAttribute("data-workspace-descendants-collapsed", "false");
  await expect(workspace.getByRole("article")).toHaveCount(7);
  await expect(workspace.getByRole("article", { name: "Nested Gamma" })).toBeVisible();
  await expect(
    root.getByRole("button", {
      name: "Minimize Recursive workspace and descendant sections",
    }),
  ).toBeFocused();
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

  const viewportBeforeWheel = await canvasViewport(page);
  await scrollRegionHorizontallyWithWheel(page, childRegion);
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
  const positioningControl = header.locator(
    '[data-workspace-section-layout-control="positioning"]',
  );
  await expect(positioningControl).toHaveAccessibleName(
    "Use freeform positioning for Nested row child sections",
  );
  await expect(orientationControl).toHaveAccessibleName(
    "Arrange Nested row child sections vertically",
  );
  await expect(orientationControl).toHaveAttribute("data-workspace-next-orientation", "vertical");
  const browserSession = await page.context().newCDPSession(page);
  await browserSession.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect(positioningControl).toBeVisible();
  await expect(orientationControl).toBeVisible();
  await browserSession.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  const directChildIds = () =>
    childRegion
      .locator(
        ":scope > [data-workspace-child-surface] > [data-workspace-child-placement] > [data-workspace-section-id]",
      )
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
  await expect(page.locator(".announcement")).toContainText(
    "External child added to Empty container.",
  );
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(workspace).toHaveScreenshot("recursive-container-overflow.png");
});
