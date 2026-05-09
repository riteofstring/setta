import { expect, test } from "@playwright/test";
import {
  cleanupGitOverlayFixture,
  getWorkspaceRootOrThrow,
  seedGitOverlayFixture,
} from "../git/helpers/gitOverlayFixture";
import {
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
  clearProjectChatWindowingState,
  clickWindowSpaceOpen,
  clickWindowSpaceSaveCurrentLayout,
  createFloatingProjectChatWindow,
  createTerminalSection,
  findProjectChatWindowIdForSection,
  getProjectChatWindowOrder,
  getProjectConfigNameFromUrl,
  loadProjectConfigState,
  readProjectChatWindowingState,
  readSectionChatId,
  resolveWorkspaceSnapBounds,
  seedProjectChatDetails,
  seedProjectChatWindowThreads,
  setOverviewTabInStore,
  setProjectChatWindowBounds,
  showSectionInProjectChatWindow,
  syncProjectChatWindowingInStore,
  syncWindowSpacesFromBackend,
  type AgentRunRecord,
  type ProjectChatThreadFixture,
} from "./standalone-project-surface-route-helpers";
test.describe.serial("standalone project surface routes", () => {
  test("standalone section windows keep their saved project-ai thread even without a live workspace binding", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
    const standalonePage = await page.context().newPage();

    try {
      const { sectionId: chatSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "Linked Research Chat",
      );
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      await showSectionInProjectChatWindow(page, chatSectionId, "floating");

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return findProjectChatWindowIdForSection(state, chatSectionId) ?? "";
        })
        .not.toBe("");
      const sectionWindowState = await readProjectChatWindowingState(page);
      const sectionWindowId = findProjectChatWindowIdForSection(
        sectionWindowState,
        chatSectionId,
      );
      if (!sectionWindowId) {
        throw new Error("Expected a floating section window before saving.");
      }

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

      const fixtures: ProjectChatThreadFixture[] = [
        {
          instanceId: sectionWindowId,
          chatId: "saved-section-thread",
          assistantText: "Saved section thread marker",
        },
        {
          instanceId: "fallback-window",
          chatId: "fallback-active-thread",
          assistantText: "Fallback active thread marker",
        },
      ];

      await seedProjectChatWindowThreads(page, [fixtures[0]]);
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

      await clearProjectChatWindowingState(
        page,
        projectContext.projectConfigId,
      );
      await expect
        .poll(async () =>
          getProjectChatWindowOrder(await readProjectChatWindowingState(page)),
        )
        .toEqual([]);

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/windowspace/${encodeURIComponent(windowSpaceSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await seedProjectChatDetails(
        standalonePage,
        fixtures,
        fixtures[1]?.chatId ?? null,
      );

      const standaloneSectionWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${sectionWindowId}"]`,
      );
      await expect(standaloneSectionWindow).toBeVisible();
      await expect(
        standaloneSectionWindow.locator(
          '[data-chat-surface-mode="project_ai_mode"]',
        ),
      ).toBeVisible();
      await expect(standaloneSectionWindow).toContainText(
        "Saved section thread marker",
      );
      await expect(standaloneSectionWindow).not.toContainText(
        "Fallback active thread marker",
      );
    } finally {
      await standalonePage.close();
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("workspace floating section windows switch threads through the section binding and survive reload", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);

    try {
      const { sectionId: chatSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "Workspace Floating Section Chat",
      );
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        managed: true,
        engineConfigId: null,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });

      await page.context().route("**/api/getAgentRuns", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "run-thread-alpha",
              profileId: null,
              status: "completed",
              startedAt: "2026-03-11T00:00:00Z",
              finishedAt: "2026-03-11T00:00:01Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: projectContext.projectConfigId,
                chatId: "section-thread-alpha",
                sectionId: chatSectionId,
                messages: [
                  {
                    id: "thread-alpha-user",
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Alpha thread label",
                      },
                    ],
                    attachments: [],
                  },
                ],
              },
              outputs: {},
            },
            {
              id: "run-thread-beta",
              profileId: null,
              status: "completed",
              startedAt: "2026-03-12T00:00:00Z",
              finishedAt: "2026-03-12T00:00:01Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: projectContext.projectConfigId,
                chatId: "section-thread-beta",
                sectionId: chatSectionId,
                messages: [
                  {
                    id: "thread-beta-user",
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Beta thread label",
                      },
                    ],
                    attachments: [],
                  },
                ],
              },
              outputs: {},
            },
          ]),
        });
      });
      await page.context().route("**/api/getLLMChat", async (route) => {
        const payload = route.request().postDataJSON() as
          | { chatId?: string }
          | undefined;
        if (payload?.chatId === "section-thread-alpha") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              messages: [
                {
                  id: "section-thread-alpha-assistant",
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: "Alpha thread marker",
                    },
                  ],
                  attachments: [],
                  tool_calls: null,
                },
              ],
              waitingForResponse: false,
              llmConfig: {
                id: "section-history-config",
                model: "gpt-4o-mini",
                provider: "openai",
                base_url: null,
                api_key_env: null,
                other_params: null,
                mcpServerIds: [],
                temporary: false,
              },
              contextUsage: null,
            }),
          });
          return;
        }
        if (payload?.chatId === "section-thread-beta") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              messages: [
                {
                  id: "section-thread-beta-assistant",
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: "Beta thread marker",
                    },
                  ],
                  attachments: [],
                  tool_calls: null,
                },
              ],
              waitingForResponse: false,
              llmConfig: {
                id: "section-history-config",
                model: "gpt-4o-mini",
                provider: "openai",
                base_url: null,
                api_key_env: null,
                other_params: null,
                mcpServerIds: [],
                temporary: false,
              },
              contextUsage: null,
            }),
          });
          return;
        }
        await route.continue();
      });

      await showSectionInProjectChatWindow(page, chatSectionId, "floating");
      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return findProjectChatWindowIdForSection(state, chatSectionId) ?? "";
        })
        .not.toBe("");
      const sectionWindowId =
        findProjectChatWindowIdForSection(
          await readProjectChatWindowingState(page),
          chatSectionId,
        ) ?? "";
      if (!sectionWindowId) {
        throw new Error("Expected a floating section window.");
      }

      const floatingSectionWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${sectionWindowId}"]`,
      );
      await expect(floatingSectionWindow).toBeVisible();

      await floatingSectionWindow
        .getByRole("button", { name: "History" })
        .click();
      await expect(
        floatingSectionWindow.getByRole("button", {
          name: "Beta thread label",
        }),
      ).toBeVisible();
      await floatingSectionWindow
        .getByRole("button", { name: "Beta thread label" })
        .click();

      await expect(floatingSectionWindow).toContainText("Beta thread marker");
      await expect(floatingSectionWindow).not.toContainText(
        "Alpha thread marker",
      );
      await expect
        .poll(async () => await readSectionChatId(page, chatSectionId))
        .toBe("section-thread-beta");
      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return state.instancesById[sectionWindowId]?.chatId ?? null;
        })
        .toBeNull();

      await page.reload({ waitUntil: "domcontentloaded" });

      const reloadedFloatingSectionWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${sectionWindowId}"]`,
      );
      await expect(reloadedFloatingSectionWindow).toBeVisible();
      await expect(reloadedFloatingSectionWindow).toContainText(
        "Beta thread marker",
      );
      await expect
        .poll(async () => await readSectionChatId(page, chatSectionId))
        .toBe("section-thread-beta");
      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return state.instancesById[sectionWindowId]?.chatId ?? null;
        })
        .toBeNull();
    } finally {
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone section windows follow the live section-mode thread when the workspace thread changes", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
    const standalonePage = await page.context().newPage();

    try {
      const { sectionId: chatSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "Standalone Section Mode Chat",
      );
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        managed: true,
        engineConfigId: null,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      await showSectionInProjectChatWindow(page, chatSectionId, "floating");

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return findProjectChatWindowIdForSection(state, chatSectionId) ?? "";
        })
        .not.toBe("");
      const sectionWindowId =
        findProjectChatWindowIdForSection(
          await readProjectChatWindowingState(page),
          chatSectionId,
        ) ?? "";
      if (!sectionWindowId) {
        throw new Error("Expected a floating section window before saving.");
      }

      await seedProjectChatWindowThreads(page, [
        {
          instanceId: sectionWindowId,
          chatId: "saved-section-thread",
          assistantText: "Saved section thread marker",
        },
      ]);
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

      await page.evaluate(
        async ({
          projectConfigId,
          sectionId,
          chatId,
        }: {
          projectConfigId: string;
          sectionId: string;
          chatId: string;
        }) => {
          const { setChatSectionChatId } = await import("/src/openapi/http");
          const { callOpenAPI } = await import(
            "/tests/e2e/browserAppSubsystemSdk.ts"
          );
          await callOpenAPI(
            setChatSectionChatId({
              body: {
                projectConfigId,
                sectionId,
                chatId,
              },
            } as Parameters<typeof setChatSectionChatId>[0]),
          );
        },
        {
          projectConfigId: projectContext.projectConfigId,
          sectionId: chatSectionId,
          chatId: "workspace-thread",
        },
      );

      const fixtures: ProjectChatThreadFixture[] = [
        {
          instanceId: sectionWindowId,
          chatId: "saved-section-thread",
          assistantText: "Saved section thread marker",
        },
        {
          instanceId: "workspace-section-window",
          chatId: "workspace-thread",
          assistantText: "Workspace section thread marker",
        },
      ];
      await seedProjectChatDetails(page, fixtures, "workspace-thread");
      await clearProjectChatWindowingState(
        page,
        projectContext.projectConfigId,
      );

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/windowspace/${encodeURIComponent(windowSpaceSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await seedProjectChatDetails(
        standalonePage,
        fixtures,
        "workspace-thread",
      );

      const standaloneSectionWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${sectionWindowId}"]`,
      );

      // Standalone section-mode windows should always follow the live section thread.
      await expect(standaloneSectionWindow).toBeVisible();
      await expect(
        standaloneSectionWindow.locator(
          '[data-chat-surface-mode="section_mode"]',
        ),
      ).toBeVisible();
      await expect(standaloneSectionWindow).toContainText(
        "Workspace section thread marker",
      );
      await expect(standaloneSectionWindow).not.toContainText(
        "Saved section thread marker",
      );
    } finally {
      await standalonePage.close();
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone window-space owner rebinding resets stale local section thread state", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
    const standalonePage = await page.context().newPage();

    try {
      const { sectionId: firstSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "First Linked Research Chat",
      );
      const { sectionId: secondSectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "Second Linked Research Chat",
      );
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      await showSectionInProjectChatWindow(page, firstSectionId, "floating");
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
      }, firstSectionId);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return findProjectChatWindowIdForSection(state, firstSectionId) ?? "";
        })
        .not.toBe("");
      const firstSectionWindowId =
        findProjectChatWindowIdForSection(
          await readProjectChatWindowingState(page),
          firstSectionId,
        ) ?? "";
      if (!firstSectionWindowId) {
        throw new Error("Expected a floating section window before saving.");
      }

      await seedProjectChatWindowThreads(page, [
        {
          instanceId: firstSectionWindowId,
          chatId: "saved-section-thread-a",
          assistantText: "Saved section A marker",
        },
      ]);
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
      await seedProjectChatDetails(
        standalonePage,
        [
          {
            instanceId: firstSectionWindowId,
            chatId: "saved-section-thread-a",
            assistantText: "Saved section A marker",
          },
          {
            instanceId: "rebound-section-window",
            chatId: "saved-section-thread-b",
            assistantText: "Saved section B marker",
          },
          {
            instanceId: "fallback-active-window",
            chatId: "fallback-active-thread",
            assistantText: "Fallback active thread marker",
          },
        ],
        "fallback-active-thread",
      );

      const standaloneSectionWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${firstSectionWindowId}"]`,
      );
      await expect(standaloneSectionWindow).toContainText(
        "Saved section A marker",
      );

      await standaloneSectionWindow
        .getByRole("button", { name: "New Chat" })
        .click();
      await expect(standaloneSectionWindow).not.toContainText(
        "Saved section A marker",
      );

      await standalonePage.evaluate(
        async ({
          nextWindowSpaceId,
          nextWindowId,
          nextSectionId,
          nextChatId,
        }) => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          useProjectState.setState((state) => {
            const nextWindow =
              state.projectConfig.windowSpaces[nextWindowSpaceId]?.windowsById[
                nextWindowId
              ];
            if (!nextWindow) {
              throw new Error("Missing saved standalone window.");
            }
            nextWindow.sectionIdOrNull = nextSectionId;
            nextWindow.chatId = nextChatId;
          });
        },
        {
          nextWindowSpaceId: windowSpace.id,
          nextWindowId: firstSectionWindowId,
          nextSectionId: secondSectionId,
          nextChatId: "saved-section-thread-b",
        },
      );

      await expect(standaloneSectionWindow).toContainText(
        "Saved section B marker",
      );
      await expect(standaloneSectionWindow).not.toContainText(
        "Fallback active thread marker",
      );
    } finally {
      await standalonePage.close();
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone window spaces adopt same-layout saved chat and git updates without navigation", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const gitFixture = await seedGitOverlayFixture(getWorkspaceRootOrThrow(), {
      historyCommitCount: 4,
    });
    const standalonePage = await page.context().newPage();

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const projectChatWindowId = await createFloatingProjectChatWindow(
        page,
        "Saved Workspace Chat",
      );
      const projectChatFixtures: ProjectChatThreadFixture[] = [
        {
          instanceId: projectChatWindowId,
          chatId: "window-chat-a",
          assistantText: "Window chat A marker",
        },
        {
          instanceId: projectChatWindowId,
          chatId: "window-chat-b",
          assistantText: "Window chat B marker",
        },
      ];
      await page.context().route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        const fixtureRuns = projectChatFixtures.map((fixture, index) => ({
          id: `run-${fixture.chatId}`,
          profileId: null,
          status: "completed",
          startedAt: `2026-03-11T00:00:0${index}Z`,
          finishedAt: `2026-03-11T00:00:1${index}Z`,
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: fixture.chatId,
            sectionId: null,
            messages: [
              {
                id: `user-${fixture.chatId}`,
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Prompt for ${fixture.chatId}`,
                  },
                ],
                attachments: [],
              },
            ],
          },
          outputs: {},
        }));
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify([
            ...runs.filter(
              (run) =>
                !projectChatFixtures.some(
                  (fixture) => fixture.chatId === run.inputs.chatId,
                ),
            ),
            ...fixtureRuns,
          ]),
        });
      });
      await page.context().route("**/api/getLLMChat", async (route) => {
        const payload = route.request().postDataJSON() as
          | { chatId?: string }
          | undefined;
        const fixture = projectChatFixtures.find(
          (candidate) => candidate.chatId === payload?.chatId,
        );
        if (!fixture) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            messages: [
              {
                id: `assistant-${fixture.chatId}`,
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: fixture.assistantText,
                  },
                ],
                attachments: [],
                tool_calls: null,
              },
            ],
            waitingForResponse: false,
            llmConfig: {
              id: "standalone-thread-config",
              model: "gpt-4o-mini",
              provider: "openai",
              base_url: null,
              api_key_env: null,
              other_params: null,
              mcpServerIds: [],
              temporary: false,
            },
            contextUsage: null,
          }),
        });
      });
      await seedProjectChatWindowThreads(page, [projectChatFixtures[0]]);

      await setOverviewTabInStore(page, "Git");
      await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();
      const graphButton = page
        .getByTestId("overview-tab-content-shell")
        .getByRole("button", { name: "Graph" });
      await expect(graphButton).toBeEnabled();
      await graphButton.click();

      const trackedWindow = page.getByTestId("project-chat-maximized-window");
      await expect(trackedWindow).toBeVisible();
      const gitWindowId = await trackedWindow.getAttribute(
        "data-chat-window-instance-id",
      );
      if (!gitWindowId) {
        throw new Error("Expected workspace git graph window instance id.");
      }
      await trackedWindow.getByTestId("project-chat-window-restore").click();

      await setOverviewTabInStore(page, "ViewModes");
      await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
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
      await seedProjectChatDetails(
        standalonePage,
        projectChatFixtures,
        "window-chat-a",
      );

      const standaloneProjectChatWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${projectChatWindowId}"]`,
      );
      const standaloneGitWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${gitWindowId}"]`,
      );
      const standaloneGitToggle = standaloneGitWindow.getByTestId(
        "git-graph-toggle-embedded-git-pane",
      );

      await expect(standaloneProjectChatWindow).toContainText(
        "Window chat A marker",
      );
      await expect(standaloneProjectChatWindow).not.toContainText(
        "Window chat B marker",
      );
      await expect(standaloneGitToggle).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      const initialProjectChatZIndex =
        await standaloneProjectChatWindow.evaluate(
          (element) => getComputedStyle(element).zIndex,
        );
      expect(initialProjectChatZIndex).not.toBe("7");

      await standalonePage.evaluate(
        async ({
          nextWindowSpaceId,
          nextProjectChatWindowId,
          nextGitWindowId,
        }: {
          nextWindowSpaceId: string;
          nextProjectChatWindowId: string;
          nextGitWindowId: string;
        }) => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          useProjectState.setState((state) => {
            const savedWindowSpace =
              state.projectConfig.windowSpaces[nextWindowSpaceId];
            if (!savedWindowSpace) {
              throw new Error("Missing saved standalone window space.");
            }
            const savedProjectChatWindow =
              savedWindowSpace.windowsById[nextProjectChatWindowId];
            if (!savedProjectChatWindow) {
              throw new Error("Missing saved standalone chat window.");
            }

            const savedGitWindow =
              savedWindowSpace.windowsById[nextGitWindowId];
            if (!savedGitWindow) {
              throw new Error("Missing saved standalone git window.");
            }
            state.projectConfig.windowSpaces = {
              ...state.projectConfig.windowSpaces,
              [nextWindowSpaceId]: {
                ...savedWindowSpace,
                windowsById: {
                  ...savedWindowSpace.windowsById,
                  [nextProjectChatWindowId]: {
                    ...savedProjectChatWindow,
                    chatId: "window-chat-b",
                    zIndex: 7,
                  },
                  [nextGitWindowId]: {
                    ...savedGitWindow,
                    embeddedGitPaneVisible: true,
                    zIndex: 3,
                  },
                },
              },
            };
          });
        },
        {
          nextWindowSpaceId: windowSpace.id,
          nextProjectChatWindowId: projectChatWindowId,
          nextGitWindowId: gitWindowId,
        },
      );

      await expect(standaloneProjectChatWindow).toContainText(
        "Window chat B marker",
      );
      await expect(standaloneProjectChatWindow).not.toContainText(
        "Window chat A marker",
      );
      await expect(standaloneGitToggle).toHaveAttribute("aria-pressed", "true");
      await expect(standaloneProjectChatWindow).toHaveCSS("z-index", "7");
    } finally {
      await standalonePage.close();
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await cleanupGitOverlayFixture(gitFixture);
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone git graph windows keep git-pane visibility local to the standalone surface", async ({
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

      const standaloneWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${graphWindowId}"]`,
      );
      await expect(standaloneWindow).toBeVisible();
      const standaloneToggle = standaloneWindow.getByTestId(
        "git-graph-toggle-embedded-git-pane",
      );
      await expect(standaloneToggle).toHaveAttribute("aria-pressed", "true");

      await standaloneToggle.click();
      await expect(standaloneToggle).toHaveAttribute("aria-pressed", "false");
      await expect(workspaceToggle).toHaveAttribute("aria-pressed", "true");
    } finally {
      await standalonePage.close();
      await cleanupGitOverlayFixture(gitFixture);
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("floating terminal section windows inset terminal content away from the frame edge", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const terminalId = await createTerminalSection(page);
      await showSectionInProjectChatWindow(page, terminalId, "floating");

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return findProjectChatWindowIdForSection(state, terminalId) ?? "";
        })
        .not.toBe("");
      const resolvedTerminalWindowId =
        findProjectChatWindowIdForSection(
          await readProjectChatWindowingState(page),
          terminalId,
        ) ?? "";
      if (!resolvedTerminalWindowId) {
        throw new Error("Expected a floating terminal window instance id.");
      }

      const floatingWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${resolvedTerminalWindowId}"]`,
      );
      const sectionSurface = floatingWindow.locator(
        `section[data-testid="section-window-surface"][data-section-id="${terminalId}"]`,
      );
      const terminalEditor = sectionSurface.locator(
        "[data-section-main-editor]",
      );

      await expect(floatingWindow).toBeVisible();
      await expect(sectionSurface).toBeVisible();
      await expect(sectionSurface.locator(".xterm")).toBeVisible();
      await expect(
        sectionSurface.locator('[data-terminal-window-host-inset="true"]'),
      ).toHaveCount(1);
      await expect(terminalEditor).toBeVisible();

      const surfaceBox = await sectionSurface.boundingBox();
      const terminalEditorBox = await terminalEditor.boundingBox();
      if (!surfaceBox || !terminalEditorBox) {
        throw new Error("Expected floating terminal bounds.");
      }

      expect(terminalEditorBox.x - surfaceBox.x).toBeGreaterThanOrEqual(8);
      expect(
        surfaceBox.x +
          surfaceBox.width -
          (terminalEditorBox.x + terminalEditorBox.width),
      ).toBeGreaterThanOrEqual(8);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

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
