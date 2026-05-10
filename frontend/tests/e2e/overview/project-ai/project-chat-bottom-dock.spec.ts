import { expect, test, type Locator } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

import {
  clickDom,
  collapseSidePanesForWindowInteraction,
  ensureFloatingWindow,
  expectNoActiveOutlineOnPointerDown,
  getFloatingWindowMetrics,
  getFloatingWorkArea,
  setActiveSections,
} from "./project-chat-bottom-dock-helpers";

test("project chat bottom dock auto-creates a chat and supports creating additional windows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const strip = page.getByTestId("project-chat-bottom-dock-strip");
    await expect(strip).toBeVisible();
    const overviewRail = page.getByTestId("overview-icon-rail");
    const uiEditorRail = page.getByTestId("ui-editor-icon-rail");
    const stripZIndex = await strip.evaluate((node) =>
      Number.parseInt(getComputedStyle(node).zIndex || "0", 10),
    );
    const overviewRailZIndex = await overviewRail.evaluate((node) =>
      Number.parseInt(getComputedStyle(node).zIndex || "0", 10),
    );
    const uiEditorRailZIndex = await uiEditorRail.evaluate((node) =>
      Number.parseInt(getComputedStyle(node).zIndex || "0", 10),
    );
    expect(overviewRailZIndex).toBeGreaterThan(stripZIndex);
    expect(uiEditorRailZIndex).toBeGreaterThan(stripZIndex);

    const dockWindow = page.getByTestId("project-chat-bottom-dock-window");
    await expect(dockWindow).toBeVisible();
    const dockPanels = page.getByTestId(
      "project-chat-bottom-dock-window-panel",
    );
    await expect(dockPanels).toHaveCount(1);
    const dockPanel = dockPanels.first();
    await expect(dockPanel).toBeVisible();
    await expectNoActiveOutlineOnPointerDown(
      page,
      page.getByTestId("project-chat-window-surface").first(),
    );
    const titleDisplay = dockPanel.getByTestId("project-chat-window-title");
    await titleDisplay.dblclick();
    const titleInput = dockPanel.getByTestId("project-chat-window-title-input");
    await expect(titleInput).toBeVisible();
    await titleInput.fill("Coast Bear");
    await titleInput.press("Enter");
    await expect(dockPanel.getByTestId("project-chat-window-title")).toHaveText(
      "Coast Bear",
    );
    const floatingWindows = page.getByTestId("project-chat-floating-window");
    await expect(floatingWindows).toHaveCount(0);
    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error("Expected viewport size for dock assertions.");
    }
    const dockPanelBounds = await dockPanel.boundingBox();
    const stripBounds = await strip.boundingBox();
    if (!dockPanelBounds || !stripBounds) {
      throw new Error("Expected dock panel and strip bounds.");
    }
    expect(
      Math.abs(dockPanelBounds.height - viewport.height * 0.7),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        dockPanelBounds.x +
          dockPanelBounds.width -
          (stripBounds.x + stripBounds.width),
      ),
    ).toBeLessThanOrEqual(4);

    const minimap = page.locator('[data-testid="rf__minimap"]');
    await expect(minimap).toBeVisible();
    const minimapBounds = await minimap.boundingBox();
    if (!minimapBounds) {
      throw new Error("Expected minimap bounds for left-side assertions.");
    }
    expect(minimapBounds.x).toBeLessThan(viewport.width / 2);
    const minimapSideToggle = page.getByTestId("rf__toggle-minimap-side");
    await minimapSideToggle.click();
    const rightMinimapBounds = await minimap.boundingBox();
    if (!rightMinimapBounds) {
      throw new Error("Expected minimap bounds after moving to the right.");
    }
    expect(rightMinimapBounds.x).toBeGreaterThan(viewport.width / 2);
    await minimapSideToggle.click();

    const createButton = page.getByTestId("project-chat-bottom-dock-create");
    const createButtonBounds = await createButton.boundingBox();
    if (!createButtonBounds) {
      throw new Error("Expected create button bounds for dock checks.");
    }
    expect(createButtonBounds.y).toBeLessThan(
      stripBounds.y + stripBounds.height,
    );
    expect(
      Math.abs(
        createButtonBounds.y +
          createButtonBounds.height -
          (stripBounds.y + stripBounds.height),
      ),
    ).toBeLessThanOrEqual(1);
    expect(createButtonBounds.x + createButtonBounds.width).toBeLessThanOrEqual(
      dockPanelBounds.x - 2,
    );

    const pills = page.getByTestId("project-chat-bottom-dock-pill");
    const initialPillCount = await pills.count();
    expect(initialPillCount).toBe(0);

    await expect(
      page.locator(
        '[data-testid="project-chat-floating-window-resize-handle"][data-resize-direction="left"], [data-testid="project-chat-floating-window-resize-handle"][data-resize-direction="right"]',
      ),
    ).toHaveCount(0);
    await expect(
      page.locator(
        '[data-testid="project-chat-bottom-dock-resize-handle"][data-resize-direction="left"], [data-testid="project-chat-bottom-dock-resize-handle"][data-resize-direction="right"]',
      ),
    ).toHaveCount(0);

    await createButton.click();
    await expect(dockPanels).toHaveCount(2);
    await expect(page.getByTestId("project-chat-bottom-dock-pill")).toHaveCount(
      0,
    );
    await expect(floatingWindows).toHaveCount(0);

    await expect(
      page.getByTestId("project-chat-window-close").last(),
    ).toBeVisible();
    await expect(
      page.getByTestId("project-chat-window-minimize").last(),
    ).toBeVisible();

    // Minimizing should use the fast downward exit path before becoming a tab.
    const minimizedDockPanel = dockPanels.last();
    const minimizedInstanceId = await minimizedDockPanel.getAttribute(
      "data-chat-window-instance-id",
    );
    if (!minimizedInstanceId) {
      throw new Error("Expected minimized dock panel instance id.");
    }
    await page.getByTestId("project-chat-window-minimize").last().click();
    await expect(minimizedDockPanel).toHaveAttribute(
      "data-chat-window-exit-animation",
      "minimize",
    );
    await expect(page.getByTestId("project-chat-bottom-dock-pill")).toHaveCount(
      1,
    );
    await expect(dockPanels).toHaveCount(1);
    const minimizedPill = page.locator(
      `[data-testid="project-chat-bottom-dock-pill"][data-chat-window-instance-id="${minimizedInstanceId}"]`,
    );
    await expect
      .poll(async () => {
        const currentPillBounds = await minimizedPill.boundingBox();
        const currentCreateButtonBounds = await createButton.boundingBox();
        if (!currentPillBounds || !currentCreateButtonBounds) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.abs(
          currentCreateButtonBounds.y +
            currentCreateButtonBounds.height -
            (currentPillBounds.y + currentPillBounds.height),
        );
      })
      .toBeLessThanOrEqual(1);
    const minimizedPillBounds = await minimizedPill.boundingBox();
    const createButtonBoundsAfterMinimize = await createButton.boundingBox();
    const remainingDockPanelBounds = await dockPanels.first().boundingBox();
    const stripBoundsAfterMinimize = await strip.boundingBox();
    if (
      !minimizedPillBounds ||
      !createButtonBoundsAfterMinimize ||
      !remainingDockPanelBounds ||
      !stripBoundsAfterMinimize
    ) {
      throw new Error(
        "Expected minimized pill, create button, strip, and dock panel bounds.",
      );
    }
    expect(
      minimizedPillBounds.x + minimizedPillBounds.width,
    ).toBeLessThanOrEqual(remainingDockPanelBounds.x - 2);
    expect(
      Math.abs(
        minimizedPillBounds.y +
          minimizedPillBounds.height -
          (remainingDockPanelBounds.y + remainingDockPanelBounds.height),
      ),
    ).toBeLessThanOrEqual(16);
    expect(
      Math.abs(
        createButtonBoundsAfterMinimize.height - minimizedPillBounds.height,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        createButtonBoundsAfterMinimize.width - minimizedPillBounds.height,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        createButtonBoundsAfterMinimize.y +
          createButtonBoundsAfterMinimize.height -
          (stripBoundsAfterMinimize.y + stripBoundsAfterMinimize.height),
      ),
    ).toBeLessThanOrEqual(3);
    expect(
      createButtonBoundsAfterMinimize.x + createButtonBoundsAfterMinimize.width,
    ).toBeLessThanOrEqual(minimizedPillBounds.x - 2);
    const minimizedPillBottomLeftRadius = await page
      .getByTestId("project-chat-bottom-dock-pill")
      .first()
      .evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).borderBottomLeftRadius),
      );
    const createButtonBottomLeftRadius = await createButton.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).borderBottomLeftRadius),
    );
    const minimizedPillBottomRightRadius = await page
      .getByTestId("project-chat-bottom-dock-pill")
      .first()
      .evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).borderBottomRightRadius),
      );
    const createButtonBottomRightRadius = await createButton.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).borderBottomRightRadius),
    );
    expect(Math.abs(minimizedPillBottomLeftRadius)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(minimizedPillBottomRightRadius)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(createButtonBottomLeftRadius)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(createButtonBottomRightRadius)).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(createButtonBottomLeftRadius - minimizedPillBottomLeftRadius),
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(createButtonBottomRightRadius - minimizedPillBottomRightRadius),
    ).toBeLessThanOrEqual(0.5);
    expect(
      createButtonBoundsAfterMinimize.x + createButtonBoundsAfterMinimize.width,
    ).toBeLessThanOrEqual(remainingDockPanelBounds.x - 2);

    const restoredDockPanel = page.locator(
      `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${minimizedInstanceId}"]`,
    );
    await clickDom(minimizedPill);
    await expect(restoredDockPanel).toHaveAttribute(
      "data-chat-window-enter-animation",
      "restore_from_minimize",
    );
    await expect(page.getByTestId("project-chat-bottom-dock-pill")).toHaveCount(
      0,
    );
    await expect(dockPanels).toHaveCount(2);

    // Closing uses a different exit path: quick scale-down and fade-out.
    const closingDockPanel = restoredDockPanel;
    await page.getByTestId("project-chat-window-close").last().click();
    await expect(closingDockPanel).toHaveAttribute(
      "data-chat-window-exit-animation",
      "close",
    );
    await expect(page.getByTestId("project-chat-bottom-dock-pill")).toHaveCount(
      0,
    );
    await expect(dockPanels).toHaveCount(1);

    await page.getByTestId("overview-tab-project-ai-chat").click();
    await expect(
      page.getByTestId("project-chat-bottom-dock-strip"),
    ).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("the Project AI manager reopens minimized windows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");

    const dockPanel = page
      .getByTestId("project-chat-bottom-dock-window-panel")
      .first();
    const instanceId = await dockPanel.getAttribute(
      "data-chat-window-instance-id",
    );
    if (!instanceId) {
      throw new Error("Expected project chat instance id.");
    }

    await dockPanel.getByTestId("project-chat-window-minimize").click();
    await expect(
      page.locator(
        `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${instanceId}"]`,
      ),
    ).toHaveCount(0);

    const managerTrigger = page.getByTestId(
      "project-chat-bottom-dock-menu-trigger",
    );
    await expect(managerTrigger).toBeVisible();
    await managerTrigger.click();
    const menuContent = page.getByTestId(
      "project-chat-bottom-dock-menu-content",
    );
    await expect(menuContent).toBeVisible();
    const reopenButton = menuContent.locator(
      `[data-testid="project-chat-manager-reopen"][data-chat-window-instance-id="${instanceId}"]`,
    );
    await expect(reopenButton).toBeVisible();
    await expect(
      menuContent.locator(
        `[data-testid="project-chat-manager-hide"][data-chat-window-instance-id="${instanceId}"]`,
      ),
    ).toHaveCount(0);

    await reopenButton.click();

    await expect(
      page.locator(
        `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${instanceId}"]`,
      ),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat bottom dock narrows into a single visible window and collapses chats into a menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const createButton = page.getByTestId("project-chat-bottom-dock-create");
    await createButton.click();
    await createButton.click();

    const dockPanels = page.getByTestId(
      "project-chat-bottom-dock-window-panel",
    );
    await expect(dockPanels).toHaveCount(1);
    const dockWindow = page.getByTestId("project-chat-bottom-dock-window");
    const dockWindowBounds = await dockWindow.boundingBox();
    const visiblePanelBounds = await dockPanels.first().boundingBox();
    if (!dockWindowBounds || !visiblePanelBounds) {
      throw new Error("Expected dock window bounds at intermediate width.");
    }
    expect(visiblePanelBounds.x).toBeGreaterThanOrEqual(dockWindowBounds.x - 1);
    expect(visiblePanelBounds.x + visiblePanelBounds.width).toBeLessThanOrEqual(
      dockWindowBounds.x + dockWindowBounds.width + 1,
    );

    const visibleTitle = dockPanels
      .first()
      .getByTestId("project-chat-window-title");
    await expect(visibleTitle).toHaveText("Chat Window 3");
    const headerCycleLeft = page
      .getByTestId("project-chat-window-cycle-left")
      .first();
    const headerCycleRight = page
      .getByTestId("project-chat-window-cycle-right")
      .first();
    await expect(headerCycleLeft).toBeVisible();
    await expect(headerCycleRight).toBeVisible();
    await expect(headerCycleRight).toBeDisabled();
    await headerCycleLeft.click();
    await expect(visibleTitle).toHaveText("Chat Window 2");
    await expect(headerCycleRight).toBeEnabled();
    await headerCycleRight.click();
    await expect(visibleTitle).toHaveText("Chat Window 3");

    await page.setViewportSize({ width: 360, height: 900 });
    await expect(dockPanels).toHaveCount(0);
    const strip = page.getByTestId("project-chat-bottom-dock-strip");
    const menuTrigger = page.getByTestId(
      "project-chat-bottom-dock-menu-trigger",
    );
    await expect(menuTrigger).toBeVisible();
    await expect(
      page.getByTestId("project-chat-bottom-dock-cycle-left"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("project-chat-bottom-dock-cycle-right"),
    ).toHaveCount(0);
    await menuTrigger.click();
    await expect(
      page.getByTestId("project-chat-bottom-dock-menu-content"),
    ).toBeVisible();
    await expect(
      page.getByTestId("project-chat-bottom-dock-menu-item"),
    ).toHaveCount(3);

    const settingsLink = page.getByTestId("overview-left-rail-settings-link");
    const createButtonBounds = await createButton.boundingBox();
    const menuTriggerBounds = await menuTrigger.boundingBox();
    const settingsLinkBounds = await settingsLink.boundingBox();
    const stripBounds = await strip.boundingBox();
    if (
      !createButtonBounds ||
      !menuTriggerBounds ||
      !settingsLinkBounds ||
      !stripBounds
    ) {
      throw new Error(
        "Expected create button, menu trigger, strip, and settings link bounds for overflow checks.",
      );
    }
    expect(createButtonBounds.x).toBeGreaterThanOrEqual(
      settingsLinkBounds.x + settingsLinkBounds.width + 4,
    );
    expect(
      Math.abs(
        createButtonBounds.y +
          createButtonBounds.height -
          (stripBounds.y + stripBounds.height),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        menuTriggerBounds.y +
          menuTriggerBounds.height -
          (stripBounds.y + stripBounds.height),
      ),
    ).toBeLessThanOrEqual(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat canvas visibility toggle hides and restores overlay windows", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    await page.getByTestId("project-chat-window-maximize").last().click();
    const maximizedWindow = page.getByTestId("project-chat-maximized-window");
    await expect(maximizedWindow).toBeVisible();

    const toggle = page.getByTestId("project-chat-canvas-visibility-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", "Show canvas");
    await expect
      .poll(async () =>
        toggle.evaluate((node) =>
          Number.parseFloat(getComputedStyle(node).borderTopLeftRadius),
        ),
      )
      .toBeLessThanOrEqual(8);
    await expect(maximizedWindow).toBeVisible();

    await clickDom(toggle);
    await expect(toggle).toHaveAttribute("aria-label", "Show chats");
    await expect(page.getByTestId("project-chat-maximized-window")).toHaveCount(
      0,
    );

    await clickDom(toggle);
    await expect(toggle).toHaveAttribute("aria-label", "Show canvas");
    await expect(maximizedWindow).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat keyboard shortcuts toggle canvas and control focused windows", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const isMac = await page.evaluate(() =>
      navigator.userAgent.includes("Mac"),
    );
    const modKey = isMac ? "Meta" : "Control";
    const dockWindow = page.getByTestId("project-chat-bottom-dock-window");
    await expect(dockWindow).toBeVisible();

    await page.keyboard.press("Shift+Escape");
    await expect(
      page.getByTestId("project-chat-bottom-dock-window"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("project-chat-canvas-visibility-toggle"),
    ).toHaveAttribute("aria-label", "Show chats");

    await page.keyboard.press("Shift+Escape");
    await expect(
      page.getByTestId("project-chat-bottom-dock-window"),
    ).toBeVisible();
    await expect(
      page.getByTestId("project-chat-canvas-visibility-toggle"),
    ).toHaveCount(0);

    await page
      .getByTestId("project-chat-bottom-dock-window-panel")
      .last()
      .click();
    await page.keyboard.press(`${modKey}+Shift+Enter`);
    const maximizedWindow = page.getByTestId("project-chat-maximized-window");
    await expect(maximizedWindow).toBeVisible();
    await expect(
      page.getByTestId("project-chat-canvas-visibility-toggle"),
    ).toHaveAttribute("aria-label", "Show canvas");
    await maximizedWindow.locator("header button").first().click();
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat keyboard shortcuts snap the focused floating window to directional presets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const isMac = await page.evaluate(() =>
      navigator.userAgent.includes("Mac"),
    );
    const modKey = isMac ? "Meta" : "Control";

    const floatingWindow = await ensureFloatingWindow(page);
    await floatingWindow
      .getByTestId("project-chat-floating-window-drag-handle")
      .click();

    await page.keyboard.press(`${modKey}+Alt+ArrowLeft`);
    const leftSnap = await getFloatingWindowMetrics(floatingWindow);
    const leftSnapWorkArea = getFloatingWorkArea(leftSnap);
    expect(Math.abs(leftSnap.left - leftSnapWorkArea.left)).toBeLessThanOrEqual(
      2,
    );
    expect(Math.abs(leftSnap.top - leftSnapWorkArea.top)).toBeLessThanOrEqual(
      2,
    );
    expect(
      Math.abs(leftSnap.width - leftSnapWorkArea.width / 2),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(leftSnap.height - leftSnapWorkArea.height),
    ).toBeLessThanOrEqual(2);

    await page.keyboard.press(`${modKey}+Alt+ArrowDown`);
    const bottomSnap = await getFloatingWindowMetrics(floatingWindow);
    const bottomSnapWorkArea = getFloatingWorkArea(bottomSnap);
    expect(
      Math.abs(bottomSnap.left - bottomSnapWorkArea.left),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        bottomSnap.top -
          (bottomSnapWorkArea.top + bottomSnapWorkArea.height / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(bottomSnap.width - bottomSnapWorkArea.width),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(bottomSnap.height - bottomSnapWorkArea.height / 2),
    ).toBeLessThanOrEqual(2);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat snap shortcuts open floating windows directly into quarter presets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);
    const { sectionId } = await createTextBlockSection(
      page,
      projectContext.projectConfigId,
      "Snap Target",
    );
    await setActiveSections(page, [sectionId]);

    const isMac = await page.evaluate(() =>
      navigator.userAgent.includes("Mac"),
    );
    const modKey = isMac ? "Meta" : "Control";

    await page.keyboard.press(`${modKey}+Alt+Shift+Q`);
    const floatingWindow = page.getByTestId("project-chat-floating-window");
    await expect(floatingWindow).toHaveCount(1);
    await expect(floatingWindow.first()).toHaveAttribute(
      "data-chat-window-snap-preset",
      "top_left",
    );

    const topLeftMetrics = await getFloatingWindowMetrics(
      floatingWindow.first(),
    );
    const topLeftWorkArea = getFloatingWorkArea(topLeftMetrics);
    expect(
      Math.abs(topLeftMetrics.left - topLeftWorkArea.left),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(topLeftMetrics.top - topLeftWorkArea.top),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(topLeftMetrics.width - topLeftWorkArea.width / 2),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(topLeftMetrics.height - topLeftWorkArea.height / 2),
    ).toBeLessThanOrEqual(2);

    await page.keyboard.press(`${modKey}+Alt+Shift+W`);
    await expect(floatingWindow.first()).toHaveAttribute(
      "data-chat-window-snap-preset",
      "top_right",
    );
    const topRightMetrics = await getFloatingWindowMetrics(
      floatingWindow.first(),
    );
    const topRightWorkArea = getFloatingWorkArea(topRightMetrics);
    expect(
      Math.abs(
        topRightMetrics.left -
          (topRightWorkArea.left + topRightWorkArea.width / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(topRightMetrics.top - topRightWorkArea.top),
    ).toBeLessThanOrEqual(2);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat windows support floating drag/resize, z-order focus, and maximize restore", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const isMac = await page.evaluate(() =>
      navigator.userAgent.includes("Mac"),
    );
    const modKey = isMac ? "Meta" : "Control";
    const firstFloatingWindowBeforeSecondUndock =
      await ensureFloatingWindow(page);
    const firstFloatingLayerZIndex =
      await firstFloatingWindowBeforeSecondUndock.evaluate((node) =>
        Number.parseInt(
          getComputedStyle(node.parentElement ?? node).zIndex || "0",
          10,
        ),
      );
    const overviewRailZIndex = await page
      .getByTestId("overview-icon-rail")
      .evaluate((node) =>
        Number.parseInt(getComputedStyle(node).zIndex || "0", 10),
      );
    const uiEditorRailZIndex = await page
      .getByTestId("ui-editor-icon-rail")
      .evaluate((node) =>
        Number.parseInt(getComputedStyle(node).zIndex || "0", 10),
      );
    expect(overviewRailZIndex).toBeGreaterThan(firstFloatingLayerZIndex);
    expect(uiEditorRailZIndex).toBeGreaterThan(firstFloatingLayerZIndex);
    const firstFloatingHandleBeforeSecondUndock =
      firstFloatingWindowBeforeSecondUndock.getByTestId(
        "project-chat-floating-window-drag-handle",
      );
    const firstFloatingComposerBeforeSecondUndock =
      firstFloatingWindowBeforeSecondUndock.getByTestId("chat-input-textarea");
    await expect(firstFloatingComposerBeforeSecondUndock).toBeVisible();
    const firstFloatingBoundsBeforeSecondUndock =
      await firstFloatingWindowBeforeSecondUndock.boundingBox();
    if (!firstFloatingBoundsBeforeSecondUndock) {
      throw new Error(
        "Expected first floating window bounds before second undock.",
      );
    }
    const firstFloatingComposerBoundsBeforeSecondUndock =
      await firstFloatingComposerBeforeSecondUndock.boundingBox();
    if (!firstFloatingComposerBoundsBeforeSecondUndock) {
      throw new Error("Expected first floating composer bounds.");
    }
    const floatingComposerBottomGap =
      firstFloatingBoundsBeforeSecondUndock.y +
      firstFloatingBoundsBeforeSecondUndock.height -
      (firstFloatingComposerBoundsBeforeSecondUndock.y +
        firstFloatingComposerBoundsBeforeSecondUndock.height);
    expect(floatingComposerBottomGap).toBeLessThan(140);
    const firstHandleBoundsBeforeSecondUndock =
      await firstFloatingHandleBeforeSecondUndock.boundingBox();
    if (!firstHandleBoundsBeforeSecondUndock) {
      throw new Error(
        "Expected first floating drag handle before second undock.",
      );
    }
    await page.mouse.move(
      firstHandleBoundsBeforeSecondUndock.x +
        firstHandleBoundsBeforeSecondUndock.width / 2,
      firstHandleBoundsBeforeSecondUndock.y +
        firstHandleBoundsBeforeSecondUndock.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      firstHandleBoundsBeforeSecondUndock.x +
        firstHandleBoundsBeforeSecondUndock.width / 2 -
        640,
      firstHandleBoundsBeforeSecondUndock.y +
        firstHandleBoundsBeforeSecondUndock.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();
    await page.getByTestId("project-chat-bottom-dock-create").click();
    await page
      .getByTestId("project-chat-bottom-dock-window-panel")
      .last()
      .getByTestId("project-chat-window-undock")
      .click();

    const floatingWindows = page.getByTestId("project-chat-floating-window");
    await expect(floatingWindows).toHaveCount(2);

    const floatingWindowIds = await floatingWindows.evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-chat-window-instance-id"))
        .filter((value): value is string => Boolean(value)),
    );
    if (floatingWindowIds.length < 2) {
      throw new Error("Expected at least two floating chat window ids.");
    }
    const firstWindowId = floatingWindowIds[0];
    const secondWindowId = floatingWindowIds[1];
    const firstWindow = page.locator(
      `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${firstWindowId}"]`,
    );
    const secondWindow = page.locator(
      `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${secondWindowId}"]`,
    );
    const firstWindowDragHandle = firstWindow.getByTestId(
      "project-chat-floating-window-drag-handle",
    );
    const secondWindowDragHandle = secondWindow.getByTestId(
      "project-chat-floating-window-drag-handle",
    );

    const resizableWindow = secondWindow;
    const resizableWindowBeforeResize = await resizableWindow.boundingBox();
    if (!resizableWindowBeforeResize) {
      throw new Error(
        "Expected resizable floating window bounds before resize.",
      );
    }
    const bottomRightResizeHandle = resizableWindow.locator(
      '[data-testid="project-chat-floating-window-resize-handle"][data-resize-direction="bottom_right"]',
    );
    const bottomRightResizeHandleBounds =
      await bottomRightResizeHandle.boundingBox();
    if (!bottomRightResizeHandleBounds) {
      throw new Error("Expected floating bottom-right resize handle bounds.");
    }
    await page.mouse.move(
      bottomRightResizeHandleBounds.x + bottomRightResizeHandleBounds.width / 2,
      bottomRightResizeHandleBounds.y +
        bottomRightResizeHandleBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      bottomRightResizeHandleBounds.x +
        bottomRightResizeHandleBounds.width / 2 +
        120,
      bottomRightResizeHandleBounds.y +
        bottomRightResizeHandleBounds.height / 2 +
        40,
      { steps: 8 },
    );
    await page.mouse.up();

    const topResizeHandle = resizableWindow.locator(
      '[data-testid="project-chat-floating-window-resize-handle"][data-resize-direction="top"]',
    );
    const topResizeHandleBounds = await topResizeHandle.boundingBox();
    if (!topResizeHandleBounds) {
      throw new Error("Expected floating top resize handle bounds.");
    }
    await page.mouse.move(
      topResizeHandleBounds.x + topResizeHandleBounds.width / 2,
      topResizeHandleBounds.y + topResizeHandleBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      topResizeHandleBounds.x + topResizeHandleBounds.width / 2,
      topResizeHandleBounds.y + topResizeHandleBounds.height / 2 - 110,
      { steps: 8 },
    );
    await page.mouse.up();

    const resizableWindowAfterResize = await resizableWindow.boundingBox();
    if (!resizableWindowAfterResize) {
      throw new Error("Expected floating window bounds after resize.");
    }
    expect(resizableWindowAfterResize.width).toBeGreaterThan(
      resizableWindowBeforeResize.width + 80,
    );
    expect(resizableWindowAfterResize.height).toBeGreaterThan(
      resizableWindowBeforeResize.height + 80,
    );

    const getZIndex = async (locator: Locator) => {
      const value = await locator.evaluate(
        (node) => window.getComputedStyle(node).zIndex,
      );
      return Number.parseInt(value, 10);
    };

    await secondWindowDragHandle.click();
    await page.keyboard.press(`${modKey}+Shift+Enter`);
    await expect(
      page.getByTestId("project-chat-maximized-window"),
    ).toBeVisible();
    await expect(page.getByTestId("project-chat-floating-window")).toHaveCount(
      1,
    );

    await page.getByTestId("project-chat-window-restore").click();
    await expect(page.getByTestId("project-chat-maximized-window")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("project-chat-floating-window")).toHaveCount(
      2,
    );

    const resizableWindowAfterRestore = await resizableWindow.boundingBox();
    if (!resizableWindowAfterRestore) {
      throw new Error("Expected restored floating window bounds.");
    }
    expect(resizableWindowAfterRestore.width).toBeGreaterThan(
      resizableWindowBeforeResize.width + 80,
    );
    expect(resizableWindowAfterRestore.height).toBeGreaterThan(
      resizableWindowBeforeResize.height + 80,
    );

    const firstZBefore = await getZIndex(firstWindow);
    const secondZBefore = await getZIndex(secondWindow);
    expect(secondZBefore).toBeGreaterThan(firstZBefore - 1);

    const firstWindowBoundsAfterRestore = await firstWindow.boundingBox();
    if (!firstWindowBoundsAfterRestore) {
      throw new Error("Expected first floating window bounds after restore.");
    }
    await page.mouse.click(
      firstWindowBoundsAfterRestore.x + 24,
      firstWindowBoundsAfterRestore.y + 16,
    );
    const firstZAfterFocus = await getZIndex(firstWindow);
    const secondZAfterFocus = await getZIndex(secondWindow);
    expect(firstZAfterFocus).toBeGreaterThan(secondZAfterFocus);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat floating windows show inline threads and chat together when resized wide", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const floatingWindow = await ensureFloatingWindow(page);

    const resizeHandle = floatingWindow.locator(
      '[data-testid="project-chat-floating-window-resize-handle"][data-resize-direction="bottom_right"]',
    );
    const resizeBounds = await resizeHandle.boundingBox();
    if (!resizeBounds) {
      throw new Error(
        "Expected floating resize handle bounds for wide inline threads check.",
      );
    }
    const resizeStartX = resizeBounds.x + resizeBounds.width / 2;
    const resizeStartY = resizeBounds.y + resizeBounds.height / 2;
    await page.mouse.move(resizeStartX, resizeStartY);
    await page.mouse.down();
    await page.mouse.move(resizeStartX + 520, resizeStartY + 80, {
      steps: 10,
    });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const bounds = await floatingWindow.boundingBox();
        return bounds?.width ?? 0;
      })
      .toBeGreaterThan(820);

    await page.evaluate(async () => {
      const { useAIStore } = await import("/src/state/definitions.ts");
      useAIStore.setState({
        viewThreads: false,
        projectChatThreadsExplicitlyClosedAtLargeWidth: false,
      });
    });

    await floatingWindow.getByRole("button", { name: "View Threads" }).click();

    const inlineThreadsPanel = floatingWindow.getByTestId(
      "project-chat-threads-panel",
    );
    await expect(inlineThreadsPanel).toBeVisible();
    await expect(inlineThreadsPanel).toHaveAttribute("data-inline", "true");
    await expect(
      floatingWindow.getByTestId("chat-input-textarea"),
    ).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat floating windows keep conversation search inline until narrow widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const floatingWindow = await ensureFloatingWindow(page);
    const instanceId = await floatingWindow.getAttribute(
      "data-chat-window-instance-id",
    );
    if (!instanceId) {
      throw new Error("Expected floating window instance id.");
    }

    await page.evaluate(async (targetInstanceId) => {
      const { setProjectChatWindowBounds } = await import(
        "/src/state/actions/projectChatWindowing.ts"
      );
      const { useProjectState } = await import("/src/state/definitions.ts");
      const instance =
        useProjectState.getState().projectChatWindowing.instancesById[
          targetInstanceId
        ];
      if (!instance) {
        throw new Error(`Missing project chat window ${targetInstanceId}.`);
      }
      setProjectChatWindowBounds(targetInstanceId, {
        ...instance.bounds,
        width: 360,
        height: Math.max(instance.bounds.height, 360),
      });
    }, instanceId);

    await expect
      .poll(async () =>
        Math.round((await floatingWindow.boundingBox())?.width ?? 0),
      )
      .toBeLessThanOrEqual(400);

    const newChatButton = floatingWindow.getByRole("button", {
      name: "New Chat",
    });
    const settingsButton = floatingWindow.getByRole("button", {
      name: "Project AI Settings",
    });
    const conversationFilter = floatingWindow.getByTestId(
      "project-chat-conversation-filter",
    );
    await expect(newChatButton).toBeVisible();
    await expect(settingsButton).toBeVisible();
    await expect(conversationFilter).toBeVisible();

    const newChatBox = await newChatButton.boundingBox();
    const settingsBox = await settingsButton.boundingBox();
    const conversationFilterBox = await conversationFilter.boundingBox();
    if (!newChatBox || !settingsBox || !conversationFilterBox) {
      throw new Error("Expected project chat header controls.");
    }

    const filterCenterY =
      conversationFilterBox.y + conversationFilterBox.height / 2;
    const newChatCenterY = newChatBox.y + newChatBox.height / 2;
    const settingsCenterY = settingsBox.y + settingsBox.height / 2;

    expect(Math.abs(filterCenterY - newChatCenterY)).toBeLessThan(16);
    expect(Math.abs(filterCenterY - settingsCenterY)).toBeLessThan(16);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
