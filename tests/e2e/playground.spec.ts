import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  installWorkspaceLifecycleDiagnostics,
  workspaceLifecycleSnapshot,
} from "./workspace-lifecycle-diagnostics.js";
import { addSampleSection, canvasViewport } from "./workspace-test-helpers.js";

async function waitForWorkspaceEffects(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function resetCanvasViewport(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Reset viewport" }).click();
  await expect.poll(() => canvasViewport(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  await expect
    .poll(() => page.locator(".react-flow__viewport").getAttribute("style"))
    .toContain("translate(0px, 0px) scale(1)");
  await waitForWorkspaceEffects(page);
}

async function moveToOpenCanvas(page: Page): Promise<Readonly<{ x: number; y: number }>> {
  const canvas = page.getByRole("application", { name: "Canvas shell workspace canvas" });
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) {
    throw new Error("The canvas shell has no browser bounds.");
  }
  const point = { x: bounds.x + bounds.width - 48, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(point.x, point.y);
  return point;
}

async function dragSurface(
  page: Page,
  surface: Locator,
  button: "left" | "middle" = "left",
  onActive?: () => Promise<void>,
): Promise<void> {
  await surface.scrollIntoViewIfNeeded();
  const bounds = await surface.boundingBox();
  if (!bounds) {
    throw new Error("The drag surface has no browser bounds.");
  }
  const start = { x: bounds.x + bounds.width * 0.72, y: bounds.y + bounds.height * 0.68 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button });
  await page.mouse.move(start.x - 72, start.y - 48, { steps: 6 });
  await onActive?.();
  await page.mouse.up({ button });
}

async function dragHostFixture(page: Page): Promise<void> {
  const surface = page.locator(".canvas-shell-host-fixture");
  await surface.scrollIntoViewIfNeeded();
  const bounds = await surface.boundingBox();
  if (!bounds) {
    throw new Error("The host interaction fixture has no browser bounds.");
  }
  const start = { x: bounds.x + 6, y: bounds.y + 6 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 64, start.y + 44, { steps: 6 });
  await page.mouse.up();
}

async function dispatchPinchWheel(page: Page, deltaY: number): Promise<void> {
  await page.locator(".react-flow__pane").evaluate((element, wheelDelta) => {
    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: element.getBoundingClientRect().x + 120,
        clientY: element.getBoundingClientRect().y + 120,
        ctrlKey: true,
        deltaY: wheelDelta,
      }),
    );
  }, deltaY);
}

test("the blank workspace supports keyboard and assistive technology", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to workspace" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  const workspace = page.getByRole("region", { name: "Section workspace" });
  await expect(workspace).toContainText("No sections yet.");

  await addSampleSection(page);
  await expect(page.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Sample section 1" })).toContainText(
    "Host-rendered content inside the package-owned section frame.",
  );
  await expect(page.getByRole("status")).toHaveText("Document change: section-create.");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the scaffold reflows and honors reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page).toHaveScreenshot("blank-workspace-320.png", { fullPage: true });
});

test("the primary workflow remains operable at 200% page scale", async ({ page }) => {
  await page.goto("/");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });

  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  const addSection = page.getByRole("button", { name: "Add section" });
  await expect(addSection).toBeVisible();
  await addSection.focus();
  await expect(addSection).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox", { name: "Search sections" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Document change: section-create.");

  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();
});

