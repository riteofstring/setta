import { expect, type Locator, type Page } from "@playwright/test";

export type FloatingWindowMetrics = {
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

export type CanvasDomRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type FlowPoint = {
  x: number;
  y: number;
};

export type ProjectChatCanvasBinding = {
  placement: string;
  sectionId: string | null;
  positionX: number | null;
  positionY: number | null;
};

export type HeaderChromeMetrics = {
  surfaceTopLeftRadius: number;
  surfaceTopRightRadius: number;
  iconInsetLeft: number;
  closeInsetRight: number;
  maximizeColor: string;
  minimizeColor: string;
  closeColor: string;
};

export const SIDE_RAIL_WIDTH_PX = 40;
export const FLOATING_TITLE_BAR_HEIGHT_PX = 32;
export const WORKSPACE_TOP_INSET_FALLBACK_PX = 40;

export function getFloatingWorkArea(metrics: FloatingWindowMetrics): {
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

export function expectBoxShadowToBeCleared(boxShadow: string) {
  expect(boxShadow).toMatch(
    /^(none|(?:rgba\(0, 0, 0, 0\) 0px 0px 0px 0px,?\s*)+)$/,
  );
}

export function expectOutlineToBeCleared({
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

export async function expectNoActiveOutlineOnPointerDown(
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

export async function getWindowHeaderChromeMetrics(
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

export async function getFloatingWindowMetrics(
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

export async function getWorkspaceTopInset(page: Page): Promise<number> {
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

export async function getCanvasDomRect(
  page: Page,
): Promise<CanvasDomRect | null> {
  return page.evaluate(async () => {
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const domNode = gpuFlowViewportStore.getState().domNode;
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

export function getExpectedClampedScreenOrigin(
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

export async function getFlowPositionFromScreenPoint(
  page: Page,
  screenPoint: FlowPoint,
): Promise<FlowPoint> {
  return page.evaluate(async (point) => {
    const { screenToFlowPosition } = await import(
      "/src/gpuFlow/viewportActions.ts"
    );
    return screenToFlowPosition(point);
  }, screenPoint);
}

export async function getProjectChatCanvasBinding(
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

export async function collapseSidePanesForWindowInteraction(
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

export async function setActiveSections(
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

export async function ensureDockedWindow(
  page: Page,
  index = 0,
): Promise<Locator> {
  const dockedWindow = page
    .getByTestId("project-chat-bottom-dock-window-panel")
    .nth(index);
  await expect(dockedWindow).toBeVisible();
  return dockedWindow;
}

export async function ensureFloatingWindow(
  page: Page,
  index = 0,
): Promise<Locator> {
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

export async function clickDom(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await target.evaluate((element: HTMLElement) => {
    element.click();
  });
}
