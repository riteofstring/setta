import { expect, type Page } from "@playwright/test";
import { postBackend } from "../helpers";

export type LoadedProjectConfigState = {
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

export type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: Array<{
    id: string;
    name: string;
  }>;
};

export type ProjectChatWindowingSnapshot = {
  order: string[];
  instancesById: Record<
    string,
    {
      sectionIdOrNull: string | null;
      placement: string;
      mode: string;
      chatId: string | null;
      zIndex: number;
      bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }
  >;
};

export type AgentRunRecord = {
  id: string;
  profileId: string | null;
  status: string;
  startedAt: string;
  finishedAt: string;
  events: Array<unknown>;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
};

export type ProjectChatThreadFixture = {
  instanceId: string;
  chatId: string;
  assistantText: string;
};

export function getProjectConfigNameFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const projectConfigName = pathname.split("/").filter(Boolean)[0];
  if (!projectConfigName) {
    throw new Error("Unable to resolve project config name from URL.");
  }
  return projectConfigName;
}

export function buildStandaloneUrl(
  currentUrl: string,
  pathname: string,
): string {
  const nextUrl = new URL(currentUrl);
  nextUrl.pathname = pathname;
  nextUrl.hash = "";
  return nextUrl.toString();
}

export async function seedAIStorePersistence(
  page: Page,
  patch: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript((nextState) => {
    const key = "setta_ai_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          state?: unknown;
          version?: unknown;
        };
        payload = {
          state:
            parsed && typeof parsed.state === "object" && parsed.state !== null
              ? (parsed.state as Record<string, unknown>)
              : {},
          version: typeof parsed?.version === "number" ? parsed.version : 0,
        };
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, ...nextState };
    window.localStorage.setItem(key, JSON.stringify(payload));
  }, patch);
}

export async function resolveSectionSlug(
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

export async function loadProjectConfigState(
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

export async function syncProjectChatWindowingInStore(
  page: Page,
  projectChatWindowing: unknown,
): Promise<void> {
  await page.evaluate(async (nextProjectChatWindowing) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    useProjectState.setState({
      projectChatWindowing: nextProjectChatWindowing,
    });
  }, projectChatWindowing);
}

export async function syncWindowSpacesFromBackend(
  page: Page,
  projectConfigName: string,
): Promise<void> {
  const loadedProjectConfig = await loadProjectConfigState(
    page,
    projectConfigName,
  );
  await page.evaluate(async (windowSpaces) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    useProjectState.setState((state) => {
      state.projectConfig.windowSpaces = windowSpaces ?? {};
    });
  }, loadedProjectConfig.projectConfig.windowSpaces ?? {});
}

