import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  createTextBlockSection,
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

type HeaderChromeMetrics = {
  surfaceTopLeftRadius: number;
  surfaceTopRightRadius: number;
  iconInsetLeft: number;
  closeInsetRight: number;
  maximizeColor: string;
  minimizeColor: string;
  closeColor: string;
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

function expectBoxShadowToBeCleared(boxShadow: string) {
  expect(boxShadow).toMatch(
    /^(none|(?:rgba\(0, 0, 0, 0\) 0px 0px 0px 0px,?\s*)+)$/,
  );
}

function expectOutlineToBeCleared({
  outlineColor,
  outlineWidth,
}: {
  outlineColor: string;
  outlineWidth: string;
}) {
  const outlineIsTransparent = /^(transparent|rgba\(0, 0, 0, 0\))$/.test(
    outlineColor,
  );
  expect(outlineIsTransparent || outlineWidth === "0px").toBe(true);
}

async function expectNoActiveOutlineOnPointerDown(
  page: Page,
  surface: Locator,
): Promise<void> {
  const bounds = await surface.boundingBox();
  if (!bounds) {
    throw new Error("Expected surface bounds for outline checks.");
  }
  const pointerX = bounds.x + Math.max(24, Math.min(bounds.width / 2, 160));
  const pointerY = bounds.y + Math.max(24, Math.min(bounds.height / 2, 160));
  await page.mouse.move(pointerX, pointerY);
  await page.mouse.down();
  try {
    const outline = await surface.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        outlineColor: style.outlineColor,
        outlineWidth: style.outlineWidth,
      };
    });
    expectOutlineToBeCleared(outline);
  } finally {
    await page.mouse.up();
  }
}

async function getWindowHeaderChromeMetrics(
  surface: Locator,
): Promise<HeaderChromeMetrics> {
  return surface.evaluate((node) => {
    const surfaceElement = node as HTMLElement;
    const header = surfaceElement.querySelector("header.section-title");
    const icon = header?.firstElementChild;
    const title = header?.children.item(1);
    const maximizeButton = header?.querySelector(
      '[data-testid="project-chat-window-maximize"]',
    );
    const minimizeButton = header?.querySelector(
      '[data-testid="project-chat-window-minimize"]',
    );
    const closeButton = header?.querySelector(
      '[data-testid="project-chat-window-close"]',
    );
    if (
      !(header instanceof HTMLElement) ||
      !(icon instanceof HTMLElement) ||
      !(title instanceof HTMLElement) ||
      !(maximizeButton instanceof HTMLElement) ||
      !(minimizeButton instanceof HTMLElement) ||
      !(closeButton instanceof HTMLElement)
    ) {
      throw new Error("Expected window header chrome elements.");
    }
    const surfaceStyle = getComputedStyle(surfaceElement);
    const headerRect = header.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const closeRect = closeButton.getBoundingClientRect();
    return {
      surfaceTopLeftRadius: Number.parseFloat(surfaceStyle.borderTopLeftRadius),
      surfaceTopRightRadius: Number.parseFloat(
        surfaceStyle.borderTopRightRadius,
      ),
      iconInsetLeft: iconRect.left - headerRect.left,
      closeInsetRight: headerRect.right - closeRect.right,
      maximizeColor: getComputedStyle(maximizeButton).color,
      minimizeColor: getComputedStyle(minimizeButton).color,
      closeColor: getComputedStyle(closeButton).color,
    };
  });
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

function getExpectedClampedScreenOrigin(
  sourceRect: { x: number; y: number; width: number; height: number },
  canvasRect: CanvasDomRect,
): FlowPoint {
  const maxX = Math.max(canvasRect.left, canvasRect.right - sourceRect.width);
  const maxY = Math.max(canvasRect.top, canvasRect.bottom - sourceRect.height);
  return {
    x: Math.min(Math.max(sourceRect.x, canvasRect.left), maxX),
    y: Math.min(Math.max(sourceRect.y, canvasRect.top), maxY),
  };
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

async function setActiveSections(
  page: Page,
  sectionIds: string[],
): Promise<void> {
  await page.evaluate(async (ids) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections.ts"
    );
    // Keyboard-driven chat routing should follow the immediate UI selection
    // instead of waiting for the deferred backend-active-id sync.
    setActiveSectionIds(ids, { syncMode: "ui-only" });
  }, sectionIds);
}

async function ensureDockedWindow(page: Page, index = 0): Promise<Locator> {
  const dockedWindow = page
    .getByTestId("project-chat-bottom-dock-window-panel")
    .nth(index);
  await expect(dockedWindow).toBeVisible();
  return dockedWindow;
}

