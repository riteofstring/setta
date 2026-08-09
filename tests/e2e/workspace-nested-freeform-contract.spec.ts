import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  dragHandleToPoint,
  recursiveChangeCount,
  requiredBoundingBox,
  setCanvasZoom,
} from "./workspace-test-helpers.js";

const contractUrl = "/?canvas-shell&nested-freeform-contract";

async function placementDelta(surface: Locator, sectionId: string) {
  const placement = surface.locator(`[data-workspace-freeform-child-placement="${sectionId}"]`);
  const [surfaceBox, placementBox] = await Promise.all([
    surface.boundingBox(),
    placement.boundingBox(),
  ]);
  if (!surfaceBox || !placementBox) {
    throw new Error(`Freeform placement ${sectionId} must expose browser geometry.`);
  }
  return { x: placementBox.x - surfaceBox.x, y: placementBox.y - surfaceBox.y };
}

async function expectSurfaceContains(surface: Locator, sectionId: string): Promise<void> {
  const placement = surface.locator(`[data-workspace-freeform-child-placement="${sectionId}"]`);
  await expect
    .poll(async () => {
      const [surfaceBox, placementBox] = await Promise.all([
        surface.boundingBox(),
        placement.boundingBox(),
      ]);
      return Boolean(
        surfaceBox &&
        placementBox &&
        placementBox.x + placementBox.width <= surfaceBox.x + surfaceBox.width + 1 &&
        placementBox.y + placementBox.height <= surfaceBox.y + surfaceBox.height + 1,
      );
    })
    .toBe(true);
}

async function expectRootFreeformLayout(workspace: Locator, root: Locator): Promise<void> {
  const rootRegion = root.locator('[data-workspace-section-child-region="recursive-root"]');
  const rootSurface = rootRegion.locator(":scope > [data-workspace-freeform-child-surface]");
  await expect(rootRegion).toHaveAttribute("data-workspace-child-positioning", "freeform");
  await expect(rootRegion).toHaveAttribute("data-workspace-child-overflow", "scroll");
  await expect(rootRegion).not.toHaveAttribute("data-workspace-child-orientation", /.+/u);
  await expect(rootSurface).toHaveCount(1);
  await expect(rootSurface.locator(".react-flow__viewport")).toHaveCount(0);
  await expect(workspace.locator(".react-flow__viewport")).toHaveCount(1);
  expect(await placementDelta(rootSurface, "nested-alpha")).toEqual({ x: 16, y: 16 });
  expect(await placementDelta(rootSurface, "nested-row")).toEqual({ x: 232, y: 48 });
  expect(await placementDelta(rootSurface, "empty-container")).toEqual({ x: 80, y: 500 });
  await expectSurfaceContains(rootSurface, "nested-row");
  await expectSurfaceContains(rootSurface, "empty-container");
}

async function expectDeepFreeformLayout(workspace: Locator, root: Locator): Promise<void> {
  const deepRegion = workspace.locator('[data-workspace-section-child-region="deep-container"]');
  const deepSurface = deepRegion.locator(":scope > [data-workspace-freeform-child-surface]");
  await expect(deepRegion).toHaveAttribute("data-workspace-child-positioning", "freeform");
  expect(await placementDelta(deepSurface, "nested-gamma")).toEqual({ x: 20, y: 24 });
  await expectSurfaceContains(deepSurface, "nested-gamma");
  await expect(root.getByRole("article", { name: "Nested Gamma" })).toHaveCount(1);
}

async function expectPositioningControls(root: Locator): Promise<void> {
  await root.getByRole("button", { name: "Select Recursive workspace" }).click();
  await expect(
    root.getByRole("button", {
      name: "Arrange Recursive workspace child sections horizontally",
    }),
  ).toHaveCount(0);
  await root.getByRole("button", { name: "Select Nested row" }).click();
  await expect(
    root.getByRole("button", { name: "Arrange Nested row child sections vertically" }),
  ).toBeVisible();
}

