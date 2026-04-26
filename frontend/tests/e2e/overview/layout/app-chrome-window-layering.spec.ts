import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

async function showSidePanes(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage } = await import("/src/state/definitions.ts");
    useLocalStorage.setState({
      overviewVis: true,
      uiEditorVis: true,
      overviewTab: "ProjectAIChat",
    });
  });
}

async function hideSidePanes(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage } = await import("/src/state/definitions.ts");
    useLocalStorage.setState({
      overviewVis: false,
      uiEditorVis: false,
    });
  });
}

async function getNearestLayerZIndex(locator: Locator): Promise<number> {
  return locator.evaluate((node) => {
    let current: HTMLElement | null = node as HTMLElement;
    while (current) {
      const parsed = Number.parseInt(
        getComputedStyle(current).zIndex || "",
        10,
      );
      if (Number.isFinite(parsed)) {
        return parsed;
      }
      current = current.parentElement;
    }
    return 0;
  });
}

async function ensureFloatingWindow(page: Page): Promise<Locator> {
  const floatingWindows = page.getByTestId("project-chat-floating-window");
  if ((await floatingWindows.count()) > 0) {
    const floatingWindow = floatingWindows.last();
    await expect(floatingWindow).toBeVisible();
    return floatingWindow;
  }
  const dockedWindow = page
    .getByTestId("project-chat-bottom-dock-window-panel")
    .first();
  await expect(dockedWindow).toBeVisible();
  await dockedWindow.getByTestId("project-chat-window-undock").click();
  const floatingWindow = page
    .getByTestId("project-chat-floating-window")
    .last();
  await expect(floatingWindow).toBeVisible();
  return floatingWindow;
}

test("header menus and side panes stay above docked and floating chat windows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".canvas-flow__canvas");
    await showSidePanes(page);

    const header = page.locator('[data-tab-scope="header"]').first();
    const overviewRail = page.getByTestId("overview-icon-rail");
    const uiEditorRail = page.getByTestId("ui-editor-icon-rail");
    const overviewPane = page.locator(
      "#OverviewPane aside.single-cell-container",
    );
    const uiEditorPane = page.locator(
      "#UiEditorPane aside.single-cell-container",
    );
    const strip = page.getByTestId("project-chat-bottom-dock-strip");

    await expect(header).toBeVisible();
    await expect(overviewRail).toBeVisible();
    await expect(uiEditorRail).toBeVisible();
    await expect(overviewPane).toBeVisible();
    await expect(uiEditorPane).toBeVisible();
    await expect(strip).toBeVisible();

    const stripZIndex = await getNearestLayerZIndex(strip);
    const headerZIndex = await getNearestLayerZIndex(header);
    const overviewRailZIndex = await getNearestLayerZIndex(overviewRail);
    const uiEditorRailZIndex = await getNearestLayerZIndex(uiEditorRail);
    const overviewPaneZIndex = await getNearestLayerZIndex(overviewPane);
    const uiEditorPaneZIndex = await getNearestLayerZIndex(uiEditorPane);

    expect(headerZIndex).toBeGreaterThan(stripZIndex);
    expect(overviewRailZIndex).toBeGreaterThan(stripZIndex);
    expect(uiEditorRailZIndex).toBeGreaterThan(stripZIndex);
    expect(overviewPaneZIndex).toBeGreaterThan(stripZIndex);
    expect(uiEditorPaneZIndex).toBeGreaterThan(stripZIndex);
    expect(overviewRailZIndex).toBeGreaterThan(overviewPaneZIndex);
    expect(uiEditorRailZIndex).toBeGreaterThan(uiEditorPaneZIndex);

    await header.getByText("Project", { exact: true }).click();
    const fileMenuItem = page.getByText("New Config", { exact: true }).last();
    await expect(fileMenuItem).toBeVisible();
    const fileMenuZIndex = await getNearestLayerZIndex(fileMenuItem);
    expect(fileMenuZIndex).toBeGreaterThan(stripZIndex);
    await page.keyboard.press("Escape");

    await page.getByTestId("overview-tab-more").click();
    const customRunsMenuItem = page.getByText("Custom Runs", {
      exact: true,
    });
    await expect(customRunsMenuItem).toBeVisible();
    const overviewMoreMenuZIndex =
      await getNearestLayerZIndex(customRunsMenuItem);
    expect(overviewMoreMenuZIndex).toBeGreaterThan(stripZIndex);
    expect(overviewMoreMenuZIndex).toBeGreaterThan(overviewPaneZIndex);
    await page.keyboard.press("Escape");

    await hideSidePanes(page);
    const floatingWindow = await ensureFloatingWindow(page);
    await showSidePanes(page);
    await expect(overviewRail).toBeVisible();
    await expect(uiEditorRail).toBeVisible();
    await expect(overviewPane).toBeVisible();
    await expect(uiEditorPane).toBeVisible();
    const floatingLayerZIndex = await floatingWindow.evaluate((node) =>
      Number.parseInt(
        getComputedStyle(node.parentElement ?? node).zIndex || "0",
        10,
      ),
    );

    expect(headerZIndex).toBeGreaterThan(floatingLayerZIndex);
    expect(overviewRailZIndex).toBeGreaterThan(floatingLayerZIndex);
    expect(uiEditorRailZIndex).toBeGreaterThan(floatingLayerZIndex);
    expect(overviewPaneZIndex).toBeGreaterThan(floatingLayerZIndex);
    expect(uiEditorPaneZIndex).toBeGreaterThan(floatingLayerZIndex);
    expect(overviewRailZIndex).toBeGreaterThan(overviewPaneZIndex);
    expect(uiEditorRailZIndex).toBeGreaterThan(uiEditorPaneZIndex);

    await header.getByText("Project", { exact: true }).click();
    await expect(fileMenuItem).toBeVisible();
    expect(await getNearestLayerZIndex(fileMenuItem)).toBeGreaterThan(
      floatingLayerZIndex,
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext.projectConfigId);
  }
});

