import { expect, test, type Route } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

import {
  collapseSidePanesForWindowInteraction,
  ensureDockedWindow,
  expectNoActiveOutlineOnPointerDown,
  getCanvasDomRect,
  getExpectedClampedScreenOrigin,
  getFloatingWindowMetrics,
  getFloatingWorkArea,
  getFlowPositionFromScreenPoint,
  getProjectChatCanvasBinding,
  getWindowHeaderChromeMetrics,
  type FlowPoint,
} from "./project-chat-bottom-dock-helpers";

test("project chat move-to-canvas anchors new canvas chats to the visible source window instead of the last cursor point", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
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
      throw new Error("Expected GPU flow canvas bounds.");
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
    await page.waitForSelector(".setta-gpu-flow__pane");
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
    await page.waitForSelector(".setta-gpu-flow__pane");
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
        const { deleteSections } = await import("/src/openapi/http");
        const { callOpenAPI } = await import(
          "/tests/e2e/browserAppSubsystemSdk.ts"
        );
        await callOpenAPI(
          deleteSections({
            body: {
              projectConfigId,
              sectionIds: [targetSectionId],
            },
          } as Parameters<typeof deleteSections>[0]),
        );
      },
      {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
      },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");
    await collapseSidePanesForWindowInteraction(page);
    await expect(reopenedFloatingWindow).toHaveCount(0);
    await expect(plainDockedWindow).toBeVisible();
    await expect(dockPanels).toHaveCount(1);

    const initialViewTabCount = await page
      .getByTestId("view-mode-tab-button")
      .count();
    const createdViewModeId = await page.evaluate(async (projectConfigId) => {
      const { createViewMode, toggleViewModeTab } = await import(
        "/src/openapi/http"
      );
      const { callOpenAPI } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const response = await callOpenAPI(
        createViewMode({
          body: {
            projectConfigId,
          },
        } as Parameters<typeof createViewMode>[0]),
      );
      const viewModeId = response.data;
      if (!viewModeId) {
        throw new Error("Expected created view mode id.");
      }
      await callOpenAPI(
        toggleViewModeTab({
          body: {
            projectConfigId,
            viewModeId,
          },
        } as Parameters<typeof toggleViewModeTab>[0]),
      );
      return viewModeId;
    }, projectContext.projectConfigId);
    await expect(page.getByTestId("view-mode-tab-button")).toHaveCount(
      initialViewTabCount + 1,
    );
    await page.evaluate(
      async ({ projectConfigId, activeViewModeId }) => {
        const { setActiveViewMode } = await import("/src/openapi/http");
        const { callOpenAPI } = await import(
          "/tests/e2e/browserAppSubsystemSdk.ts"
        );
        await callOpenAPI(
          setActiveViewMode({
            body: {
              projectConfigId,
              activeViewModeId,
            },
          } as Parameters<typeof setActiveViewMode>[0]),
        );
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
    await page.waitForSelector(".setta-gpu-flow__pane");
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
    await page.waitForSelector(".setta-gpu-flow__pane");
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
    await page.waitForSelector(".setta-gpu-flow__pane");
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
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");
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
      throw new Error("Expected GPU flow canvas bounds.");
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
      throw new Error("Unable to find a point outside the GPU flow canvas.");
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

    const canvasResizableSurface = page.locator(
      `[id="${secondBinding.sectionId}-CustomResizable"]`,
    );
    await expect(canvasResizableSurface).toBeVisible();
    const canvasResizableSurfaceBox =
      await canvasResizableSurface.boundingBox();
    if (!canvasResizableSurfaceBox) {
      throw new Error("Expected visible canvas section surface bounds.");
    }
    const conversationFilterInput = canvasSection.getByTestId(
      "project-chat-conversation-filter-input",
    );
    const composerInput = canvasSection.getByTestId("chat-input-textarea");
    await expect(conversationFilterInput).toBeVisible();
    await expect(composerInput).toBeVisible();
    const conversationFilterBox = await conversationFilterInput.boundingBox();
    const composerInputBox = await composerInput.boundingBox();
    if (!conversationFilterBox || !composerInputBox) {
      throw new Error("Expected visible project chat controls in canvas mode.");
    }
    const canvasEdgeTolerancePx = 4;
    expect(conversationFilterBox.width).toBeGreaterThan(
      canvasResizableSurfaceBox.width * 0.45,
    );
    expect(composerInputBox.width).toBeGreaterThan(
      canvasResizableSurfaceBox.width * 0.45,
    );
    expect(canvasResizableSurfaceBox.x).toBeGreaterThanOrEqual(
      canvasRect.left - canvasEdgeTolerancePx,
    );
    expect(canvasResizableSurfaceBox.y).toBeGreaterThanOrEqual(
      canvasRect.top - canvasEdgeTolerancePx,
    );
    expect(
      canvasResizableSurfaceBox.x + canvasResizableSurfaceBox.width,
    ).toBeLessThanOrEqual(canvasRect.right + canvasEdgeTolerancePx);
    expect(
      canvasResizableSurfaceBox.y + canvasResizableSurfaceBox.height,
    ).toBeLessThanOrEqual(canvasRect.bottom + canvasEdgeTolerancePx);
    expect(
      Math.abs(canvasResizableSurfaceBox.width - sourceWindowBox.width),
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs(canvasResizableSurfaceBox.height - sourceWindowBox.height),
    ).toBeLessThanOrEqual(4);
  } finally {
    await engineCleanup();
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
    await page.waitForSelector(".setta-gpu-flow__pane");
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
