import { expect, test, type Page } from "@playwright/test";
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

type ProjectChatWindowingSnapshot = {
  order: string[];
  instancesById: Record<
    string,
    {
      sectionIdOrNull: string | null;
      placement: string;
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
            standaloneChatId: await readActiveProjectChatId(standalonePage),
          };
        })
        .toEqual({
          workspaceChatId: "workspace-thread",
          standaloneChatId: standaloneThreadChatId,
        });
    } finally {
      await standalonePage.close();
      await page.context().unroute("**/api/getAgentRuns");
      await page.context().unroute("**/api/getLLMChat");
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
      const resolvedTerminalWindowId = await page.evaluate(
        async (sectionId) => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          const { getOpenFloatingProjectChatWindowInstanceForSectionInState } =
            await import("/src/state/actions/projectChatWindowing.ts");
          return (
            getOpenFloatingProjectChatWindowInstanceForSectionInState(
              useProjectState.getState().projectChatWindowing,
              sectionId,
            )?.instanceId ?? ""
          );
        },
        terminalId,
      );
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
