import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { canvasViewport } from "./workspace-test-helpers.js";

type CanvasSection = Readonly<{
  size: Readonly<{
    height: Readonly<{ mode: "content" | "fixed"; value: number }>;
    width: Readonly<{ mode: "content" | "fixed"; value: number }>;
  }>;
}>;

type CanvasRoot = Readonly<{
  position: Readonly<{ x: number; y: number }>;
  sectionId: string;
}>;

async function canvasDocument(page: Page): Promise<{
  rootSections: readonly CanvasRoot[];
  sections: Readonly<Record<string, CanvasSection>>;
}> {
  return JSON.parse(await page.getByTestId("canvas-shell-document").inputValue()) as {
    rootSections: readonly CanvasRoot[];
    sections: Readonly<Record<string, CanvasSection>>;
  };
}

async function alphaState(page: Page) {
  const document = await canvasDocument(page);
  const section = document.sections.alpha;
  const root = document.rootSections.find(({ sectionId }) => sectionId === "alpha");
  if (!root || !section) {
    throw new Error("The canvas resize fixture is missing Alpha.");
  }
  return { root, section };
}

async function changeCount(page: Page): Promise<number> {
  return Number(await page.getByTestId("canvas-shell-change-count").textContent());
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
  while (await control.isEnabled()) {
    await control.click();
  }
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBe(zoom);
}