test("controlled and uncontrolled state honor live capability policy", async ({ page }) => {
  await page.goto("/?state-contract");

  const uncontrolledWorkspace = page.getByRole("region", {
    name: "Uncontrolled workspace",
    exact: true,
  });
  const controlledWorkspace = page.getByRole("region", {
    name: "Controlled workspace",
    exact: true,
  });
  const uncontrolledPanel = page.getByRole("region", {
    name: "Uncontrolled document",
    exact: true,
  });
  const controlledPanel = page.getByRole("region", {
    name: "Controlled document",
    exact: true,
  });
  const hostNote = page.getByRole("textbox", { name: "Host note" });
  const status = page.getByRole("status");
  const moveUncontrolledAlpha = uncontrolledWorkspace.getByRole("button", { name: "Move Alpha" });
  await expect(uncontrolledWorkspace).toHaveAttribute("data-workspace-mode", "uncontrolled");
  await expect(controlledWorkspace).toHaveAttribute("data-workspace-mode", "controlled");
  await expect(uncontrolledWorkspace).toContainText("alpha host renderer is editable.");
  await expect(moveUncontrolledAlpha).toBeEnabled();

  await hostNote.fill("Keep this host value");
  await page.getByRole("button", { name: "Turn read-only on" }).click();
  await expect(uncontrolledWorkspace).toHaveAttribute("data-read-only", "true");
  await expect(uncontrolledWorkspace).toContainText("alpha host renderer is read-only.");
  await expect(moveUncontrolledAlpha).toBeDisabled();

  await page.getByRole("button", { name: "Lock Alpha" }).click();
  await expect(status).toHaveText("Layout edit rejected: layout-edit-disabled.");
  await page.getByRole("button", { name: "Minimize Alpha" }).click();
  await expect(status).toHaveText("Presentation edit rejected: presentation-edit-disabled.");
  await page.getByRole("button", { name: "Delete Beta" }).click();
  await expect(status).toHaveText("Structure edit rejected: structure-edit-disabled.");
  await expect(uncontrolledPanel.getByText("Committed changes: 0")).toBeVisible();
  await expect(hostNote).toHaveValue("Keep this host value");

  await page.getByRole("button", { name: "Pan uncontrolled viewport" }).click();
  await expect(status).toHaveText("Viewport navigation: applied.");
  await expect(uncontrolledPanel.getByText("Committed changes: 1")).toBeVisible();
  await expect(page.getByTestId("uncontrolled-document")).toHaveValue(/"zoom": 1.5/u);

  await page.getByRole("button", { name: "Turn editing on" }).click();
  await expect(uncontrolledWorkspace).toContainText("alpha host renderer is editable.");
  await expect(moveUncontrolledAlpha).toBeEnabled();
  await page.getByRole("button", { name: "Minimize Alpha" }).click();
  await page.getByRole("button", { name: "Delete Beta" }).click();
  await expect(page.getByTestId("uncontrolled-document")).toHaveValue(/"isMinimized": true/u);
  await expect(page.getByTestId("uncontrolled-document")).not.toHaveValue(/"beta"/u);
  await expect(hostNote).toHaveValue("Keep this host value");

  await page.getByRole("button", { name: "Pan controlled viewport" }).click();
  await expect(status).toHaveText("Controlled viewport: applied.");
  await expect(page.getByTestId("controlled-document")).toHaveValue(/"x": 120/u);
  await expect(controlledPanel.getByText("Committed changes: 1")).toBeVisible();

  const acceptControlledChanges = page.getByRole("checkbox", {
    name: "Accept controlled changes",
  });
  await acceptControlledChanges.uncheck();
  const controlledMoveAlpha = controlledWorkspace.getByRole("button", { name: "Move Alpha" });
  const controlledAlphaNode = controlledWorkspace
    .getByRole("article", { name: "Alpha" })
    .locator("xpath=..");
  const controlledPositionStyle = await controlledAlphaNode.getAttribute("style");
  const controlledDocumentBeforeMove = await page.getByTestId("controlled-document").inputValue();
  await controlledMoveAlpha.focus();
  await page.keyboard.press("ArrowRight");
  await expect(status).toHaveText("Controlled change rejected by host.");
  await expect(page.getByTestId("controlled-document")).toHaveValue(controlledDocumentBeforeMove);
  await expect.poll(() => controlledAlphaNode.getAttribute("style")).toBe(controlledPositionStyle);
  await expect(controlledWorkspace.locator("[data-workspace-movement-announcement]")).toHaveText(
    "Alpha stayed in place.",
  );
  await expect(controlledMoveAlpha).toBeFocused();
  const controlledZoomIn = controlledWorkspace.getByRole("button", { name: "Zoom in" });
  await controlledZoomIn.click();
  await controlledZoomIn.click();
  await expect(status).toHaveText("Controlled change rejected by host.");
  await expect(page.getByTestId("controlled-document")).toHaveValue(/"zoom": 1.25/u);
  await expect(controlledPanel.getByText("Committed changes: 1")).toBeVisible();

  await acceptControlledChanges.check();
  await controlledZoomIn.click();
  await expect(page.getByTestId("controlled-document")).toHaveValue(/"zoom": 1.5/u);
  await expect(controlledPanel.getByText("Committed changes: 2")).toBeVisible();
  await acceptControlledChanges.uncheck();
  const controlledFocus = page.getByRole("button", { name: "Focus controlled Alpha" });
  const controlledViewport = controlledWorkspace.locator(".react-flow__viewport");
  await expect(controlledViewport).toHaveAttribute("style", /scale\(1\.5\)/u);
  const acceptedViewportStyle = await controlledViewport.getAttribute("style");
  await controlledFocus.click();
  await expect(status).toHaveText("Controlled focus: applied.");
  await expect(controlledFocus).toBeFocused();
  await expect(controlledPanel.getByText("Committed changes: 2")).toBeVisible();
  await expect.poll(() => controlledViewport.getAttribute("style")).toBe(acceptedViewportStyle);

  const controlledCanvas = controlledWorkspace.getByRole("application", {
    name: "Controlled workspace canvas",
  });
  await controlledCanvas.scrollIntoViewIfNeeded();
  const controlledCanvasBounds = await controlledCanvas.boundingBox();
  if (!controlledCanvasBounds) {
    throw new Error("The controlled workspace has no browser bounds.");
  }
  await page.mouse.move(
    controlledCanvasBounds.x + controlledCanvasBounds.width - 48,
    controlledCanvasBounds.y + controlledCanvasBounds.height / 2,
  );
  await page.mouse.wheel(0, 180);
  await expect(status).toHaveText("Controlled change rejected by host.");
  await expect(controlledPanel.getByText("Committed changes: 2")).toBeVisible();
  await expect.poll(() => controlledViewport.getAttribute("style")).toBe(acceptedViewportStyle);

  await page.setViewportSize({ width: 320, height: 720 });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the canvas shell coalesces viewport gestures and isolates host input", async ({ page }) => {
  await page.goto("/?canvas-shell");

  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const canvas = page.getByRole("application", { name: "Canvas shell workspace canvas" });
  const hostNote = page.getByRole("textbox", { name: "Host note" });
  const scrollFixture = page.getByRole("textbox", { name: "Scrollable host content" });
  const documentJson = page.getByTestId("canvas-shell-document");

  await expect(workspace).toContainText("No sections yet.");
  await hostNote.fill("Keep this host value");
  await page.getByRole("checkbox", { name: "Zoom with wheel" }).check();
  await page.getByRole("checkbox", { name: "Zoom with wheel" }).uncheck();
  await expect(hostNote).toHaveValue("Keep this host value");

  await scrollFixture.hover();
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => scrollFixture.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(documentJson).toHaveValue(/"x": 0[,.]/u);
  await expect(documentJson).toHaveValue(/"y": 0[,.]/u);
  await expect(page.getByRole("status")).toContainText("Committed document changes: 0.");

  await canvas.scrollIntoViewIfNeeded();
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds) {
    throw new Error("The canvas shell has no browser bounds.");
  }
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width - 48,
    canvasBounds.y + canvasBounds.height / 2,
  );
  await page.mouse.wheel(0, 180);
  await expect
    .poll(async () => {
      const value = await documentJson.inputValue();
      return (JSON.parse(value) as { viewport: { y: number } }).viewport.y;
    })
    .not.toBe(0);
  await expect(page.getByRole("status")).toContainText("Committed document changes: 1.");

  await page.getByRole("button", { name: "Reset viewport" }).click();
  await expect(documentJson).toHaveValue(/"x": 0[,.]/u);
  await expect(documentJson).toHaveValue(/"y": 0[,.]/u);
  await expect(documentJson).toHaveValue(/"zoom": 1/u);
  await expect(page.getByRole("status")).toContainText("Committed document changes: 2.");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the canvas shell honors the complete runtime gesture matrix", async ({ page }) => {
  await page.goto("/?canvas-shell");

  const canvas = page.getByRole("application", { name: "Canvas shell workspace canvas" });
  const pane = page.locator(".react-flow__pane");
  const panWithWheel = page.getByRole("checkbox", { name: "Pan with wheel" });
  const zoomWithWheel = page.getByRole("checkbox", { name: "Zoom with wheel" });
  const pinchToZoom = page.getByRole("checkbox", { name: "Pinch to zoom" });
  const doubleClickToZoom = page.getByRole("checkbox", { name: "Double-click to zoom" });
  const blockHostPan = page.getByRole("checkbox", {
    name: "Block canvas pan from host content",
  });
  const blockHostWheel = page.getByRole("checkbox", {
    name: "Block canvas wheel from host content",
  });
  const dragToPan = page.getByLabel("Drag to pan");
  const wheelDirection = page.getByLabel("Wheel pan direction");
  const wheelSpeed = page.getByLabel("Wheel pan speed");

  await wheelDirection.selectOption("horizontal");
  await expect(canvas).toHaveAttribute("data-workspace-pan-on-scroll-mode", "horizontal");
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(120, 180);
  await expect
    .poll(async () => {
      const viewport = await canvasViewport(page);
      return { movedX: viewport.x !== 0, y: viewport.y, zoom: viewport.zoom };
    })
    .toEqual({ movedX: true, y: 0, zoom: 1 });

  await wheelDirection.selectOption("vertical");
  await expect(canvas).toHaveAttribute("data-workspace-pan-on-scroll-mode", "vertical");
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(120, 180);
  await expect
    .poll(async () => {
      const viewport = await canvasViewport(page);
      return { movedY: viewport.y !== 0, x: viewport.x, zoom: viewport.zoom };
    })
    .toEqual({ movedY: true, x: 0, zoom: 1 });

  await wheelDirection.selectOption("free");
  await expect(canvas).toHaveAttribute("data-workspace-pan-on-scroll-mode", "free");
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(120, 180);
  await expect
    .poll(async () => {
      const viewport = await canvasViewport(page);
      return { movedX: viewport.x !== 0, movedY: viewport.y !== 0, zoom: viewport.zoom };
    })
    .toEqual({ movedX: true, movedY: true, zoom: 1 });

  await wheelDirection.selectOption("horizontal");
  await wheelSpeed.selectOption("0.25");
  await expect(canvas).toHaveAttribute("data-workspace-pan-on-scroll-speed", "0.25");
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(160, 0);
  await expect.poll(async () => (await canvasViewport(page)).x).not.toBe(0);
  const slowPan = Math.abs((await canvasViewport(page)).x);
  await wheelSpeed.selectOption("1");
  await expect(canvas).toHaveAttribute("data-workspace-pan-on-scroll-speed", "1");
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(160, 0);
  await expect
    .poll(async () => Math.abs((await canvasViewport(page)).x))
    .toBeGreaterThan(slowPan * 2);

  await zoomWithWheel.check();
  await wheelDirection.selectOption("vertical");
  await expect(canvas).toHaveAttribute("data-workspace-pan-on-scroll-mode", "vertical");
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(0, -180);
  await expect
    .poll(async () => {
      const viewport = await canvasViewport(page);
      return { movedY: viewport.y !== 0, zoom: viewport.zoom };
    })
    .toEqual({ movedY: true, zoom: 1 });
  await page.keyboard.down("Alt");
  await page.waitForTimeout(50);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(0, -180);
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBeGreaterThan(1);

  await panWithWheel.uncheck();
  await resetCanvasViewport(page);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(0, -2_000);
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBe(2);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(0, 4_000);
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBe(0.5);

  await zoomWithWheel.uncheck();
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(220);
  expect(await canvasViewport(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  await page.keyboard.down("Alt");
  await page.waitForTimeout(50);
  await moveToOpenCanvas(page);
  await page.mouse.wheel(0, -180);
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBeGreaterThan(1);

  await resetCanvasViewport(page);
  await dispatchPinchWheel(page, -180);
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBeGreaterThan(1);
  await pinchToZoom.uncheck();
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await dispatchPinchWheel(page, -180);
  await page.waitForTimeout(220);
  expect(await canvasViewport(page)).toEqual({ x: 0, y: 0, zoom: 1 });

  await pane.dblclick({ position: { x: 420, y: 260 } });
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBe(2);
  await doubleClickToZoom.uncheck();
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await pane.dblclick({ position: { x: 420, y: 260 } });
  await page.waitForTimeout(220);
  expect(await canvasViewport(page)).toEqual({ x: 0, y: 0, zoom: 1 });

  await dragToPan.selectOption("disabled");
  await waitForWorkspaceEffects(page);
  await dragSurface(page, pane);
  await page.waitForTimeout(50);
  expect(await canvasViewport(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down("Space");
  await page.waitForTimeout(50);
  await dragSurface(page, pane);
  await page.keyboard.up("Space");
  await expect
    .poll(async () => {
      const viewport = await canvasViewport(page);
      return viewport.x !== 0 && viewport.y !== 0;
    })
    .toBe(true);

  await dragToPan.selectOption("all");
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await dragSurface(page, pane, "left", async () => {
    await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "viewport");
  });
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
  await expect
    .poll(async () => {
      const viewport = await canvasViewport(page);
      return viewport.x !== 0 && viewport.y !== 0;
    })
    .toBe(true);
  await resetCanvasViewport(page);
  await dragSurface(page, pane, "middle");
  await expect
    .poll(async () => {
      const viewport = await canvasViewport(page);
      return viewport.x !== 0 && viewport.y !== 0;
    })
    .toBe(true);

  await dragToPan.selectOption("middle");
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await dragSurface(page, pane);
  await page.waitForTimeout(50);
  expect(await canvasViewport(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  await dragSurface(page, pane, "middle");
  await expect
    .poll(async () => {
      const viewport = await canvasViewport(page);
      return viewport.x !== 0 && viewport.y !== 0;
    })
    .toBe(true);

  await dragToPan.selectOption("primary");
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  await dragHostFixture(page);
  await page.waitForTimeout(50);
  expect(await canvasViewport(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  await blockHostPan.uncheck();
  await waitForWorkspaceEffects(page);
  await dragHostFixture(page);
  await expect
    .poll(async () => {
      const viewport = await canvasViewport(page);
      return viewport.x !== 0 && viewport.y !== 0;
    })
    .toBe(true);

  await blockHostPan.check();
  await panWithWheel.uncheck();
  await zoomWithWheel.check();
  await waitForWorkspaceEffects(page);
  await resetCanvasViewport(page);
  const scrollFixture = page.getByRole("textbox", { name: "Scrollable host content" });
  await scrollFixture.evaluate((element) => {
    element.scrollTop = 0;
  });
  await scrollFixture.hover();
  await page.mouse.wheel(0, 180);
  await expect
    .poll(() => scrollFixture.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await canvasViewport(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  await blockHostWheel.uncheck();
  await waitForWorkspaceEffects(page);
  await scrollFixture.hover();
  await page.mouse.wheel(0, -180);
  await expect.poll(async () => (await canvasViewport(page)).zoom).toBeGreaterThan(1);

  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the canvas shell releases lifecycle resources and restores its persisted viewport", async ({
  page,
}) => {
  await installWorkspaceLifecycleDiagnostics(page);
  await page.goto("/?canvas-shell");

  const mountCanvas = page.getByRole("checkbox", { name: "Mount workspace canvas" });
  const canvas = page.getByRole("application", { name: "Canvas shell workspace canvas" });
  await page.getByRole("button", { name: "Load navigation fixture" }).click();
  await page.getByRole("button", { name: "Set grid probe viewport" }).click();
  const persistedViewport = await canvasViewport(page);
  expect(persistedViewport).toEqual({ x: -37, y: 53, zoom: 1.5 });

  await mountCanvas.uncheck();
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Focus Alpha" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Fit navigation fixture" })).toBeDisabled();
  const detachedBaseline = await workspaceLifecycleSnapshot(page);
  expect(detachedBaseline.geometryTargets).toBe(0);

  await mountCanvas.check();
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("article", { name: "Alpha frame" })).toBeAttached();
  await expect
    .poll(() => page.locator(".react-flow__viewport").getAttribute("style"))
    .toContain("translate(-37px, 53px) scale(1.5)");
  const mountedResources = await workspaceLifecycleSnapshot(page);
  expect(mountedResources.geometryTargets).toBe(3);
  expect(mountedResources.globalListeners).toBeGreaterThan(detachedBaseline.globalListeners);

  await moveToOpenCanvas(page);
  await page.mouse.wheel(0, 240);
  await mountCanvas.evaluate((element: HTMLInputElement) => element.click());
  await expect(canvas).toHaveCount(0);
  await page.waitForTimeout(250);
  expect(await canvasViewport(page)).toEqual(persistedViewport);
  await expect.poll(() => workspaceLifecycleSnapshot(page)).toEqual(detachedBaseline);

  await page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
  });
  await page.waitForTimeout(50);
  expect(await canvasViewport(page)).toEqual(persistedViewport);

  await mountCanvas.check();
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => page.locator(".react-flow__viewport").getAttribute("style"))
    .toContain("translate(-37px, 53px) scale(1.5)");
  expect(await canvasViewport(page)).toEqual(persistedViewport);

  await page.getByLabel("Drag to pan").selectOption("primary");
  const dragStart = await moveToOpenCanvas(page);
  await page.mouse.down();
  await page.mouse.move(dragStart.x - 48, dragStart.y - 32, { steps: 4 });
  const activeDragResources = await workspaceLifecycleSnapshot(page);
  expect(activeDragResources.globalListeners).toBeGreaterThan(mountedResources.globalListeners);

  await mountCanvas.evaluate((element: HTMLInputElement) => element.click());
  await expect(canvas).toHaveCount(0);
  await page.mouse.up();
  expect(await canvasViewport(page)).toEqual(persistedViewport);
  await expect.poll(() => workspaceLifecycleSnapshot(page)).toEqual(detachedBaseline);

  await mountCanvas.check();
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => page.locator(".react-flow__viewport").getAttribute("style"))
    .toContain("translate(-37px, 53px) scale(1.5)");
  expect(await canvasViewport(page)).toEqual(persistedViewport);
});

