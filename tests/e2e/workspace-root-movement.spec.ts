import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { canvasViewport } from "./workspace-test-helpers.js";

type BrowserPoint = Readonly<{ x: number; y: number }>;

async function canvasRootPosition(page: Page, sectionId: string): Promise<BrowserPoint> {
  const value = await page.getByTestId("canvas-shell-document").inputValue();
  const document = JSON.parse(value) as {
    rootSections: readonly { position: BrowserPoint; sectionId: string }[];
  };
  const root = document.rootSections.find((entry) => entry.sectionId === sectionId);
  if (!root) {
    throw new Error(`The canvas shell document has no root section ${sectionId}.`);
  }
  return root.position;
}

async function canvasDocumentChangeCount(page: Page): Promise<number> {
  const value = await page.getByTestId("canvas-shell-change-count").textContent();
  return Number(value);
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
  const control = page.getByRole("button", { name: zoom === 0.5 ? "Zoom out" : "Zoom in" });
  for (let attempt = 0; attempt < 12 && (await control.isEnabled()); attempt += 1) {
    await control.click();
  }
  await expect(control).toBeDisabled();
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBe(zoom);
}

test("top-level sections move once per pointer or keyboard interaction", async ({ page }) => {
  await page.goto("/?canvas-shell");

  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const announcement = workspace.locator("[data-workspace-movement-announcement]");
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await page.getByRole("button", { name: "Focus Alpha" }).click();

  const alpha = page.getByRole("article", { name: "Alpha frame" });
  const moveAlpha = page.getByRole("button", { name: "Move Alpha frame" });
  await expect(moveAlpha).toBeEnabled();
  await expect(moveAlpha).toHaveAttribute(
    "aria-keyshortcuts",
    "ArrowUp ArrowDown ArrowLeft ArrowRight",
  );
  const handleSize = await moveAlpha.evaluate((element) => {
    const style = getComputedStyle(element);
    return { height: Number.parseFloat(style.height), width: Number.parseFloat(style.width) };
  });
  expect(handleSize.height).toBeGreaterThanOrEqual(40);
  expect(handleSize.width).toBeGreaterThanOrEqual(40);

  await moveAlpha.focus();
  await page.keyboard.press("ArrowRight");
  await expect(moveAlpha).toBeFocused();
  await expect.poll(() => canvasRootPosition(page, "alpha")).toEqual({ x: 504, y: 80 });
  await expect(announcement).toHaveText("Alpha frame moved to 504, 80.");
  await expect(page.locator(".announcement")).toContainText("Document change: section-move.");

  const snap = page.getByRole("button", { name: "Snap to grid" });
  await snap.click();
  await expect(snap).toHaveAttribute("aria-pressed", "false");
  await moveAlpha.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => canvasRootPosition(page, "alpha")).toEqual({ x: 504, y: 90 });
  await expect(announcement).toHaveText("Alpha frame moved to 504, 90.");
  await snap.click();
  await moveAlpha.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => canvasRootPosition(page, "alpha")).toEqual({ x: 504, y: 96 });

  for (const zoom of [0.5, 1, 2] as const) {
    await setCanvasZoom(page, zoom);
    await page.getByRole("button", { name: "Focus Alpha" }).click();
    const beforePosition = await canvasRootPosition(page, "alpha");
    const beforeViewport = await canvasViewport(page);
    const beforeChangeCount = await canvasDocumentChangeCount(page);
    await moveAlpha.scrollIntoViewIfNeeded();
    const bounds = await moveAlpha.boundingBox();
    if (!bounds) {
      throw new Error("The Alpha move handle has no browser bounds.");
    }
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await expect(alpha.locator("xpath=..")).toHaveClass(/draggable/u);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 48 * zoom, start.y + 24 * zoom, { steps: 6 });
    await expect(alpha).toHaveAttribute("data-workspace-moving", "true");
    expect(await canvasRootPosition(page, "alpha")).toEqual(beforePosition);
    await page.mouse.up();

    const expectedPosition = {
      x: beforePosition.x + 48,
      y: beforePosition.y + 24,
    };
    await expect.poll(() => canvasRootPosition(page, "alpha")).toEqual(expectedPosition);
    await expect.poll(() => canvasDocumentChangeCount(page)).toBe(beforeChangeCount + 1);
    await expect(alpha).toHaveAttribute("data-workspace-moving", "false");
    await expect.poll(() => canvasViewport(page)).toEqual(beforeViewport);
    await expect(announcement).toHaveText(
      `Alpha frame moved to ${String(expectedPosition.x)}, ${String(expectedPosition.y)}.`,
    );
  }

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});
