import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

import {
  collapseSidePanesForWindowInteraction,
  ensureFloatingWindow,
  expectBoxShadowToBeCleared,
  FLOATING_TITLE_BAR_HEIGHT_PX,
  getFloatingWindowMetrics,
  getFloatingWorkArea,
} from "./project-chat-bottom-dock-helpers";

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