test("the canvas toolbar, host extensions, and empty minimap synchronize and clean up", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getElementById = Document.prototype.getElementById;
    Document.prototype.getElementById = function (id: string) {
      if (id.startsWith("setta-workspace-canvas-")) {
        throw new Error("Toolbar zoom must use adapter-owned canvas geometry.");
      }
      return getElementById.call(this, id);
    };
  });
  await page.goto("/?canvas-shell");

  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const canvas = page.getByRole("application", { name: "Canvas shell workspace canvas" });
  const toolbar = page.getByRole("toolbar", { name: "Canvas shell workspace controls" });
  const documentJson = page.getByTestId("canvas-shell-document");
  const hostNote = page.getByRole("textbox", { name: "Host note" });
  const gridProbe = page.getByRole("button", { name: "Set grid probe viewport" });
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  const resetZoom = page.getByRole("button", { name: "Reset zoom" });
  const fitSections = page.getByRole("button", { name: "Fit sections" });
  const snapToGrid = page.getByRole("button", { name: "Snap to grid" });
  const showMinimap = page.getByRole("button", { name: "Show minimap" });
  const minimap = page.getByRole("img", { name: "Canvas shell workspace minimap" });

  await expect(toolbar).toBeVisible();
  await expect
    .poll(() =>
      toolbar
        .locator("button")
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute("data-workspace-control-id")),
        ),
    )
    .toEqual([
      "grid-probe",
      "zoom-in",
      "zoom-out",
      "reset-zoom",
      "fit-sections",
      "snap-to-grid",
      "move-minimap",
      "remove-host-extensions",
      "show-minimap",
    ]);
  await expect(resetZoom).toBeDisabled();
  await expect(fitSections).toBeDisabled();
  await expect(snapToGrid).toHaveAttribute("aria-pressed", "true");
  await expect(showMinimap).toHaveAttribute("aria-pressed", "true");
  await expect(minimap).toBeVisible();
  await expect(workspace).toHaveScreenshot("canvas-toolbar-minimap.png");

  await hostNote.fill("Host state survives extension updates");
  await zoomIn.focus();
  const zoomInTooltip = zoomIn.locator("xpath=..").locator(".setta-workspace__toolbar-tooltip");
  await expect(zoomInTooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(zoomInTooltip).toBeHidden();
  await page.keyboard.press("Home");
  await expect(gridProbe).toBeFocused();
  await page.keyboard.press("End");
  await expect(showMinimap).toBeFocused();
  await zoomIn.focus();
  await page.keyboard.press("ArrowDown");
  await expect(zoomOut).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(zoomIn).toBeFocused();
  const initialMask = await workspace.locator(".react-flow__minimap-mask").getAttribute("d");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => {
      const value = await documentJson.inputValue();
      return (JSON.parse(value) as { viewport: { zoom: number } }).viewport.zoom;
    })
    .toBeGreaterThan(1);
  await expect(resetZoom).toBeEnabled();
  await expect
    .poll(() => workspace.locator(".react-flow__minimap-mask").getAttribute("d"))
    .not.toBe(initialMask);

  for (let attempt = 0; attempt < 8 && (await zoomIn.isEnabled()); attempt += 1) {
    await zoomIn.click();
  }
  await expect(zoomIn).toBeDisabled();
  await expect
    .poll(async () => {
      const value = await documentJson.inputValue();
      return (JSON.parse(value) as { viewport: { zoom: number } }).viewport.zoom;
    })
    .toBe(2);
  await resetZoom.click();
  await expect(resetZoom).toBeDisabled();
  for (let attempt = 0; attempt < 8 && (await zoomOut.isEnabled()); attempt += 1) {
    await zoomOut.click();
  }
  await expect(zoomOut).toBeDisabled();
  await expect
    .poll(async () => {
      const value = await documentJson.inputValue();
      return (JSON.parse(value) as { viewport: { zoom: number } }).viewport.zoom;
    })
    .toBe(0.5);
  await resetZoom.click();
  await expect(resetZoom).toBeDisabled();

  const beforeSnapToggle = await documentJson.inputValue();
  await snapToGrid.click();
  await expect(snapToGrid).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-workspace-grid-snap", "false");
  await expect(documentJson).toHaveValue(beforeSnapToggle);

  await showMinimap.click();
  await expect(showMinimap).toHaveAttribute("aria-pressed", "false");
  await expect(minimap).toHaveCount(0);
  await showMinimap.click();
  await expect(page.getByRole("img", { name: "Canvas shell workspace minimap" })).toHaveCount(1);

  await page.getByRole("button", { name: "Move minimap to left" }).click();
  await expect(workspace.locator('[data-workspace-minimap-placement="left"]')).toBeAttached();
  await expect(page.getByRole("button", { name: "Move minimap to right" })).toBeVisible();
  await expect(hostNote).toHaveValue("Host state survives extension updates");

  const removeExtensions = page.getByRole("button", { name: "Remove host extensions" });
  await removeExtensions.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Set grid probe viewport" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset viewport" })).toHaveCount(0);
  await expect(zoomIn).toBeFocused();

  await page.getByRole("checkbox", { name: "Show host extensions" }).check();
  await expect(page.getByRole("button", { name: "Set grid probe viewport" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset viewport" })).toBeVisible();
  await page.getByRole("button", { name: "Set grid probe viewport" }).click();
  await expect(page.getByRole("status")).toContainText("Grid probe viewport: applied.");
  await expect(page.getByRole("button", { name: "Set grid probe viewport" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(hostNote).toHaveValue("Host state survives extension updates");

  const workspaceBounds = await workspace.boundingBox();
  await page.locator("html").evaluate((element) => element.setAttribute("dir", "rtl"));
  await expect
    .poll(async () => {
      const toolbarBounds = await toolbar.boundingBox();
      return Boolean(
        workspaceBounds &&
        toolbarBounds &&
        toolbarBounds.x > workspaceBounds.x + workspaceBounds.width / 2,
      );
    })
    .toBe(true);
  const emptyPanelBounds = await workspace.locator(".setta-workspace__empty-panel").boundingBox();
  expect(emptyPanelBounds).not.toBeNull();
  if (workspaceBounds && emptyPanelBounds) {
    expect(emptyPanelBounds.x + emptyPanelBounds.width / 2).toBeLessThan(
      workspaceBounds.x + workspaceBounds.width / 2,
    );
  }
  await page.locator("html").evaluate((element) => element.setAttribute("dir", "ltr"));

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the canvas shell navigates measured geometry without browser scroll", async ({ page }) => {
  await page.goto("/?canvas-shell");

  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const documentJson = page.getByTestId("canvas-shell-document");
  await page.getByRole("button", { name: "Load navigation fixture" }).click();

  const alpha = page.getByRole("article", { name: "Alpha frame" });
  const beta = page.getByRole("article", { name: "Beta frame" });
  const gamma = page.getByRole("article", { name: "Gamma frame" });
  await expect(alpha).toBeAttached();
  await expect(beta).toBeAttached();
  await expect(gamma).toBeAttached();

  await page.getByRole("button", { name: "Focus Alpha" }).click();
  await expect(alpha).toBeFocused();
  await expect(page.getByRole("status")).toContainText("Focus Alpha: applied.");

  const focusNext = page.getByRole("button", { name: "Focus next from Alpha" });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await focusNext.focus();
  await expect(focusNext).toBeFocused();
  const browserScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Focus next from Alpha: applied.");
  await expect(beta).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await expect
    .poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })))
    .toEqual(browserScroll);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  await expect(beta).toHaveCSS("outline-style", "solid");
  await expect(beta).toHaveCSS("outline-width", "3px");
  await expect(beta).toHaveCSS("outline-offset", "-4px");
  await expect(workspace).toHaveScreenshot("canvas-section-keyboard-focus.png");
  await session.detach();

  await page.getByRole("button", { name: "Focus previous from Alpha" }).click();
  await expect(gamma).toBeFocused();
  await expect(page.getByRole("status")).toContainText("Focus previous from Alpha: applied.");

  await page.getByRole("button", { name: "Fit navigation fixture" }).click();
  await expect(page.getByRole("status")).toContainText("Fit navigation fixture: applied.");
  await expect
    .poll(async () => {
      const value = await documentJson.inputValue();
      return (JSON.parse(value) as { viewport: { zoom: number } }).viewport.zoom;
    })
    .toBeLessThan(1);
  await expect(workspace).toHaveScreenshot("canvas-geometry-navigation.png");

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "Clear navigation fixture" }).click();
  await expect(alpha).toHaveCount(0);
  await expect(beta).toHaveCount(0);
  await expect(gamma).toHaveCount(0);
  await expect(workspace).toContainText("No sections yet.");
});

