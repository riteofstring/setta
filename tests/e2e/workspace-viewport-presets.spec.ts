import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

type BrowserWorkspaceDocument = Readonly<{
  rootSections: readonly unknown[];
  sections: Readonly<Record<string, unknown>>;
  viewport: Readonly<{ x: number; y: number; zoom: number }>;
}>;

const DOCUMENT_STORAGE_KEY = "setta-workspace-playground-document-v1";
const PREFERENCES_STORAGE_KEY = "setta-workspace-playground-preferences-v1";

async function resetExample(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show workspace data" }).click();
  await page.getByRole("button", { name: "Reset example" }).click();
  await page
    .getByRole("group", { name: "Confirm reset" })
    .getByRole("button", { name: "Reset workspace" })
    .click();
  await expect(page.getByRole("article", { name: "Welcome note" })).toBeVisible();
  await page.getByRole("button", { name: "Hide workspace data" }).click();
}

async function workspaceDocument(page: Page): Promise<BrowserWorkspaceDocument> {
  return page.evaluate((key) => {
    const serialized = localStorage.getItem(key);
    if (serialized === null) throw new Error("The persisted workspace document is unavailable.");
    return JSON.parse(serialized) as BrowserWorkspaceDocument;
  }, DOCUMENT_STORAGE_KEY);
}

async function showSavedViews(
  page: Page,
): Promise<Readonly<{ panel: Locator; workspace: Locator }>> {
  const workspace = page.getByRole("region", { exact: true, name: "Section workspace" });
  const toggle = workspace.getByRole("button", { exact: true, name: "Saved views" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(workspace.locator('[data-workspace-pane-id="saved-views"]')).toHaveAttribute(
    "data-workspace-pane-placement",
    "end",
  );
  const panel = workspace.getByRole("region", { name: "Saved workspace views" });
  await expect(panel).toBeVisible();
  return { panel, workspace };
}

async function saveView(panel: Locator, name: string): Promise<Locator> {
  const form = panel.getByRole("form", { name: "Save current view" });
  await form.getByRole("textbox", { name: "View name" }).fill(name);
  await form.getByRole("button", { name: "Save view" }).click();
  const restore = panel.getByRole("button", { name: `Restore ${name}` });
  await expect(restore).toBeFocused();
  return restore;
}

test("saved views capture, restore, rename, delete, and persist exact viewports", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1_280 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  await resetExample(page);
  await expect.poll(async () => (await workspaceDocument(page)).rootSections.length).toBe(3);

  const { panel, workspace } = await showSavedViews(page);
  const createForm = panel.getByRole("form", { name: "Save current view" });
  const createName = createForm.getByRole("textbox", { name: "View name" });
  await createName.fill("   ");
  await createForm.getByRole("button", { name: "Save view" }).click();
  await expect(createName).toHaveAttribute("aria-invalid", "true");
  await expect(createName).toBeFocused();
  await expect(panel).toContainText("Enter a name for this view.");

  const selected = workspace.locator('[data-workspace-section-id="example-note"]');
  await selected.getByRole("button", { name: "Select Welcome note" }).click();
  const captured = await workspaceDocument(page);
  const restore = await saveView(panel, "Planning overview");
  await expect(panel.locator("[data-workspace-viewport-presets-announcement]")).toHaveText(
    "Planning overview saved.",
  );

  await workspace.getByRole("button", { name: "Fit sections" }).click();
  await expect
    .poll(async () => (await workspaceDocument(page)).viewport)
    .not.toEqual(captured.viewport);
  await restore.click();
  await expect
    .poll(async () => (await workspaceDocument(page)).viewport)
    .toEqual(captured.viewport);
  await expect(restore).toBeFocused();
  await expect(panel.locator("[data-workspace-viewport-presets-announcement]")).toHaveText(
    "Planning overview restored.",
  );
  const restored = await workspaceDocument(page);
  expect(restored.rootSections).toEqual(captured.rootSections);
  expect(restored.sections).toEqual(captured.sections);
  await expect(selected).toHaveAttribute("data-workspace-selected", "true");

  await panel.getByRole("button", { name: "Rename Planning overview" }).click();
  const renameForm = panel.getByRole("form", { name: "Rename Planning overview" });
  const renameInput = renameForm.getByRole("textbox", { name: "View name" });
  await expect(renameInput).toBeFocused();
  await renameInput.fill("Review overview");
  await renameInput.press("Enter");
  const renamedRestore = panel.getByRole("button", { name: "Restore Review overview" });
  await expect(renamedRestore).toBeFocused();
  await expect(panel.locator("[data-workspace-viewport-presets-announcement]")).toHaveText(
    "View renamed to Review overview.",
  );

  await page.mouse.move(1, 1);
  await expect(panel).toHaveScreenshot("workspace-saved-views.png");

  const accessibility = await new AxeBuilder({ page })
    .include("[data-workspace-viewport-presets]")
    .analyze();
  expect(accessibility.violations).toEqual([]);

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await renamedRestore.focus();
  await expect(renamedRestore).toBeFocused();
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  expect((await renamedRestore.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(
    (await panel.getByRole("button", { name: "Delete Review overview" }).boundingBox())?.height,
  ).toBeGreaterThanOrEqual(44);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
  await session.detach();

  await panel.getByRole("button", { name: "Delete Review overview" }).click();
  await expect(createName).toBeFocused();
  await expect(panel).toContainText("No saved views yet.");
  const persistedRestore = await saveView(panel, "Persisted planning view");
  await workspace.getByRole("button", { name: "Fit sections" }).click();
  await expect
    .poll(async () => (await workspaceDocument(page)).viewport)
    .not.toEqual(captured.viewport);
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
      }, PREFERENCES_STORAGE_KEY),
    )
    .toMatchObject({
      schemaVersion: 2,
      viewportPresets: [{ id: "saved-view-1", name: "Persisted planning view" }],
    });
  await expect(persistedRestore).toBeVisible();

  await page.reload();
  const reloaded = await showSavedViews(page);
  const persisted = reloaded.panel.getByRole("button", { name: "Restore Persisted planning view" });
  await persisted.click();
  await expect
    .poll(async () => (await workspaceDocument(page)).viewport)
    .toEqual(captured.viewport);
  await expect(persisted).toBeFocused();
});