async function ensureFloatingWindow(page: Page, index = 0): Promise<Locator> {
  const floatingWindows = page.getByTestId("project-chat-floating-window");
  if ((await floatingWindows.count()) > index) {
    const floatingWindow = floatingWindows.nth(index);
    await expect(floatingWindow).toBeVisible();
    return floatingWindow;
  }
  const dockedWindow = await ensureDockedWindow(page, index);
  await dockedWindow.getByTestId("project-chat-window-undock").click();
  const floatingWindow = page
    .getByTestId("project-chat-floating-window")
    .last();
  await expect(floatingWindow).toBeVisible();
  return floatingWindow;
}

async function clickDom(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await target.evaluate((element: HTMLElement) => {
    element.click();
  });
}

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
    await page.waitForSelector(".react-flow__pane");
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
    if (
      !minimizedPillBounds ||
      !createButtonBoundsAfterMinimize ||
      !remainingDockPanelBounds
    ) {
      throw new Error(
        "Expected minimized pill, create button, and dock panel bounds.",
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
          (stripBounds.y + stripBounds.height),
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
    await page.waitForSelector(".react-flow__pane");

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
    await page.waitForSelector(".react-flow__pane");
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
    await page.waitForSelector(".react-flow__pane");
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
    await page.waitForSelector(".react-flow__pane");
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
    await page.waitForSelector(".react-flow__pane");
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
    await page.waitForSelector(".react-flow__pane");
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
    await page.waitForSelector(".react-flow__pane");
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
    await expect(floatingWindow.getByTestId("chat-input-textarea")).toBeVisible();
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
    await page.waitForSelector(".react-flow__pane");
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

test("project chat floating windows keep titlebar and minimum visibility guardrails across drag and viewport changes", async ({
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

    const floatingWindow = await ensureFloatingWindow(page);
    const viewportSize = page.viewportSize();
    if (!viewportSize) {
      throw new Error("Expected browser viewport size.");
    }
    const floatingDragHandle = floatingWindow.getByTestId(
      "project-chat-floating-window-drag-handle",
    );
    const dragHandleToPoint = async (targetX: number, targetY: number) => {
      const dragBounds = await floatingDragHandle.boundingBox();
      if (!dragBounds) {
        throw new Error("Expected floating drag handle bounds.");
      }
      const startX = dragBounds.x + dragBounds.width / 2;
      const startY = dragBounds.y + dragBounds.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(targetX, targetY, { steps: 20 });
      await page.mouse.up();
    };
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

    if (
      (await floatingWindow.getAttribute("data-chat-window-snap-preset")) !==
      null
    ) {
      await dragHandleToPoint(
        Math.round(viewportSize.width * 0.58),
        Math.round(viewportSize.height * 0.34),
      );
      await expect
        .poll(async () =>
          floatingWindow.getAttribute("data-chat-window-snap-preset"),
        )
        .toBeNull();
    }

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

    const floatingWindow = await ensureFloatingWindow(page);
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
    await expect(floatingWindow).toHaveAttribute(
      "data-chat-window-snap-preset",
      "top_left",
    );
    const quarterSnapBorderRadius = await floatingWindow.evaluate(
      (node) => getComputedStyle(node).borderRadius,
    );
    expect(quarterSnapBorderRadius).toBe("0px");
    const quarterSnapShadow = await floatingWindow.evaluate(
      (node) => getComputedStyle(node).boxShadow,
    );
    expectBoxShadowToBeCleared(quarterSnapShadow);

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
    await expect(floatingWindow).toHaveAttribute(
      "data-chat-window-snap-preset",
      "right",
    );
    const rightHalfSnapBorderRadius = await floatingWindow.evaluate(
      (node) => getComputedStyle(node).borderRadius,
    );
    expect(rightHalfSnapBorderRadius).toBe("0px");
    const rightHalfSnapShadow = await floatingWindow.evaluate(
      (node) => getComputedStyle(node).boxShadow,
    );
    expectBoxShadowToBeCleared(rightHalfSnapShadow);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat dragging a snapped window restores its previous floating size", async ({
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

    const floatingWindow = await ensureFloatingWindow(page);
    const dragHandle = floatingWindow.getByTestId(
      "project-chat-floating-window-drag-handle",
    );
    const initialBounds = await floatingWindow.boundingBox();
    if (!initialBounds) {
      throw new Error("Expected initial floating window bounds.");
    }

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
      await page.mouse.up();
    };

    const viewportSize = page.viewportSize();
    if (!viewportSize) {
      throw new Error("Expected browser viewport size.");
    }

    await dragHandleToPoint(viewportSize.width - 3, viewportSize.height / 2);
    await expect(floatingWindow).toHaveAttribute(
      "data-chat-window-snap-preset",
      "right",
    );

    await dragHandleToPoint(
      Math.round(viewportSize.width * 0.58),
      Math.round(viewportSize.height * 0.34),
    );

    await expect
      .poll(async () =>
        floatingWindow.getAttribute("data-chat-window-snap-preset"),
      )
      .toBeNull();

    const restoredBounds = await floatingWindow.boundingBox();
    if (!restoredBounds) {
      throw new Error("Expected restored floating window bounds after unsnap.");
    }

    expect(
      Math.abs(restoredBounds.width - initialBounds.width),
    ).toBeLessThanOrEqual(24);
    expect(
      Math.abs(restoredBounds.height - initialBounds.height),
    ).toBeLessThanOrEqual(24);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat dragging a snapped window with no prior floating bounds falls back to the default floating size", async ({
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

    const created = await page.evaluate(async () => {
      const [windowing, generatedTypes, snapLayout] = await Promise.all([
        import("/src/state/actions/projectChatWindowing.ts"),
        import("/src/utils/generatedTypes.ts"),
        import("/src/components/ChatWindowing/projectChatSnapLayout.ts"),
      ]);
      const pane = document.querySelector(".react-flow__pane");
      const workspaceTopInsetPx =
        pane instanceof HTMLElement ? pane.getBoundingClientRect().top : 40;
      const viewModeTabs = document.querySelector(
        '[data-testid="view-mode-tabs-bar"]',
      );
      let bottomInsetPx = 0;
      if (viewModeTabs instanceof HTMLElement) {
        const tabsRect = viewModeTabs.getBoundingClientRect();
        if (
          tabsRect.height > 0 &&
          tabsRect.top >= window.innerHeight - tabsRect.height - 2
        ) {
          bottomInsetPx = tabsRect.height;
        }
      }
      const snappedBounds = snapLayout.buildFloatingSnapBounds(
        "right",
        window.innerWidth,
        window.innerHeight,
        {
          left: 40,
          right: 40,
          top: workspaceTopInsetPx,
          bottom: bottomInsetPx,
        },
      );
      const expectedDefaultBounds = windowing.resolveDefaultFloatingChatBounds({
        viewportWidthPx: window.innerWidth,
        viewportHeightPx: window.innerHeight,
        workspaceTopInsetPx,
        bottomInsetPx,
        sideRailWidthPx: 40,
        minWidthPx: 380,
        minHeightPx: 240,
      });
      const instanceId = windowing.createProjectChatWindowInstance({
        placement: generatedTypes.ChatWindowPlacementEnum.floating,
        bounds: snappedBounds,
      });
      return {
        instanceId,
        expectedDefaultBounds,
      };
    });

    const floatingWindow = page.locator(
      `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${created.instanceId}"]`,
    );
    await expect(floatingWindow).toBeVisible();
    await expect(floatingWindow).toHaveAttribute(
      "data-chat-window-snap-preset",
      "right",
    );

    const dragHandle = floatingWindow.getByTestId(
      "project-chat-floating-window-drag-handle",
    );
    const dragHandleBounds = await dragHandle.boundingBox();
    if (!dragHandleBounds) {
      throw new Error("Expected snapped floating drag handle bounds.");
    }
    const viewportSize = page.viewportSize();
    if (!viewportSize) {
      throw new Error("Expected browser viewport size.");
    }

    const startX = dragHandleBounds.x + dragHandleBounds.width / 2;
    const startY = dragHandleBounds.y + dragHandleBounds.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(
      Math.round(viewportSize.width * 0.55),
      Math.round(viewportSize.height * 0.36),
      { steps: 20 },
    );
    await page.mouse.up();

    await expect
      .poll(async () =>
        floatingWindow.getAttribute("data-chat-window-snap-preset"),
      )
      .toBeNull();

    const restoredBounds = await floatingWindow.boundingBox();
    if (!restoredBounds) {
      throw new Error(
        "Expected restored floating window bounds after default unsnap.",
      );
    }

    expect(
      Math.abs(restoredBounds.width - created.expectedDefaultBounds.width),
    ).toBeLessThanOrEqual(24);
    expect(
      Math.abs(restoredBounds.height - created.expectedDefaultBounds.height),
    ).toBeLessThanOrEqual(24);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat snapped quad layout keeps snap mode while shared split handles resize it", async ({
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

    const snapTargets = [
      { preset: "top_left" },
      { preset: "top_right" },
      { preset: "bottom_left" },
      { preset: "bottom_right" },
    ] as const;

    const floatingWindowIds = await page.evaluate(
      async (presets) => {
        const [stateDefinitions, generatedTypes, snapLayout] =
          await Promise.all([
            import("/src/state/definitions.ts"),
            import("/src/utils/generatedTypes.ts"),
            import("/src/components/ChatWindowing/projectChatSnapLayout.ts"),
          ]);
        const pane = document.querySelector(".react-flow__pane");
        const viewModeTabs = document.querySelector(
          '[data-testid="view-mode-tabs-bar"]',
        );
        const workspaceTopInset =
          pane instanceof HTMLElement ? pane.getBoundingClientRect().top : 40;
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
        const instanceIds = presets.map(
          (preset) => `playwright-chat-snap-${preset}`,
        );
        const nextState = generatedTypes.createProjectChatWindowingState({
          instancesById: Object.fromEntries(
            instanceIds.map((instanceId, index) => [
              instanceId,
              generatedTypes.createProjectChatWindowInstance({
                instanceId,
                placement: generatedTypes.ChatWindowPlacementEnum.floating,
                bounds: snapLayout.buildFloatingSnapBounds(
                  presets[index],
                  window.innerWidth,
                  window.innerHeight,
                  {
                    left: 40,
                    right: 40,
                    top: workspaceTopInset > 0 ? workspaceTopInset : 40,
                    bottom: bottomInset,
                  },
                ),
                zIndex: index + 1,
              }),
            ]),
          ),
          order: instanceIds,
          nextInstanceNumber: 1,
        });
        stateDefinitions.useProjectState.setState((state) => {
          state.projectChatWindowing = nextState;
        });
        return instanceIds;
      },
      snapTargets.map((target) => target.preset),
    );

    const floatingWindows = page.getByTestId("project-chat-floating-window");
    await expect(floatingWindows).toHaveCount(4);
    const resolvedSnapTargets = snapTargets.map((target, index) => ({
      ...target,
      id: floatingWindowIds[index] ?? "",
    }));
    for (const snapTarget of resolvedSnapTargets) {
      const floatingWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${snapTarget.id}"]`,
      );
      await expect(floatingWindow).toHaveAttribute(
        "data-chat-window-snap-preset",
        snapTarget.preset,
      );
      await expect(
        floatingWindow.getByTestId(
          "project-chat-floating-window-resize-handle",
        ),
      ).toHaveCount(0);
    }

    const verticalHandle = page.locator(
      '[data-testid="project-chat-floating-snap-resize-handle"][data-resize-axis="vertical"]',
    );
    const horizontalHandle = page.locator(
      '[data-testid="project-chat-floating-snap-resize-handle"][data-resize-axis="horizontal"]',
    );
    await expect(verticalHandle).toHaveCount(1);
    await expect(horizontalHandle).toHaveCount(1);

    for (const snapTarget of resolvedSnapTargets) {
      await expect(
        page.locator(
          `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${snapTarget.id}"]`,
        ),
      ).toHaveAttribute("data-chat-window-snap-preset", snapTarget.preset);
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat move-to-canvas anchors new canvas chats to the visible source window instead of the last cursor point", async ({
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
        page.getByTestId("project-chat-window-show-in-canvas").count(),
      )
      .toBeGreaterThanOrEqual(1);
    const firstInstanceId = await page
      .getByTestId("project-chat-window-show-in-canvas")
      .first()
      .getAttribute("data-chat-window-instance-id");
    if (!firstInstanceId) {
      throw new Error("Expected move-to-canvas control with instance id.");
    }
    const sourceWindow = page.locator(
      `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${firstInstanceId}"]`,
    );
    await expect(sourceWindow).toBeVisible();
    const sourceWindowBox = await sourceWindow.boundingBox();
    if (!sourceWindowBox) {
      throw new Error("Expected visible source docked window bounds.");
    }

    const canvasRect = await getCanvasDomRect(page);
    if (!canvasRect) {
      throw new Error("Expected react-flow canvas bounds.");
    }

    const insideCursorPoint = {
      x: canvasRect.left + Math.min(canvasRect.width * 0.35, 320),
      y: canvasRect.top + Math.min(canvasRect.height * 0.3, 180),
    };
    const expectedFromSource = await getFlowPositionFromScreenPoint(
      page,
      getExpectedClampedScreenOrigin(sourceWindowBox, canvasRect),
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
      `[data-testid="project-chat-window-show-in-canvas"][data-chat-window-instance-id="${firstInstanceId}"]`,
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
      Math.abs(firstBinding.positionX - expectedFromSource.x),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(firstBinding.positionY - expectedFromSource.y),
    ).toBeLessThanOrEqual(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat move-to-canvas failure leaves the source window as the only live host and retries cleanly", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  const failCreateTopLevelSection = async (route: Route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "synthetic canvas boot failure" }),
    });
  };

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const dockedWindow = await ensureDockedWindow(page);
    const instanceId = await dockedWindow.getAttribute(
      "data-chat-window-instance-id",
    );
    if (!instanceId) {
      throw new Error("Expected docked project chat window instance id.");
    }

    await page.route("**/createTopLevelSection", failCreateTopLevelSection);
    allowExpectedApiError(page, {
      path: "/api/createTopLevelSection",
      statuses: [500],
      method: "POST",
    });
    const failedCreateResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/createTopLevelSection") &&
        response.status() === 500,
    );
    await dockedWindow
      .getByTestId("project-chat-window-show-in-canvas")
      .click();
    await failedCreateResponse;

    await expect(
      page.getByTestId("project-chat-bottom-dock-window-panel"),
    ).toHaveCount(1);
    await expect(page.getByTestId("project-chat-floating-window")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("section-window-surface")).toHaveCount(0);
    await expect(
      page.locator(
        `[data-testid="project-chat-window-show-in-canvas"][data-chat-window-instance-id="${instanceId}"]`,
      ),
    ).toBeVisible();
    expect(await getProjectChatCanvasBinding(page, instanceId)).toMatchObject({
      placement: "bottom_docked",
      sectionId: null,
    });

    await page.unroute("**/createTopLevelSection", failCreateTopLevelSection);
    await dockedWindow
      .getByTestId("project-chat-window-show-in-canvas")
      .click();

    await expect
      .poll(
        async () =>
          (await getProjectChatCanvasBinding(page, instanceId))?.sectionId,
      )
      .not.toBeNull();
    expect(
      await page.getByTestId("project-chat-bottom-dock-window-panel").count(),
    ).toBe(0);
  } finally {
    await page
      .unroute("**/createTopLevelSection", failCreateTopLevelSection)
      .catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat windows reopen canvas-bound sections as centered floating windows while keeping section chrome", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);

    const dockedWindow = await ensureDockedWindow(page);
    const instanceId = await dockedWindow.getAttribute(
      "data-chat-window-instance-id",
    );
    if (!instanceId) {
      throw new Error("Expected docked window instance id.");
    }

    await dockedWindow
      .getByTestId("project-chat-window-show-in-canvas")
      .click();
    await expect(
      page.getByTestId("project-chat-bottom-dock-window-panel"),
    ).toHaveCount(0);

    await expect
      .poll(
        async () =>
          (await getProjectChatCanvasBinding(page, instanceId))?.sectionId,
      )
      .not.toBeNull();
    const binding = await getProjectChatCanvasBinding(page, instanceId);
    const sectionId = binding?.sectionId;
    if (!sectionId) {
      throw new Error(
        "Expected a canvas section id after moving chat to canvas.",
      );
    }
    await expect(
      page
        .locator(`section[data-section-id="${sectionId}"]`)
        .getByTestId("project-chat-conversation-filter-input"),
    ).toBeVisible();
    await expect(
      page
        .locator(`section[data-section-id="${sectionId}"]`)
        .locator(
          '[data-chat-surface-host="section_layout"][data-chat-surface-mode="project_ai_mode"]',
        ),
    ).toBeVisible();

    await page.evaluate(async (targetSectionId) => {
      const { showSectionInProjectChatWindow } = await import(
        "/src/state/actions/projectChatWindowing.ts"
      );
      showSectionInProjectChatWindow(targetSectionId);
    }, sectionId);

    const reopenedFloatingWindow = page.locator(
      `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${instanceId}"]`,
    );
    await expect(reopenedFloatingWindow).toBeVisible();
    await expect(
      page.locator(
        `[data-testid="project-chat-canvas-floating-placeholder"][data-chat-window-section-id="${sectionId}"]`,
      ),
    ).toBeVisible();
    await expect(
      reopenedFloatingWindow.getByRole("button", { name: "Follow chat" }),
    ).toBeVisible();
    await expect(
      reopenedFloatingWindow.getByTestId("project-chat-window-close"),
    ).toBeVisible();
    const reopenedFloatingMetrics = await getFloatingWindowMetrics(
      reopenedFloatingWindow,
    );
    const floatingWorkArea = getFloatingWorkArea(reopenedFloatingMetrics);
    expect(
      Math.abs(
        reopenedFloatingMetrics.left -
          (floatingWorkArea.left +
            (floatingWorkArea.width - reopenedFloatingMetrics.width) / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        reopenedFloatingMetrics.top -
          (floatingWorkArea.top +
            (floatingWorkArea.height - reopenedFloatingMetrics.height) / 2),
      ),
    ).toBeLessThanOrEqual(2);
    await page.getByTestId("project-chat-bottom-dock-create").click();
    const dockPanels = page.getByTestId(
      "project-chat-bottom-dock-window-panel",
    );
    await expect(dockPanels).toHaveCount(1);
    const dockInstanceIds = await dockPanels.evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-chat-window-instance-id"))
        .filter((value): value is string => Boolean(value)),
    );
    const plainInstanceId = dockInstanceIds[0];
    if (!plainInstanceId) {
      throw new Error("Expected a plain docked chat window to compare chrome.");
    }
    const plainDockedWindow = page.locator(
      `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${plainInstanceId}"]`,
    );
    await expect(
      reopenedFloatingWindow.getByTestId("section-window-surface"),
    ).toBeVisible();
    await expect(
      plainDockedWindow.getByTestId("project-chat-window-surface"),
    ).toBeVisible();
    const sectionChrome = await getWindowHeaderChromeMetrics(
      reopenedFloatingWindow.getByTestId("section-window-surface"),
    );
    const plainChrome = await getWindowHeaderChromeMetrics(
      plainDockedWindow.getByTestId("project-chat-window-surface"),
    );
    expect(
      Math.abs(
        plainChrome.surfaceTopLeftRadius - sectionChrome.surfaceTopLeftRadius,
      ),
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(
        plainChrome.surfaceTopRightRadius - sectionChrome.surfaceTopRightRadius,
      ),
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(plainChrome.iconInsetLeft - sectionChrome.iconInsetLeft),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(plainChrome.closeInsetRight - sectionChrome.closeInsetRight),
    ).toBeLessThanOrEqual(2);
    expect(plainChrome.maximizeColor).toBe(sectionChrome.maximizeColor);
    expect(plainChrome.minimizeColor).toBe(sectionChrome.minimizeColor);
    expect(plainChrome.closeColor).toBe(sectionChrome.closeColor);
    await expectNoActiveOutlineOnPointerDown(
      page,
      reopenedFloatingWindow.getByTestId("section-window-surface"),
    );

    await page.evaluate(
      async ({ projectConfigId, sectionId: targetSectionId }) => {
        const { route_delete_sections } = await import(
          "/src/utils/generatedEndpoints.ts"
        );
        await route_delete_sections({
          projectConfigId,
          sectionIds: [targetSectionId],
        });
      },
      {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
      },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);
    await expect(reopenedFloatingWindow).toHaveCount(0);
    await expect(plainDockedWindow).toBeVisible();
    await expect(dockPanels).toHaveCount(1);

    const initialViewTabCount = await page
      .getByTestId("view-mode-tab-button")
      .count();
    const createdViewModeId = await page.evaluate(async (projectConfigId) => {
      const { route_create_view_mode, route_toggle_view_mode_tab } =
        await import("/src/utils/generatedEndpoints.ts");
      const response = await route_create_view_mode({ projectConfigId });
      const viewModeId = response.data;
      if (!viewModeId) {
        throw new Error("Expected created view mode id.");
      }
      await route_toggle_view_mode_tab({
        projectConfigId,
        viewModeId,
      });
      return viewModeId;
    }, projectContext.projectConfigId);
    await expect(page.getByTestId("view-mode-tab-button")).toHaveCount(
      initialViewTabCount + 1,
    );
    await page.evaluate(
      async ({ projectConfigId, activeViewModeId }) => {
        const { route_set_active_view_mode } = await import(
          "/src/utils/generatedEndpoints.ts"
        );
        await route_set_active_view_mode({
          projectConfigId,
          activeViewModeId,
        });
      },
      {
        projectConfigId: projectContext.projectConfigId,
        activeViewModeId: createdViewModeId,
      },
    );
    await expect(plainDockedWindow).toBeVisible();
    await expect(dockPanels).toHaveCount(1);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("section pop-out opens above existing floating windows by default", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);
    const { sectionId } = await createTextBlockSection(
      page,
      projectContext.projectConfigId,
      "Research Notes",
    );
    await collapseSidePanesForWindowInteraction(page);
    const baselineFloatingWindowId = await page.evaluate(async () => {
      const { createProjectChatWindowInstance } = await import(
        "/src/state/actions/projectChatWindowing.ts"
      );
      const { ChatWindowPlacementEnum } = await import(
        "/src/utils/generatedTypes.ts"
      );
      return createProjectChatWindowInstance({
        placement: ChatWindowPlacementEnum.floating,
        title: "Baseline Floating Chat",
      });
    });
    const baselineFloatingWindow = page.locator(
      `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${baselineFloatingWindowId}"]`,
    );
    await expect(baselineFloatingWindow).toBeVisible();

    await page.evaluate(async (targetSectionId) => {
      const { showSectionInProjectChatWindow } = await import(
        "/src/state/actions/projectChatWindowing.ts"
      );
      showSectionInProjectChatWindow(targetSectionId);
    }, sectionId);

    const sectionFloatingWindow = page
      .getByTestId("project-chat-floating-window")
      .filter({
        has: page.locator(
          `[data-testid="section-window-surface"][data-section-id="${sectionId}"]`,
        ),
      });
    await expect(sectionFloatingWindow).toBeVisible();
    const zIndices = await Promise.all([
      baselineFloatingWindow.evaluate((node) =>
        Number.parseInt(getComputedStyle(node).zIndex, 10),
      ),
      sectionFloatingWindow.evaluate((node) =>
        Number.parseInt(getComputedStyle(node).zIndex, 10),
      ),
    ]);
    expect(zIndices[1]).toBeGreaterThan(zIndices[0]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("minimized docked section windows keep their section icon in the tray", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);
    const { sectionId } = await createTextBlockSection(
      page,
      projectContext.projectConfigId,
      "Tray Notes",
    );

    await page.evaluate(async (targetSectionId) => {
      const { showSectionInProjectChatWindow } = await import(
        "/src/state/actions/projectChatWindowing.ts"
      );
      const { ChatWindowPlacementEnum } = await import(
        "/src/utils/generatedTypes.ts"
      );
      showSectionInProjectChatWindow(
        targetSectionId,
        ChatWindowPlacementEnum.bottom_docked,
      );
    }, sectionId);

    const dockedSectionWindow = page
      .getByTestId("project-chat-bottom-dock-window-panel")
      .filter({
        has: page.locator(
          `[data-testid="section-window-surface"][data-section-id="${sectionId}"]`,
        ),
      });
    await expect(dockedSectionWindow).toBeVisible();

    await dockedSectionWindow
      .getByTestId("project-chat-window-minimize")
      .click();

    const minimizedPill = page.getByTestId("project-chat-bottom-dock-pill");
    await expect(minimizedPill).toHaveCount(1);
    await expect(
      minimizedPill.first().getByTestId("project-chat-bottom-dock-pill-icon"),
    ).toHaveAttribute("data-chat-window-icon-mode", "section_mode");
    await expect(
      minimizedPill.first().getByTestId("project-chat-bottom-dock-pill-icon"),
    ).toHaveAttribute("data-chat-window-icon-section-type", "TextBlock");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("minimized floating section windows keep their canvas placeholder", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await collapseSidePanesForWindowInteraction(page);
    const { sectionId } = await createTextBlockSection(
      page,
      projectContext.projectConfigId,
      "Hidden Window Notes",
    );

    await page.evaluate(async (targetSectionId) => {
      const { showSectionInProjectChatWindow } = await import(
        "/src/state/actions/projectChatWindowing.ts"
      );
      const { ChatWindowPlacementEnum } = await import(
        "/src/utils/generatedTypes.ts"
      );
      showSectionInProjectChatWindow(
        targetSectionId,
        ChatWindowPlacementEnum.floating,
      );
    }, sectionId);

    const placeholder = page.locator(
      `[data-testid="section-canvas-window-placeholder"][data-chat-window-section-id="${sectionId}"]`,
    );
    await expect(placeholder).toBeVisible();

    const floatingSectionWindow = page
      .getByTestId("project-chat-floating-window")
      .filter({
        has: page.locator(
          `[data-testid="section-window-surface"][data-section-id="${sectionId}"]`,
        ),
      });
    await expect(floatingSectionWindow).toBeVisible();

    await floatingSectionWindow
      .getByTestId("project-chat-window-minimize")
      .click();

    await expect(page.getByTestId("project-chat-bottom-dock-pill")).toHaveCount(
      1,
    );
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText("moved to a window");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project chat move-to-canvas keeps the project-ai surface and the source window size", async ({
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
        page.getByTestId("project-chat-window-show-in-canvas").count(),
      )
      .toBeGreaterThanOrEqual(1);
    const instanceId = await page
      .getByTestId("project-chat-window-show-in-canvas")
      .first()
      .getAttribute("data-chat-window-instance-id");
    if (!instanceId) {
      throw new Error("Expected move-to-canvas control with instance id.");
    }
    const sourceWindow = page.locator(
      `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${instanceId}"]`,
    );
    await expect(sourceWindow).toBeVisible();
    const sourceWindowBox = await sourceWindow.boundingBox();
    if (!sourceWindowBox) {
      throw new Error("Expected visible source docked window bounds.");
    }

    const canvasRect = await getCanvasDomRect(page);
    if (!canvasRect) {
      throw new Error("Expected react-flow canvas bounds.");
    }
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
      `[data-testid="project-chat-window-show-in-canvas"][data-chat-window-instance-id="${instanceId}"]`,
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
      !secondBinding.sectionId ||
      secondBinding.positionX === null ||
      secondBinding.positionY === null
    ) {
      throw new Error(
        "Expected second canvas binding with section coordinates.",
      );
    }
    expect(secondBinding.placement).toBe("canvas_section");
    const expectedFromSource = await getFlowPositionFromScreenPoint(
      page,
      getExpectedClampedScreenOrigin(sourceWindowBox, canvasRect),
    );
    expect(
      Math.abs(secondBinding.positionX - expectedFromSource.x),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(secondBinding.positionY - expectedFromSource.y),
    ).toBeLessThanOrEqual(1);

    const canvasSection = page.locator(
      `section[data-section-id="${secondBinding.sectionId}"]`,
    );
    await expect(canvasSection).toBeVisible();
    await expect(
      canvasSection.locator(
        '[data-chat-surface-host="section_layout"][data-chat-surface-mode="project_ai_mode"]',
      ),
    ).toBeVisible();
    await expect(
      canvasSection.locator(
        '[data-chat-surface-host="section_layout"][data-chat-surface-mode="section_mode"]',
      ),
    ).toHaveCount(0);

    const canvasSectionBox = await canvasSection.boundingBox();
    if (!canvasSectionBox) {
      throw new Error("Expected visible canvas section bounds.");
    }
    const conversationFilterInput = canvasSection.getByTestId(
      "project-chat-conversation-filter-input",
    );
    const composerInput = canvasSection.getByPlaceholder("Type a message...");
    await expect(conversationFilterInput).toBeVisible();
    await expect(composerInput).toBeVisible();
    const conversationFilterBox = await conversationFilterInput.boundingBox();
    const composerInputBox = await composerInput.boundingBox();
    if (!conversationFilterBox || !composerInputBox) {
      throw new Error("Expected visible project chat controls in canvas mode.");
    }
    expect(conversationFilterBox.width).toBeGreaterThan(
      canvasSectionBox.width * 0.45,
    );
    expect(composerInputBox.width).toBeGreaterThan(
      canvasSectionBox.width * 0.45,
    );
    expect(canvasSectionBox.x).toBeGreaterThanOrEqual(canvasRect.left - 1);
    expect(canvasSectionBox.y).toBeGreaterThanOrEqual(canvasRect.top - 1);
    expect(canvasSectionBox.x + canvasSectionBox.width).toBeLessThanOrEqual(
      canvasRect.right + 1,
    );
    expect(canvasSectionBox.y + canvasSectionBox.height).toBeLessThanOrEqual(
      canvasRect.bottom + 1,
    );
    expect(
      Math.abs(canvasSectionBox.width - sourceWindowBox.width),
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs(canvasSectionBox.height - sourceWindowBox.height),
    ).toBeLessThanOrEqual(4);
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
        page.getByTestId("project-chat-window-show-in-canvas").count(),
      )
      .toBeGreaterThanOrEqual(1);

    const instanceId = await page
      .getByTestId("project-chat-window-show-in-canvas")
      .first()
      .getAttribute("data-chat-window-instance-id");
    if (!instanceId) {
      throw new Error("Expected move-to-canvas control with instance id.");
    }

    await page
      .locator(
        `[data-testid="project-chat-window-show-in-canvas"][data-chat-window-instance-id="${instanceId}"]`,
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

    const managerTrigger = page.getByTestId(
      "project-chat-bottom-dock-menu-trigger",
    );
    await expect(managerTrigger).toBeVisible();
    await managerTrigger.click();
    const menuContent = page.getByTestId(
      "project-chat-bottom-dock-menu-content",
    );
    await expect(menuContent).toBeVisible();
    await menuContent
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
    await expect(placeholder).toContainText("moved to a window");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
