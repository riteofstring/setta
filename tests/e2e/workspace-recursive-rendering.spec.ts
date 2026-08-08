import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { canvasViewport } from "./workspace-test-helpers.js";

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
  await expect(emptyContainer.getByText("No child sections", { exact: true })).toBeVisible();
  await expect(
    root.getByRole("group", { name: "Recursive workspace child sections" }),
  ).toHaveAttribute("data-workspace-child-orientation", "vertical");
  await expect(nestedRow.getByRole("group", { name: "Nested row child sections" })).toHaveAttribute(
    "data-workspace-child-orientation",
    "horizontal",
  );
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
