import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

type FloatingWindowMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
  visibleWidth: number;
  viewportWidth: number;
  viewportHeight: number;
  workspaceTopInset: number;
  bottomInset: number;
};

type CanvasDomRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type FlowPoint = {
  x: number;
  y: number;
};

type ProjectChatCanvasBinding = {
  placement: string;
  sectionId: string | null;
  positionX: number | null;
  positionY: number | null;
};

const SIDE_RAIL_WIDTH_PX = 40;
const FLOATING_TITLE_BAR_HEIGHT_PX = 32;
const WORKSPACE_TOP_INSET_FALLBACK_PX = 40;

function getFloatingWorkArea(metrics: FloatingWindowMetrics): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} {
  const left = SIDE_RAIL_WIDTH_PX;
  const top =
    metrics.workspaceTopInset > 0
      ? metrics.workspaceTopInset
      : WORKSPACE_TOP_INSET_FALLBACK_PX;
  const right = metrics.viewportWidth - SIDE_RAIL_WIDTH_PX;
  const bottom = metrics.viewportHeight - metrics.bottomInset;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

async function getFloatingWindowMetrics(
  floatingWindow: Locator,
): Promise<FloatingWindowMetrics> {
  return floatingWindow.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const pane = document.querySelector(".react-flow__pane");
    const workspaceTopInset =
      pane instanceof HTMLElement ? pane.getBoundingClientRect().top : 0;
    const viewModeTabs = document.querySelector(
      '[data-testid="view-mode-tabs-bar"]',
    );
    let bottomInset = 0;
    if (viewModeTabs instanceof HTMLElement) {
      const tabsRect = viewModeTabs.getBoundingClientRect();
      if (
        tabsRect.height > 0 &&
        tabsRect.top >= window.innerHeight - tabsRect.height - 2
      ) {
        bottomInset = tabsRect.height;
      }
    }
    const visibleWidth = Math.max(
      0,
      Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
    );
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      visibleWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      workspaceTopInset,
      bottomInset,
    };
  });
}

async function getWorkspaceTopInset(page: Page): Promise<number> {
  return page.evaluate(() => {
    const pane = document.querySelector(".react-flow__pane");
    if (pane instanceof HTMLElement) {
      const topInset = pane.getBoundingClientRect().top;
      if (Number.isFinite(topInset) && topInset > 0) {
        return topInset;
      }
    }
    return 40;
  });
}

async function getCanvasDomRect(page: Page): Promise<CanvasDomRect | null> {
  return page.evaluate(async () => {
    const { useReactFlow } = await import(
      "/src/forks/xyflow/core/store/index.ts"
    );
    const domNode = useReactFlow.getState().domNode;
    if (!domNode) {
      return null;
    }
    const rect = domNode.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  });
}

async function getFlowPositionFromScreenPoint(
  page: Page,
  screenPoint: FlowPoint,
): Promise<FlowPoint> {
  return page.evaluate(async (point) => {
    const { screenToFlowPosition } = await import(
      "/src/forks/xyflow/core/hooks/useViewportHelper.ts"
    );
    return screenToFlowPosition(point);
  }, screenPoint);
}

async function getProjectChatCanvasBinding(
  page: Page,
  instanceId: string,
): Promise<ProjectChatCanvasBinding | null> {
  return page.evaluate(async (targetInstanceId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const state = useProjectState.getState();
    const instance = state.projectChatWindowing.instancesById[targetInstanceId];
    if (!instance) {
      return null;
    }
    const sectionId = instance.sectionIdOrNull;
    if (!sectionId) {
      return {
        placement: instance.placement,
        sectionId: null,
        positionX: null,
        positionY: null,
      };
    }
    const topLevelLayout = state.projectConfig.topLevelSections[sectionId];
    if (!topLevelLayout) {
      return {
        placement: instance.placement,
        sectionId,
        positionX: null,
        positionY: null,
      };
    }
    return {
      placement: instance.placement,
      sectionId,
      positionX: topLevelLayout.x,
      positionY: topLevelLayout.y,
    };
  }, instanceId);
}

