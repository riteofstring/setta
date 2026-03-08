import { expect, test, type Page } from "@playwright/test";
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

type LoadedProjectConfigState = {
  projectConfig: {
    activeIds: string[];
    windowSpaces?: Record<
      string,
      {
        id: string;
        name: string;
        windowsById: Record<string, unknown>;
        order: string[];
      }
    >;
  };
};

type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: Array<{
    id: string;
    name: string;
  }>;
};

type ProjectChatWindowingSnapshot = {
  order: string[];
  instancesById: Record<
    string,
    {
      sectionIdOrNull: string | null;
      placement: string;
      mode: string;
      chatId: string | null;
      bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }
  >;
};

type AgentRunRecord = {
  id: string;
  profileId: string | null;
  status: string;
  startedAt: string;
  finishedAt: string;
  events: Array<unknown>;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
};

type ProjectChatThreadFixture = {
  instanceId: string;
  chatId: string;
  assistantText: string;
};

function getProjectConfigNameFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const projectConfigName = pathname.split("/").filter(Boolean)[0];
  if (!projectConfigName) {
    throw new Error("Unable to resolve project config name from URL.");
  }
  return projectConfigName;
}

function buildStandaloneUrl(currentUrl: string, pathname: string): string {
  const nextUrl = new URL(currentUrl);
  nextUrl.pathname = pathname;
  nextUrl.hash = "";
  return nextUrl.toString();
}

async function resolveSectionSlug(
  page: Page,
  sectionName: string,
): Promise<string> {
  return page.evaluate(async (name) => {
    const { sanitizeNameForSlug } = await import(
      "/src/utils/nameValidation.ts"
    );
    return sanitizeNameForSlug(name);
  }, sectionName);
}

async function loadProjectConfigState(
  page: Page,
  projectConfigName: string,
): Promise<LoadedProjectConfigState> {
  const response = await postBackend<LoadedProjectConfigState>(
    page,
    "/loadProjectConfig",
    { projectConfigName },
  );
  if (!response) {
    throw new Error("Missing project config response.");
  }
  return response;
}

async function saveProjectConfigCopyWithRefs(
  page: Page,
  projectConfigId: string,
  newConfigName: string,
): Promise<{ id: string; name: string }> {
  await postBackend<null>(page, "/saveAsNewProjectConfig", {
    projectConfigId,
    newConfigName,
    withRefs: true,
  });
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  const copiedProject = metadata?.projectMetadata.find(
    (entry) => entry.name === newConfigName,
  );
  if (!copiedProject) {
    throw new Error("Unable to resolve copied project config.");
  }
  return copiedProject;
}

async function navigateSameTabSpa(page: Page, pathname: string): Promise<void> {
  await page.evaluate((nextPathname) => {
    window.history.pushState({}, "", nextPathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, pathname);
}

async function setActiveSections(
  page: Page,
  sectionIds: string[],
): Promise<void> {
  await page.evaluate(async (ids) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections.ts"
    );
    setActiveSectionIds(ids);
  }, sectionIds);
}

async function showSectionInProjectChatWindow(
  page: Page,
  sectionId: string,
  placement: "bottom_docked" | "floating" = "bottom_docked",
): Promise<void> {
  await page.evaluate(
    async ({ id, nextPlacement }) => {
      const { showSectionInProjectChatWindow } = await import(
        "/src/state/actions/projectChatWindowing.ts"
      );
      showSectionInProjectChatWindow(id, nextPlacement);
    },
    { id: sectionId, nextPlacement: placement },
  );
}

async function createFloatingProjectChatWindow(
  page: Page,
  title: string,
): Promise<string> {
  return page.evaluate(async (nextTitle) => {
    const { createProjectChatWindowInstance } = await import(
      "/src/state/actions/projectChatWindowing.ts"
    );
    const { ChatWindowPlacementEnum } = await import(
      "/src/utils/generatedTypes.ts"
    );
    return createProjectChatWindowInstance({
      placement: ChatWindowPlacementEnum.floating,
      title: nextTitle,
    });
  }, title);
}

async function createTerminalSection(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { createTopLevelSection } = await import(
      "/src/state/actions/sections/createSections"
    );
    const { SectionTypeEnum } = await import("/src/utils/generatedTypes.ts");
    return await createTopLevelSection({
      implType: SectionTypeEnum.Terminal,
      implOverrides: null,
      position: null,
    });
  });
}

async function setProjectChatWindowBounds(
  page: Page,
  instanceId: string,
  bounds: { x: number; y: number; width: number; height: number },
): Promise<void> {
  await page.evaluate(
    async ({ nextInstanceId, nextBounds }) => {
      const { setProjectChatWindowBounds } = await import(
        "/src/state/actions/projectChatWindowing.ts"
      );
      setProjectChatWindowBounds(nextInstanceId, nextBounds);
    },
    {
      nextInstanceId: instanceId,
      nextBounds: bounds,
    },
  );
}

