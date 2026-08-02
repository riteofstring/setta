import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
} from "../helpers";

import {
  buildStandaloneUrl,
  clickWindowSpaceSaveCurrentLayout,
  createFloatingProjectChatWindow,
  getProjectConfigNameFromUrl,
  navigateSameTabSpa,
  readProjectChatWindowingState,
  saveProjectConfigCopyWithRefs,
  seedAIStorePersistence,
  seedProjectChatDetails,
  seedProjectChatHistoryRuns,
  setOverviewTabInStore,
  setProjectChatWindowBounds,
  type AgentRunRecord,
} from "./standalone-project-surface-route-helpers";
test.describe.serial("standalone project surface thread routes", () => {
  test("standalone thread routes hydrate valid chats even when local history is empty", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const standalonePage = await page.context().newPage();
    const standaloneThreadChatId = "standalone-thread-hydrate-only";

    try {
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

      await page.context().route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify([
            ...runs.filter(
              (run) => run.inputs?.chatId !== standaloneThreadChatId,
            ),
            {
              id: "run-standalone-thread-hydrate-only",
              profileId: null,
              status: "completed",
              startedAt: "2026-02-01T00:00:00Z",
              finishedAt: "2026-02-01T00:00:01Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: projectContext.projectConfigId,
                chatId: standaloneThreadChatId,
                engineConfigId: managedEngineId,
                messages: [
                  {
                    id: "standalone-thread-hydrate-only-user",
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Hydrate this standalone thread.",
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
                id: "hydrated-assistant-message",
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: "Hydrated without local history.",
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
        standalonePage.getByText("Hydrated without local history."),
      ).toBeVisible();
      await expect(
        standalonePage.getByTestId("standalone-project-chat-thread-not-found"),
      ).toHaveCount(0);
    } finally {
      await standalonePage.close();
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone thread routes switch to another in-page thread without requiring a refresh", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const alphaChatId = "standalone-thread-alpha";
    const betaChatId = "standalone-thread-beta";
    const fixtures = [
      {
        instanceId: "standalone-history-alpha",
        chatId: alphaChatId,
        prompt: "Alpha standalone prompt",
        assistantText: "Alpha standalone thread marker.",
      },
      {
        instanceId: "standalone-history-beta",
        chatId: betaChatId,
        prompt: "Beta standalone prompt",
        assistantText: "Beta standalone thread marker.",
      },
    ];

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      await page.context().route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        const fixtureRuns = fixtures.map((fixture, index) => ({
          id: `standalone-switch-run-${fixture.chatId}`,
          profileId: null,
          status: "completed",
          startedAt: `2026-03-13T00:00:0${index}Z`,
          finishedAt: `2026-03-13T00:00:1${index}Z`,
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
                    text: fixture.prompt,
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
                !fixtures.some(
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
        const fixture = fixtures.find(
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
      await seedAIStorePersistence(page, {
        viewThreads: true,
        projectChatThreadsExplicitlyClosedAtLargeWidth: false,
      });

      await page.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/chat/${encodeURIComponent(alphaChatId)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await seedProjectChatHistoryRuns(
        page,
        projectContext.projectConfigId,
        fixtures,
      );
      await seedProjectChatDetails(page, fixtures, alphaChatId);

      const standaloneSurface = page.getByTestId(
        "standalone-project-chat-thread-surface",
      );
      await expect(standaloneSurface).toBeVisible();
      await expect(
        page.getByText("Alpha standalone thread marker."),
      ).toBeVisible();

      const betaThreadEntry = page.locator(
        `[data-testid="project-chat-thread-entry"][data-thread-id="${betaChatId}"]`,
      );
      await expect(betaThreadEntry).toBeVisible();
      await betaThreadEntry.click();

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`/${projectConfigName}/chat/${betaChatId}`);
      await expect(standaloneSurface).toBeVisible();
      await expect(
        page.getByText("Beta standalone thread marker."),
      ).toBeVisible();
      await expect(
        page.getByText("Alpha standalone thread marker."),
      ).toHaveCount(0);
    } finally {
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("saving a window space in one project does not inject it into another project after same-tab navigation", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();

    let releaseCreateWindowSpaceRequest: (() => void) | null = null;
    let createWindowSpaceRequestSeen: (() => void) | null = null;
    const createWindowSpaceRequestStarted = new Promise<void>((resolve) => {
      createWindowSpaceRequestSeen = resolve;
    });

    try {
      const copiedProject = await saveProjectConfigCopyWithRefs(
        page,
        projectContext.projectConfigId,
        "window-space-race-copy",
      );
      const raceWindowId = await createFloatingProjectChatWindow(
        page,
        "Race Window",
      );
      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return state.order.includes(raceWindowId);
        })
        .toBe(true);
      await setProjectChatWindowBounds(page, raceWindowId, {
        x: 80,
        y: 60,
        width: 520,
        height: 320,
      });

      await page.route("**/api/createWindowSpace", async (route) => {
        createWindowSpaceRequestSeen?.();
        const response = await route.fetch();
        const headers = response.headers();
        const body = await response.body();
        await new Promise<void>((resolve) => {
          releaseCreateWindowSpaceRequest = resolve;
        });
        await route.fulfill({
          status: response.status(),
          headers,
          body,
        });
      });

      await clickWindowSpaceSaveCurrentLayout(page);
      await createWindowSpaceRequestStarted;

      await navigateSameTabSpa(page, `/${copiedProject.name}`);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`/${copiedProject.name}`);
      await setOverviewTabInStore(page, "ViewModes");
      await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
      await expect(page.getByTestId("window-space-open")).toHaveCount(0);

      releaseCreateWindowSpaceRequest?.();

      await expect
        .poll(async () => page.getByTestId("window-space-open").count())
        .toBe(0);
    } finally {
      releaseCreateWindowSpaceRequest?.();
      if (!page.isClosed()) {
        await page.unroute("**/api/createWindowSpace");
      }
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone thread routes recover from a stale not-found state after same-tab SPA navigation", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const standalonePage = await page.context().newPage();
    const missingThreadChatId = "standalone-thread-missing";
    const validThreadChatId = "standalone-thread-recovered";

    try {
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

      await page.context().route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify([
            ...runs.filter(
              (run) =>
                run.inputs?.chatId !== missingThreadChatId &&
                run.inputs?.chatId !== validThreadChatId,
            ),
            {
              id: "run-standalone-thread-missing",
              profileId: null,
              status: "completed",
              startedAt: "2026-02-01T00:00:00Z",
              finishedAt: "2026-02-01T00:00:01Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: projectContext.projectConfigId,
                chatId: missingThreadChatId,
                engineConfigId: managedEngineId,
                messages: [
                  {
                    id: "standalone-thread-missing-user",
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Missing thread prompt.",
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
            {
              id: "run-standalone-thread-recovered",
              profileId: null,
              status: "completed",
              startedAt: "2026-02-01T00:00:02Z",
              finishedAt: "2026-02-01T00:00:03Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: projectContext.projectConfigId,
                chatId: validThreadChatId,
                engineConfigId: managedEngineId,
                messages: [
                  {
                    id: "standalone-thread-recovered-user",
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Recovered thread prompt.",
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
        if (payload?.chatId === missingThreadChatId) {
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
        if (payload?.chatId !== validThreadChatId) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            messages: [
              {
                id: "recovered-assistant-message",
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: "Recovered after same-tab navigation.",
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

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/chat/${encodeURIComponent(missingThreadChatId)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      await expect(
        standalonePage.getByTestId("standalone-project-chat-thread-not-found"),
      ).toBeVisible();

      const validThreadPath = `/${projectConfigName}/chat/${validThreadChatId}`;
      await standalonePage.evaluate((nextPath) => {
        window.history.pushState({}, "", nextPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, validThreadPath);

      await expect
        .poll(() => new URL(standalonePage.url()).pathname)
        .toBe(validThreadPath);
      await expect(
        standalonePage.getByTestId("standalone-project-chat-thread-surface"),
      ).toBeVisible();
      await expect(
        standalonePage.getByText("Recovered after same-tab navigation."),
      ).toBeVisible();
      await expect(
        standalonePage.getByTestId("standalone-project-chat-thread-not-found"),
      ).toHaveCount(0);
    } finally {
      await standalonePage.close();
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("standalone thread routes fail closed for blank chat ids", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const standalonePage = await page.context().newPage();

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/chat/%20`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      await expect(
        standalonePage.getByTestId("standalone-project-chat-thread-not-found"),
      ).toBeVisible();
      await expect(standalonePage.getByText("Thread Not Found")).toBeVisible();
      await expect(
        standalonePage.getByTestId("standalone-project-chat-thread-surface"),
      ).toHaveCount(0);
      await expect(
        standalonePage.getByTestId("standalone-project-chat-surface"),
      ).toHaveCount(0);
    } finally {
      await standalonePage.close();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