async function expectSerializedFreeformDocument(page: Page): Promise<void> {
  const serialized = JSON.parse(await page.getByTestId("canvas-shell-document").inputValue()) as {
    schemaVersion: number;
    sections: Record<
      string,
      { childLayout: { positioning: string; positions?: Record<string, unknown> } | null }
    >;
  };
  expect(serialized.schemaVersion).toBe(2);
  expect(serialized.sections["recursive-root"]?.childLayout).toMatchObject({
    positioning: "freeform",
    positions: {
      "empty-container": { x: 80, y: 500 },
      "nested-alpha": { x: 16, y: 16 },
      "nested-row": { x: 232, y: 48 },
    },
  });
}

async function serializedFreeformPosition(page: Page, sectionId: string) {
  const serialized = JSON.parse(await page.getByTestId("canvas-shell-document").inputValue()) as {
    sections: Record<
      string,
      { childLayout: { positions?: Record<string, { x: number; y: number }> } | null }
    >;
  };
  return serialized.sections["recursive-root"]?.childLayout?.positions?.[sectionId];
}

async function dispatchTouchDrag(
  page: Page,
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>,
  beforeEnd: () => Promise<void>,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touchPoint = (x: number, y: number) => ({
    force: 1,
    id: 91,
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
  await beforeEnd();
  await cdp.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });
  await cdp.detach();
}

async function expectFittedRoot(page: Page, workspace: Locator, root: Locator): Promise<void> {
  await page.getByRole("button", { name: "Fit sections" }).click();
  const [workspaceBounds, rootBounds] = await Promise.all([
    workspace.boundingBox(),
    root.boundingBox(),
  ]);
  if (!workspaceBounds || !rootBounds) {
    throw new Error("The fitted freeform root must expose browser geometry.");
  }
  expect(rootBounds.y + 1).toBeGreaterThanOrEqual(workspaceBounds.y);
  expect(rootBounds.y + rootBounds.height).toBeLessThanOrEqual(
    workspaceBounds.y + workspaceBounds.height + 1,
  );
}

