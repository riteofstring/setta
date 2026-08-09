import { expect, type Locator, type Page } from "@playwright/test";

type BrowserViewport = Readonly<{ x: number; y: number; zoom: number }>;

export async function canvasViewport(page: Page): Promise<BrowserViewport> {
  const value = await page.getByTestId("canvas-shell-document").inputValue();
  return (JSON.parse(value) as { viewport: BrowserViewport }).viewport;
}

export async function addSampleSection(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add section" }).click();
  const picker = page.getByRole("dialog", { name: "Add a section" });
  await picker.getByRole("button", { name: "Sample note" }).click();
}

export async function loadRecursiveFixture(page: Page): Promise<Locator> {
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

export async function setCanvasZoom(page: Page, target: 0.5 | 1 | 2): Promise<void> {
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

export async function requiredBoundingBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`${label} must expose browser geometry.`);
  }
  return box;
}

export async function visibleCanvasTargetPoint(
  canvas: Locator,
  target: Locator,
  label: string,
): Promise<{ x: number; y: number }> {
  const [canvasBox, targetBox] = await Promise.all([
    requiredBoundingBox(canvas, "The workspace canvas"),
    requiredBoundingBox(target, label),
  ]);
  const left = Math.max(canvasBox.x, targetBox.x);
  const top = Math.max(canvasBox.y, targetBox.y);
  const right = Math.min(canvasBox.x + canvasBox.width, targetBox.x + targetBox.width);
  const bottom = Math.min(canvasBox.y + canvasBox.height, targetBox.y + targetBox.height);
  if (right <= left || bottom <= top) {
    throw new Error(`${label} must intersect the workspace canvas.`);
  }
  const inset = Math.min(16, (right - left) / 4, (bottom - top) / 4);
  const canvasCenter = {
    x: canvasBox.x + canvasBox.width / 2,
    y: canvasBox.y + canvasBox.height / 2,
  };
  return {
    x: Math.min(right - inset, Math.max(left + inset, canvasCenter.x)),
    y: Math.min(bottom - inset, Math.max(top + inset, canvasCenter.y)),
  };
}

export async function recursiveChangeCount(page: Page): Promise<number> {
  return Number(await page.getByTestId("canvas-shell-change-count").textContent());
}

export async function dragHandleToPoint(
  page: Page,
  handle: Locator,
  point: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const box = await requiredBoundingBox(handle, "The structural movement handle");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 10 });
}
