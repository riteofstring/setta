import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

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
});
