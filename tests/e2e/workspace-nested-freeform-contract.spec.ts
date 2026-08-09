import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test,
  type BrowserContext,
  type JSHandle,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  dragHandleToPoint,
  recursiveChangeCount,
  requiredBoundingBox,
  setCanvasZoom,
} from "./workspace-test-helpers.js";

const contractUrl = "/?canvas-shell&nested-freeform-contract";
const PLAYGROUND_ORIGIN = "http://127.0.0.1:4173";
const RECURSIVE_CHILD_MIME = "application/x-setta-workspace-recursive-child";
const NATIVE_COPY_SHORTCUT = process.platform === "darwin" ? "Meta+c" : "Control+c";

async function grantClipboard(context: BrowserContext): Promise<void> {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: PLAYGROUND_ORIGIN,
  });
}

async function externalTransfer(page: Page, value: string): Promise<JSHandle<DataTransfer>> {
  return page.evaluateHandle(
    ({ mimeType, payload }) => {
      const transfer = new DataTransfer();
      transfer.setData(mimeType, payload);
      return transfer;
    },
    { mimeType: RECURSIVE_CHILD_MIME, payload: value },
  );
}

async function visibleRootFreeformPoint(
  workspace: Locator,
  offset: Readonly<{ x: number; y: number }>,
) {
  const region = workspace.locator('[data-workspace-section-child-region="recursive-root"]');
  const surface = region.locator(":scope > [data-workspace-freeform-child-surface]");
  await region.scrollIntoViewIfNeeded();
  const [regionBox, surfaceBox] = await Promise.all([
    requiredBoundingBox(region, "Recursive root drop region"),
    requiredBoundingBox(surface, "Recursive root drop surface"),
  ]);
  const rawPoint = {
    x: Math.min(
      regionBox.x + regionBox.width - 12,
      Math.max(regionBox.x + 12, surfaceBox.x + offset.x),
    ),
    y: Math.min(
      regionBox.y + regionBox.height - 12,
      Math.max(regionBox.y + 12, surfaceBox.y + offset.y),
    ),
  };
  const point = { x: Math.round(rawPoint.x), y: Math.round(rawPoint.y) };
  return {
    local: { x: point.x - surfaceBox.x, y: point.y - surfaceBox.y },
    point,
  };
}

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
    root.getByRole("button", { name: "Change Recursive workspace child positioning" }),
  ).toHaveAttribute("aria-haspopup", "dialog");
  await expect(
    root.getByRole("button", {
      name: "Arrange Recursive workspace child sections horizontally",
    }),
  ).toHaveCount(0);
  await root.getByRole("button", { name: "Select Nested row" }).click();
  await expect(
    root.getByRole("button", {
      name: "Use freeform positioning for Nested row child sections",
    }),
  ).toBeVisible();
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

type NestedFreeformSerializedDocument = Readonly<{
  sections: Readonly<
    Record<
      string,
      Readonly<{
        childLayout: Readonly<{
          positioning: string;
          positions?: Readonly<Record<string, Readonly<{ x: number; y: number }>>>;
          sectionIds: readonly string[];
        }> | null;
      }>
    >
  >;
}>;

async function nestedFreeformSerializedDocument(
  page: Page,
): Promise<NestedFreeformSerializedDocument> {
  return JSON.parse(
    await page.getByTestId("canvas-shell-document").inputValue(),
  ) as NestedFreeformSerializedDocument;
}

function requiredSerializedChildLayout(
  document: NestedFreeformSerializedDocument,
  sectionId: string,
) {
  const layout = document.sections[sectionId]?.childLayout;
  if (!layout) {
    throw new Error(`Serialized section ${sectionId} must provide a child layout.`);
  }
  return layout;
}

function requiredSerializedFreeformPosition(
  document: NestedFreeformSerializedDocument,
  parentSectionId: string,
  sectionId: string,
): Readonly<{ x: number; y: number }> {
  const position = requiredSerializedChildLayout(document, parentSectionId).positions?.[sectionId];
  if (!position) {
    throw new Error(`Serialized freeform position for ${sectionId} is unavailable.`);
  }
  return position;
}

async function requiredAttribute(locator: Locator, name: string, label: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (!value) throw new Error(`${label} is unavailable.`);
  return value;
}

