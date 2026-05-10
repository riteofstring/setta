import { expect, test } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
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
  findProjectChatWindowIdForSection,
  getProjectConfigNameFromUrl,
  loadProjectConfigState,
  navigateSameTabSpa,
  readProjectChatWindowingState,
  resolveWorkspaceSnapBounds,
  saveProjectConfigCopyWithRefs,
  seedProjectChatWindowThreads,
  setOverviewTabInStore,
  setProjectChatWindowBounds,
  showSectionInProjectChatWindow,
  type AgentRunRecord,
  type ProjectChatThreadFixture,
} from "./standalone-project-surface-route-helpers";
test.describe.serial("standalone project surface route window spaces", () => {
  test("standalone thread routes fail closed when multiple runtimes answer the same chat id", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    const standalonePage = await page.context().newPage();
    const standaloneThreadChatId = "standalone-thread-ambiguous";

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
              id: "run-standalone-thread-ambiguous",
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
                    id: "standalone-thread-ambiguous-user",
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Hydrate the ambiguous thread.",
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
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail: {
              errorCode: "chat_runtime_ambiguous",
              message:
                "This chat id matches multiple runtimes and cannot be hydrated safely.",
            },
          }),
        });
      });
      await page
        .context()
        .route("**/api/getExternalAgentChat", async (route) => {
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
                  id: "external-ambiguous-message",
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: "External runtime transcript",
                    },
                  ],
                  attachments: [],
                  tool_calls: null,
                },
              ],
              waitingForResponse: false,
              toolCallArguments: {
                "tool-call-1": '{\n  "runtime": "external"\n}',
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
        standalonePage.getByTestId("project-chat-thread-blocked-banner"),
      ).toContainText("multiple chat runtimes");
      await expect(
        standalonePage.getByText("Managed runtime transcript"),
      ).toHaveCount(0);
      await expect(
        standalonePage.getByText("External runtime transcript"),
      ).toHaveCount(0);
    } finally {
      await standalonePage.close();
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await page.context().unroute("**/api/getExternalAgentChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("saved window spaces preserve distinct project chat threads per window in both workspace and standalone views", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
    const standalonePage = await page.context().newPage();

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const alphaWindowId = await createFloatingProjectChatWindow(
        page,
        "Alpha Chat",
      );
      const betaWindowId = await createFloatingProjectChatWindow(
        page,
        "Beta Chat",
      );
      const fixtures: ProjectChatThreadFixture[] = [
        {
          instanceId: alphaWindowId,
          chatId: "window-chat-alpha",
          assistantText: "Workspace alpha thread marker",
        },
        {
          instanceId: betaWindowId,
          chatId: "window-chat-beta",
          assistantText: "Workspace beta thread marker",
        },
      ];

      await page.context().route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        const fixtureRuns = fixtures.map((fixture, index) => ({
          id: `run-${fixture.chatId}`,
          profileId: null,
          status: "completed",
          startedAt: `2026-03-07T00:00:0${index}Z`,
          finishedAt: `2026-03-07T00:00:1${index}Z`,
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

      await setProjectChatWindowBounds(page, alphaWindowId, {
        x: 680,
        y: 140,
        width: 420,
        height: 300,
      });
      await setProjectChatWindowBounds(page, betaWindowId, {
        x: 520,
        y: 40,
        width: 440,
        height: 300,
      });
      await seedProjectChatWindowThreads(page, fixtures);

      const alphaWorkspaceWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${alphaWindowId}"]`,
      );
      const betaWorkspaceWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${betaWindowId}"]`,
      );
      await expect(alphaWorkspaceWindow).toContainText(
        "Workspace alpha thread marker",
      );
      await expect(alphaWorkspaceWindow).not.toContainText(
        "Workspace beta thread marker",
      );
      await expect(betaWorkspaceWindow).toContainText(
        "Workspace beta thread marker",
      );
      await expect(betaWorkspaceWindow).not.toContainText(
        "Workspace alpha thread marker",
      );

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
        throw new Error("Expected the saved window space to be persisted.");
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
      await expect(alphaWorkspaceWindow).toHaveCount(0);
      await expect(betaWorkspaceWindow).toHaveCount(0);

      await clickWindowSpaceOpen(page);

      await expect(alphaWorkspaceWindow).toContainText(
        "Workspace alpha thread marker",
      );
      await expect(alphaWorkspaceWindow).not.toContainText(
        "Workspace beta thread marker",
      );
      await expect(betaWorkspaceWindow).toContainText(
        "Workspace beta thread marker",
      );
      await expect(betaWorkspaceWindow).not.toContainText(
        "Workspace alpha thread marker",
      );
      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return {
            alpha: state.instancesById[alphaWindowId]?.chatId ?? null,
            beta: state.instancesById[betaWindowId]?.chatId ?? null,
          };
        })
        .toEqual({
          alpha: "window-chat-alpha",
          beta: "window-chat-beta",
        });

      await standalonePage.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/windowspace/${encodeURIComponent(windowSpaceSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      const alphaStandaloneWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${alphaWindowId}"]`,
      );
      const betaStandaloneWindow = standalonePage.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${betaWindowId}"]`,
      );
      await expect(alphaStandaloneWindow).toContainText(
        "Workspace alpha thread marker",
      );
      await expect(alphaStandaloneWindow).not.toContainText(
        "Workspace beta thread marker",
      );
      await expect(betaStandaloneWindow).toContainText(
        "Workspace beta thread marker",
      );
      await expect(betaStandaloneWindow).not.toContainText(
        "Workspace alpha thread marker",
      );
    } finally {
      await standalonePage.close();
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("restoring a saved window space keeps the saved thread after the user refocuses a restored window before layout sync completes", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();

    let releaseRestoreLayoutWrite: (() => void) | null = null;

    try {
      const alphaWindowId = await createFloatingProjectChatWindow(
        page,
        "Alpha Chat",
      );
      const fixture: ProjectChatThreadFixture = {
        instanceId: alphaWindowId,
        chatId: "window-chat-alpha",
        assistantText: "Workspace alpha thread marker",
      };

      await page.context().route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        const fixtureRun = {
          id: `run-${fixture.chatId}`,
          profileId: null,
          status: "completed",
          startedAt: "2026-03-07T00:00:00Z",
          finishedAt: "2026-03-07T00:00:10Z",
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
        };
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify([
            ...runs.filter((run) => run.inputs.chatId !== fixture.chatId),
            fixtureRun,
          ]),
        });
      });
      await page.context().route("**/api/getLLMChat", async (route) => {
        const payload = route.request().postDataJSON() as
          | { chatId?: string }
          | undefined;
        if (payload?.chatId !== fixture.chatId) {
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

      await setProjectChatWindowBounds(page, alphaWindowId, {
        x: 40,
        y: 40,
        width: 440,
        height: 300,
      });
      await seedProjectChatWindowThreads(page, [fixture]);

      await clickWindowSpaceSaveCurrentLayout(page);
      await expect(page.getByTestId("window-space-open")).toHaveCount(1);

      await clearProjectChatWindowingState(
        page,
        projectContext.projectConfigId,
      );

      let delayedFirstRestoreWrite = false;
      await page.route("**/api/setProjectChatWindowingState", async (route) => {
        if (!delayedFirstRestoreWrite) {
          delayedFirstRestoreWrite = true;
          await new Promise<void>((resolve) => {
            releaseRestoreLayoutWrite = resolve;
          });
        }
        await route.continue();
      });

      const alphaWorkspaceWindow = page.locator(
        `[data-testid="project-chat-floating-window"][data-chat-window-instance-id="${alphaWindowId}"]`,
      );

      await clickWindowSpaceOpen(page);
      await expect(alphaWorkspaceWindow).toBeVisible();
      await page.evaluate(async (instanceId) => {
        const { focusProjectChatWindow } = await import(
          "/src/state/actions/projectChatWindowing.ts"
        );
        focusProjectChatWindow(instanceId, 1234);
      }, alphaWindowId);

      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return state.instancesById[alphaWindowId]?.zIndex ?? -1;
        })
        .toBeGreaterThan(1);

      releaseRestoreLayoutWrite?.();
      await expect
        .poll(async () => {
          const state = await readProjectChatWindowingState(page);
          return state.instancesById[alphaWindowId]?.chatId ?? null;
        })
        .toBe("window-chat-alpha");
    } finally {
      releaseRestoreLayoutWrite?.();
      await page
        .unroute("**/api/setProjectChatWindowingState")
        .catch(() => null);
      await page
        .context()
        .unroute("**/api/getAgentRuns")
        .catch(() => null);
      await page
        .context()
        .unroute("**/api/getLLMChat")
        .catch(() => null);
      if (!page.isClosed()) {
        await cleanupManagedEngine();
        await cleanupIsolatedProject(page, projectContext);
      }
    }
  });

  test("same-tab standalone navigation isolates copied project configs even when the window-space id is reused", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    let copiedProjectContext: {
      projectConfigId: string;
      defaultProjectConfigId: string | null;
    } | null = null;
    const cleanupManagedEngine = await ensureManagedChatEngine(page);
    await setOverviewTabInStore(page, "ViewModes");
    await expect(page.getByTestId("window-spaces-pane")).toBeVisible();

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
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
      await seedProjectChatWindowThreads(page, [
        {
          instanceId: projectChatWindowId,
          chatId: "source-window-chat",
          assistantText: "Source copied-config thread marker",
        },
      ]);

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
              (run) => run.inputs?.chatId !== "source-window-chat",
            ),
            {
              id: "run-source-window-chat",
              profileId: null,
              status: "completed",
              startedAt: "2026-03-07T00:00:00Z",
              finishedAt: "2026-03-07T00:00:01Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: projectContext.projectConfigId,
                chatId: "source-window-chat",
                sectionId: null,
                messages: [],
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
        if (payload?.chatId !== "source-window-chat") {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            messages: [
              {
                id: "assistant-source-window-chat",
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: "Source copied-config thread marker",
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
        throw new Error("Expected the saved window space to be persisted.");
      }
      const windowSpaceSlug = await page.evaluate(async (name) => {
        const { sanitizeNameForSlug } = await import(
          "/src/utils/nameValidation.ts"
        );
        return sanitizeNameForSlug(name);
      }, windowSpace.name);

      const copiedProjectName = `${projectConfigName}-copy-windowspace`;
      const copiedProject = await saveProjectConfigCopyWithRefs(
        page,
        projectContext.projectConfigId,
        copiedProjectName,
      );
      copiedProjectContext = {
        projectConfigId: copiedProject.id,
        defaultProjectConfigId: projectContext.defaultProjectConfigId,
      };

      await page.goto(
        buildStandaloneUrl(
          page.url(),
          `/${encodeURIComponent(projectConfigName)}/windowspace/${encodeURIComponent(windowSpaceSlug)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );

      const sourceProjectWindow = page.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${projectChatWindowId}"]`,
      );
      const sourceSectionWindow = page.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${sectionWindowId}"]`,
      );
      const verticalHandle = page.locator(
        '[data-testid="standalone-window-space-resize-handle"][data-resize-axis="vertical"]',
      );
      await expect(sourceProjectWindow).toContainText(
        "Source copied-config thread marker",
      );
      const handleBounds = await verticalHandle.boundingBox();
      if (!handleBounds) {
        throw new Error(
          "Expected standalone resize handle for copied-config test.",
        );
      }

      await page.mouse.move(
        handleBounds.x + handleBounds.width / 2,
        handleBounds.y + handleBounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        handleBounds.x + handleBounds.width / 2 + 80,
        handleBounds.y + handleBounds.height / 2,
        {
          steps: 8,
        },
      );
      await page.mouse.up();

      const resizedSourceWidth = (await sourceProjectWindow.boundingBox())
        ?.width;
      if (!resizedSourceWidth) {
        throw new Error("Expected resized standalone window width.");
      }

      await navigateSameTabSpa(
        page,
        `/${encodeURIComponent(copiedProjectName)}/windowspace/${encodeURIComponent(windowSpaceSlug)}`,
      );
      await page.evaluate(async (nextProjectConfigName) => {
        const { loadProjectConfig } = await import(
          "/src/state/actions/project/loadProject.ts"
        );
        await loadProjectConfig({ projectConfigName: nextProjectConfigName });
      }, copiedProjectName);
      await expect(
        page.getByTestId("standalone-window-space-surface"),
      ).toBeVisible();
      await expect
        .poll(async () => {
          return await page.evaluate(async () => {
            const { useProjectState } = await import(
              "/src/state/definitions.ts"
            );
            return useProjectState.getState().projectConfig.id;
          });
        })
        .toBe(copiedProject.id);

      const copiedProjectWindow = page.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${projectChatWindowId}"]`,
      );
      const copiedSectionWindow = page.locator(
        `[data-testid="standalone-window-space-window"][data-chat-window-instance-id="${sectionWindowId}"]`,
      );
      await expect(copiedProjectWindow).toBeVisible();
      await expect(copiedSectionWindow).toBeVisible();
      await expect(copiedProjectWindow).not.toContainText(
        "Source copied-config thread marker",
      );
      await expect
        .poll(async () => (await copiedProjectWindow.boundingBox())?.width ?? 0)
        .toBeLessThan(resizedSourceWidth - 60);
    } finally {
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, copiedProjectContext);
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("same-tab standalone project chat navigation keeps llm_disallowed state scoped to the owning project config", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    let copiedProjectContext: {
      projectConfigId: string;
      defaultProjectConfigId: string | null;
    } | null = null;
    const cleanupManagedEngine = await ensureManagedChatEngine(page);

    try {
      const projectConfigName = getProjectConfigNameFromUrl(page.url());
      const sharedThreadChatId = "shared-thread";
      const copiedProjectName = `${projectConfigName}-copy-thread`;
      const copiedProject = await saveProjectConfigCopyWithRefs(
        page,
        projectContext.projectConfigId,
        copiedProjectName,
      );
      copiedProjectContext = {
        projectConfigId: copiedProject.id,
        defaultProjectConfigId: projectContext.defaultProjectConfigId,
      };
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
      allowExpectedApiError(page, {
        path: "/api/getLLMChat",
        statuses: [403],
        method: "POST",
        count: 4,
      });
      await page.context().route("**/api/getAgentRuns", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "run-shared-thread-source-project",
              profileId: null,
              status: "completed",
              startedAt: "2026-02-01T00:00:00Z",
              finishedAt: "2026-02-01T00:00:01Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: projectContext.projectConfigId,
                chatId: sharedThreadChatId,
                engineConfigId: managedEngineId,
                messages: [],
              },
              outputs: {},
              toolCalls: [],
              cost: null,
            },
            {
              id: "run-shared-thread-copied-project",
              profileId: null,
              status: "completed",
              startedAt: "2026-02-01T00:00:02Z",
              finishedAt: "2026-02-01T00:00:03Z",
              events: [],
              inputs: {
                runType: "llm_chat",
                projectConfigId: copiedProject.id,
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
        if (payload?.chatId !== sharedThreadChatId) {
          await route.continue();
          return;
        }
        if (payload.projectConfigId === projectContext.projectConfigId) {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({
              detail: "LLM access disabled for this standalone thread.",
            }),
          });
          return;
        }
        if (payload.projectConfigId === copiedProject.id) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              messages: [
                {
                  id: "assistant-copied-shared-thread",
                  role: "assistant",
                  content: [
                    {
                      type: "text",
                      text: "Copied project thread hydrated successfully.",
                    },
                  ],
                  attachments: [],
                  tool_calls: null,
                },
              ],
              waitingForResponse: false,
              llmConfig: {
                id: "copied-thread-config",
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
          `/${encodeURIComponent(projectConfigName)}/chat/${encodeURIComponent(sharedThreadChatId)}`,
        ),
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        page.getByTestId("standalone-managed-chat-blocked"),
      ).toBeVisible();
      await expect(
        page.getByTestId("standalone-project-chat-thread-surface"),
      ).toHaveCount(0);

      const copiedThreadPath = `/${encodeURIComponent(copiedProjectName)}/chat/${encodeURIComponent(sharedThreadChatId)}`;
      await page.evaluate(async (nextPath) => {
        const { router } = await import("/src/components/Pages/router.tsx");
        await router.navigate(nextPath);
      }, copiedThreadPath);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(copiedThreadPath);

      await expect(
        page.getByTestId("standalone-managed-chat-blocked"),
      ).toHaveCount(0);
      await expect(
        page.getByTestId("standalone-project-chat-thread-surface"),
      ).toBeVisible();
      await expect(
        page.getByText("Copied project thread hydrated successfully."),
      ).toBeVisible();
    } finally {
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, copiedProjectContext);
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