test.describe("Phase 6 nested freeform document contract", () => {
  test("renders schema-v2 local positions through one recursive DOM owner", async ({ page }) => {
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(contractUrl);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    const root = workspace.getByRole("article", { name: "Recursive workspace" });
    await expect(root).toBeVisible();
    await expectRootFreeformLayout(workspace, root);
    await expectDeepFreeformLayout(workspace, root);
    await expectPositioningControls(root);
    await expectSerializedFreeformDocument(page);

    const results = await new AxeBuilder({ page }).include(".setta-workspace").analyze();
    expect(results.violations).toEqual([]);
    await expectFittedRoot(page, workspace, root);
    await expect(workspace).toHaveScreenshot("nested-freeform-contract.png", {
      animations: "disabled",
    });
  });

  test("retains local coordinates at 200% scale and 320 CSS-pixel reflow", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ height: 900, width: 320 });
    await page.goto(contractUrl);
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    await expect(workspace.getByRole("article", { name: "Recursive workspace" })).toBeVisible();
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    const rootSurface = workspace.locator(
      '[data-workspace-section-child-region="recursive-root"] > [data-workspace-freeform-child-surface]',
    );
    const alpha = await placementDelta(rootSurface, "nested-alpha");
    const row = await placementDelta(rootSurface, "nested-row");
    expect(row.x - alpha.x).toBeCloseTo(232 - 16, 0);
    expect(row.y - alpha.y).toBeCloseTo(48 - 16, 0);
    await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  });

  test("moves a freeform child by pointer and keyboard through one local plan", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(contractUrl);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    await setCanvasZoom(page, 1);
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
    const alpha = workspace.getByRole("article", { name: "Nested Alpha" });
    const handle = alpha.getByRole("button", { name: "Move Nested Alpha" });
    await handle.scrollIntoViewIfNeeded();
    const handleBox = await requiredBoundingBox(handle, "Nested Alpha freeform handle");
    const baselineChanges = await recursiveChangeCount(page);

    await dragHandleToPoint(page, handle, {
      x: handleBox.x + handleBox.width / 2 + 48,
      y: handleBox.y + handleBox.height / 2 + 24,
    });
    const preview = workspace.locator(
      '[data-workspace-section-move-destination-parent="recursive-root"]' +
        '[data-workspace-section-move-destination-placement="freeform"]',
    );
    await expect(preview).toHaveCount(1);
    await expect(preview).not.toHaveAttribute("data-workspace-section-move-destination-index");
    await expect(
      preview.locator(".setta-workspace__section-move-placeholder--freeform"),
    ).toBeVisible();
    await expect(alpha).toHaveAttribute("data-workspace-section-move-preview-transform", "56,32");
    await expect(
      workspace.locator("[data-workspace-section-move-preview-announcement]"),
    ).toHaveText("Preview: Nested Alpha will move to Recursive workspace at x 72, y 48.");
    await expect(workspace.locator('[data-workspace-child-placement="nested-alpha"]')).toHaveCSS(
      "z-index",
      "1",
    );
    await expect(canvas).toHaveScreenshot("nested-freeform-movement-preview.png", {
      animations: "disabled",
    });
    await page.mouse.up();

    await expect
      .poll(() => serializedFreeformPosition(page, "nested-alpha"))
      .toEqual({
        x: 72,
        y: 48,
      });
    await expect(handle).toBeFocused();
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);

    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await expect(
      workspace.locator("[data-workspace-section-move-preview-announcement]"),
    ).toHaveText("Preview: Nested Alpha will move to Recursive workspace at x 96, y 24.");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => serializedFreeformPosition(page, "nested-alpha"))
      .toEqual({
        x: 96,
        y: 24,
      });
    await expect(handle).toBeFocused();
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 2);

    const results = await new AxeBuilder({ page }).include(".setta-workspace").analyze();
    expect(results.violations).toEqual([]);
  });

  test("keeps movement local through nested scrolling and outer zoom", async ({ page }) => {
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(contractUrl);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    await setCanvasZoom(page, 2);
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    const region = workspace.locator('[data-workspace-section-child-region="recursive-root"]');
    const alpha = workspace.getByRole("article", { name: "Nested Alpha" });
    const handle = alpha.getByRole("button", { name: "Move Nested Alpha" });
    const handleBox = await requiredBoundingBox(handle, "zoomed Nested Alpha handle");
    const source = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };
    const baselineChanges = await recursiveChangeCount(page);

    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    await page.mouse.move(source.x + 48, source.y, { steps: 10 });
    await expect(alpha).toHaveAttribute("data-workspace-section-move-preview-transform", "32,8");
    await region.evaluate((element) => {
      element.scrollTop = 48;
    });
    await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBe(48);
    await page.mouse.move(source.x + 49, source.y, { steps: 2 });
    await expect(alpha).toHaveAttribute("data-workspace-section-move-preview-transform", "32,56");
    await page.mouse.up();

    await expect
      .poll(() => serializedFreeformPosition(page, "nested-alpha"))
      .toEqual({ x: 48, y: 72 });
    await expect(handle).toBeFocused();
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);
  });
});

test.describe("Phase 6 nested freeform coarse-pointer movement", () => {
  test.use({ hasTouch: true });

  test("commits the same snapped local move from touch input", async ({ page }) => {
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(contractUrl);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    await setCanvasZoom(page, 1);
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
    const alpha = workspace.getByRole("article", { name: "Nested Alpha" });
    const handle = alpha.getByRole("button", { name: "Move Nested Alpha" });
    await handle.scrollIntoViewIfNeeded();
    const handleBox = await requiredBoundingBox(handle, "Nested Alpha touch handle");
    const source = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };
    const baselineChanges = await recursiveChangeCount(page);

    await dispatchTouchDrag(page, source, { x: source.x + 48, y: source.y + 24 }, async () => {
      await expect(canvas).toHaveAttribute("data-workspace-section-move-input", "touch");
      await expect(alpha).toHaveAttribute("data-workspace-section-move-preview-transform", "56,32");
    });

    await expect
      .poll(() => serializedFreeformPosition(page, "nested-alpha"))
      .toEqual({
        x: 72,
        y: 48,
      });
    await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);
  });
});
