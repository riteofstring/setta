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
  clearProjectChatWindowingState,
  clickWindowSpaceOpen,
  clickWindowSpaceSaveCurrentLayout,
  createFloatingProjectChatWindow,
  findFloatingWindowIdByBounds,
  findProjectChatWindowIdForSection,
  flushProjectChatWindowingWrites,
  getProjectChatWindowOrder,
  getProjectConfigNameFromUrl,
  loadProjectConfigState,
  readActiveProjectChatId,
  readProjectChatGitPaneVisibility,
  readProjectChatWindowingState,
  readSectionChatId,
  resolveSectionSlug,
  seedAIStorePersistence,
  seedProjectChatDetails,
  seedProjectChatWindowThreads,
  setActiveProjectChatId,
  setActiveSections,
  setOverviewTabInStore,
  setProjectChatWindowBounds,
  showSectionInProjectChatWindow,
  type AgentRunRecord,
  type ProjectChatThreadFixture,
} from "./standalone-project-surface-route-helpers";
test.describe.serial("standalone project surface routes", () => {
  test("keeps standalone project chat draft state isolated across project configs", async ({
    page,
  }) => {
    await ensureAppReady(page);
    let firstProjectContext: Awaited<
      ReturnType<typeof openIsolatedProject>
    > | null = null;
    let secondProjectContext: Awaited<
      ReturnType<typeof openIsolatedProject>
    > | null = null;

    try {
      firstProjectContext = await openIsolatedProject(page);
      const firstProjectName = getProjectConfigNameFromUrl(page.url());
      secondProjectContext = await openIsolatedProject(page);
      const secondProjectName = getProjectConfigNameFromUrl(page.url());

      await page.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(firstProjectName)}/chat`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        page.getByTestId("standalone-project-chat-surface"),
      ).toBeVisible();

      await page.evaluate(
        async ({ projectConfigId, draftText }) => {
          const { useAIStore } = await import("/src/state/definitions.ts");
          const { getDefaultChatDetails } = await import(
            "/src/state/actions/ai.ts"
          );
          const { buildStandalonePageProjectChatSurfaceId } = await import(
            "/src/components/ChatWindowing/projectChatSurfaceIds.ts"
          );
          const { createMessageTextContent, createUserChatMessage } =
            await import("/src/utils/generatedTypes.ts");
          const surfaceId =
            buildStandalonePageProjectChatSurfaceId(projectConfigId);

          useAIStore.setState((state) => ({
            ...state,
            pendingChatDetailsBySurfaceId: {
              ...state.pendingChatDetailsBySurfaceId,
              [surfaceId]: {
                ...getDefaultChatDetails(),
                messages: [
                  createUserChatMessage({
                    id: "standalone-project-a-draft",
                    content: [createMessageTextContent({ text: draftText })],
                    attachments: [],
                  }),
                ],
                waitingForResponse: true,
              },
            },
          }));
        },
        {
          projectConfigId: firstProjectContext.projectConfigId,
          draftText: "Standalone draft owned by project A",
        },
      );

      await expect(
        page.getByText("Standalone draft owned by project A"),
      ).toBeVisible();

      await page.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(secondProjectName)}/chat`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        page.getByTestId("standalone-project-chat-surface"),
      ).toBeVisible();
      await expect(
        page.getByText("Standalone draft owned by project A"),
      ).toHaveCount(0);
      if (!secondProjectContext) {
        throw new Error("Expected the second project context.");
      }
      await expect
        .poll(async () => {
          return await page.evaluate(
            async ({ projectConfigId }) => {
              const { useAIStore } = await import("/src/state/definitions.ts");
              const { buildStandalonePageProjectChatSurfaceId } = await import(
                "/src/components/ChatWindowing/projectChatSurfaceIds.ts"
              );
              const surfaceId =
                buildStandalonePageProjectChatSurfaceId(projectConfigId);
              return (
                useAIStore.getState().pendingChatDetailsBySurfaceId[
                  surfaceId
                ] !== undefined
              );
            },
            { projectConfigId: secondProjectContext.projectConfigId },
          );
        })
        .toBe(false);
    } finally {
      await cleanupIsolatedProject(page, secondProjectContext);
      await cleanupIsolatedProject(page, firstProjectContext);
    }
  });

  test("standalone project chat preserves unsent composer drafts across reloads", async ({
    page,
  }) => {
    await ensureAppReady(page);
    let projectContext: Awaited<ReturnType<typeof openIsolatedProject>> | null =
      null;
    const cleanupManagedEngine = await ensureManagedChatEngine(page);

    try {
      projectContext = await openIsolatedProject(page);
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      await page.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/chat`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      const standaloneSurface = page.getByTestId(
        "standalone-project-chat-surface",
      );
      await expect(standaloneSurface).toBeVisible();
      const composerInput =
        standaloneSurface.getByPlaceholder("Type a message...");
      const draftText = "  keep this standalone draft after reload  \n";
      await composerInput.fill(draftText);
      await expect(composerInput).toHaveValue(draftText);

      await page.reload({ waitUntil: "domcontentloaded" });
      const reloadedStandaloneSurface = page.getByTestId(
        "standalone-project-chat-surface",
      );
      await expect(reloadedStandaloneSurface).toBeVisible();
      await expect(
        reloadedStandaloneSurface.getByPlaceholder("Type a message..."),
      ).toHaveValue(draftText);
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone project chat reload restores the full waiting transcript instead of only the latest fragment", async ({
    page,
  }) => {
    await ensureAppReady(page);
    let projectContext: Awaited<ReturnType<typeof openIsolatedProject>> | null =
      null;
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const waitingChatId = "standalone-waiting-reload-thread";
    let llmHydrateCalls = 0;

    try {
      projectContext = await openIsolatedProject(page);
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs = (await engineConfigsResponse.json()) as Array<{
        id: string;
        engineType: string;
      }>;
      const managedEngineId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!managedEngineId) {
        throw new Error("Missing managed LLM engine config.");
      }
      await seedAIStorePersistence(page, {
        chatDetails: {
          [waitingChatId]: {
            messages: [
              {
                id: "assistant-live-fragment",
                role: "assistant",
                content: [{ type: "text", text: "Latest fragment only..." }],
                attachments: [],
              },
            ],
            toolCallArguments: {},
            waitingForResponse: true,
            llmConfig: null,
            contextUsage: null,
          },
        },
      });

      await page.context().route("**/api/getAgentRuns", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "run-waiting-thread",
              profileId: null,
              status: "running",
              startedAt: "2026-02-01T00:00:00Z",
              finishedAt: null,
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: projectContext.projectConfigId,
                chatId: waitingChatId,
                engineConfigId: managedEngineId,
                messages: [
                  {
                    id: "user-before-reload",
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Earlier question before reload.",
                      },
                    ],
                    attachments: [],
                  },
                ],
              },
              outputs: {},
              toolCalls: [],
              cost: null,
            },
          ]),
        });
      });
      await page.context().route("**/api/getLLMChat", async (route) => {
        const payload = route.request().postDataJSON() as
          | { chatId?: string }
          | undefined;
        if (payload?.chatId === waitingChatId) {
          llmHydrateCalls += 1;
        }
        if (payload?.chatId !== waitingChatId) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            messages: [
              {
                id: "user-before-reload",
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Earlier question before reload.",
                  },
                ],
                attachments: [],
              },
              {
                id: "assistant-before-reload",
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: "Earlier answer before reload.",
                  },
                ],
                attachments: [],
              },
              {
                id: "assistant-still-streaming",
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: "Streaming continuation after reload.",
                  },
                ],
                attachments: [],
              },
            ],
            waitingForResponse: true,
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

      await page.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/chat/${encodeURIComponent(waitingChatId)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      const standaloneThreadSurface = page.getByTestId(
        "standalone-project-chat-thread-surface",
      );
      await expect(standaloneThreadSurface).toBeVisible();

      // The route-owned chat id should immediately rehydrate the full thread
      // even though the optimistic local state starts with only the latest
      // streaming fragment.
      await expect.poll(() => llmHydrateCalls).toBeGreaterThan(0);
      await expect(
        standaloneThreadSurface.getByText("Earlier question before reload."),
      ).toBeVisible();
      await expect(
        standaloneThreadSurface.getByText("Earlier answer before reload."),
      ).toBeVisible();
      await expect(
        standaloneThreadSurface.getByText(
          "Streaming continuation after reload.",
        ),
      ).toBeVisible();

      await page.reload({ waitUntil: "domcontentloaded" });
      const reloadedStandaloneThreadSurface = page.getByTestId(
        "standalone-project-chat-thread-surface",
      );
      await expect(reloadedStandaloneThreadSurface).toBeVisible();
      await expect(
        reloadedStandaloneThreadSurface.getByText(
          "Earlier question before reload.",
        ),
      ).toBeVisible();
      await expect(
        reloadedStandaloneThreadSurface.getByText(
          "Earlier answer before reload.",
        ),
      ).toBeVisible();
      await expect(
        reloadedStandaloneThreadSurface.getByText(
          "Streaming continuation after reload.",
        ),
      ).toBeVisible();
    } finally {
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("re-hydrates the same standalone thread id when navigating across project configs", async ({
    page,
  }) => {
    await ensureAppReady(page);
    let firstProjectContext: Awaited<
      ReturnType<typeof openIsolatedProject>
    > | null = null;
    let secondProjectContext: Awaited<
      ReturnType<typeof openIsolatedProject>
    > | null = null;
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const sharedThreadChatId = "shared-standalone-thread";
    const llmHydrationCalls: Array<{
      chatId: string | undefined;
      projectConfigId: string | undefined;
    }> = [];

    try {
      firstProjectContext = await openIsolatedProject(page);
      const firstProjectName = getProjectConfigNameFromUrl(page.url());
      secondProjectContext = await openIsolatedProject(page);
      const secondProjectName = getProjectConfigNameFromUrl(page.url());
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs = (await engineConfigsResponse.json()) as Array<{
        id: string;
        engineType: string;
      }>;
      const managedEngineId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!managedEngineId) {
        throw new Error("Missing managed LLM engine config.");
      }

      await page.context().route("**/api/getAgentRuns", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "run-shared-thread-project-a",
              profileId: null,
              status: "completed",
              startedAt: "2026-02-01T00:00:00Z",
              finishedAt: "2026-02-01T00:00:01Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: firstProjectContext.projectConfigId,
                chatId: sharedThreadChatId,
                engineConfigId: managedEngineId,
                messages: [],
              },
              outputs: {},
              toolCalls: [],
              cost: null,
            },
            {
              id: "run-shared-thread-project-b",
              profileId: null,
              status: "completed",
              startedAt: "2026-02-01T00:00:02Z",
              finishedAt: "2026-02-01T00:00:03Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: secondProjectContext.projectConfigId,
                chatId: sharedThreadChatId,
                engineConfigId: managedEngineId,
                messages: [],
              },
              outputs: {},
              toolCalls: [],
              cost: null,
            },
          ]),
        });
      });

      await page.context().route("**/api/getLLMChat", async (route) => {
        const payload = route.request().postDataJSON() as
          | { chatId?: string; projectConfigId?: string }
          | undefined;
        llmHydrationCalls.push({
          chatId: payload?.chatId,
          projectConfigId: payload?.projectConfigId,
        });
        if (payload?.chatId !== sharedThreadChatId) {
          await route.continue();
          return;
        }
        if (
          firstProjectContext &&
          payload?.projectConfigId === firstProjectContext.projectConfigId
        ) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({
              detail: {
                errorCode: "chat_not_found",
                message: "Chat not found.",
              },
            }),
          });
          return;
        }
        if (
          secondProjectContext &&
          payload?.projectConfigId === secondProjectContext.projectConfigId
        ) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              messages: [
                {
                  id: "project-b-thread-message",
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: "Hydrated independently for project B.",
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
          return;
        }
        await route.continue();
      });

      await page.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(firstProjectName)}/chat/${encodeURIComponent(sharedThreadChatId)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        page.getByTestId("standalone-project-chat-thread-not-found"),
      ).toBeVisible();

      const secondThreadPath = `/${secondProjectName}/chat/${sharedThreadChatId}`;
      await page.evaluate(async (nextPath) => {
        const { router } = await import("/src/components/Pages/router.tsx");
        await router.navigate(nextPath);
      }, secondThreadPath);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(secondThreadPath);
      await expect(
        page.getByTestId("standalone-project-chat-thread-surface"),
      ).toBeVisible();
      await expect(
        page.getByText("Hydrated independently for project B."),
      ).toBeVisible();
      await expect(
        page.getByTestId("standalone-project-chat-thread-not-found"),
      ).toHaveCount(0);
      await expect
        .poll(() =>
          llmHydrationCalls.some(
            (call) =>
              call.chatId === sharedThreadChatId &&
              call.projectConfigId === secondProjectContext?.projectConfigId,
          ),
        )
        .toBe(true);
      const matchingHydrationCalls = llmHydrationCalls.filter(
        (call) => call.chatId === sharedThreadChatId,
      );
      expect(matchingHydrationCalls[0]).toEqual({
        chatId: sharedThreadChatId,
        projectConfigId: firstProjectContext.projectConfigId,
      });
      expect(
        matchingHydrationCalls.some(
          (call) =>
            call.projectConfigId === secondProjectContext.projectConfigId,
        ),
      ).toBe(true);
      expect(matchingHydrationCalls.at(-1)?.projectConfigId).toBe(
        secondProjectContext.projectConfigId,
      );
      expect(
        new Set(matchingHydrationCalls.map((call) => call.projectConfigId)),
      ).toEqual(
        new Set([
          firstProjectContext.projectConfigId,
          secondProjectContext.projectConfigId,
        ]),
      );
    } finally {
      await page.context().unroute("**/api/getLLMChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, secondProjectContext);
      await cleanupIsolatedProject(page, firstProjectContext);
    }
  });

  test("keeps standalone project surfaces isolated from workspace selection and windowing state", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const { sectionId: textSectionId, sectionName: textSectionName } =
      await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "Blue Star",
      );
    const { sectionId: chatSectionId, sectionName: chatSectionName } =
      await createChatSection(
        page,
        projectContext.projectConfigId,
        "Windowed Chat",
      );

    const standalonePage = await page.context().newPage();
    const standaloneThreadChatId = "standalone-thread-123";

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const textSectionSlug = await resolveSectionSlug(page, textSectionName);
      const chatSectionSlug = await resolveSectionSlug(page, chatSectionName);
      const browserContext = page.context();

      await browserContext.route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        const threadRun: AgentRunRecord = {
          id: "run-standalone-thread-123",
          profileId: null,
          status: "completed",
          startedAt: "2026-03-07T00:00:00Z",
          finishedAt: "2026-03-07T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: standaloneThreadChatId,
            sectionId: null,
            messages: [
              {
                id: "standalone-thread-user-message",
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Summarize the standalone routing plan.",
                  },
                ],
                attachments: [],
              },
            ],
          },
          outputs: {},
        };
        const dedupedRuns = runs.filter((run) => run.id !== threadRun.id);
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify([...dedupedRuns, threadRun]),
        });
      });
      await browserContext.route("**/api/getLLMChat", async (route) => {
        const payload = route.request().postDataJSON() as
          | { chatId?: string }
          | undefined;
        if (payload?.chatId !== standaloneThreadChatId) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            messages: [
              {
                id: "standalone-thread-assistant-message",
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: "Standalone thread route hydrated successfully.",
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

      await setActiveSections(page, [textSectionId]);
      await setActiveProjectChatId(page, "workspace-thread");

      await expect
        .poll(async () => {
          const state = await loadProjectConfigState(page, projectConfigName);
          return state.projectConfig.activeIds;
        })
        .toEqual([textSectionId]);

      const baselineWindowingState = await readProjectChatWindowingState(page);
      const baselineWindowOrder = getProjectChatWindowOrder(
        baselineWindowingState,
      );

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/chat`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      await expect(
        standalonePage.getByTestId("standalone-project-chat-surface"),
      ).toBeVisible();
      await expect(standalonePage.locator("#OverviewPane")).toHaveCount(0);
      await expect(standalonePage.locator("#UiEditorPane")).toHaveCount(0);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return {
            activeIds: (await loadProjectConfigState(page, projectConfigName))
              .projectConfig.activeIds,
            order: getProjectChatWindowOrder(state),
          };
        })
        .toEqual({
          activeIds: [textSectionId],
          order: baselineWindowOrder,
        });

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/section/${encodeURIComponent(textSectionSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      await expect(
        standalonePage.getByTestId("standalone-section-surface"),
      ).toBeVisible();
      await expect(
        standalonePage.getByText(textSectionName, { exact: true }),
      ).toBeVisible();
      await expect(standalonePage.locator("#OverviewPane")).toHaveCount(0);
      await expect(standalonePage.locator("#UiEditorPane")).toHaveCount(0);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return {
            activeIds: (await loadProjectConfigState(page, projectConfigName))
              .projectConfig.activeIds,
            order: getProjectChatWindowOrder(state),
          };
        })
        .toEqual({
          activeIds: [textSectionId],
          order: baselineWindowOrder,
        });

      await showSectionInProjectChatWindow(page, chatSectionId);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return findProjectChatWindowIdForSection(state, chatSectionId);
        })
        .not.toBeNull();

      const windowedState = await readProjectChatWindowingState(page);
      const externalizedWindowId = findProjectChatWindowIdForSection(
        windowedState,
        chatSectionId,
      );
      if (!externalizedWindowId) {
        throw new Error(
          "Expected a persisted project chat window for the chat section.",
        );
      }
      const windowedOrder = getProjectChatWindowOrder(windowedState);

      await expect(
        page.locator(
          `[data-testid="project-chat-bottom-dock-window-panel"][data-chat-window-instance-id="${externalizedWindowId}"]`,
        ),
      ).toBeVisible();
      await expect(
        page.locator(
          `[data-testid="project-chat-canvas-floating-placeholder"][data-chat-window-section-id="${chatSectionId}"]`,
        ),
      ).toBeVisible();

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/section/${encodeURIComponent(chatSectionSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      await expect(
        standalonePage.getByTestId("standalone-section-surface"),
      ).toBeVisible();
      await expect(
        standalonePage.getByText(chatSectionName, { exact: true }),
      ).toBeVisible();
      await expect(
        standalonePage.locator(
          '[data-chat-surface-host="standalone_page"][data-chat-surface-mode="section_mode"]',
        ),
      ).toBeVisible();
      await expect(
        standalonePage.getByRole("button", { name: "Send message" }),
      ).toBeVisible();
      await expect(
        standalonePage.getByTestId("project-chat-canvas-floating-placeholder"),
      ).toHaveCount(0);
      await expect(standalonePage.locator("#OverviewPane")).toHaveCount(0);
      await expect(standalonePage.locator("#UiEditorPane")).toHaveCount(0);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return {
            activeIds: (await loadProjectConfigState(page, projectConfigName))
              .projectConfig.activeIds,
            order: getProjectChatWindowOrder(state),
          };
        })
        .toEqual({
          activeIds: [textSectionId],
          order: windowedOrder,
        });

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/chat/${encodeURIComponent(standaloneThreadChatId)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      await expect(
        standalonePage.getByTestId("standalone-project-chat-thread-surface"),
      ).toBeVisible();
      await expect(
        standalonePage.getByText(
          "Standalone thread route hydrated successfully.",
        ),
      ).toBeVisible();
      await expect(standalonePage.locator("#OverviewPane")).toHaveCount(0);
      await expect(standalonePage.locator("#UiEditorPane")).toHaveCount(0);

      await expect
        .poll(async () => {
          return {
            workspaceChatId: await readActiveProjectChatId(page),
            standalonePath: new URL(standalonePage.url()).pathname,
          };
        })
        .toEqual({
          workspaceChatId: "workspace-thread",
          standalonePath: `/${projectConfigName}/chat/${standaloneThreadChatId}`,
        });

      await standalonePage.getByRole("button", { name: "New Chat" }).click();
      await expect
        .poll(async () => {
          return {
            workspaceChatId: await readActiveProjectChatId(page),
            standalonePath: new URL(standalonePage.url()).pathname,
          };
        })
        .toEqual({
          workspaceChatId: "workspace-thread",
          standalonePath: `/${projectConfigName}/chat`,
        });
    } finally {
      await standalonePage.close();
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone section routes stay bound to their section thread and keep workspace project chat isolated", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const standalonePage = await page.context().newPage();

    try {
      await setOverviewTabInStore(page, "ProjectAIChat");
      const { sectionId: chatSectionId, sectionName: chatSectionName } =
        await createChatSection(
          page,
          projectContext.projectConfigId,
          "Standalone Route Chat",
        );
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const chatSectionSlug = await resolveSectionSlug(page, chatSectionName);

      // Convert the canvas chat section onto the authoritative project-ai
      // binding path so both the workspace and standalone route read the same
      // stored section thread id.
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
          return findProjectChatWindowIdForSection(state, chatSectionId);
        })
        .not.toBeNull();
      const resolvedWindowingState = await readProjectChatWindowingState(page);
      const resolvedSectionBindingId = findProjectChatWindowIdForSection(
        resolvedWindowingState,
        chatSectionId,
      );
      if (!resolvedSectionBindingId) {
        throw new Error("Expected a section binding for the standalone route.");
      }

      await page.evaluate(
        async ({
          instanceId,
          chatId,
        }: {
          instanceId: string;
          chatId: string;
        }) => {
          const { setProjectChatWindowChatId } = await import(
            "/src/state/actions/projectChatWindowing.ts"
          );
          setProjectChatWindowChatId(instanceId, chatId);
        },
        {
          instanceId: resolvedSectionBindingId,
          chatId: "section-thread",
        },
      );

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return state.instancesById[resolvedSectionBindingId]?.chatId ?? null;
        })
        .toBe("section-thread");

      const threadFixtures: ProjectChatThreadFixture[] = [
        {
          instanceId: "workspace-window",
          chatId: "workspace-thread",
          assistantText: "Workspace global thread marker",
        },
        {
          instanceId: resolvedSectionBindingId,
          chatId: "section-thread",
          assistantText: "Section route thread marker",
        },
      ];
      await seedProjectChatDetails(page, threadFixtures, "workspace-thread");

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/section/${encodeURIComponent(chatSectionSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await seedProjectChatDetails(
        standalonePage,
        threadFixtures,
        "workspace-thread",
      );

      const workspaceSection = page.locator(
        `section[data-section-id="${chatSectionId}"]`,
      );
      const standaloneSectionSurface = standalonePage.getByTestId(
        "standalone-section-surface",
      );

      await expect
        .poll(async () => await readActiveProjectChatId(page))
        .toBe("workspace-thread");
      await expect(workspaceSection).toContainText(
        "Section route thread marker",
      );
      await expect(workspaceSection).not.toContainText(
        "Workspace global thread marker",
      );
      await expect(standaloneSectionSurface).toContainText(
        "Section route thread marker",
      );
      await expect(standaloneSectionSurface).not.toContainText(
        "Workspace global thread marker",
      );

      // Starting a new thread from the standalone section route should only
      // clear the section binding. The workspace-global thread selection must
      // stay on its own chat id.
      await standaloneSectionSurface
        .getByRole("button", { name: "New Chat" })
        .click();

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(standalonePage);
          return state.instancesById[resolvedSectionBindingId]?.chatId ?? null;
        })
        .toBeNull();
      await expect
        .poll(async () => await readActiveProjectChatId(page))
        .toBe("workspace-thread");
      await expect(standaloneSectionSurface).not.toContainText(
        "Section route thread marker",
      );
    } finally {
      await standalonePage.close();
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone section routes resolve the renamed slug and fail closed on the stale slug", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const standalonePage = await page.context().newPage();

    try {
      const { sectionId, sectionName } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "Standalone Slug Route",
      );
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const initialSlug = await resolveSectionSlug(page, sectionName);
      const renamedSectionName = `${sectionName}-renamed`;
      const renamedSlug = await resolveSectionSlug(page, renamedSectionName);

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/section/${encodeURIComponent(initialSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        standalonePage.getByTestId("standalone-section-surface"),
      ).toBeVisible();
      await expect(
        standalonePage.getByText(sectionName, { exact: true }),
      ).toBeVisible();

      await postBackend(page, "/setSectionName", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        name: renamedSectionName,
      });

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/section/${encodeURIComponent(initialSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        standalonePage.getByTestId("standalone-section-not-found"),
      ).toBeVisible();

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/section/${encodeURIComponent(renamedSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        standalonePage.getByTestId("standalone-section-surface"),
      ).toBeVisible();
      await expect(
        standalonePage.getByText(renamedSectionName, { exact: true }),
      ).toBeVisible();
    } finally {
      await standalonePage.close();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

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
  });
});
