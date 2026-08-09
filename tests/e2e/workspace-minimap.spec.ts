import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

type BrowserViewport = Readonly<{ x: number; y: number; zoom: number }>;

async function documentViewport(page: Page): Promise<BrowserViewport> {
  const value = await page.getByTestId("canvas-shell-document").inputValue();
  return (JSON.parse(value) as { viewport: BrowserViewport }).viewport;
}

async function changeCount(page: Page): Promise<number> {
  return Number(await page.getByTestId("canvas-shell-change-count").textContent());
}

async function renderedViewport(canvas: Locator): Promise<BrowserViewport> {
  return canvas.locator(".react-flow__viewport").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: matrix.e, y: matrix.f, zoom: matrix.a };
  });
}

async function loadMinimapFixture(page: Page): Promise<Locator> {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  const minimap = page.getByRole("img", { name: "Canvas shell workspace minimap" });
  await expect(minimap.locator(".react-flow__minimap-node")).toHaveCount(3);
  return minimap;
}

async function minimapPoint(
  minimap: Locator,
  inlineFraction: number,
  blockFraction: number,
): Promise<
  Readonly<{
    client: { x: number; y: number };
    pixelTolerance: number;
    workspace: { x: number; y: number };
  }>
> {
  return minimap.evaluate(
    (element, fractions) => {
      const bounds = element.getBoundingClientRect();
      const client = {
        x: bounds.x + bounds.width * fractions.inlineFraction,
        y: bounds.y + bounds.height * fractions.blockFraction,
      };
      const matrix = (element as SVGSVGElement).getScreenCTM();
      if (!matrix) {
        throw new Error("The populated minimap must expose an SVG screen transform.");
      }
      const workspace = new DOMPoint(client.x, client.y).matrixTransform(matrix.inverse());
      const viewBox = (element as SVGSVGElement).viewBox.baseVal;
      return {
        client,
        pixelTolerance: Math.max(viewBox.width / bounds.width, viewBox.height / bounds.height),
        workspace: { x: workspace.x, y: workspace.y },
      };
    },
    { blockFraction, inlineFraction },
  );
}

test("the populated minimap focuses roots, centers points, and pans through one change", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const minimap = await loadMinimapFixture(page);
  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const canvas = page.getByRole("application", { name: "Canvas shell workspace canvas" });
  const minimapWrapper = minimap.locator("xpath=../..");
  const minimapNodes = minimap.locator(".react-flow__minimap-node");

  await expect(minimapWrapper).toHaveAttribute("data-workspace-minimap-interactive", "true");
  const beforeNodeClick = await changeCount(page);
  await minimapNodes.nth(1).click();
  await expect(page.getByRole("button", { name: "Select Beta frame" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("article", { name: "Beta frame" })).toBeFocused();
  await expect.poll(() => changeCount(page)).toBe(beforeNodeClick + 1);
  await expect(workspace).toHaveScreenshot("populated-minimap-navigation.png");

  const beforePointClick = await changeCount(page);
  const beforePointViewport = await documentViewport(page);
  const target = await minimapPoint(minimap, 0.5, 0.92);
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds) {
    throw new Error("The minimap navigation test requires visible canvas geometry.");
  }
  await page.mouse.click(target.client.x, target.client.y);
  await expect.poll(() => changeCount(page)).toBe(beforePointClick + 1);
  const centeredViewport = await documentViewport(page);
  expect(centeredViewport.zoom).toBe(beforePointViewport.zoom);
  expect(
    Math.abs(
      centeredViewport.x - (canvasBounds.width / 2 - target.workspace.x * beforePointViewport.zoom),
    ),
  ).toBeLessThanOrEqual(target.pixelTolerance);
  expect(
    Math.abs(
      centeredViewport.y -
        (canvasBounds.height / 2 - target.workspace.y * beforePointViewport.zoom),
    ),
  ).toBeLessThanOrEqual(target.pixelTolerance);

  const beforePan = await changeCount(page);
  const beforePanViewport = await documentViewport(page);
  const dragStart = await minimapPoint(minimap, 0.5, 0.88);
  await page.mouse.move(dragStart.client.x, dragStart.client.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.client.x + 28, dragStart.client.y - 18, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => changeCount(page)).toBe(beforePan + 1);
  const pannedViewport = await documentViewport(page);
  expect(pannedViewport).not.toEqual(beforePanViewport);
  expect(pannedViewport.zoom).toBe(beforePanViewport.zoom);
  await expect
    .poll(async () => {
      const rendered = await renderedViewport(canvas);
      return (
        Math.abs(rendered.x - pannedViewport.x) < 0.01 &&
        Math.abs(rendered.y - pannedViewport.y) < 0.01 &&
        Math.abs(rendered.zoom - pannedViewport.zoom) < 0.01
      );
    })
    .toBe(true);

  const focusAlpha = page.getByRole("button", { name: "Focus Alpha" });
  await focusAlpha.focus();
  const browserScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  const beforeScaledNodeClick = await changeCount(page);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: "Alpha frame" })).toBeFocused();
  await expect.poll(() => changeCount(page)).toBe(beforeScaledNodeClick + 1);
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await expect
    .poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })))
    .toEqual(browserScroll);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test.describe("coarse-pointer minimap", () => {
  test.use({ hasTouch: true });

  test("the populated minimap remains usable at 320 CSS pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    const minimap = await loadMinimapFixture(page);
    const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
    const workspaceBounds = await workspace.boundingBox();
    const minimapBounds = await minimap.boundingBox();
    if (!workspaceBounds || !minimapBounds) {
      throw new Error("The coarse-pointer minimap test requires visible browser geometry.");
    }
    expect(minimapBounds.x).toBeGreaterThanOrEqual(workspaceBounds.x);
    expect(minimapBounds.x + minimapBounds.width).toBeLessThanOrEqual(
      workspaceBounds.x + workspaceBounds.width,
    );

    const beforeTap = await changeCount(page);
    await minimap.locator(".react-flow__minimap-node").nth(2).tap();
    await expect(page.getByRole("article", { name: "Gamma frame" })).toBeFocused();
    await expect.poll(() => changeCount(page)).toBe(beforeTap + 1);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    const accessibility = await new AxeBuilder({ page })
      .include("[data-setta-workspace]")
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
});