function expectGroupedFreeformDocument(document: NestedFreeformSerializedDocument): void {
  expect(requiredSerializedChildLayout(document, "recursive-root")).toEqual({
    overflow: "scroll",
    positioning: "freeform",
    positions: {
      "empty-container": { x: 80, y: 500 },
      "navigation-group-1": { x: 16, y: 16 },
    },
    sectionIds: ["navigation-group-1", "empty-container"],
  });
  expect(requiredSerializedChildLayout(document, "navigation-group-1")).toMatchObject({
    positioning: "ordered",
    sectionIds: ["nested-alpha", "nested-row"],
  });
}

function expectUngroupedFreeformDocument(
  document: NestedFreeformSerializedDocument,
  expectedPositions: Readonly<
    Record<"nested-alpha" | "nested-row", Readonly<{ x: number; y: number }>>
  >,
): void {
  const layout = requiredSerializedChildLayout(document, "recursive-root");
  expect(layout.sectionIds).toEqual(["nested-alpha", "nested-row", "empty-container"]);
  expect(layout.positions).not.toHaveProperty("navigation-group-1");
  expect(layout.positions?.["empty-container"]).toEqual({ x: 80, y: 500 });
  for (const sectionId of ["nested-alpha", "nested-row"] as const) {
    expect(layout.positions?.[sectionId]?.x).toBeCloseTo(expectedPositions[sectionId].x, 4);
    expect(layout.positions?.[sectionId]?.y).toBeCloseTo(expectedPositions[sectionId].y, 4);
  }
  expect(document.sections["navigation-group-1"]).toBeUndefined();
}