async function collapseSidePanesForWindowInteraction(
  page: Page,
): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage } = await import("/src/state/definitions.ts");
    useLocalStorage.setState({
      overviewVis: false,
      uiEditorVis: false,
    });
  });
}

test("project chat bottom dock auto-creates a chat and supports creating additional windows", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const strip = page.getByTestId("project-chat-bottom-dock-strip");
    await expect(strip).toBeVisible();

    const dockWindow = page.getByTestId("project-chat-bottom-dock-window");
    await expect(dockWindow).toBeVisible();
    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error("Expected viewport size for dock width assertions.");
    }
    const dockWindowBounds = await dockWindow.boundingBox();
    if (!dockWindowBounds) {
      throw new Error("Expected dock window bounds for width assertions.");
    }
    const workspaceTopInset = await getWorkspaceTopInset(page);
    expect(dockWindowBounds.width).toBeLessThan(viewport.width - 80);
    expect(
      Math.abs(dockWindowBounds.y - workspaceTopInset),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(dockWindowBounds.y + dockWindowBounds.height - viewport.height),
    ).toBeLessThanOrEqual(2);
    const dockWindowBackgroundColor = await dockWindow.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    expect(dockWindowBackgroundColor).not.toBe("rgb(255, 255, 255)");

    const createButton = page.getByTestId("project-chat-bottom-dock-create");
    const createButtonBounds = await createButton.boundingBox();
    const stripBounds = await strip.boundingBox();
    if (!createButtonBounds || !stripBounds) {
      throw new Error("Expected create and strip bounds for floating checks.");
    }
    expect(createButtonBounds.y).toBeLessThan(
      stripBounds.y + stripBounds.height,
    );
    expect(
      createButtonBounds.y + createButtonBounds.height,
    ).toBeGreaterThanOrEqual(stripBounds.y - 10);
    expect(createButtonBounds.x).toBeGreaterThan(
      stripBounds.x + stripBounds.width - 120,
    );

    const pills = page.getByTestId("project-chat-bottom-dock-pill");
    const initialPillCount = await pills.count();
    expect(initialPillCount).toBe(0);

    await createButton.click();
    await expect(page.getByTestId("project-chat-bottom-dock-pill")).toHaveCount(
      0,
    );
    const dockPanels = page.getByTestId(
      "project-chat-bottom-dock-window-panel",
    );
    const initialPanelCount = await dockPanels.count();
    await createButton.click();

    await expect(dockPanels).toHaveCount(initialPanelCount + 1);
    const firstDockPanelBounds = await dockPanels.first().boundingBox();
    const secondDockPanelBounds = await dockPanels.nth(1).boundingBox();
    if (!firstDockPanelBounds || !secondDockPanelBounds) {
      throw new Error("Expected dock panel bounds for separation checks.");
    }
    const dockPanelGap =
      secondDockPanelBounds.x -
      (firstDockPanelBounds.x + firstDockPanelBounds.width);
    expect(dockPanelGap).toBeGreaterThan(4);

    const firstResizeHandle = page
      .locator(
        '[data-testid="project-chat-bottom-dock-resize-handle"][data-resize-direction="right"]',
      )
      .first();
    const firstResizeHandleBounds = await firstResizeHandle.boundingBox();
    if (!firstResizeHandleBounds) {
      throw new Error("Expected first dock resize handle bounds.");
    }
    const handleX =
      firstResizeHandleBounds.x + firstResizeHandleBounds.width / 2;
    const handleY =
      firstResizeHandleBounds.y + firstResizeHandleBounds.height / 2;
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 80, handleY, { steps: 8 });
    await page.mouse.up();

    const minimizeButton = page
      .getByTestId("project-chat-window-minimize")
      .last();
    await minimizeButton.click();
    await expect(page.getByTestId("project-chat-bottom-dock-pill")).toHaveCount(
      1,
    );
    await expect(dockPanels).toHaveCount(initialPanelCount);
    await expect(firstResizeHandle).toBeVisible();

    await page.getByTestId("project-chat-bottom-dock-pill").first().click();
    await expect(page.getByTestId("project-chat-bottom-dock-pill")).toHaveCount(
      0,
    );
    await expect(dockPanels).toHaveCount(initialPanelCount + 1);

    await page.getByTestId("overview-tab-project-ai-chat").click();
    await expect(
      page.getByTestId("project-chat-bottom-dock-strip"),
    ).toBeVisible();
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat bottom dock overflows to cycling controls when many windows are open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const cycleRight = page.getByTestId("project-chat-bottom-dock-cycle-right");
    const cycleLeft = page.getByTestId("project-chat-bottom-dock-cycle-left");
    const createButton = page.getByTestId("project-chat-bottom-dock-create");
    let cycleControlsVisible = false;
    for (let i = 0; i < 12; i += 1) {
      await createButton.click();
      const minimizeButtons = page.getByRole("button", {
        name: /^Minimize /,
      });
      const minimizeButtonCount = await minimizeButtons.count();
      if (minimizeButtonCount > 0) {
        await minimizeButtons.nth(minimizeButtonCount - 1).click();
      }
      cycleControlsVisible = await cycleRight.isVisible().catch(() => false);
      if (cycleControlsVisible) {
        break;
      }
    }

    expect(cycleControlsVisible).toBe(true);
    await expect(cycleRight).toBeVisible();
    await expect(cycleLeft).toBeVisible();
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
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const dockWindow = page.getByTestId("project-chat-bottom-dock-window");
    if ((await dockWindow.count()) === 0) {
      await page.getByTestId("project-chat-bottom-dock-create").click();
    }
    await page.getByTestId("project-chat-window-maximize").last().click();
    const maximizedWindow = page.getByTestId("project-chat-maximized-window");
    await expect(maximizedWindow).toBeVisible();

    const toggle = page.getByTestId("project-chat-canvas-visibility-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText("Show canvas");
    await expect(maximizedWindow).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveText("Show chats");
    await expect(page.getByTestId("project-chat-maximized-window")).toHaveCount(
      0,
    );

    await toggle.click();
    await expect(toggle).toHaveText("Show canvas");
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
    await page.waitForSelector(".react-flow__pane");
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
    ).toHaveText("Show chats");

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
    ).toHaveText("Show canvas");
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
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const isMac = await page.evaluate(() =>
      navigator.userAgent.includes("Mac"),
    );
    const modKey = isMac ? "Meta" : "Control";

    await page.getByTestId("project-chat-bottom-dock-create").click();
    await page.getByTestId("project-chat-window-undock").last().press("Enter");

    const floatingWindow = page
      .getByTestId("project-chat-floating-window")
      .first();
    await expect(floatingWindow).toBeVisible();
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

