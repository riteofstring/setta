import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function renderedHostBodyCount(workspace: Locator): Promise<number> {
  return workspace.locator(".canvas-shell-section-content").count();
}

async function committedDocumentChangeCount(page: Page): Promise<number> {
  const value = Number(await page.getByTestId("canvas-shell-change-count").textContent());
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("The canvas shell document change count is unavailable.");
  }
  return value;
}

async function panRecursiveRootOutsideCanvas(page: Page, canvas: Locator, workspace: Locator) {
  await canvas.scrollIntoViewIfNeeded();
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds) {
    throw new Error("The culling canvas has no browser bounds.");
  }
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width - 48,
    canvasBounds.y + canvasBounds.height / 2,
  );
  const changeCountBeforePan = await committedDocumentChangeCount(page);
  await page.mouse.wheel(0, 4_000);
  await expect.poll(() => committedDocumentChangeCount(page)).toBeGreaterThan(changeCountBeforePan);
  const recursiveRoot = workspace.locator('[data-workspace-section-id="recursive-root"]');
  await expect
    .poll(async () => {
      const rootBounds = await recursiveRoot.boundingBox();
      if (!rootBounds) {
        return false;
      }
      return (
        rootBounds.y + rootBounds.height < canvasBounds.y ||
        rootBounds.y > canvasBounds.y + canvasBounds.height
      );
    })
    .toBe(true);
  return recursiveRoot;
}

test("viewport culling removes offscreen renderer subtrees and pins focused ancestry", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1_280 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/?canvas-shell&viewport-culling");
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  const workspace = page.getByRole("region", {
    exact: true,
    name: "Canvas shell workspace",
  });
  const canvas = workspace.locator(".setta-workspace__canvas");
  await expect(canvas).toHaveAttribute("data-workspace-viewport-culling", "true");
  await expect(canvas).toHaveAttribute("data-workspace-viewport-culling-overscan", "80");
  await expect
    .poll(() => workspace.locator('[data-workspace-culled="true"]').count())
    .toBeGreaterThan(0);
  expect(await renderedHostBodyCount(workspace)).toBeLessThan(7);

  await page.getByRole("button", { name: "Focus Nested Gamma" }).click();
  const nestedGamma = workspace.getByRole("article", { name: "Nested Gamma" });
  await expect(nestedGamma).toBeFocused();
  await expect(nestedGamma).toHaveAttribute("data-workspace-culled", "false");
  await expect(nestedGamma).toContainText("Measured host renderer for nested-gamma");
  await expect(page.locator(".announcement")).toContainText("Focus Nested Gamma: applied.");

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await expect(nestedGamma).toBeFocused();
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();

  const recursiveRoot = await panRecursiveRootOutsideCanvas(page, canvas, workspace);
  await expect(nestedGamma).toBeFocused();
  await expect(nestedGamma).toHaveAttribute("data-workspace-culled", "false");
  await page.getByRole("button", { name: "Fit recursive descendants" }).focus();
  await expect.poll(() => recursiveRoot.getAttribute("data-workspace-culled")).toBe("true");
  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Canvas shell workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("controller focus restores a culled target after the viewport commits", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1_280 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/?canvas-shell&viewport-culling");
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  const workspace = page.getByRole("region", {
    exact: true,
    name: "Canvas shell workspace",
  });
  const canvas = workspace.locator(".setta-workspace__canvas");
  await page.getByRole("button", { name: "Focus Nested Gamma" }).click();
  const nestedGamma = workspace.getByRole("article", { name: "Nested Gamma" });
  await expect(nestedGamma).toBeFocused();
  const recursiveRoot = await panRecursiveRootOutsideCanvas(page, canvas, workspace);
  await page.getByRole("button", { name: "Fit recursive descendants" }).focus();
  await expect.poll(() => recursiveRoot.getAttribute("data-workspace-culled")).toBe("true");

  await page.getByRole("button", { name: "Focus Nested Gamma" }).click();
  await expect(nestedGamma).toBeFocused();
  await expect(nestedGamma).toHaveAttribute("data-workspace-culled", "false");
  await expect(nestedGamma).toContainText("Measured host renderer for nested-gamma");
  await page.mouse.move(1, 1);
  await expect(canvas).toHaveScreenshot("workspace-viewport-culling.png");
});

test("viewport culling retains reduced-motion semantics and 320 CSS-pixel reflow", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/?canvas-shell&viewport-culling");
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  const workspace = page.getByRole("region", {
    exact: true,
    name: "Canvas shell workspace",
  });
  await expect
    .poll(() => workspace.locator('[data-workspace-culled="true"]').count())
    .toBeGreaterThan(0);
  const documentWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentWidths.scrollWidth).toBeLessThanOrEqual(documentWidths.clientWidth);
  expect(
    await workspace
      .locator(".setta-workspace__section-frame--culled")
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");
  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Canvas shell workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