async function openSelectionActions(page: Page, trigger: Locator): Promise<Locator> {
  await trigger.focus();
  await page.keyboard.press("Shift+F10");
  const dialog = page.getByRole("dialog", { name: "Selection actions" });
  await expect(dialog).toBeVisible();
  return dialog;
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
    const root = workspace.getByRole("article", { name: "Recursive workspace" });
    await expect(root).toBeVisible();
    const selectRoot = root.getByRole("button", { name: "Select Recursive workspace" });
    await selectRoot.click();
    await expect(selectRoot).toHaveAttribute("aria-pressed", "true");
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

    const positioning = root.getByRole("button", {
      name: "Change Recursive workspace child positioning",
    });
    await positioning.focus();
    await positioning.press("Enter");
    const choiceDialog = page.getByRole("dialog", { name: "Arrange child sections" });
    const verticalChoice = choiceDialog.getByRole("button", { name: "Arrange vertically" });
    await expect(verticalChoice).toBeFocused();
    await verticalChoice.press("Enter");
    const confirmation = page.getByRole("dialog", { name: "Arrange child sections?" });
    await expect(confirmation).toHaveAttribute(
      "data-workspace-section-positioning-step",
      "confirm",
    );
    await expect(confirmation.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    const dialogAccessibility = await new AxeBuilder({ page }).include("dialog[open]").analyze();
    expect(dialogAccessibility.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(positioning).toBeFocused();
    await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  });

  test("switches child positioning with confirmation only for material rearrangement", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(contractUrl);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    await setCanvasZoom(page, 1);
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    const root = workspace.getByRole("article", { name: "Recursive workspace" });
    const rootRegion = root.locator('[data-workspace-section-child-region="recursive-root"]');
    const rootSelection = root.getByRole("button", { name: "Select Recursive workspace" });
    await rootSelection.click();
    const freeformControl = root.getByRole("button", {
      name: "Change Recursive workspace child positioning",
    });
    const baselineChanges = await recursiveChangeCount(page);

    await freeformControl.click();
    let choiceDialog = page.getByRole("dialog", { name: "Arrange child sections" });
    await expect(choiceDialog.getByRole("button", { name: "Arrange horizontally" })).toBeVisible();
    await choiceDialog.getByRole("button", { name: "Arrange vertically" }).click();
    let confirmation = page.getByRole("dialog", { name: "Arrange child sections?" });
    await expect(confirmation).toContainText(
      "This will move 3 child sections in Recursive workspace into vertical order.",
    );
    await expect(confirmation.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect(page).toHaveScreenshot("nested-freeform-positioning-confirmation.png", {
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(rootSelection).toHaveAttribute("aria-pressed", "true");
    await expect(freeformControl).toBeFocused();
    await expect(rootRegion).toHaveAttribute("data-workspace-child-positioning", "freeform");
    expect(await recursiveChangeCount(page)).toBe(baselineChanges);

    await freeformControl.click();
    choiceDialog = page.getByRole("dialog", { name: "Arrange child sections" });
    await choiceDialog.getByRole("button", { name: "Arrange vertically" }).click();
    confirmation = page.getByRole("dialog", { name: "Arrange child sections?" });
    await confirmation.getByRole("button", { name: "Arrange vertically" }).click();
    await expect(rootRegion).toHaveAttribute("data-workspace-child-positioning", "ordered");
    await expect(rootRegion).toHaveAttribute("data-workspace-child-orientation", "vertical");
    await expect(
      workspace.locator("[data-workspace-container-positioning-announcement]"),
    ).toHaveText("Recursive workspace child sections are arranged vertically.");
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);

    const sectionIds = ["nested-alpha", "nested-row", "empty-container"] as const;
    const orderedBoxes = await Promise.all(
      sectionIds.map((sectionId) =>
        requiredBoundingBox(
          workspace.locator(`[data-workspace-section-id="${sectionId}"]`),
          `Ordered ${sectionId}`,
        ),
      ),
    );
    const minimumX = Math.min(...orderedBoxes.map(({ x }) => x));
    const minimumY = Math.min(...orderedBoxes.map(({ y }) => y));
    const orderedControl = root.getByRole("button", {
      name: "Use freeform positioning for Recursive workspace child sections",
    });
    await orderedControl.click();
    await expect(rootRegion).toHaveAttribute("data-workspace-child-positioning", "freeform");
    await expect(page.getByRole("dialog", { name: "Arrange child sections" })).toHaveCount(0);
    await expect(freeformControl).toBeFocused();
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 2);

    const freeformDocument = await nestedFreeformSerializedDocument(page);
    for (const [index, sectionId] of sectionIds.entries()) {
      const orderedBox = orderedBoxes[index];
      if (!orderedBox) {
        throw new Error(`Ordered ${sectionId} geometry is unavailable.`);
      }
      const position = requiredSerializedFreeformPosition(
        freeformDocument,
        "recursive-root",
        sectionId,
      );
      expect(position.x).toBeCloseTo(orderedBox.x - minimumX, 3);
      expect(position.y).toBeCloseTo(orderedBox.y - minimumY, 3);
    }

    await freeformControl.click();
    choiceDialog = page.getByRole("dialog", { name: "Arrange child sections" });
    await choiceDialog.getByRole("button", { name: "Arrange vertically" }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(rootRegion).toHaveAttribute("data-workspace-child-positioning", "ordered");
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 3);

    const results = await new AxeBuilder({ page }).include(".setta-workspace").analyze();
    expect(results.violations).toEqual([]);
  });

  test("reports a controlled host that retains child positioning", async ({ page }) => {
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(`${contractUrl}&reject-positioning`);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    const root = workspace.getByRole("article", { name: "Recursive workspace" });
    const rootRegion = root.locator('[data-workspace-section-child-region="recursive-root"]');
    await root.getByRole("button", { name: "Select Recursive workspace" }).click();
    const positioning = root.getByRole("button", {
      name: "Change Recursive workspace child positioning",
    });
    const baselineChanges = await recursiveChangeCount(page);

    await positioning.click();
    await page
      .getByRole("dialog", { name: "Arrange child sections" })
      .getByRole("button", { name: "Arrange vertically" })
      .click();
    await page
      .getByRole("dialog", { name: "Arrange child sections?" })
      .getByRole("button", { name: "Arrange vertically" })
      .click();

    await expect(rootRegion).toHaveAttribute("data-workspace-child-positioning", "freeform");
    await expect(
      workspace.locator("[data-workspace-container-positioning-announcement]"),
    ).toHaveText(
      "Recursive workspace child positioning did not change because the host did not accept the change.",
    );
    await expect(positioning).toBeFocused();
    expect(await recursiveChangeCount(page)).toBe(baselineChanges);
  });

  test("cancels a descendant positioning confirmation when its subtree collapses", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(contractUrl);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    const root = workspace.getByRole("article", { name: "Recursive workspace" });
    const deepContainer = workspace.getByRole("article", { name: "Deep container" });
    await deepContainer.getByRole("button", { name: "Select Deep container" }).click();
    await deepContainer
      .getByRole("button", { name: "Change Deep container child positioning" })
      .click();
    await page
      .getByRole("dialog", { name: "Arrange child sections" })
      .getByRole("button", { name: "Arrange vertically" })
      .click();
    const confirmation = page.getByRole("dialog", { name: "Arrange child sections?" });
    await expect(confirmation).toBeVisible();
    const baselineChanges = await recursiveChangeCount(page);

    await root
      .locator(
        ':scope > .setta-workspace__section-header [data-workspace-section-state-control="minimize"]',
      )
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(deepContainer).toHaveCount(0);
    await confirmation.getByRole("button", { name: "Arrange vertically" }).click();

    await expect(confirmation).toHaveCount(0);
    await expect(
      workspace.locator("[data-workspace-container-positioning-announcement]"),
    ).toHaveText("The container changed before child positioning could be selected.");
    expect(
      requiredSerializedChildLayout(await nestedFreeformSerializedDocument(page), "deep-container")
        .positioning,
    ).toBe("freeform");
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);
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

  test("reparents between canvas, freeform, and ordered destinations", async ({ page }) => {
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(contractUrl);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    await page.getByRole("combobox", { name: "Section movement" }).selectOption("free");
    await setCanvasZoom(page, 1);
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
    const alpha = workspace.getByRole("article", { name: "Nested Alpha" });
    const handle = alpha.getByRole("button", { name: "Move Nested Alpha" });
    const baselineChanges = await recursiveChangeCount(page);

    await handle.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowLeft");
    await expect(
      workspace.locator(
        '[data-workspace-section-move-destination-parent="canvas"]' +
          '[data-workspace-section-move-destination-placement="freeform"]',
      ),
    ).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(handle).toBeFocused();
    await expect(alpha).toHaveAttribute("data-workspace-depth", "0");

    const handleBox = await requiredBoundingBox(handle, "Promoted Nested Alpha handle");
    const alphaBox = await requiredBoundingBox(alpha, "Promoted Nested Alpha frame");
    const rootRegion = workspace.locator('[data-workspace-section-child-region="recursive-root"]');
    let rootRegionBox = await requiredBoundingBox(rootRegion, "Recursive root freeform region");
    await dragHandleToPoint(page, handle, {
      x: handleBox.x + handleBox.width / 2 + rootRegionBox.x - 24 - alphaBox.x,
      y: handleBox.y + handleBox.height / 2 + rootRegionBox.y + 260 - alphaBox.y,
    });
    await expect(
      workspace.locator(
        '[data-workspace-section-move-destination-parent="recursive-root"]' +
          '[data-workspace-section-move-destination-placement="freeform"]',
      ),
    ).toHaveCount(1);
    await expect(canvas).toHaveScreenshot("nested-freeform-cross-parent-preview.png", {
      animations: "disabled",
    });
    await page.mouse.up();
    await expect(alpha).toHaveAttribute("data-workspace-parent-section-id", "recursive-root");

    const beta = workspace.getByRole("article", { name: "Nested Beta" });
    const betaBox = await requiredBoundingBox(beta, "Nested Beta ordered destination");
    await dragHandleToPoint(page, handle, {
      x: betaBox.x + betaBox.width / 2,
      y: betaBox.y + betaBox.height / 2,
    });
    await expect(
      workspace.locator(
        '[data-workspace-section-move-destination-parent="nested-row"]' +
          '[data-workspace-section-move-destination-placement="ordered"]',
      ),
    ).toHaveCount(1);
    await page.mouse.up();
    await expect(alpha).toHaveAttribute("data-workspace-parent-section-id", "nested-row");

    const orderedHandleBox = await requiredBoundingBox(handle, "Ordered Nested Alpha handle");
    const orderedAlphaBox = await requiredBoundingBox(alpha, "Ordered Nested Alpha frame");
    rootRegionBox = await requiredBoundingBox(rootRegion, "Recursive root freeform region");
    await dragHandleToPoint(page, handle, {
      x: orderedHandleBox.x + orderedHandleBox.width / 2 + rootRegionBox.x - 24 - orderedAlphaBox.x,
      y:
        orderedHandleBox.y +
        orderedHandleBox.height / 2 +
        rootRegionBox.y +
        260 -
        orderedAlphaBox.y,
    });
    await expect(
      workspace.locator(
        '[data-workspace-section-move-destination-parent="recursive-root"]' +
          '[data-workspace-section-move-destination-placement="freeform"]',
      ),
    ).toHaveCount(1);
    await page.mouse.up();

    await expect(alpha).toHaveAttribute("data-workspace-parent-section-id", "recursive-root");
    await expect(handle).toBeFocused();
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 4);
    const serialized = JSON.parse(await page.getByTestId("canvas-shell-document").inputValue()) as {
      rootSections: readonly { sectionId: string }[];
      sections: Record<
        string,
        {
          childLayout:
            | { positioning: "freeform"; positions: Record<string, unknown>; sectionIds: string[] }
            | { positioning: "ordered"; sectionIds: string[] }
            | null;
        }
      >;
    };
    expect(serialized.rootSections.some(({ sectionId }) => sectionId === "nested-alpha")).toBe(
      false,
    );
    expect(serialized.sections["recursive-root"]?.childLayout).toMatchObject({
      positioning: "freeform",
      sectionIds: expect.arrayContaining(["nested-alpha"]),
    });
    expect(serialized.sections["deep-container"]?.childLayout).toMatchObject({
      positioning: "freeform",
      sectionIds: ["nested-gamma"],
    });
    const results = await new AxeBuilder({ page }).include(".setta-workspace").analyze();
    expect(results.violations).toEqual([]);
  });

  test("pastes and externally drops into a nested freeform parent", async ({ context, page }) => {
    await grantClipboard(context);
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(contractUrl);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    await setCanvasZoom(page, 1);
    const workspace = page.getByRole("region", {
      exact: true,
      name: "Canvas shell workspace",
    });
    const canvas = workspace.getByRole("application", {
      name: "Canvas shell workspace canvas",
    });
    const alpha = workspace.getByRole("article", { name: "Nested Alpha" });
    const selectAlpha = alpha.getByRole("button", { name: "Select Nested Alpha" });
    const baselineChanges = await recursiveChangeCount(page);

    await selectAlpha.click();
    await selectAlpha.focus();
    await page.keyboard.press(NATIVE_COPY_SHORTCUT);
    const clipboardAnnouncement = workspace.locator("[data-workspace-clipboard-announcement]");
    await expect(clipboardAnnouncement).toHaveText(
      "Copied 1 selected section with 1 section in the complete subtree.",
    );

    const pasteTarget = await visibleRootFreeformPoint(workspace, { x: 24, y: 260 });
    await page.mouse.move(pasteTarget.point.x, pasteTarget.point.y);
    await canvas.focus();
    await page.keyboard.press("Control+v");
    const pastedPlacement = workspace.locator(
      '[data-workspace-freeform-child-placement^="nested-freeform-copy-"]',
    );
    await expect(pastedPlacement).toHaveCount(1);
    const pastedSectionId = await requiredAttribute(
      pastedPlacement,
      "data-workspace-freeform-child-placement",
      "The pasted freeform section ID",
    );
    const pastedSection = workspace.locator(`[data-workspace-section-id="${pastedSectionId}"]`);
    await expect(pastedSection).toHaveAttribute(
      "data-workspace-parent-section-id",
      "recursive-root",
    );
    await expect(pastedSection).toHaveAttribute("data-workspace-selected", "true");
    await expect(pastedSection.getByRole("button", { name: "Select Nested Alpha" })).toBeFocused();
    await expect(clipboardAnnouncement).toHaveText("Pasted 1 section in one change.");
    let serialized = await nestedFreeformSerializedDocument(page);
    const pastedPosition = requiredSerializedFreeformPosition(
      serialized,
      "recursive-root",
      pastedSectionId,
    );
    expect(pastedPosition.x).toBeGreaterThanOrEqual(0);
    expect(pastedPosition.y).toBeGreaterThanOrEqual(0);
    expect(pastedPosition.x % 24).toBe(0);
    expect(pastedPosition.y % 24).toBe(0);
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);

    const externalTarget = await visibleRootFreeformPoint(workspace, { x: 48, y: 284 });
    const transfer = await externalTransfer(page, "Dropped into freeform root");
    const eventInit = {
      clientX: externalTarget.point.x,
      clientY: externalTarget.point.y,
      dataTransfer: transfer,
    };
    await canvas.dispatchEvent("dragenter", eventInit);
    await canvas.dispatchEvent("dragover", eventInit);
    const target = workspace.locator('[data-workspace-external-drop-target="recursive-root"]');
    await expect(target).toHaveAttribute("data-workspace-external-drop-placement", "freeform");
    await expect(target).toHaveAttribute("data-workspace-external-drop-valid", "true");
    await expect(workspace.locator("[data-workspace-external-drop-announcement]")).toHaveText(
      "Drop allowed. Add child section to this container",
    );
    await expect(canvas).toHaveScreenshot("nested-freeform-placement-preview.png", {
      animations: "disabled",
    });

    await canvas.dispatchEvent("drop", eventInit);
    const dropped = workspace.getByRole("article", { name: "Dropped into freeform root" });
    await expect(dropped).toHaveAttribute("data-workspace-parent-section-id", "recursive-root");
    serialized = await nestedFreeformSerializedDocument(page);
    const droppedPosition = requiredSerializedFreeformPosition(
      serialized,
      "recursive-root",
      "external-child-1",
    );
    expect(droppedPosition.x).toBeCloseTo(Math.max(0, externalTarget.local.x), 4);
    expect(droppedPosition.y).toBeCloseTo(Math.max(0, externalTarget.local.y), 4);
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 2);
    await expect(page.locator(".announcement")).toContainText(
      "Dropped into freeform root added to Recursive workspace.",
    );
    const results = await new AxeBuilder({ page }).include(".setta-workspace").analyze();
    expect(results.violations).toEqual([]);
  });

  test("groups and ungroups nested freeform siblings through exact local positions", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 1_000, width: 1_280 });
    await page.goto(contractUrl);
    await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
    await setCanvasZoom(page, 1);
    const workspace = page.getByRole("region", { exact: true, name: "Canvas shell workspace" });
    const canvas = workspace.getByRole("application", { name: "Canvas shell workspace canvas" });
    const alpha = workspace.getByRole("article", { name: "Nested Alpha" });
    const row = workspace.getByRole("article", { name: "Nested row" });
    const selectAlpha = alpha.getByRole("button", { name: "Select Nested Alpha" });
    const selectRow = row.getByRole("button", { name: "Select Nested row" });
    const announcement = workspace.locator("[data-workspace-selection-action-announcement]");
    const baselineChanges = await recursiveChangeCount(page);

    await selectAlpha.click();
    await selectRow.click({ modifiers: ["Shift"] });
    let dialog = await openSelectionActions(page, selectAlpha);
    const groupAction = dialog.getByRole("menuitem", { name: "Group sections", exact: true });
    await groupAction.focus();
    await page.keyboard.press("Enter");

    const group = workspace.getByRole("article", { name: "Group 1 (2 sections)" });
    const selectGroup = group.getByRole("button", { name: "Select Group 1 (2 sections)" });
    await expect(group).toHaveAttribute("data-workspace-parent-section-id", "recursive-root");
    await expect(selectGroup).toHaveAttribute("aria-pressed", "true");
    await expect(selectGroup).toBeFocused();
    await expect(announcement).toHaveText("The 2 selected sections were grouped.");
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 1);

    expectGroupedFreeformDocument(await nestedFreeformSerializedDocument(page));
    const [groupBox, alphaBox, rowBox] = await Promise.all([
      requiredBoundingBox(group, "Nested freeform group"),
      requiredBoundingBox(alpha, "Grouped Nested Alpha"),
      requiredBoundingBox(row, "Grouped Nested row"),
    ]);
    const expectedPositions = {
      "nested-alpha": {
        x: 16 + alphaBox.x - groupBox.x,
        y: 16 + alphaBox.y - groupBox.y,
      },
      "nested-row": {
        x: 16 + rowBox.x - groupBox.x,
        y: 16 + rowBox.y - groupBox.y,
      },
    };
    const groupedAccessibility = await new AxeBuilder({ page })
      .include(".setta-workspace")
      .analyze();
    expect(groupedAccessibility.violations).toEqual([]);
    await expect(canvas).toHaveScreenshot("nested-freeform-grouped-sections.png", {
      animations: "disabled",
    });

    dialog = await openSelectionActions(page, selectGroup);
    const ungroupAction = dialog.getByRole("menuitem", { name: "Ungroup section", exact: true });
    await ungroupAction.focus();
    await page.keyboard.press("Enter");

    await expect(group).toHaveCount(0);
    await expect(alpha).toHaveAttribute("data-workspace-parent-section-id", "recursive-root");
    await expect(row).toHaveAttribute("data-workspace-parent-section-id", "recursive-root");
    await expect(selectAlpha).toHaveAttribute("aria-pressed", "true");
    await expect(selectRow).toHaveAttribute("aria-pressed", "true");
    await expect(selectAlpha).toBeFocused();
    await expect(announcement).toHaveText("The selected section was ungrouped.");
    expect(await recursiveChangeCount(page)).toBe(baselineChanges + 2);

    expectUngroupedFreeformDocument(
      await nestedFreeformSerializedDocument(page),
      expectedPositions,
    );
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