async function resolveWorkspaceSnapBounds(
  page: Page,
  preset: "left" | "right" | "top" | "bottom" | "top_left" | "top_right",
): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  return page.evaluate(async (nextPreset) => {
    const { buildFloatingSnapBounds } = await import(
      "/src/components/ChatWindowing/projectChatSnapLayout.ts"
    );
    const { resolveProjectChatFloatingViewport } = await import(
      "/src/components/ChatWindowing/projectChatViewport.ts"
    );
    const viewport = resolveProjectChatFloatingViewport();
    return buildFloatingSnapBounds(
      nextPreset,
      viewport.viewportWidthPx,
      viewport.viewportHeightPx,
      viewport.insets,
    );
  }, preset);
}

async function setOverviewTabInStore(
  page: Page,
  tabName: string,
): Promise<void> {
  await page.evaluate(async (nextTabName) => {
    const { useLocalStorage } = await import("/src/state/definitions.ts");
    useLocalStorage.setState({
      overviewTab: nextTabName,
      overviewVis: true,
    });
  }, tabName);
}

async function readProjectChatWindowingState(
  page: Page,
): Promise<ProjectChatWindowingSnapshot> {
  return page.evaluate(async () => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const projectChatWindowing =
      useProjectState.getState().projectChatWindowing;
    return {
      order: [...projectChatWindowing.order],
      instancesById: Object.fromEntries(
        Object.entries(projectChatWindowing.instancesById).map(
          ([instanceId, instance]) => [
            instanceId,
            {
              sectionIdOrNull: instance.sectionIdOrNull ?? null,
              placement: instance.placement,
              mode: instance.mode,
              chatId: instance.chatId ?? null,
              bounds: {
                x: instance.bounds.x,
                y: instance.bounds.y,
                width: instance.bounds.width,
                height: instance.bounds.height,
              },
            },
          ],
        ),
      ),
    };
  });
}

async function setActiveProjectChatId(
  page: Page,
  chatId: string | null | undefined,
): Promise<void> {
  await page.evaluate(async (nextChatId) => {
    const { useAIStore } = await import("/src/state/definitions.ts");
    useAIStore.setState({ activeChatId: nextChatId });
  }, chatId);
}

async function readActiveProjectChatId(
  page: Page,
): Promise<string | null | undefined> {
  return page.evaluate(async () => {
    const { useAIStore } = await import("/src/state/definitions.ts");
    return useAIStore.getState().activeChatId;
  });
}

async function seedProjectChatWindowThreads(
  page: Page,
  fixtures: ProjectChatThreadFixture[],
): Promise<void> {
  await page.evaluate(async (nextFixtures) => {
    const { useAIStore } = await import("/src/state/definitions.ts");
    const { getDefaultChatDetails } = await import("/src/state/actions/ai.ts");
    const { setProjectChatWindowChatId } = await import(
      "/src/state/actions/projectChatWindowing.ts"
    );

    for (const fixture of nextFixtures) {
      setProjectChatWindowChatId(fixture.instanceId, fixture.chatId);
    }

    useAIStore.setState((state) => {
      const nextChatDetails = { ...state.chatDetails };
      for (const fixture of nextFixtures) {
        nextChatDetails[fixture.chatId] = {
          ...getDefaultChatDetails(),
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
        };
      }
      return {
        activeChatId: nextFixtures[0]?.chatId,
        chatDetails: nextChatDetails,
      };
    });
  }, fixtures);
}

async function seedProjectChatDetails(
  page: Page,
  fixtures: ProjectChatThreadFixture[],
  activeChatId: string | null,
): Promise<void> {
  await page.evaluate(
    async ({
      nextFixtures,
      nextActiveChatId,
    }: {
      nextFixtures: ProjectChatThreadFixture[];
      nextActiveChatId: string | null;
    }) => {
      const { useAIStore } = await import("/src/state/definitions.ts");
      const { getDefaultChatDetails } = await import(
        "/src/state/actions/ai.ts"
      );

      useAIStore.setState((state) => {
        const nextChatDetails = { ...state.chatDetails };
        for (const fixture of nextFixtures) {
          nextChatDetails[fixture.chatId] = {
            ...getDefaultChatDetails(),
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
          };
        }
        return {
          activeChatId: nextActiveChatId,
          chatDetails: nextChatDetails,
        };
      });
    },
    {
      nextFixtures: fixtures,
      nextActiveChatId: activeChatId,
    },
  );
}