test("saved views remain available in read-only mode and reflow at 320 CSS pixels", async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/?read-only");

  const { panel, workspace } = await showSavedViews(page);
  const restore = await saveView(panel, "Read-only overview");
  await expect(restore).toBeEnabled();
  await restore.click();
  await expect(panel.locator("[data-workspace-viewport-presets-announcement]")).toHaveText(
    "Already at Read-only overview.",
  );

  const [documentWidths, panelBounds, workspaceBounds] = await Promise.all([
    page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
    panel.boundingBox(),
    workspace.boundingBox(),
  ]);
  if (!panelBounds || !workspaceBounds) {
    throw new Error("The narrow saved-view panel and workspace must expose browser geometry.");
  }
  expect(documentWidths.scrollWidth).toBeLessThanOrEqual(documentWidths.clientWidth);
  expect(panelBounds.x).toBeGreaterThanOrEqual(workspaceBounds.x);
  expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(
    workspaceBounds.x + workspaceBounds.width,
  );
  expect(await restore.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    "0s",
  );

  const accessibility = await new AxeBuilder({ page })
    .include("[data-workspace-viewport-presets]")
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("saved views report a controlled host that retains its viewport", async ({ page }) => {
  await page.goto("/?reject-viewport");
  await resetExample(page);
  let current = await workspaceDocument(page);
  let savedViews = await showSavedViews(page);
  await saveView(savedViews.panel, "Host-retained view");
  const rejectedViewport = {
    x: current.viewport.x + 640,
    y: current.viewport.y + 320,
    zoom: current.viewport.zoom,
  };
  await page.evaluate(
    ({ key, viewport }) => {
      const value = localStorage.getItem(key);
      if (!value) throw new Error("Saved-view preferences are unavailable.");
      const preferences = JSON.parse(value) as {
        viewportPresets: Array<{ viewport: BrowserWorkspaceDocument["viewport"] }>;
      };
      const preset = preferences.viewportPresets[0];
      if (!preset) throw new Error("The saved-view fixture is unavailable.");
      preset.viewport = viewport;
      localStorage.setItem(key, JSON.stringify(preferences));
    },
    { key: PREFERENCES_STORAGE_KEY, viewport: rejectedViewport },
  );

  await page.reload();
  savedViews = await showSavedViews(page);
  current = await workspaceDocument(page);
  await savedViews.panel.getByRole("button", { name: "Restore Host-retained view" }).click();

  await expect(
    savedViews.panel.locator("[data-workspace-viewport-presets-announcement]"),
  ).toHaveText("Host-retained view was not restored because the host did not accept the change.");
  expect((await workspaceDocument(page)).viewport).toEqual(current.viewport);
});