async function selectAlpha(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Select Alpha frame" }).click();
  await expect(page.getByRole("button", { name: "Select Alpha frame" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

test("resizes by keyboard and switches fixed or content sizing accessibly", async ({ page }) => {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  await selectAlpha(page);

  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const article = page.getByRole("article", { name: "Alpha frame" });
  const sizingAnnouncement = workspace.locator("[data-workspace-sizing-announcement]");
  let widthHandle = page.getByRole("button", {
    name: "Resize Alpha frame width",
    exact: true,
  });
  const heightHandle = page.getByRole("button", {
    name: "Resize Alpha frame height",
    exact: true,
  });
  const cornerHandle = page.getByRole("button", {
    name: "Resize Alpha frame width and height",
  });

  for (const [handle, shortcuts] of [
    [widthHandle, "ArrowLeft ArrowRight Enter Space"],
    [heightHandle, "ArrowUp ArrowDown Enter Space"],
    [cornerHandle, "ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space"],
  ] as const) {
    await expect(handle).toBeVisible();
    const bounds = await handle.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(40);
    expect(bounds?.width).toBeGreaterThanOrEqual(40);
    await expect(handle).toHaveAttribute("aria-keyshortcuts", shortcuts);
  }
  await expect(widthHandle).toHaveAttribute("data-workspace-resize-edge", "right");

  const beforeKeyboardCount = await changeCount(page);
  await widthHandle.focus();
  await widthHandle.press("ArrowRight");
  await expect(widthHandle).toBeFocused();
  await expect
    .poll(async () => (await alphaState(page)).section.size.width)
    .toEqual({
      mode: "fixed",
      value: 264,
    });
  await expect.poll(() => changeCount(page)).toBe(beforeKeyboardCount + 1);
  await expect(sizingAnnouncement).toHaveText("Alpha frame resized to 264 by 180.");

  const snap = page.getByRole("button", { name: "Snap to grid" });
  await snap.click();
  const beforeUnsnappedCount = await changeCount(page);
  await heightHandle.focus();
  await heightHandle.press("ArrowDown");
  await expect
    .poll(async () => (await alphaState(page)).section.size.height)
    .toEqual({
      mode: "fixed",
      value: 190,
    });
  await expect.poll(() => changeCount(page)).toBe(beforeUnsnappedCount + 1);
  await snap.click();

  const fixedWidth = (await alphaState(page)).section.size.width.value;
  const beforeContentCount = await changeCount(page);
  await widthHandle.dblclick();
  await expect
    .poll(async () => (await alphaState(page)).section.size.width)
    .toEqual({
      mode: "content",
      value: fixedWidth,
    });
  await expect(article).toHaveAttribute("data-workspace-width-mode", "content");
  await expect.poll(() => changeCount(page)).toBe(beforeContentCount + 1);
  await expect(sizingAnnouncement).toHaveText("Alpha frame now fits width to content.");

  widthHandle = page.getByRole("button", {
    name: "Resize Alpha frame width",
    exact: true,
  });
  const measuredWidth = await article.evaluate((element) => element.getBoundingClientRect().width);
  expect(measuredWidth).toBeGreaterThanOrEqual(192);
  const promotionKey = measuredWidth > 192 ? "ArrowLeft" : "ArrowRight";
  const beforePromotionCount = await changeCount(page);
  await widthHandle.focus();
  await widthHandle.press(promotionKey);
  await expect.poll(async () => (await alphaState(page)).section.size.width.mode).toBe("fixed");
  await expect.poll(() => changeCount(page)).toBe(beforePromotionCount + 1);

  widthHandle = page.getByRole("button", {
    name: "Resize Alpha frame width",
    exact: true,
  });
  const beforeKeyboardContentCount = await changeCount(page);
  await widthHandle.focus();
  await widthHandle.press("Enter");
  await expect.poll(async () => (await alphaState(page)).section.size.width.mode).toBe("content");
  await expect.poll(() => changeCount(page)).toBe(beforeKeyboardContentCount + 1);
  await expect(widthHandle).toBeFocused();

  const fixedHeight = (await alphaState(page)).section.size.height.value;
  const beforeHeightContentCount = await changeCount(page);
  await heightHandle.focus();
  await heightHandle.press("Enter");
  await expect
    .poll(async () => (await alphaState(page)).section.size.height)
    .toEqual({
      mode: "content",
      value: fixedHeight,
    });
  await expect.poll(() => changeCount(page)).toBe(beforeHeightContentCount + 1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await changeCount(page)).toBe(beforeHeightContentCount + 1);
  const contentRect = await article.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  expect(contentRect.height).toBeGreaterThanOrEqual(144);
  expect(contentRect.height).toBeLessThanOrEqual(360);
  const contentSizeBeforeStateTransitions = (await alphaState(page)).section.size;

  const lock = article.getByRole("button", { name: "Lock Alpha frame" });
  await lock.click();
  await expect(
    page.getByRole("button", { name: "Resize Alpha frame width", exact: true }),
  ).toHaveCount(0);
  await article.getByRole("button", { name: "Unlock Alpha frame" }).click();
  await expect(
    page.getByRole("button", { name: "Resize Alpha frame width", exact: true }),
  ).toBeVisible();

  await article.getByRole("button", { name: "Minimize Alpha frame" }).click();
  await expect(
    page.getByRole("button", { name: "Resize Alpha frame width", exact: true }),
  ).toHaveCount(0);
  await article.getByRole("button", { name: "Expand Alpha frame" }).click();
  await expect(
    page.getByRole("button", { name: "Resize Alpha frame width", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await alphaState(page)).section.size)
    .toEqual(contentSizeBeforeStateTransitions);

  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await selectAlpha(page);
  await workspace.evaluate((element) => element.setAttribute("dir", "rtl"));
  widthHandle = page.getByRole("button", {
    name: "Resize Alpha frame width",
    exact: true,
  });
  await expect(widthHandle).toHaveAttribute("data-workspace-resize-edge", "left");
  const beforeRtl = await alphaState(page);
  await widthHandle.focus();
  await widthHandle.press("ArrowLeft");
  await expect.poll(async () => (await alphaState(page)).section.size.width.value).toBe(264);
  await expect
    .poll(async () => (await alphaState(page)).root.position.x)
    .toBe(beforeRtl.root.position.x - 24);

  await expect(workspace).toHaveScreenshot("canvas-section-resize-controls-rtl.png");
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(widthHandle).toHaveCSS("transition-duration", "0s");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  const coarseBounds = await widthHandle.boundingBox();
  expect(coarseBounds?.height).toBeGreaterThanOrEqual(44);
  expect(coarseBounds?.width).toBeGreaterThanOrEqual(44);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await expect(widthHandle).toBeVisible();
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();

  await page.setViewportSize({ height: 800, width: 320 });
  await workspace.getByRole("button", { name: "Fit sections" }).click();
  await expect(widthHandle).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test("keeps pointer resizing transient and commits once at every supported zoom", async ({
  page,
}) => {
  await page.goto("/?canvas-shell");
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await page.getByRole("checkbox", { name: "Show host extensions" }).uncheck();
  await selectAlpha(page);

  const article = page.getByRole("article", { name: "Alpha frame" });
  const sizingAnnouncement = page.locator("[data-workspace-sizing-announcement]");

  for (const zoom of [0.5, 1, 2] as const) {
    await setCanvasZoom(page, zoom);
    const widthHandle = page.getByRole("button", {
      name: "Resize Alpha frame width",
      exact: true,
    });
    const before = await alphaState(page);
    const beforeViewport = await canvasViewport(page);
    const beforeCount = await changeCount(page);
    await widthHandle.scrollIntoViewIfNeeded();
    const bounds = await widthHandle.boundingBox();
    if (!bounds) {
      throw new Error("The Alpha width handle has no browser bounds.");
    }
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 25 * zoom, start.y, { steps: 6 });
    await expect(article).toHaveAttribute("data-workspace-resizing", "true");
    expect(await alphaState(page)).toEqual(before);
    await page.mouse.up();

    await expect
      .poll(async () => (await alphaState(page)).section.size.width.value)
      .toBe(before.section.size.width.value + 24);
    await expect.poll(() => changeCount(page)).toBe(beforeCount + 1);
    await expect(article).toHaveAttribute("data-workspace-resizing", "false");
    await expect.poll(() => canvasViewport(page)).toEqual(beforeViewport);
    const after = await alphaState(page);
    await expect(sizingAnnouncement).toHaveText(
      `Alpha frame resized to ${String(after.section.size.width.value)} by 180.`,
    );
  }

  await setCanvasZoom(page, 1);
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await selectAlpha(page);
  const snap = page.getByRole("button", { name: "Snap to grid" });
  await snap.click();
  await expect(snap).toHaveAttribute("aria-pressed", "false");
  const unsnappedHandle = page.getByRole("button", {
    name: "Resize Alpha frame width",
    exact: true,
  });
  await unsnappedHandle.scrollIntoViewIfNeeded();
  const unsnappedBounds = await unsnappedHandle.boundingBox();
  if (!unsnappedBounds) {
    throw new Error("The unsnapped Alpha width handle has no browser bounds.");
  }
  const beforeUnsnapped = await alphaState(page);
  const beforeUnsnappedCount = await changeCount(page);
  const unsnappedStart = {
    x: unsnappedBounds.x + unsnappedBounds.width / 2,
    y: unsnappedBounds.y + unsnappedBounds.height / 2,
  };
  await page.mouse.move(unsnappedStart.x, unsnappedStart.y);
  await page.mouse.down();
  await page.mouse.move(unsnappedStart.x + 13, unsnappedStart.y, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await alphaState(page)).section.size.width.value)
    .toBe(beforeUnsnapped.section.size.width.value + 13);
  await expect.poll(() => changeCount(page)).toBe(beforeUnsnappedCount + 1);
  await snap.click();
  await expect(snap).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await selectAlpha(page);
  const widthHandle = page.getByRole("button", {
    name: "Resize Alpha frame width",
    exact: true,
  });
  await widthHandle.scrollIntoViewIfNeeded();
  const bounds = await widthHandle.boundingBox();
  if (!bounds) {
    throw new Error("The constrained Alpha width handle has no browser bounds.");
  }
  const beforeConstraintCount = await changeCount(page);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 2_000, bounds.y + bounds.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await alphaState(page)).section.size.width.value).toBe(480);
  await expect.poll(() => changeCount(page)).toBe(beforeConstraintCount + 1);

  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await selectAlpha(page);
  const cancellationHandle = page.getByRole("button", {
    name: "Resize Alpha frame width",
    exact: true,
  });
  await cancellationHandle.scrollIntoViewIfNeeded();
  const cancellationBounds = await cancellationHandle.boundingBox();
  if (!cancellationBounds) {
    throw new Error("The cancellation resize handle has no browser bounds.");
  }
  const beforeCancellation = await alphaState(page);
  const beforeCancellationCount = await changeCount(page);
  const cancellationStart = {
    x: cancellationBounds.x + cancellationBounds.width / 2,
    y: cancellationBounds.y + cancellationBounds.height / 2,
  };
  await page.mouse.move(cancellationStart.x, cancellationStart.y);
  await page.mouse.down();
  await page.mouse.move(cancellationStart.x + 48, cancellationStart.y, { steps: 6 });
  await expect(article).toHaveAttribute("data-workspace-resizing", "true");
  await page
    .getByRole("checkbox", { name: "Mount workspace canvas" })
    .evaluate((element: HTMLInputElement) => element.click());
  await expect(article).toHaveCount(0);
  await page.mouse.up();
  expect(await alphaState(page)).toEqual(beforeCancellation);
  expect(await changeCount(page)).toBe(beforeCancellationCount);
  await page.getByRole("checkbox", { name: "Mount workspace canvas" }).click();
  await expect(page.getByRole("article", { name: "Alpha frame" })).toBeVisible();
  expect(await alphaState(page)).toEqual(beforeCancellation);
});

test("reconciles a controlled host resize rejection to canonical geometry", async ({ page }) => {
  await page.goto("/?state-contract");
  const controlled = page.getByRole("region", { name: "Controlled workspace", exact: true });
  await controlled.getByRole("button", { name: "Select Alpha" }).click();
  await page.getByRole("checkbox", { name: "Accept controlled changes" }).uncheck();

  const document = page.getByTestId("controlled-document");
  const canonicalDocument = await document.inputValue();
  const article = controlled.getByRole("article", { name: "Alpha" });
  const canonicalWidth = await article.evaluate((element) => element.getBoundingClientRect().width);
  const handle = controlled.getByRole("button", {
    name: "Resize Alpha width",
    exact: true,
  });
  await handle.focus();
  await handle.press("ArrowRight");

  await expect(document).toHaveValue(canonicalDocument);
  await expect
    .poll(() => article.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(canonicalWidth);
  await expect(handle).toBeFocused();
  await expect(controlled.locator("[data-workspace-sizing-announcement]")).toHaveText(
    "Alpha stayed at its previous size.",
  );
  await expect(controlled.locator("..")).toContainText("Committed changes: 0");
});