async function clearProjectChatWindowingState(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  await page.evaluate(async (nextProjectConfigId) => {
    const { route_set_project_chat_windowing_state } = await import(
      "/src/utils/generatedEndpoints.ts"
    );
    const { createProjectChatWindowingState } = await import(
      "/src/utils/generatedTypes.ts"
    );
    await route_set_project_chat_windowing_state({
      projectConfigId: nextProjectConfigId,
      state: createProjectChatWindowingState(),
    });
  }, projectConfigId);
}

function getProjectChatWindowOrder(
  state: ProjectChatWindowingSnapshot,
): string[] {
  return state.order;
}

function findProjectChatWindowIdForSection(
  state: ProjectChatWindowingSnapshot,
  sectionId: string,
): string | null {
  for (const [instanceId, instance] of Object.entries(state.instancesById)) {
    if (instance.sectionIdOrNull === sectionId) {
      return instanceId;
    }
  }
  return null;
}

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
      await page.getByTestId("window-space-save-current-layout").click();
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

      const baselineWorkspaceState = await readProjectChatWindowingState(page);
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

      await page.getByTestId("window-space-open").click();
      await expect.poll(() => page.url()).toBe(originalWorkspaceUrl);
      await expect
        .poll(async () => readProjectChatWindowingState(page))
        .toEqual(baselineWorkspaceState);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect
        .poll(async () => readProjectChatWindowingState(page))
        .toEqual(baselineWorkspaceState);

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
        .toEqual(baselineWorkspaceState);
    } finally {
      await standalonePage.close();
      await cleanupManagedEngine();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

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

      await page.context().route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify(
            runs.filter((run) => run.inputs?.chatId !== standaloneThreadChatId),
          ),
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

      await page.context().route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify(
            runs.filter((run) => run.inputs?.chatId !== validThreadChatId),
          ),
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

      await page.context().route("**/api/getAgentRuns", async (route) => {
        const response = await route.fetch();
        const runs = (await response.json()) as AgentRunRecord[];
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify(
            runs.filter((run) => run.inputs?.chatId !== standaloneThreadChatId),
          ),
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
                id: "managed-ambiguous-message",
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: "Managed runtime transcript",
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
        x: 40,
        y: 40,
        width: 440,
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

      await page.getByTestId("window-space-save-current-layout").click();
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

      await page.getByTestId("window-space-save-current-layout").click();
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
      await page.getByTestId("window-space-save-current-layout").click();
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
      await page.getByTestId("window-space-save-current-layout").click();
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

      await setOverviewTabInStore(page, "ViewModes");
      await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
      await page.getByTestId("window-space-save-current-layout").click();
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
      await expect(standaloneToggle).toHaveAttribute("aria-pressed", "false");

      await standaloneToggle.click();
      await expect(standaloneToggle).toHaveAttribute("aria-pressed", "true");
      await expect(workspaceToggle).toHaveAttribute("aria-pressed", "false");
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

      await page.getByTestId("window-space-save-current-layout").click();
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

      await page.getByTestId("window-space-save-current-layout").click();
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

      await page.getByTestId("window-space-open").click();

      await expect(leftWindow).toHaveAttribute(
        "data-chat-window-snap-preset",
        "left",
      );
      await expect(rightWindow).toHaveAttribute(
        "data-chat-window-snap-preset",
        "right",
      );
      await expect(verticalHandle).toHaveCount(1);

      const leftBeforeResize = await leftWindow.boundingBox();
      const rightBeforeResize = await rightWindow.boundingBox();
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
        .poll(async () => (await leftWindow.boundingBox())?.width ?? 0)
        .toBeGreaterThan(leftBeforeResize.width + 60);
      await expect
        .poll(async () => (await rightWindow.boundingBox())?.width ?? 0)
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
          createProjectChatWindowingState,
          createWindowSpaceState,
        } = await import("/src/utils/generatedTypes.ts");
        return {
          currentWindowing: createProjectChatWindowingState({
            order: ["canvas-section-window"],
            instancesById: {
              "canvas-section-window": {
                instanceId: "canvas-section-window",
                placement: ChatWindowPlacementEnum.canvas_section,
                mode: ChatWindowModeEnum.section_mode,
                sectionIdOrNull: sectionId,
                title: "Canvas Section Chat",
              },
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
      await postBackend(page, "/createWindowSpace", {
        projectConfigId: projectContext.projectConfigId,
        name: "Collision Layout",
        state: seededStates.windowSpaceState,
      });

      await expect(page.getByTestId("window-space-open")).toHaveCount(1);
      await page.getByTestId("window-space-open").click();

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

      await page.getByTestId("window-space-save-current-layout").click();
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

      await page.getByTestId("window-space-save-current-layout").click();

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