export async function saveProjectConfigCopyWithRefs(
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

export async function navigateSameTabSpa(
  page: Page,
  pathname: string,
): Promise<void> {
  await page.evaluate((nextPathname) => {
    window.history.pushState({}, "", nextPathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, pathname);
}

export async function setActiveSections(
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

export async function showSectionInProjectChatWindow(
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

export async function createFloatingProjectChatWindow(
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

export async function createTerminalSection(page: Page): Promise<string> {
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

export async function setProjectChatWindowBounds(
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

export async function resolveWorkspaceSnapBounds(
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

export async function setOverviewTabInStore(
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

export async function readProjectChatWindowingState(
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
              zIndex: instance.zIndex,
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

export async function readProjectChatGitPaneVisibility(
  page: Page,
): Promise<Record<string, true>> {
  return page.evaluate(async () => {
    const { useMisc } = await import("/src/state/definitions.ts");
    return {
      ...useMisc.getState().projectChatGitGraphEmbeddedPaneVisibleByInstanceId,
    };
  });
}

export async function setActiveProjectChatId(
  page: Page,
  chatId: string | null | undefined,
): Promise<void> {
  await page.evaluate(async (nextChatId) => {
    const { useAIStore } = await import("/src/state/definitions.ts");
    useAIStore.setState({ activeChatId: nextChatId });
  }, chatId);
}

export async function readActiveProjectChatId(
  page: Page,
): Promise<string | null | undefined> {
  return page.evaluate(async () => {
    const { useAIStore } = await import("/src/state/definitions.ts");
    return useAIStore.getState().activeChatId;
  });
}

export async function readSectionChatId(
  page: Page,
  sectionId: string,
): Promise<string | null> {
  return page.evaluate(async (targetSectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const { getCurrEffectiveSectionImplOfType } = await import(
      "/src/state/actions/sectionInfos.ts"
    );
    const { SectionTypeEnum } = await import("/src/utils/generatedTypes.ts");
    return (
      getCurrEffectiveSectionImplOfType(
        useProjectState.getState(),
        targetSectionId,
        SectionTypeEnum.Chat,
      ).chatId ?? null
    );
  }, sectionId);
}

export async function seedProjectChatWindowThreads(
  page: Page,
  fixtures: ProjectChatThreadFixture[],
): Promise<void> {
  await flushProjectChatWindowingWrites(page);
  await page.evaluate(async (nextFixtures) => {
    const { setChatSectionChatId, setProjectChatWindowChatId } = await import(
      "/src/openapi/http"
    );
    const { callOpenAPI } = await import(
      "/tests/e2e/browserAppSubsystemSdk.ts"
    );
    const { useAIStore, useProjectState } = await import(
      "/src/state/definitions.ts"
    );
    const { getDefaultChatDetails } = await import("/src/state/actions/ai.ts");
    const { ChatWindowModeEnum } = await import("/src/utils/generatedTypes.ts");

    for (const fixture of nextFixtures) {
      const window =
        useProjectState.getState().projectChatWindowing.instancesById[
          fixture.instanceId
        ];
      if (
        window?.mode === ChatWindowModeEnum.section_mode &&
        window.sectionIdOrNull
      ) {
        await callOpenAPI(
          setChatSectionChatId({
            body: {
              projectConfigId: useProjectState.getState().projectConfig.id,
              sectionId: window.sectionIdOrNull,
              chatId: fixture.chatId,
            },
          } as Parameters<typeof setChatSectionChatId>[0]),
        );
        continue;
      }
      const response = await callOpenAPI(
        setProjectChatWindowChatId({
          body: {
            projectConfigId: useProjectState.getState().projectConfig.id,
            instanceId: fixture.instanceId,
            chatId: fixture.chatId,
          },
        } as Parameters<typeof setProjectChatWindowChatId>[0]),
      );
      if (response.status !== 200 || !response.data) {
        throw new Error(
          `Failed to seed project chat window ${fixture.instanceId}: ${response.status}`,
        );
      }
      useProjectState.setState({
        projectChatWindowing: response.data,
      });
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

  // The helper updates both local chat details and persisted window bindings.
  // Flush the serialized windowing writes so later layout mutations do not
  // accidentally carry a pending chatId change through the wrong route.
  await flushProjectChatWindowingWrites(page);
}

export async function seedProjectChatDetails(
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

export async function seedProjectChatHistoryRuns(
  page: Page,
  projectConfigId: string,
  fixtures: Array<{
    chatId: string;
    prompt: string;
  }>,
): Promise<void> {
  await page.evaluate(
    async ({
      nextProjectConfigId,
      nextFixtures,
    }: {
      nextProjectConfigId: string;
      nextFixtures: Array<{
        chatId: string;
        prompt: string;
      }>;
    }) => {
      const { useAIStore } = await import("/src/state/definitions.ts");
      useAIStore.setState({
        agentRunsAuthorityState: "ready",
        agentRunsInitialLoadComplete: true,
        agentRunsLoadError: null,
        agentRuns: nextFixtures.map((fixture, index) => ({
          id: `standalone-history-run-${fixture.chatId}`,
          profileId: null,
          status: "completed",
          startedAt: `2026-03-13T00:00:0${index}Z`,
          finishedAt: `2026-03-13T00:00:1${index}Z`,
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: nextProjectConfigId,
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
        })),
      });
    },
    {
      nextProjectConfigId: projectConfigId,
      nextFixtures: fixtures.map((fixture) => ({
        chatId: fixture.chatId,
        prompt: fixture.prompt,
      })),
    },
  );
}

export async function clearProjectChatWindowingState(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  await page.evaluate(async (nextProjectConfigId) => {
    const { setProjectChatWindowChatId, setProjectChatWindowingState } =
      await import("/src/openapi/http");
    const { callOpenAPI } = await import(
      "/tests/e2e/browserAppSubsystemSdk.ts"
    );
    const { useProjectState } = await import("/src/state/definitions.ts");
    const { ChatWindowModeEnum } = await import("/src/utils/generatedTypes.ts");
    const { createProjectChatWindowingState } = await import(
      "/src/utils/generatedTypes.ts"
    );
    const currentWindowing = useProjectState.getState().projectChatWindowing;
    for (const instance of Object.values(currentWindowing.instancesById)) {
      if (
        instance.mode !== ChatWindowModeEnum.project_ai_mode ||
        instance.chatId == null
      ) {
        continue;
      }
      await callOpenAPI(
        setProjectChatWindowChatId({
          body: {
            projectConfigId: nextProjectConfigId,
            instanceId: instance.instanceId,
            chatId: null,
          },
        } as Parameters<typeof setProjectChatWindowChatId>[0]),
      );
    }
    const response = await callOpenAPI(
      setProjectChatWindowingState({
        body: {
          projectConfigId: nextProjectConfigId,
          state: createProjectChatWindowingState(),
        },
      } as Parameters<typeof setProjectChatWindowingState>[0]),
    );
    if (response.status !== 200 || !response.data) {
      throw new Error(
        `Failed to clear project chat windowing state: ${response.status}`,
      );
    }
    useProjectState.setState({
      projectChatWindowing: response.data,
    });
  }, projectConfigId);
}

export async function setDeploymentSharePolicy(
  page: Page,
  {
    allowLLM,
    allowLayoutChanges,
  }: {
    allowLLM: boolean;
    allowLayoutChanges: boolean;
  },
): Promise<void> {
  await page.evaluate(
    async ({
      nextAllowLLM,
      nextAllowLayoutChanges,
    }: {
      nextAllowLLM: boolean;
      nextAllowLayoutChanges: boolean;
    }) => {
      const { useShareSession } = await import("/src/state/definitions.ts");
      useShareSession.setState({
        isDeploymentMode: true,
        shareSessionId: "share-session-standalone-surfaces",
        sessionRunCount: 0,
        sharePolicy: {
          allowLLM: nextAllowLLM,
          allowLayoutChanges: nextAllowLayoutChanges,
          allowParamChanges: false,
          allowVariantChanges: false,
          allowRun: false,
          allowMultipleRuns: false,
        },
        shareDeploymentName: "deployment",
        shareDeploymentVersion: "v1",
        deploymentMode: "share",
      });
    },
    {
      nextAllowLLM: allowLLM,
      nextAllowLayoutChanges: allowLayoutChanges,
    },
  );
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const { useShareSession } = await import("/src/state/definitions.ts");
        const state = useShareSession.getState();
        return {
          isDeploymentMode: state.isDeploymentMode,
          allowLLM: state.sharePolicy?.allowLLM ?? null,
          allowLayoutChanges: state.sharePolicy?.allowLayoutChanges ?? null,
        };
      });
    })
    .toEqual({
      isDeploymentMode: true,
      allowLLM,
      allowLayoutChanges,
    });
}

export function getProjectChatWindowOrder(
  state: ProjectChatWindowingSnapshot,
): string[] {
  return state.order;
}

export function findProjectChatWindowIdForSection(
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

export function findFloatingWindowIdByBounds(
  state: ProjectChatWindowingSnapshot,
  bounds: { x: number; y: number; width: number; height: number },
  excludedInstanceIds: Set<string> = new Set(),
): string | null {
  for (const [instanceId, instance] of Object.entries(state.instancesById)) {
    if (excludedInstanceIds.has(instanceId)) {
      continue;
    }
    if (
      instance.placement === "floating" &&
      instance.bounds.x === bounds.x &&
      instance.bounds.y === bounds.y &&
      instance.bounds.width === bounds.width &&
      instance.bounds.height === bounds.height
    ) {
      return instanceId;
    }
  }
  return null;
}

export async function clickWindowSpaceSaveCurrentLayout(
  page: Page,
): Promise<void> {
  await page
    .getByTestId("window-space-save-current-layout")
    .evaluate((element: HTMLButtonElement) => element.click());
}

export async function clickWindowSpaceOpen(page: Page): Promise<void> {
  await page
    .getByTestId("window-space-open")
    .evaluate((element: HTMLButtonElement) => element.click());
}

export async function flushProjectChatWindowingWrites(
  page: Page,
): Promise<void> {
  await page.evaluate(async () => {
    const { flushPendingProjectChatWindowingWrites } = await import(
      "/src/state/actions/projectChatWindowing.ts"
    );
    await flushPendingProjectChatWindowingWrites();
  });
}