test("q quick info tooltip stays above open side panes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".canvas-flow__canvas");
    await showSidePanes(page);

    const overviewRail = page.getByTestId("overview-icon-rail");
    const uiEditorRail = page.getByTestId("ui-editor-icon-rail");
    const overviewPane = page.locator(
      "#OverviewPane aside.single-cell-container",
    );
    const uiEditorPane = page.locator(
      "#UiEditorPane aside.single-cell-container",
    );
    const quickInfoTab = page.getByTestId("ui-editor-tab-quick-info-config");
    const tooltip = page.locator("#setta-tooltip-floating-box");

    await expect(overviewRail).toBeVisible();
    await expect(uiEditorRail).toBeVisible();
    await expect(overviewPane).toBeVisible();
    await expect(uiEditorPane).toBeVisible();
    await expect(quickInfoTab).toBeVisible();

    await quickInfoTab.hover();
    await page.evaluate(async () => {
      const { enableFloatingBox } = await import(
        "/src/components/Utils/FloatingBox.tsx"
      );
      enableFloatingBox();
    });
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Parameter Info Editing");

    const tooltipZIndex = await getNearestLayerZIndex(tooltip);
    const overviewRailZIndex = await getNearestLayerZIndex(overviewRail);
    const uiEditorRailZIndex = await getNearestLayerZIndex(uiEditorRail);
    const overviewPaneZIndex = await getNearestLayerZIndex(overviewPane);
    const uiEditorPaneZIndex = await getNearestLayerZIndex(uiEditorPane);

    expect(tooltipZIndex).toBeGreaterThan(overviewRailZIndex);
    expect(tooltipZIndex).toBeGreaterThan(uiEditorRailZIndex);
    expect(tooltipZIndex).toBeGreaterThan(overviewPaneZIndex);
    expect(tooltipZIndex).toBeGreaterThan(uiEditorPaneZIndex);
  } finally {
    await page.evaluate(async () => {
      const { disableFloatingBox } = await import(
        "/src/components/Utils/FloatingBox.tsx"
      );
      disableFloatingBox();
    });
    await cleanupIsolatedProject(page, projectContext.projectConfigId);
  }
});
