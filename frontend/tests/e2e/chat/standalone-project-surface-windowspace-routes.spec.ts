import { expect, test } from "@playwright/test";
import {
  cleanupGitOverlayFixture,
  getWorkspaceRootOrThrow,
  seedGitOverlayFixture,
} from "../git/helpers/gitOverlayFixture";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  createChatSection,
  createTextBlockSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
} from "../helpers";
import {
  buildStandaloneUrl,
  clearProjectChatWindowingState,
  clickWindowSpaceOpen,
  clickWindowSpaceSaveCurrentLayout,
  createFloatingProjectChatWindow,
  findFloatingWindowIdByBounds,
  findProjectChatWindowIdForSection,
  flushProjectChatWindowingWrites,
  getProjectConfigNameFromUrl,
  loadProjectConfigState,
  readProjectChatGitPaneVisibility,
  readProjectChatWindowingState,
  readSectionChatId,
  seedProjectChatWindowThreads,
  setOverviewTabInStore,
  setProjectChatWindowBounds,
  showSectionInProjectChatWindow,
} from "./standalone-project-surface-route-helpers";

test.describe.serial("standalone project window-space routes", () => {
  test("restoring a saved window space preserves unrelated live floating windows", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();

    try {
      const savedWindowId = await createFloatingProjectChatWindow(
        page,
        "Saved Window",
      );
      await setProjectChatWindowBounds(page, savedWindowId, {
        x: 40,
        y: 40,
        width: 420,
        height: 280,
      });

      await clickWindowSpaceSaveCurrentLayout(page);
      await expect(page.getByTestId("window-space-open")).toHaveCount(1);

      const liveWindowId = await createFloatingProjectChatWindow(
        page,
        "Live Window",
      );
      await setProjectChatWindowBounds(page, liveWindowId, {
        x: 700,
        y: 80,
        width: 360,
        height: 260,
      });
      await setProjectChatWindowBounds(page, savedWindowId, {
        x: 260,
        y: 320,
        width: 360,
        height: 240,
      });

      await clickWindowSpaceOpen(page);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          const liveWindow = state.instancesById[liveWindowId];
          const restoredWindowId = findFloatingWindowIdByBounds(
            state,
            {
              x: 40,
              y: 40,
              width: 420,
              height: 280,
            },
            new Set([liveWindowId]),
          );
          return (
            restoredWindowId !== null &&
            state.order.includes(liveWindowId) &&
            liveWindow?.placement === "floating"
          );
        })
        .toBe(true);

      const restoredWindowId = findFloatingWindowIdByBounds(
        await readProjectChatWindowingState(page),
        {
          x: 40,
          y: 40,
          width: 420,
          height: 280,
        },
        new Set([liveWindowId]),
      );
      if (!restoredWindowId) {
        throw new Error("Expected the saved floating window to be restored.");
      }

      await expect(
        page.locator(
          `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${restoredWindowId}"]`,
        ),
      ).toBeVisible();
      await expect(
        page.locator(
          `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${liveWindowId}"]`,
        ),
      ).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("restoring a saved window space reuses the live window when the same chat owner already exists under a different id", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();

    try {
      const savedWindowId = await createFloatingProjectChatWindow(
        page,
        "Saved Window",
      );
      await seedProjectChatWindowThreads(page, [
        {
          instanceId: savedWindowId,
          chatId: "chat-shared",
          assistantText: "Shared thread marker",
        },
      ]);

      await clickWindowSpaceSaveCurrentLayout(page);
      await expect(page.getByTestId("window-space-open")).toHaveCount(1);

      await clearProjectChatWindowingState(
        page,
        projectContext.projectConfigId,
      );

      const liveWindowId = await createFloatingProjectChatWindow(
        page,
        "Live Window",
      );
      await seedProjectChatWindowThreads(page, [
        {
          instanceId: liveWindowId,
          chatId: "chat-shared",
          assistantText: "Shared thread marker",
        },
      ]);

      await clickWindowSpaceOpen(page);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return {
            liveWindowChatId: state.instancesById[liveWindowId]?.chatId ?? null,
            savedWindowExists: savedWindowId in state.instancesById,
            order: state.order,
          };
        })
        .toEqual({
          liveWindowChatId: "chat-shared",
          savedWindowExists: false,
          order: [liveWindowId],
        });

      const liveWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${liveWindowId}"]`,
      );
      await expect(liveWindow).toBeVisible();
      await expect(liveWindow).toContainText("Shared thread marker");
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("restoring a saved window space reuses the live section-owned project-chat window before the first thread exists", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();

    try {
      const { sectionId: chatSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "Linked Research Chat",
      );
      await showSectionInProjectChatWindow(page, chatSectionId, "floating");

      await page.evaluate(async (sectionId) => {
        const { setProjectChatWindowModeForSection } = await import(
          "/src/state/actions/projectChatWindowing.ts"
        );
        const { ChatWindowModeEnum } = await import(
          "/src/utils/generatedTypes.ts"
        );
        setProjectChatWindowModeForSection(
          sectionId,
          ChatWindowModeEnum.project_ai_mode,
        );
      }, chatSectionId);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          const instanceId = findProjectChatWindowIdForSection(
            state,
            chatSectionId,
          );
          if (!instanceId) {
            return "";
          }
          return state.instancesById[instanceId]?.chatId === null
            ? instanceId
            : "";
        })
        .not.toBe("");
      const savedWindowId =
        findProjectChatWindowIdForSection(
          await readProjectChatWindowingState(page),
          chatSectionId,
        ) ?? "";
      if (!savedWindowId) {
        throw new Error("Expected a section-owned project chat window.");
      }

      await setProjectChatWindowBounds(page, savedWindowId, {
        x: 140,
        y: 120,
        width: 360,
        height: 240,
      });
      const savedWindowState = (await readProjectChatWindowingState(page))
        .instancesById[savedWindowId];
      if (!savedWindowState) {
        throw new Error("Expected saved section window state before restore.");
      }
      await clickWindowSpaceSaveCurrentLayout(page);
      await expect(page.getByTestId("window-space-open")).toHaveCount(1);

      await page.evaluate(async (sectionId) => {
        const { replaceProjectChatWindowingState } = await import(
          "/src/state/actions/projectChatWindowing.ts"
        );
        const {
          ChatWindowModeEnum,
          ChatWindowPlacementEnum,
          createProjectChatWindowInstance,
          createProjectChatWindowingState,
        } = await import("/src/utils/generatedTypes.ts");
        replaceProjectChatWindowingState(
          createProjectChatWindowingState({
            order: ["live-section-window"],
            instancesById: {
              "live-section-window": createProjectChatWindowInstance({
                instanceId: "live-section-window",
                placement: ChatWindowPlacementEnum.floating,
                mode: ChatWindowModeEnum.project_ai_mode,
                sectionIdOrNull: sectionId,
                chatId: null,
                isClosed: false,
                isMinimized: false,
                isMaximized: false,
                zIndex: 7,
                bounds: {
                  x: 620,
                  y: 260,
                  width: 340,
                  height: 260,
                },
              }),
            },
            nextInstanceNumber: 2,
          }),
        );
      }, chatSectionId);

      await clickWindowSpaceOpen(page);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          const liveWindow = state.instancesById["live-section-window"];
          return {
            liveWindowExists: "live-section-window" in state.instancesById,
            savedWindowExists: savedWindowId in state.instancesById,
            liveWindow:
              liveWindow === undefined
                ? null
                : {
                    ...liveWindow,
                    bounds: {
                      x: Math.round(liveWindow.bounds.x),
                      y: Math.round(liveWindow.bounds.y),
                      width: Math.round(liveWindow.bounds.width),
                      height: Math.round(liveWindow.bounds.height),
                    },
                  },
            sectionChatId: await readSectionChatId(page, chatSectionId),
            order: state.order,
          };
        })
        .toEqual({
          liveWindowExists: true,
          savedWindowExists: false,
          liveWindow: {
            sectionIdOrNull: chatSectionId,
            placement: "floating",
            mode: "project_ai_mode",
            chatId: null,
            zIndex: savedWindowState.zIndex,
            bounds: {
              ...savedWindowState.bounds,
            },
          },
          sectionChatId: null,
          order: ["live-section-window"],
        });

      await expect(
        page.locator(
          '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="live-section-window"]',
        ),
      ).toBeVisible();
      await expect(
        page.locator(
          `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${savedWindowId}"]`,
        ),
      ).toHaveCount(0);
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("failed workspace restore rolls back git-pane visibility with the layout", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const gitFixture = await seedGitOverlayFixture(getWorkspaceRootOrThrow(), {
      historyCommitCount: 4,
    });

    try {
      await setOverviewTabInStore(page, "Git");
      await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();
      const graphButton = page
        .getByTestId("overview-tab-content-shell")
        .getByRole("button", { name: "Graph" });
      await expect(graphButton).toBeEnabled();
      await graphButton.click();

      const trackedWindow = page.getByTestId("project-chat-maximized-window");
      await expect(trackedWindow).toBeVisible();
      const graphWindowId = await trackedWindow.getAttribute(
        "data-chat-window-instance-id",
      );
      if (!graphWindowId) {
        throw new Error("Expected workspace git graph window instance id.");
      }

      await trackedWindow.getByTestId("project-chat-window-restore").click();
      const workspaceFloatingWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${graphWindowId}"]`,
      );
      await expect(workspaceFloatingWindow).toBeVisible();
      const workspaceToggle = workspaceFloatingWindow.getByTestId(
        "git-graph-toggle-embedded-git-pane",
      );
      await expect(workspaceToggle).toHaveAttribute("aria-pressed", "false");
      await workspaceToggle.click();
      await expect(workspaceToggle).toHaveAttribute("aria-pressed", "true");

      await setOverviewTabInStore(page, "ViewModes");
      await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
      await clickWindowSpaceSaveCurrentLayout(page);
      await expect(page.getByTestId("window-space-open")).toHaveCount(1);

      await setProjectChatWindowBounds(page, graphWindowId, {
        x: 640,
        y: 120,
        width: 340,
        height: 260,
      });

      const baselineWindowingState = await readProjectChatWindowingState(page);
      const baselineGitPaneVisibility =
        await readProjectChatGitPaneVisibility(page);

      allowExpectedApiError(page, {
        path: "/api/setProjectChatWindowingState",
        statuses: [500],
        count: 4,
        ttlMs: 60000,
      });
      await page.route("**/api/setProjectChatWindowingState", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Synthetic restore failure." }),
        });
      });

      await clickWindowSpaceOpen(page);

      await expect
        .poll(async () => readProjectChatWindowingState(page))
        .toEqual(baselineWindowingState);
      await expect
        .poll(async () => readProjectChatGitPaneVisibility(page))
        .toEqual(baselineGitPaneVisibility);
      await expect(workspaceToggle).toHaveAttribute("aria-pressed", "true");
      await page.unroute("**/api/setProjectChatWindowingState");
    } finally {
      if (!page.isClosed()) {
        await page.unroute("**/api/setProjectChatWindowingState");
      }
      await cleanupGitOverlayFixture(gitFixture);
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("saves a floating layout as a window space and reopens it by URL without mutating workspace windowing state", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
    const standalonePage = await page.context().newPage();

    try {
      const { sectionId: textSectionId, sectionName: textSectionName } =
        await createTextBlockSection(
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
          return {
            projectChatWindowIdPresent:
              state.order.includes(projectChatWindowId),
            hasSectionWindow:
              findProjectChatWindowIdForSection(state, textSectionId) !== null,
          };
        })
        .toEqual({
          projectChatWindowIdPresent: true,
          hasSectionWindow: true,
        });

      const workspaceWindowingState = await readProjectChatWindowingState(page);
      const sectionWindowId = findProjectChatWindowIdForSection(
        workspaceWindowingState,
        textSectionId,
      );
      if (!sectionWindowId) {
        throw new Error("Expected a floating section window before saving.");
      }

      await setProjectChatWindowBounds(page, projectChatWindowId, {
        x: 40,
        y: 40,
        width: 520,
        height: 320,
      });
      await setProjectChatWindowBounds(page, sectionWindowId, {
        x: 560,
        y: 40,
        width: 520,
        height: 420,
      });

      await expect(
        page.getByTestId("window-space-save-current-layout"),
      ).toBeVisible();
      await clickWindowSpaceSaveCurrentLayout(page);
      await expect(page.getByTestId("window-space-open")).toHaveCount(1);

      await expect
        .poll(async () => {
          const state = await loadProjectConfigState(page, projectConfigName);
          return Object.keys(state.projectConfig.windowSpaces ?? {}).length;
        })
        .toBe(1);

      const resolvedWindowSpace = await loadProjectConfigState(
        page,
        projectConfigName,
      );
      const [windowSpace] = Object.values(
        resolvedWindowSpace.projectConfig.windowSpaces ?? {},
      );
      if (!windowSpace) {
        throw new Error("Expected the saved window space to be persisted.");
      }
      const windowSpaceSlug = await page.evaluate(async (name) => {
        const { sanitizeNameForSlug } = await import(
          "/src/utils/nameValidation.ts"
        );
        return sanitizeNameForSlug(name);
      }, windowSpace.name);

      const originalWorkspaceUrl = page.url();

      await setProjectChatWindowBounds(page, projectChatWindowId, {
        x: 120,
        y: 220,
        width: 360,
        height: 280,
      });
      await setProjectChatWindowBounds(page, sectionWindowId, {
        x: 520,
        y: 260,
        width: 300,
        height: 260,
      });

      await clickWindowSpaceOpen(page);
      await expect.poll(() => page.url()).toBe(originalWorkspaceUrl);
      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          const restoredProjectChatWindowId = findFloatingWindowIdByBounds(
            state,
            {
              x: 40,
              y: 40,
              width: 520,
              height: 320,
            },
          );
          const restoredSectionWindow = Object.values(state.instancesById).find(
            (instance) =>
              instance.sectionIdOrNull === textSectionId &&
              instance.placement === "floating" &&
              instance.bounds.x === 560 &&
              instance.bounds.y === 40 &&
              instance.bounds.width === 520 &&
              instance.bounds.height === 420,
          );
          return (
            restoredProjectChatWindowId !== null &&
            restoredSectionWindow !== undefined
          );
        })
        .toBe(true);

      await flushProjectChatWindowingWrites(page);
      const restoredWorkspaceState = await readProjectChatWindowingState(page);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect
        .poll(async () => readProjectChatWindowingState(page))
        .toEqual(restoredWorkspaceState);

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/windowspace/${encodeURIComponent(windowSpaceSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      await expect(
        standalonePage.getByTestId("standalone-window-space-surface"),
      ).toBeVisible();
      await expect(
        standalonePage.getByTestId("standalone-window-space-window"),
      ).toHaveCount(2);
      await expect(
        standalonePage.locator(
          '[data-window-space-surface-kind="project_chat"]',
        ),
      ).toHaveCount(1);
      await expect(
        standalonePage.locator('[data-window-space-surface-kind="section"]'),
      ).toHaveCount(1);
      await expect(
        standalonePage.getByText(textSectionName, { exact: true }),
      ).toBeVisible();
      await expect(standalonePage.locator("#OverviewPane")).toHaveCount(0);
      await expect(standalonePage.locator("#UiEditorPane")).toHaveCount(0);

      await expect
        .poll(async () => readProjectChatWindowingState(page))
        .toEqual(restoredWorkspaceState);
    } finally {
      await standalonePage.close();
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });});
