import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
} from "../helpers";

import {
  buildStandaloneUrl,
  clickWindowSpaceOpen,
  clickWindowSpaceSaveCurrentLayout,
  createFloatingProjectChatWindow,
  findProjectChatWindowIdForSection,
  getProjectConfigNameFromUrl,
  loadProjectConfigState,
  readProjectChatWindowingState,
  resolveWorkspaceSnapBounds,
  setOverviewTabInStore,
  setProjectChatWindowBounds,
  showSectionInProjectChatWindow,
  syncProjectChatWindowingInStore,
  syncWindowSpacesFromBackend,
} from "./standalone-project-surface-route-helpers";

test.describe.serial("standalone project surface window-space layouts", () => {
  test("allows resizing snapped standalone window-space layouts in a dedicated tab", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
    const standalonePage = await page.context().newPage();

    try {
      const { sectionId: textSectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "Research Notes",
      );
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const projectChatWindowId = await createFloatingProjectChatWindow(
        page,
        "Research Chat",
      );
      await showSectionInProjectChatWindow(page, textSectionId, "floating");

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return findProjectChatWindowIdForSection(state, textSectionId) ?? "";
        })
        .not.toBe("");
      const sectionState = await readProjectChatWindowingState(page);
      const sectionWindowId = findProjectChatWindowIdForSection(
        sectionState,
        textSectionId,
      );
      if (!sectionWindowId) {
        throw new Error("Expected floating section window before saving.");
      }

      const leftBounds = await resolveWorkspaceSnapBounds(page, "left");
      const rightBounds = await resolveWorkspaceSnapBounds(page, "right");
      await setProjectChatWindowBounds(page, projectChatWindowId, leftBounds);
      await setProjectChatWindowBounds(page, sectionWindowId, rightBounds);

      await clickWindowSpaceSaveCurrentLayout(page);
      await expect(page.getByTestId("window-space-open")).toHaveCount(1);

      const resolvedWindowSpace = await loadProjectConfigState(
        page,
        projectConfigName,
      );
      const [windowSpace] = Object.values(
        resolvedWindowSpace.projectConfig.windowSpaces ?? {},
      );
      if (!windowSpace) {
        throw new Error("Expected a saved standalone window space.");
      }
      const windowSpaceSlug = await page.evaluate(async (name) => {
        const { sanitizeNameForSlug } = await import(
          "/src/utils/nameValidation.ts"
        );
        return sanitizeNameForSlug(name);
      }, windowSpace.name);

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/windowspace/${encodeURIComponent(windowSpaceSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      const leftWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${projectChatWindowId}"]`,
      );
      const rightWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${sectionWindowId}"]`,
      );
      const verticalHandle = standalonePage.locator(
        '[data-testid="standalone-window-space-resize-handle"][data-resize-axis="vertical"]',
      );

      await expect(leftWindow).toBeVisible();
      await expect(rightWindow).toBeVisible();
      await expect(verticalHandle).toHaveCount(1);

      const leftBeforeResize = await leftWindow.boundingBox();
      const rightBeforeResize = await rightWindow.boundingBox();
      const resizeHandleBounds = await verticalHandle.boundingBox();
      if (!leftBeforeResize || !rightBeforeResize || !resizeHandleBounds) {
        throw new Error(
          "Expected standalone snapped layout bounds before resize.",
        );
      }

      await standalonePage.mouse.move(
        resizeHandleBounds.x + resizeHandleBounds.width / 2,
        resizeHandleBounds.y + resizeHandleBounds.height / 2,
      );
      await standalonePage.mouse.down();
      await standalonePage.mouse.move(
        resizeHandleBounds.x + resizeHandleBounds.width / 2 + 80,
        resizeHandleBounds.y + resizeHandleBounds.height / 2,
        {
          steps: 8,
        },
      );
      await standalonePage.mouse.up();

      await expect
        .poll(async () => (await leftWindow.boundingBox())?.width ?? 0)
        .toBeGreaterThan(leftBeforeResize.width + 60);
      await expect
        .poll(async () => (await rightWindow.boundingBox())?.width ?? 0)
        .toBeLessThan(rightBeforeResize.width - 60);
    } finally {
      await standalonePage.close();
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("restores snapped window spaces back onto the shared floating resize grid", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();

    try {
      const { sectionId: textSectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "Research Notes",
      );
      const projectChatWindowId = await createFloatingProjectChatWindow(
        page,
        "Research Chat",
      );
      await showSectionInProjectChatWindow(page, textSectionId, "floating");

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return findProjectChatWindowIdForSection(state, textSectionId) ?? "";
        })
        .not.toBe("");
      const sectionState = await readProjectChatWindowingState(page);
      const sectionWindowId = findProjectChatWindowIdForSection(
        sectionState,
        textSectionId,
      );
      if (!sectionWindowId) {
        throw new Error("Expected floating section window before saving.");
      }

      const leftBounds = await resolveWorkspaceSnapBounds(page, "left");
      const rightBounds = await resolveWorkspaceSnapBounds(page, "right");
      await setProjectChatWindowBounds(page, projectChatWindowId, leftBounds);
      await setProjectChatWindowBounds(page, sectionWindowId, rightBounds);

      const leftWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${projectChatWindowId}"]`,
      );
      const rightWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${sectionWindowId}"]`,
      );
      await expect(leftWindow).toHaveAttribute(
        "data-chat-window-snap-preset",
        "left",
      );
      await expect(rightWindow).toHaveAttribute(
        "data-chat-window-snap-preset",
        "right",
      );
      const verticalHandle = page.locator(
        '[data-testid="project-chat-floating-snap-resize-handle"][data-resize-axis="vertical"]',
      );
      await expect(verticalHandle).toHaveCount(1);

      await clickWindowSpaceSaveCurrentLayout(page);
      await expect(page.getByTestId("window-space-open")).toHaveCount(1);

      await setProjectChatWindowBounds(page, projectChatWindowId, {
        x: 140,
        y: 180,
        width: 320,
        height: 260,
      });
      await setProjectChatWindowBounds(page, sectionWindowId, {
        x: 620,
        y: 240,
        width: 360,
        height: 300,
      });

      await expect(leftWindow).not.toHaveAttribute(
        "data-chat-window-snap-preset",
        "left",
      );
      await expect(rightWindow).not.toHaveAttribute(
        "data-chat-window-snap-preset",
        "right",
      );

      await clickWindowSpaceOpen(page);

      const restoredLeftWindow = page
        .locator(
          '[data-testid="project-chat-floating-window"][data-chat-window-snap-preset="left"]',
        )
        .first();
      const restoredRightWindow = page
        .locator(
          '[data-testid="project-chat-floating-window"][data-chat-window-snap-preset="right"]',
        )
        .first();

      await expect(restoredLeftWindow).toHaveAttribute(
        "data-chat-window-snap-preset",
        "left",
      );
      await expect(restoredRightWindow).toHaveAttribute(
        "data-chat-window-snap-preset",
        "right",
      );
      await expect(verticalHandle).toHaveCount(1);

      const leftBeforeResize = await restoredLeftWindow.boundingBox();
      const rightBeforeResize = await restoredRightWindow.boundingBox();
      const resizeHandleBounds = await verticalHandle.boundingBox();
      if (!leftBeforeResize || !rightBeforeResize || !resizeHandleBounds) {
        throw new Error(
          "Expected snapped floating layout bounds before resize.",
        );
      }

      await page.mouse.move(
        resizeHandleBounds.x + resizeHandleBounds.width / 2,
        resizeHandleBounds.y + resizeHandleBounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        resizeHandleBounds.x + resizeHandleBounds.width / 2 + 80,
        resizeHandleBounds.y + resizeHandleBounds.height / 2,
        {
          steps: 8,
        },
      );
      await page.mouse.up();

      await expect
        .poll(async () => (await restoredLeftWindow.boundingBox())?.width ?? 0)
        .toBeGreaterThan(leftBeforeResize.width + 60);
      await expect
        .poll(async () => (await restoredRightWindow.boundingBox())?.width ?? 0)
        .toBeLessThan(rightBeforeResize.width - 60);
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("restoring a saved floating section window does not evict a live canvas section host", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const projectConfigName = getProjectConfigNameFromUrl(page.url());
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();

    try {
      const { sectionId: textSectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "Research Notes",
      );
      const seededStates = await page.evaluate(async (sectionId) => {
        const {
          ChatWindowModeEnum,
          ChatWindowPlacementEnum,
          WindowSpaceSurfaceKindEnum,
          createProjectChatWindowInstance,
          createProjectChatWindowingState,
          createWindowSpaceState,
        } = await import("/src/utils/generatedTypes.ts");
        return {
          currentWindowing: createProjectChatWindowingState({
            order: ["canvas-section-window"],
            instancesById: {
              "canvas-section-window": createProjectChatWindowInstance({
                instanceId: "canvas-section-window",
                placement: ChatWindowPlacementEnum.canvas_section,
                mode: ChatWindowModeEnum.section_mode,
                sectionIdOrNull: sectionId,
                title: "Canvas Section Chat",
              }),
            },
            nextInstanceNumber: 2,
          }),
          windowSpaceState: createWindowSpaceState({
            windowsById: {
              "restored-section-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.section,
                sectionIdOrNull: sectionId,
                mode: ChatWindowModeEnum.section_mode,
                title: null,
                chatId: null,
                zIndex: 4,
                normalizedBounds: {
                  x: 0.1,
                  y: 0.15,
                  width: 0.45,
                  height: 0.5,
                },
              },
            },
            order: ["restored-section-window"],
          }),
        };
      }, textSectionId);

      await postBackend(page, "/setProjectChatWindowingState", {
        projectConfigId: projectContext.projectConfigId,
        state: seededStates.currentWindowing,
      });
      await syncProjectChatWindowingInStore(
        page,
        seededStates.currentWindowing,
      );
      await postBackend(page, "/createWindowSpace", {
        projectConfigId: projectContext.projectConfigId,
        name: "Collision Layout",
        state: seededStates.windowSpaceState,
      });
      await syncWindowSpacesFromBackend(page, projectConfigName);

      await expect(page.getByTestId("window-space-open")).toHaveCount(1);
      await clickWindowSpaceOpen(page);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return {
            order: state.order,
            placementsById: Object.fromEntries(
              Object.entries(state.instancesById).map(
                ([instanceId, instance]) => [instanceId, instance.placement],
              ),
            ),
          };
        })
        .toEqual({
          order: ["canvas-section-window"],
          placementsById: {
            "canvas-section-window": "canvas_section",
          },
        });
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("renames and deletes saved window spaces from the overview list without edit mode", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      await createFloatingProjectChatWindow(page, "Research Chat");
      await expect(
        page.getByTestId("window-space-save-current-layout"),
      ).toBeEnabled();

      await clickWindowSpaceSaveCurrentLayout(page);
      await expect(page.getByTestId("window-space-open")).toHaveCount(1);
      await expect(page.getByTestId("window-space-rename")).toBeVisible();
      await expect(page.getByTestId("window-space-delete")).toBeVisible();

      const renamedWindowSpace = "Research Board";
      await page.getByTestId("window-space-rename").click();
      await expect(page.getByTestId("window-space-name-input")).toBeVisible();
      await page
        .getByTestId("window-space-name-input")
        .fill(renamedWindowSpace);
      await page.getByTestId("window-space-name-input").press("Enter");
      await expect(page.getByTestId("window-space-open")).toHaveText(
        renamedWindowSpace,
      );

      await expect
        .poll(async () => {
          const state = await loadProjectConfigState(page, projectConfigName);
          const [windowSpace] = Object.values(
            state.projectConfig.windowSpaces ?? {},
          );
          return windowSpace?.name ?? "";
        })
        .toBe(renamedWindowSpace);

      await page.getByTestId("window-space-delete").click();
      await expect(page.getByTestId("window-space-open")).toHaveCount(0);
      await expect(page.getByTestId("window-space-rename")).toHaveCount(0);
      await expect(page.getByTestId("window-space-delete")).toHaveCount(0);

      await expect
        .poll(async () => {
          const state = await loadProjectConfigState(page, projectConfigName);
          return Object.keys(state.projectConfig.windowSpaces ?? {}).length;
        })
        .toBe(0);
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