test("project chat windows support floating drag/resize, z-order focus, and maximize restore", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    await page.getByTestId("project-chat-bottom-dock-create").click();
    await page.getByTestId("project-chat-window-undock").last().press("Enter");
    const firstFloatingWindowBeforeSecondUndock = page
      .getByTestId("project-chat-floating-window")
      .first();
    await expect(firstFloatingWindowBeforeSecondUndock).toBeVisible();
    const firstFloatingHandleBeforeSecondUndock =
      firstFloatingWindowBeforeSecondUndock.getByTestId(
        "project-chat-floating-window-drag-handle",
      );
    const firstFloatingComposerBeforeSecondUndock =
      firstFloatingWindowBeforeSecondUndock.getByPlaceholder(
        "Type a message...",
      );
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
        firstHandleBoundsBeforeSecondUndock.width / 2 +
        640,
      firstHandleBoundsBeforeSecondUndock.y +
        firstHandleBoundsBeforeSecondUndock.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();
    await page.getByTestId("project-chat-window-undock").last().press("Enter");

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
    const leftResizeHandle = resizableWindow.locator(
      '[data-testid="project-chat-floating-window-resize-handle"][data-resize-direction="left"]',
    );
    const leftResizeHandleBounds = await leftResizeHandle.boundingBox();
    if (!leftResizeHandleBounds) {
      throw new Error("Expected floating left resize handle bounds.");
    }
    await page.mouse.move(
      leftResizeHandleBounds.x + leftResizeHandleBounds.width / 2,
      leftResizeHandleBounds.y + leftResizeHandleBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      leftResizeHandleBounds.x + leftResizeHandleBounds.width / 2 - 120,
      leftResizeHandleBounds.y + leftResizeHandleBounds.height / 2,
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

    await resizableWindow.getByTestId("project-chat-window-maximize").click();
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

    await firstWindowDragHandle.click();
    const firstZAfterFocus = await getZIndex(firstWindow);
    const secondZAfterFocus = await getZIndex(secondWindow);
    expect(firstZAfterFocus).toBeGreaterThan(secondZAfterFocus);
  } finally {
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

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    await page.getByTestId("project-chat-bottom-dock-create").click();
    await page.getByTestId("project-chat-window-undock").last().press("Enter");

    const floatingWindow = page
      .getByTestId("project-chat-floating-window")
      .first();
    await expect(floatingWindow).toBeVisible();

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
      floatingWindow.getByPlaceholder("Type a message..."),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat floating windows keep titlebar and minimum visibility guardrails across drag/resize/viewport changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    await page.getByTestId("project-chat-bottom-dock-create").click();
    await page.getByTestId("project-chat-window-undock").last().press("Enter");

    const floatingWindow = page
      .getByTestId("project-chat-floating-window")
      .first();
    await expect(floatingWindow).toBeVisible();

    const floatingDragHandle = floatingWindow.getByTestId(
      "project-chat-floating-window-drag-handle",
    );
    const moveByDragHandle = async (deltaX: number, deltaY: number) => {
      const dragBounds = await floatingDragHandle.boundingBox();
      if (!dragBounds) {
        throw new Error("Expected floating drag handle bounds.");
      }
      const startX = dragBounds.x + dragBounds.width / 2;
      const startY = dragBounds.y + dragBounds.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
      await page.mouse.up();
    };

    await moveByDragHandle(-2600, -1800);
    let metrics = await getFloatingWindowMetrics(floatingWindow);
    let workArea = getFloatingWorkArea(metrics);
    expect(metrics.visibleWidth).toBeGreaterThanOrEqual(118);
    expect(metrics.top).toBeGreaterThanOrEqual(workArea.top - 0.5);
    expect(metrics.top).toBeLessThanOrEqual(
      workArea.bottom - FLOATING_TITLE_BAR_HEIGHT_PX + 0.5,
    );

    await moveByDragHandle(3200, 2200);
    metrics = await getFloatingWindowMetrics(floatingWindow);
    workArea = getFloatingWorkArea(metrics);
    expect(metrics.visibleWidth).toBeGreaterThanOrEqual(118);
    expect(metrics.top).toBeGreaterThanOrEqual(workArea.top - 0.5);
    expect(metrics.top).toBeLessThanOrEqual(
      workArea.bottom - FLOATING_TITLE_BAR_HEIGHT_PX + 0.5,
    );

    const resizeHandle = floatingWindow.locator(
      '[data-testid="project-chat-floating-window-resize-handle"][data-resize-direction="bottom_right"]',
    );
    const resizeByHandle = async (deltaX: number, deltaY: number) => {
      const resizeBounds = await resizeHandle.boundingBox();
      if (!resizeBounds) {
        throw new Error("Expected floating resize handle bounds.");
      }
      const startX = resizeBounds.x + resizeBounds.width / 2;
      const startY = resizeBounds.y + resizeBounds.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
      await page.mouse.up();
    };

    await resizeByHandle(-2600, -2000);
    const minimumSizeMetrics = await getFloatingWindowMetrics(floatingWindow);
    expect(minimumSizeMetrics.width).toBeGreaterThanOrEqual(379);
    expect(minimumSizeMetrics.height).toBeGreaterThanOrEqual(239);

    await resizeByHandle(1200, 900);
    const largerSizeMetrics = await getFloatingWindowMetrics(floatingWindow);
    expect(largerSizeMetrics.width).toBeGreaterThan(
      minimumSizeMetrics.width + 200,
    );
    expect(largerSizeMetrics.height).toBeGreaterThan(
      minimumSizeMetrics.height + 150,
    );

    await page.setViewportSize({ width: 880, height: 620 });
    await expect
      .poll(
        async () =>
          (await getFloatingWindowMetrics(floatingWindow)).visibleWidth,
      )
      .toBeGreaterThanOrEqual(118);
    const correctedMetrics = await getFloatingWindowMetrics(floatingWindow);
    const correctedWorkArea = getFloatingWorkArea(correctedMetrics);
    expect(correctedMetrics.top).toBeGreaterThanOrEqual(
      correctedWorkArea.top - 0.5,
    );
    expect(correctedMetrics.top).toBeLessThanOrEqual(
      correctedWorkArea.bottom - FLOATING_TITLE_BAR_HEIGHT_PX + 0.5,
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat floating drag shows snap ghost zones and snaps to quarter/half presets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    await page.getByTestId("project-chat-bottom-dock-create").click();
    await page.getByTestId("project-chat-window-undock").last().press("Enter");

    const floatingWindow = page
      .getByTestId("project-chat-floating-window")
      .first();
    await expect(floatingWindow).toBeVisible();
    const dragHandle = floatingWindow.getByTestId(
      "project-chat-floating-window-drag-handle",
    );
    const ghostZone = page.getByTestId("project-chat-floating-snap-ghost-zone");

    const dragHandleToPoint = async (targetX: number, targetY: number) => {
      const dragHandleBounds = await dragHandle.boundingBox();
      if (!dragHandleBounds) {
        throw new Error("Expected floating drag handle bounds.");
      }
      const startX = dragHandleBounds.x + dragHandleBounds.width / 2;
      const startY = dragHandleBounds.y + dragHandleBounds.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(targetX, targetY, { steps: 20 });
    };

    const viewportSize = page.viewportSize();
    if (!viewportSize) {
      throw new Error("Expected browser viewport size.");
    }

    await dragHandleToPoint(4, 4);
    await expect(ghostZone).toBeVisible();
    await expect(ghostZone).toHaveAttribute(
      "data-chat-window-snap-preset",
      "top_left",
    );
    await page.mouse.up();
    await expect(ghostZone).toHaveCount(0);

    const quarterSnap = await getFloatingWindowMetrics(floatingWindow);
    const quarterSnapWorkArea = getFloatingWorkArea(quarterSnap);
    expect(
      Math.abs(quarterSnap.left - quarterSnapWorkArea.left),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(quarterSnap.top - quarterSnapWorkArea.top),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(quarterSnap.width - quarterSnapWorkArea.width / 2),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(quarterSnap.height - quarterSnapWorkArea.height / 2),
    ).toBeLessThanOrEqual(2);

    await dragHandleToPoint(viewportSize.width - 3, viewportSize.height / 2);
    await expect(ghostZone).toBeVisible();
    await expect(ghostZone).toHaveAttribute(
      "data-chat-window-snap-preset",
      "right",
    );
    await page.mouse.up();
    await expect(ghostZone).toHaveCount(0);

    const rightHalfSnap = await getFloatingWindowMetrics(floatingWindow);
    const rightHalfWorkArea = getFloatingWorkArea(rightHalfSnap);
    expect(
      Math.abs(
        rightHalfSnap.left -
          (rightHalfWorkArea.left + rightHalfWorkArea.width / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(rightHalfSnap.top - rightHalfWorkArea.top),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(rightHalfSnap.width - rightHalfWorkArea.width / 2),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(rightHalfSnap.height - rightHalfWorkArea.height),
    ).toBeLessThanOrEqual(2);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat move-to-canvas uses the last canvas cursor position when available", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await expect
      .poll(() =>
        page.getByTestId("project-chat-window-move-to-canvas").count(),
      )
      .toBeGreaterThanOrEqual(1);
    const firstInstanceId = await page
      .getByTestId("project-chat-window-move-to-canvas")
      .first()
      .getAttribute("data-chat-window-instance-id");
    if (!firstInstanceId) {
      throw new Error("Expected move-to-canvas control with instance id.");
    }

    const canvasRect = await getCanvasDomRect(page);
    if (!canvasRect) {
      throw new Error("Expected react-flow canvas bounds.");
    }

    const insideCursorPoint = {
      x: canvasRect.left + Math.min(canvasRect.width * 0.35, 320),
      y: canvasRect.top + Math.min(canvasRect.height * 0.3, 180),
    };
    const expectedFromCursor = await getFlowPositionFromScreenPoint(
      page,
      insideCursorPoint,
    );
    await page.evaluate(async (cursorPoint) => {
      const { useMisc } = await import("/src/state/definitions.ts");
      useMisc.setState({
        lastMouseDownLocation: cursorPoint,
        lastMouseUpLocation: cursorPoint,
        lastPaneClickLocation: { x: 0, y: 0 },
      });
    }, insideCursorPoint);
    const firstMoveButton = page.locator(
      `[data-testid="project-chat-window-move-to-canvas"][data-chat-window-instance-id="${firstInstanceId}"]`,
    );
    await firstMoveButton.focus();
    await page.keyboard.press("Enter");

    await expect
      .poll(
        async () =>
          (await getProjectChatCanvasBinding(page, firstInstanceId))?.sectionId,
      )
      .not.toBeNull();
    const firstBinding = await getProjectChatCanvasBinding(
      page,
      firstInstanceId,
    );
    if (
      !firstBinding ||
      firstBinding.positionX === null ||
      firstBinding.positionY === null
    ) {
      throw new Error(
        "Expected first canvas binding with section coordinates.",
      );
    }
    expect(firstBinding.placement).toBe("canvas_section");
    expect(
      Math.abs(firstBinding.positionX - expectedFromCursor.x),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(firstBinding.positionY - expectedFromCursor.y),
    ).toBeLessThanOrEqual(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat move-to-canvas falls back to canvas center without canvas cursor history", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await expect
      .poll(() =>
        page.getByTestId("project-chat-window-move-to-canvas").count(),
      )
      .toBeGreaterThanOrEqual(1);
    const instanceId = await page
      .getByTestId("project-chat-window-move-to-canvas")
      .first()
      .getAttribute("data-chat-window-instance-id");
    if (!instanceId) {
      throw new Error("Expected move-to-canvas control with instance id.");
    }

    const canvasRect = await getCanvasDomRect(page);
    if (!canvasRect) {
      throw new Error("Expected react-flow canvas bounds.");
    }
    const centerFallbackPoint = {
      x: canvasRect.left + canvasRect.width / 2,
      y: canvasRect.top + canvasRect.height / 2,
    };
    const expectedFromCenter = await getFlowPositionFromScreenPoint(
      page,
      centerFallbackPoint,
    );
    const viewportSize = page.viewportSize();
    if (!viewportSize) {
      throw new Error("Expected viewport dimensions.");
    }
    let outsideCursorPoint: FlowPoint | null = null;
    if (canvasRect.left > 10) {
      outsideCursorPoint = {
        x: canvasRect.left - 10,
        y: canvasRect.top + Math.min(canvasRect.height / 3, 160),
      };
    } else if (canvasRect.top > 10) {
      outsideCursorPoint = {
        x: canvasRect.left + Math.min(canvasRect.width / 3, 200),
        y: canvasRect.top - 10,
      };
    } else if (canvasRect.right + 10 < viewportSize.width) {
      outsideCursorPoint = {
        x: canvasRect.right + 10,
        y: canvasRect.top + Math.min(canvasRect.height / 3, 160),
      };
    } else if (canvasRect.bottom + 10 < viewportSize.height) {
      outsideCursorPoint = {
        x: canvasRect.left + Math.min(canvasRect.width / 3, 200),
        y: canvasRect.bottom + 10,
      };
    }
    if (!outsideCursorPoint) {
      throw new Error("Unable to find a point outside the react-flow canvas.");
    }
    await page.evaluate(async (cursorPoint) => {
      const { useMisc } = await import("/src/state/definitions.ts");
      useMisc.setState({
        lastMouseDownLocation: cursorPoint,
        lastMouseUpLocation: cursorPoint,
        lastPaneClickLocation: { x: 0, y: 0 },
      });
    }, outsideCursorPoint);
    const moveButton = page.locator(
      `[data-testid="project-chat-window-move-to-canvas"][data-chat-window-instance-id="${instanceId}"]`,
    );
    await moveButton.focus();
    await page.keyboard.press("Enter");

    await expect
      .poll(
        async () =>
          (await getProjectChatCanvasBinding(page, instanceId))?.sectionId,
      )
      .not.toBeNull();
    const secondBinding = await getProjectChatCanvasBinding(page, instanceId);
    if (
      !secondBinding ||
      secondBinding.positionX === null ||
      secondBinding.positionY === null
    ) {
      throw new Error(
        "Expected second canvas binding with section coordinates.",
      );
    }
    expect(secondBinding.placement).toBe("canvas_section");
    expect(
      Math.abs(secondBinding.positionX - expectedFromCenter.x),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(secondBinding.positionY - expectedFromCenter.y),
    ).toBeLessThanOrEqual(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat undock from canvas-section to floating keeps a visual canvas placeholder", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await expect
      .poll(() =>
        page.getByTestId("project-chat-window-move-to-canvas").count(),
      )
      .toBeGreaterThanOrEqual(1);

    const instanceId = await page
      .getByTestId("project-chat-window-move-to-canvas")
      .first()
      .getAttribute("data-chat-window-instance-id");
    if (!instanceId) {
      throw new Error("Expected move-to-canvas control with instance id.");
    }

    await page
      .locator(
        `[data-testid="project-chat-window-move-to-canvas"][data-chat-window-instance-id="${instanceId}"]`,
      )
      .click();
    await expect
      .poll(
        async () =>
          (await getProjectChatCanvasBinding(page, instanceId))?.placement,
      )
      .toBe("canvas_section");
    const canvasBinding = await getProjectChatCanvasBinding(page, instanceId);
    if (!canvasBinding?.sectionId) {
      throw new Error("Expected section binding after move-to-canvas.");
    }

    await page
      .locator(
        `[data-testid="project-chat-window-undock-from-canvas"][data-chat-window-instance-id="${instanceId}"]`,
      )
      .click();

    await expect
      .poll(
        async () =>
          (await getProjectChatCanvasBinding(page, instanceId))?.placement,
      )
      .toBe("floating");
    await expect(
      page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${instanceId}"]`,
      ),
    ).toBeVisible();

    const placeholder = page.locator(
      `[data-testid="project-chat-canvas-floating-placeholder"][data-chat-window-instance-id="${instanceId}"][data-chat-window-section-id="${canvasBinding.sectionId}"]`,
    );
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText("Chat moved to floating window");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
