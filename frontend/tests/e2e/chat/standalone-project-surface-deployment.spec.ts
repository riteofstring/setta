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
  postBackend,
} from "../helpers";
import {
  buildStandaloneUrl,
  clickWindowSpaceSaveCurrentLayout,
  getProjectConfigNameFromUrl,
  resolveSectionSlug,
  setDeploymentSharePolicy,
  setOverviewTabInStore,
  showSectionInProjectChatWindow,
  syncWindowSpacesFromBackend,
} from "./standalone-project-surface-route-helpers";
test.describe.serial("standalone project surface deployment routes", () => {
  test("deployment allowLLM=false keeps scriptable section and git graph surfaces available while blocking managed project chat windows", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const gitFixture = await seedGitOverlayFixture(getWorkspaceRootOrThrow(), {
      historyCommitCount: 4,
    });
    const standalonePage = await page.context().newPage();

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const {
        sectionId: scriptableSectionId,
        sectionName: scriptableSectionName,
      } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "Scriptable Chat",
      );
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: scriptableSectionId,
        managed: false,
        engineConfigId: null,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const scriptableSectionSlug = await resolveSectionSlug(
        page,
        scriptableSectionName,
      );
      const allowedWindowSpaceName = "Allowed Mixed Space";
      const allowedWindowSpaceSlug = await page.evaluate(async (name) => {
        const { sanitizeNameForSlug } = await import(
          "/src/utils/nameValidation.ts"
        );
        return sanitizeNameForSlug(name);
      }, allowedWindowSpaceName);
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
          windowingState: createProjectChatWindowingState({
            order: [
              "blocked-project-chat",
              "scriptable-section-window",
              "git-graph-window",
            ],
            instancesById: {
              "blocked-project-chat": createProjectChatWindowInstance({
                instanceId: "blocked-project-chat",
                placement: ChatWindowPlacementEnum.floating,
                mode: ChatWindowModeEnum.project_ai_mode,
                sectionIdOrNull: null,
                title: "Blocked Project Chat",
                chatId: null,
                isClosed: false,
                isMinimized: false,
                isMaximized: false,
                zIndex: 1,
                bounds: {
                  x: 80,
                  y: 80,
                  width: 360,
                  height: 280,
                },
              }),
              "scriptable-section-window": createProjectChatWindowInstance({
                instanceId: "scriptable-section-window",
                placement: ChatWindowPlacementEnum.floating,
                mode: ChatWindowModeEnum.section_mode,
                sectionIdOrNull: sectionId,
                title: "Scriptable Section Chat",
                chatId: null,
                isClosed: false,
                isMinimized: false,
                isMaximized: false,
                zIndex: 2,
                bounds: {
                  x: 480,
                  y: 80,
                  width: 360,
                  height: 280,
                },
              }),
              "git-graph-window": createProjectChatWindowInstance({
                instanceId: "git-graph-window",
                placement: ChatWindowPlacementEnum.floating,
                mode: ChatWindowModeEnum.git_graph_mode,
                sectionIdOrNull: null,
                title: "Git Graph",
                chatId: null,
                isClosed: false,
                isMinimized: false,
                isMaximized: false,
                zIndex: 3,
                bounds: {
                  x: 280,
                  y: 400,
                  width: 420,
                  height: 260,
                },
              }),
            },
            nextInstanceNumber: 4,
          }),
          windowSpaceState: createWindowSpaceState({
            windowsById: {
              "blocked-project-chat": {
                surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
                sectionIdOrNull: null,
                mode: ChatWindowModeEnum.project_ai_mode,
                title: "Blocked Project Chat",
                chatId: null,
                zIndex: 1,
                normalizedBounds: {
                  x: 0.05,
                  y: 0.08,
                  width: 0.28,
                  height: 0.44,
                },
              },
              "scriptable-section-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.section,
                sectionIdOrNull: sectionId,
                mode: ChatWindowModeEnum.section_mode,
                title: "Scriptable Section Chat",
                chatId: null,
                zIndex: 2,
                normalizedBounds: {
                  x: 0.35,
                  y: 0.08,
                  width: 0.28,
                  height: 0.44,
                },
              },
              "git-graph-window": {
                surfaceKind: WindowSpaceSurfaceKindEnum.project_chat,
                sectionIdOrNull: null,
                mode: ChatWindowModeEnum.git_graph_mode,
                title: "Git Graph",
                chatId: null,
                zIndex: 3,
                normalizedBounds: {
                  x: 0.66,
                  y: 0.08,
                  width: 0.29,
                  height: 0.44,
                },
              },
            },
            order: [
              "blocked-project-chat",
              "scriptable-section-window",
              "git-graph-window",
            ],
          }),
        };
      }, scriptableSectionId);

      await page.evaluate(async (windowingState) => {
        const { useProjectState } = await import("/src/state/definitions.ts");
        useProjectState.setState((state) => {
          state.projectChatWindowing = windowingState;
        });
      }, seededStates.windowingState);
      await postBackend(page, "/createWindowSpace", {
        projectConfigId: projectContext.projectConfigId,
        name: allowedWindowSpaceName,
        state: seededStates.windowSpaceState,
      });
      await syncWindowSpacesFromBackend(page, projectConfigName);
      await setDeploymentSharePolicy(page, {
        allowLLM: false,
        allowLayoutChanges: false,
      });

      await expect(
        page.locator(
          '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="scriptable-section-window"]',
        ),
      ).toBeVisible();
      await expect(
        page.locator(
          '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="git-graph-window"]',
        ),
      ).toBeVisible();
      await expect(
        page.locator(
          '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="blocked-project-chat"]',
        ),
      ).toHaveCount(0);

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/section/${encodeURIComponent(scriptableSectionSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        standalonePage.getByTestId("standalone-section-surface"),
      ).toBeVisible();
      await setDeploymentSharePolicy(standalonePage, {
        allowLLM: false,
        allowLayoutChanges: false,
      });
      await expect(
        standalonePage.getByTestId("standalone-section-surface"),
      ).toBeVisible();
      await expect(
        standalonePage.getByTestId("standalone-managed-chat-blocked"),
      ).toHaveCount(0);

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/windowspace/${encodeURIComponent(allowedWindowSpaceSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        standalonePage.getByTestId("standalone-window-space-surface"),
      ).toBeVisible();
      await setDeploymentSharePolicy(standalonePage, {
        allowLLM: false,
        allowLayoutChanges: false,
      });
      await expect(
        standalonePage.getByTestId("standalone-window-space-surface"),
      ).toBeVisible();
      await expect(
        standalonePage.getByTestId("standalone-managed-chat-blocked"),
      ).toHaveCount(0);
      await expect(
        standalonePage.locator(
          '[data-testid="standalone-window-space-window"][data-chat-window-instance-id="blocked-project-chat"]',
        ),
      ).toHaveCount(0);
      await expect(
        standalonePage.locator(
          '[data-testid="standalone-window-space-window"][data-chat-window-instance-id="scriptable-section-window"]',
        ),
      ).toBeVisible();
      await expect(
        standalonePage.locator(
          '[data-testid="standalone-window-space-window"][data-chat-window-instance-id="git-graph-window"]',
        ),
      ).toBeVisible();
    } finally {
      await standalonePage.close();
      await cleanupGitOverlayFixture(gitFixture);
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("deployment allowLLM=false blocks managed standalone section and window-space routes", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const { sectionId: managedSectionId, sectionName: managedSectionName } =
        await createChatSection(
          page,
          projectContext.projectConfigId,
          "Managed Chat",
        );
      let managedEngineId: string | null = null;
      await expect
        .poll(async () => {
          managedEngineId = await page.evaluate(async () => {
            const { useAIStore } = await import("/src/state/definitions.ts");
            return (
              useAIStore
                .getState()
                .engineConfigs.find(
                  (config) => config.engineType === "setta_llm",
                )?.id ?? null
            );
          });
          return managedEngineId;
        })
        .not.toBeNull();
      if (!managedEngineId) {
        throw new Error(
          "Missing managed chat engine for standalone block test.",
        );
      }
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: managedSectionId,
        managed: true,
        engineConfigId: managedEngineId,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      await expect
        .poll(async () => {
          return page.evaluate(async (sectionId) => {
            const { isManagedChatSection } = await import(
              "/src/state/actions/sectionInfos.ts"
            );
            const { useProjectState } = await import(
              "/src/state/definitions.ts"
            );
            const state = useProjectState.getState();
            return isManagedChatSection(
              {
                projectConfig: {
                  sectionVariantMap: state.projectConfig.sectionVariantMap,
                },
                sections: state.sections,
                sectionVariants: state.sectionVariants,
                sectionImpls: state.sectionImpls,
              },
              sectionId,
            );
          }, managedSectionId);
        })
        .toBe(true);
      const managedSectionSlug = await resolveSectionSlug(
        page,
        managedSectionName,
      );
      const blockedWindowSpaceName = "Blocked Managed Space";
      const blockedWindowSpaceSlug = await page.evaluate(async (name) => {
        const { sanitizeNameForSlug } = await import(
          "/src/utils/nameValidation.ts"
        );
        return sanitizeNameForSlug(name);
      }, blockedWindowSpaceName);
      const blockedWindowSpaceState = await page.evaluate(async (sectionId) => {
        const {
          ChatWindowModeEnum,
          WindowSpaceSurfaceKindEnum,
          createWindowSpaceState,
        } = await import("/src/utils/generatedTypes.ts");
        return createWindowSpaceState({
          windowsById: {
            "managed-section-window": {
              surfaceKind: WindowSpaceSurfaceKindEnum.section,
              sectionIdOrNull: sectionId,
              mode: ChatWindowModeEnum.section_mode,
              title: "Managed Section Chat",
              chatId: null,
              zIndex: 1,
              normalizedBounds: {
                x: 0.08,
                y: 0.1,
                width: 0.52,
                height: 0.5,
              },
            },
          },
          order: ["managed-section-window"],
        });
      }, managedSectionId);

      await postBackend(page, "/createWindowSpace", {
        projectConfigId: projectContext.projectConfigId,
        name: blockedWindowSpaceName,
        state: blockedWindowSpaceState,
      });
      await syncWindowSpacesFromBackend(page, projectConfigName);
      await setDeploymentSharePolicy(page, {
        allowLLM: false,
        allowLayoutChanges: false,
      });

      await page.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/section/${encodeURIComponent(managedSectionSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        page.getByTestId("standalone-section-surface"),
      ).toBeVisible();
      await setDeploymentSharePolicy(page, {
        allowLLM: false,
        allowLayoutChanges: false,
      });
      await expect(
        page.getByTestId("standalone-managed-chat-blocked"),
      ).toBeVisible();
      await expect(page.getByTestId("standalone-section-surface")).toHaveCount(
        0,
      );

      await page.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/windowspace/${encodeURIComponent(blockedWindowSpaceSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        page.getByTestId("standalone-window-space-surface"),
      ).toBeVisible();
      await setDeploymentSharePolicy(page, {
        allowLLM: false,
        allowLayoutChanges: false,
      });
      await expect(
        page.getByTestId("standalone-managed-chat-blocked"),
      ).toBeVisible();
      await expect(
        page.getByTestId("standalone-window-space-surface"),
      ).toHaveCount(0);
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone managed project chat route reopens when deployment policy allows LLM again", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const standaloneChatUrl = buildStandaloneUrl(
        page.url(),
        `/${encodeURIComponent(projectConfigName)}/chat`,
      );

      await page.goto(standaloneChatUrl, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByTestId("standalone-project-chat-surface"),
      ).toBeVisible();

      await setDeploymentSharePolicy(page, {
        allowLLM: false,
        allowLayoutChanges: false,
      });
      await expect(
        page.getByTestId("standalone-managed-chat-blocked"),
      ).toBeVisible();
      await expect(
        page.getByTestId("standalone-project-chat-surface"),
      ).toHaveCount(0);

      await setDeploymentSharePolicy(page, {
        allowLLM: true,
        allowLayoutChanges: false,
      });
      await expect(
        page.getByTestId("standalone-managed-chat-blocked"),
      ).toHaveCount(0);
      await expect(
        page.getByTestId("standalone-project-chat-surface"),
      ).toBeVisible();
      await expect(page).toHaveURL(standaloneChatUrl);
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("wraps standalone project chat routes in the shared project-chat frame", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const standaloneChatUrl = buildStandaloneUrl(
        page.url(),
        `/${encodeURIComponent(projectConfigName)}/chat`,
      );

      await page.goto(standaloneChatUrl, {
        waitUntil: "domcontentloaded",
      });
      const standaloneSurface = page.getByTestId(
        "standalone-project-chat-surface",
      );
      await expect(standaloneSurface).toBeVisible();
      await expect(
        page
          .locator('[data-chat-window-frame="project-chat"]')
          .filter({ has: standaloneSurface }),
      ).toBeVisible();
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows an error notification when saving a window space fails", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
    allowExpectedApiError(page, {
      path: "/api/createWindowSpace",
      statuses: [404],
      method: "POST",
    });

    await page.route("**/api/createWindowSpace", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not Found" }),
      });
    });

    try {
      const { sectionId: textSectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "Research Notes",
      );
      await showSectionInProjectChatWindow(page, textSectionId, "floating");
      await expect(
        page.getByTestId("window-space-save-current-layout"),
      ).toBeEnabled();

      await clickWindowSpaceSaveCurrentLayout(page);

      await expect(
        page.getByText("Failed to save window space (404): Not Found"),
      ).toBeVisible();
      await expect(page.getByTestId("window-space-open")).toHaveCount(0);
    } finally {
      if (!page.isClosed()) {
        await page.unroute("**/api/createWindowSpace");
      }
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
