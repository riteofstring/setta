import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the blank workspace supports keyboard and assistive technology", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to workspace" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  const workspace = page.getByRole("region", { name: "Section workspace" });
  await expect(workspace).toContainText("No sections yet.");

  await page.getByRole("button", { name: "Add sample section" }).click();
  await expect(page.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Sample section 1 added.");

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
  const addSection = page.getByRole("button", { name: "Add sample section" });
  await expect(addSection).toBeVisible();
  await addSection.focus();
  await expect(addSection).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Sample section 1" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Sample section 1 added.");

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
  await expect(uncontrolledWorkspace).toHaveAttribute("data-workspace-mode", "uncontrolled");
  await expect(controlledWorkspace).toHaveAttribute("data-workspace-mode", "controlled");

  await hostNote.fill("Keep this host value");
  await page.getByRole("button", { name: "Turn read-only on" }).click();
  await expect(uncontrolledWorkspace).toHaveAttribute("data-read-only", "true");

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
  await page.getByRole("button", { name: "Minimize Alpha" }).click();
  await page.getByRole("button", { name: "Delete Beta" }).click();
  await expect(page.getByTestId("uncontrolled-document")).toHaveValue(/"isMinimized": true/u);
  await expect(page.getByTestId("uncontrolled-document")).not.toHaveValue(/"beta"/u);
  await expect(hostNote).toHaveValue("Keep this host value");

  await page.getByRole("button", { name: "Pan controlled viewport" }).click();
  await expect(status).toHaveText("Controlled viewport: applied.");
  await expect(page.getByTestId("controlled-document")).toHaveValue(/"x": 120/u);
  await expect(controlledPanel.getByText("Committed changes: 1")).toBeVisible();

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
  await expect(page.getByRole("status")).toContainText("Committed viewport changes: 0.");

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
  await expect(page.getByRole("status")).toContainText("Committed viewport changes: 1.");

  await page.getByRole("button", { name: "Reset viewport" }).click();
  await expect(documentJson).toHaveValue(/"x": 0[,.]/u);
  await expect(documentJson).toHaveValue(/"y": 0[,.]/u);
  await expect(documentJson).toHaveValue(/"zoom": 1/u);
  await expect(page.getByRole("status")).toContainText("Committed viewport changes: 2.");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("the canvas toolbar, host extensions, and empty minimap synchronize and clean up", async ({
  page,
}) => {
  await page.goto("/?canvas-shell");

  const workspace = page.getByRole("region", { name: "Canvas shell workspace", exact: true });
  const canvas = page.getByRole("application", { name: "Canvas shell workspace canvas" });
  const toolbar = page.getByRole("toolbar", { name: "Canvas shell workspace controls" });
  const documentJson = page.getByTestId("canvas-shell-document");
  const hostNote = page.getByRole("textbox", { name: "Host note" });
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
      toolbar.locator("button").evaluateAll((buttons) =>
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

  await page.getByRole("checkbox", { name: "Snap to grid" }).uncheck();
  await expect(canvas).toHaveAttribute("data-workspace-grid-snap", "false");
  await expect(background).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Snap to grid" }).check();
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
  await expect(page.getByRole("status")).toContainText("Committed viewport changes: 0.");

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
  await expect(page).toHaveScreenshot("canvas-shell-320.png", { fullPage: true });
});