test("the canvas grid and scoped appearance remain independent and aligned", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/?canvas-shell");

  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const canvas = page.getByRole("application", { name: "Canvas shell workspace canvas" });
  const hostNote = page.getByRole("textbox", { name: "Host note" });
  const documentJson = page.getByTestId("canvas-shell-document");
  const background = workspace.locator(".setta-workspace__grid .react-flow__background");
  const initialDocument = await documentJson.inputValue();
  const initialHostRoot = await page.evaluate(() => ({
    className: document.documentElement.className,
    style: document.documentElement.getAttribute("style"),
  }));

  await expect(workspace).toHaveAttribute("data-workspace-appearance", "system");
  await expect(workspace).toHaveAttribute("data-workspace-resolved-appearance", "light");
  await expect(canvas).toHaveAttribute("data-workspace-grid-visible", "true");
  await expect(canvas).toHaveAttribute("data-workspace-grid-snap", "true");
  await expect(background).toHaveCount(1);
  await expect(background.locator("xpath=..")).toHaveAttribute("aria-hidden", "true");
  await expect(background.locator("pattern")).toHaveAttribute("width", "24");
  await expect(background.locator("pattern")).toHaveAttribute("x", "0");
  await expect(background.locator("pattern circle")).toHaveCount(1);

  await page.getByRole("button", { name: "Snap to grid" }).click();
  await expect(canvas).toHaveAttribute("data-workspace-grid-snap", "false");
  await expect(background).toHaveCount(1);
  await page.getByRole("button", { name: "Snap to grid" }).click();
  await expect(page.getByRole("button", { name: "Snap to grid" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("checkbox", { name: "Show grid" }).uncheck();
  await expect(canvas).toHaveAttribute("data-workspace-grid-visible", "false");
  await expect(canvas).toHaveAttribute("data-workspace-grid-snap", "true");
  await expect(background).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Show grid" }).check();
  await page.getByRole("combobox", { name: "Grid pattern" }).selectOption("cross");
  await expect(canvas).toHaveAttribute("data-workspace-grid-pattern", "cross");
  await expect(background.locator("pattern path")).toHaveCount(1);

  await hostNote.fill("Host state preserved");
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await expect(workspace).toHaveAttribute("data-workspace-resolved-appearance", "dark");
  await expect(hostNote).toHaveValue("Host state preserved");
  await expect
    .poll(() => workspace.evaluate((element) => getComputedStyle(element).colorScheme))
    .toBe("dark");

  await page.getByRole("combobox", { name: "Appearance" }).selectOption("system");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await expect(workspace).toHaveAttribute("data-workspace-resolved-appearance", "light");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(workspace).toHaveAttribute("data-workspace-resolved-appearance", "dark");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await expect(workspace).toHaveAttribute("data-workspace-resolved-appearance", "light");

  await page.getByRole("checkbox", { name: "Use violet grid color" }).check();
  await expect
    .poll(() =>
      workspace.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--setta-workspace-grid-color").trim(),
      ),
    )
    .toBe("oklch(0.58 0.12 305)");
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await expect
    .poll(() =>
      workspace.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--setta-workspace-grid-color").trim(),
      ),
    )
    .toBe("oklch(0.68 0.11 305)");
  await expect(documentJson).toHaveValue(initialDocument);
  await expect(page.getByRole("status")).toContainText("Committed document changes: 0.");

  await page.getByRole("combobox", { name: "Grid pattern" }).selectOption("lines");
  await expect(canvas).toHaveAttribute("data-workspace-grid-pattern", "lines");
  await page.getByRole("button", { name: "Set grid probe viewport" }).click();
  await expect(page.getByRole("status")).toContainText("Grid probe viewport: applied.");
  const pattern = background.locator("pattern");
  await expect(pattern).toHaveAttribute("width", "36");
  await expect(pattern).toHaveAttribute("height", "36");
  await expect(pattern).toHaveAttribute("x", "-1");
  await expect(pattern).toHaveAttribute("y", "17");
  await expect(pattern.locator("[stroke-width]")).toHaveAttribute("stroke-width", "1.5");
  await page.keyboard.press("Escape");
  await expect(workspace).toHaveScreenshot("canvas-grid-dark.png");

  await expect
    .poll(() =>
      page.evaluate(() => ({
        className: document.documentElement.className,
        style: document.documentElement.getAttribute("style"),
      })),
    )
    .toEqual(initialHostRoot);

  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the canvas shell reflows at 320 pixels with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/?canvas-shell");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const toolbar = page.getByRole("toolbar", { name: "Canvas shell workspace controls" });
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  const workspaceBounds = await workspace.boundingBox();
  const toolbarBounds = await toolbar.boundingBox();
  expect(workspaceBounds).not.toBeNull();
  expect(toolbarBounds).not.toBeNull();
  if (workspaceBounds && toolbarBounds) {
    expect(toolbarBounds.y).toBeGreaterThanOrEqual(workspaceBounds.y);
    expect(toolbarBounds.y + toolbarBounds.height).toBeLessThanOrEqual(
      workspaceBounds.y + workspaceBounds.height,
    );
  }
  await expect(toolbar.getByRole("button")).toHaveCount(6);
  await expect(page.getByRole("checkbox", { name: "Show host extensions" })).not.toBeChecked();
  await expect
    .poll(() => zoomIn.evaluate((element) => getComputedStyle(element).transitionDuration))
    .toBe("0s");
  await expect(page).toHaveScreenshot("canvas-shell-320.png", { fullPage: true });
});
