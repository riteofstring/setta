import { callOpenAPI, createNewId } from "@setta/app-subsystem-frontend-sdk";

import { getViewport, setViewport } from "gpuFlow/viewportActions";

import { setProjectChatWindowChatId as setProjectChatWindowChatIdRequest } from "openapi/http";

import {
  NULL_PROJECT_CONFIG_ID,
  useAIStore,
  useProjectState,
  useSettings,
} from "state/definitions";

import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  SectionTypeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";

import {
  clearTrackedGitPaneGraphWindowIfMatches,
  getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject,
} from "./projectChatWindowingEphemeral";

import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "./sectionInfos";

import { createTopLevelSectionWithResult } from "./sections/createSections";

import {
  CreateProjectChatWindowInstanceOptions,
  SetBoundsByInstanceIdOptions,
  SetBoundsOptions,
  SetDockFractionsOptions,
  addProjectChatWindowInstanceInState,
  canMutateProjectChatWindowingLayout,
  getProjectChatWindowInstanceForSectionInState,
  getProjectChatWindowingStateFromStore,
  pendingProjectChatWindowingWrites,
  resolveProjectChatCanvasBootPosition,
  resolveProjectChatCanvasBootSectionSize,
  resolveProjectChatWindowTitle,
  shouldSyncActiveProjectChatId,
} from "./instancesAndDocking";

import {
  ProjectChatWindowingMutation,
  ProjectChatWindowingStoreOptions,
  applyProjectChatWindowingEphemeralState,
  applyProjectChatWindowingMutation,
  applyProjectChatWindowingMutationToState,
  closeProjectChatWindowInState,
  enqueueSerializedProjectChatWindowingWrite,
  focusProjectChatWindowInState,
  maximizeProjectChatWindowInState,
  minimizeProjectChatWindowInState,
  moveProjectChatWindowToCanvasSectionInState,
  primeAuthoritativeProjectChatWindowingState,
  reopenProjectChatWindowInState,
  restoreProjectChatWindowingEphemeralState,
  sendProjectChatWindowingSnapshot,
  setProjectChatWindowBoundsByIdInState,
  setProjectChatWindowBoundsInState,
  setProjectChatWindowChatIdInState,
  setProjectChatWindowDockFractionsInState,
  setProjectChatWindowModeForSectionInState,
  setProjectChatWindowPlacementInState,
  setProjectChatWindowTitleInState,
  showSectionInProjectChatWindowInState,
  undockProjectChatWindowFromCanvasSectionInState,
  unmaximizeProjectChatWindowInState,
} from "./windowingStateMutations";

export function dispatchProjectChatWindowingMutation(
  mutation: ProjectChatWindowingMutation,
): void {
  const projectConfigId = getCurrProjectConfigId();
  const currentProjectState = useProjectState.getState();
  const previousProjectChatWindowing = currentProjectState.projectChatWindowing;
  const previousActiveChatId = useAIStore.getState().activeChatId;
  const {
    nextProjectChatWindowing,
    alwaysSend = false,
    options: initialOptions,
    send = sendProjectChatWindowingSnapshot,
  } = mutation(getProjectChatWindowingStateFromStore(currentProjectState));
  const previousGitPaneVisibleInstanceIds =
    !projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID
      ? []
      : getProjectChatGitGraphEmbeddedPaneVisibleInstanceIdsForProject(
          projectConfigId,
        );
  if (
    !alwaysSend &&
    nextProjectChatWindowing === previousProjectChatWindowing
  ) {
    return;
  }
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    applyProjectChatWindowingMutation(
      getProjectChatWindowingStateFromStore(currentProjectState),
      null,
      mutation,
    );
    return;
  }
  primeAuthoritativeProjectChatWindowingState(
    projectConfigId,
    previousProjectChatWindowing,
  );
  dispatchOptimisticProjectStateUpdate({
    projectConfigId,
    apply: (state) =>
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        mutation,
      ),
    reapply: (state) =>
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        mutation,
      ),
    rollback: (state) => {
      restoreProjectChatWindowingEphemeralState(
        projectConfigId,
        previousProjectChatWindowing,
        previousGitPaneVisibleInstanceIds,
      );
      state.projectChatWindowing = previousProjectChatWindowing;
      if (initialOptions && Object.hasOwn(initialOptions, "syncActiveChatId")) {
        useAIStore.setState({
          activeChatId: previousActiveChatId,
        });
      }
    },
    send: (frontendOpId) =>
      enqueueSerializedProjectChatWindowingWrite(
        projectConfigId,
        frontendOpId,
        {
          alwaysSend,
          mutation,
          opId: frontendOpId,
          send,
        },
      ),
  });
}

export function applyProjectChatWindowingMutationLocally(
  nextProjectChatWindowing: ProjectChatWindowingState,
  options: ProjectChatWindowingStoreOptions = {},
): void {
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  if (nextProjectChatWindowing === currentWindowing) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId && projectConfigId !== NULL_PROJECT_CONFIG_ID) {
    applyProjectChatWindowingEphemeralState(
      projectConfigId,
      nextProjectChatWindowing,
      options,
    );
  }
  useProjectState.setState((state) => {
    state.projectChatWindowing = nextProjectChatWindowing;
  });
  if (Object.hasOwn(options, "syncActiveChatId")) {
    useAIStore.setState({
      activeChatId: options.syncActiveChatId,
    });
  }
}

export async function flushPendingProjectChatWindowingWrites(): Promise<void> {
  while (pendingProjectChatWindowingWrites.size > 0) {
    await Promise.allSettled([...pendingProjectChatWindowingWrites]);
  }
}

export async function syncProjectChatWindowingState() {
  const projectConfigId = getCurrProjectConfigId();
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return null;
  }
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  primeAuthoritativeProjectChatWindowingState(
    projectConfigId,
    currentWindowing,
  );
  const opId = createNewId();
  return enqueueSerializedProjectChatWindowingWrite(projectConfigId, opId, {
    alwaysSend: true,
    mutation: (latestWindowing) => ({
      nextProjectChatWindowing: latestWindowing,
      alwaysSend: true,
    }),
    opId,
    send: sendProjectChatWindowingSnapshot,
  });
}

export function replaceProjectChatWindowingState(
  nextProjectChatWindowing: ProjectChatWindowingState,
  options: ProjectChatWindowingStoreOptions = {},
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation(() => ({
    nextProjectChatWindowing,
    options,
  }));
}

export function createProjectChatWindowInstance(
  options: CreateProjectChatWindowInstanceOptions = {},
): string {
  if (!canMutateProjectChatWindowingLayout()) {
    return "";
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = addProjectChatWindowInstanceInState(currentWindowing, options);
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: addProjectChatWindowInstanceInState(
      latestWindowing,
      {
        ...options,
        instanceId: next.instanceId,
      },
    ).state,
  }));
  return next.instanceId;
}

export function setProjectChatWindowPlacement(
  instanceId: string,
  placement: ChatWindowPlacement,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  if (placement !== ChatWindowPlacementEnum.maximized) {
    clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowPlacementInState(
      currentWindowing,
      instanceId,
      placement,
    ),
  }));
}

export function maximizeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: maximizeProjectChatWindowInState(
      currentWindowing,
      instanceId,
    ),
  }));
}

export function unmaximizeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: unmaximizeProjectChatWindowInState(
      currentWindowing,
      instanceId,
      useSettings.getState().chatWindowing?.restorePriorStateOnUnmaximize ??
        true,
    ),
  }));
}

export function closeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: closeProjectChatWindowInState(
      currentWindowing,
      instanceId,
    ),
  }));
}

export function minimizeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: minimizeProjectChatWindowInState(
      currentWindowing,
      instanceId,
    ),
  }));
}

export function reopenProjectChatWindow(instanceId: string): void {
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  const nextProjectChatWindowing = reopenProjectChatWindowInState(
    currentWindowing,
    instanceId,
  );
  if (nextProjectChatWindowing === currentWindowing) {
    return;
  }
  if (!canMutateProjectChatWindowingLayout()) {
    applyProjectChatWindowingMutationLocally(nextProjectChatWindowing);
    return;
  }
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: reopenProjectChatWindowInState(
      latestWindowing,
      instanceId,
    ),
  }));
}

export function focusProjectChatWindow(
  instanceId: string,
  nowMs: number = Date.now(),
): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = focusProjectChatWindowInState(
    currentWindowing,
    instanceId,
    nowMs,
  );
  if (next === currentWindowing) {
    return;
  }
  const focusedWindow = next.instancesById[instanceId];
  if (!canMutateProjectChatWindowingLayout()) {
    applyProjectChatWindowingMutationLocally(next, {
      ...(shouldSyncActiveProjectChatId(focusedWindow)
        ? {
            syncActiveChatId: focusedWindow.chatId ?? undefined,
          }
        : {}),
    });
    return;
  }
  dispatchProjectChatWindowingMutation((latestWindowing) => {
    const nextProjectChatWindowing = focusProjectChatWindowInState(
      latestWindowing,
      instanceId,
      nowMs,
    );
    const nextFocusedWindow =
      nextProjectChatWindowing.instancesById[instanceId] ?? null;
    return {
      nextProjectChatWindowing,
      options: shouldSyncActiveProjectChatId(nextFocusedWindow)
        ? {
            syncActiveChatId: nextFocusedWindow?.chatId ?? undefined,
          }
        : {},
    };
  });
}

export function setProjectChatWindowDockFractions(
  options: SetDockFractionsOptions,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowDockFractionsInState(
      currentWindowing,
      options,
    ),
  }));
}

export function setProjectChatWindowBounds(
  instanceId: string,
  bounds: SetBoundsOptions,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowBoundsInState(
      currentWindowing,
      instanceId,
      bounds,
    ),
  }));
}

export function setProjectChatWindowBoundsById(
  boundsByInstanceId: SetBoundsByInstanceIdOptions,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  for (const instanceId of Object.keys(boundsByInstanceId)) {
    clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowBoundsByIdInState(
      currentWindowing,
      boundsByInstanceId,
    ),
  }));
}

export function setProjectChatWindowTitle(
  instanceId: string,
  title: string | null,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowTitleInState(
      currentWindowing,
      instanceId,
      title,
    ),
  }));
}

export function setProjectChatWindowChatId(
  instanceId: string,
  chatId: string | null | undefined,
): void {
  const normalizedChatId = chatId?.trim() ? chatId.trim() : null;
  dispatchProjectChatWindowingMutation((currentWindowing) => {
    const nextProjectChatWindowing = setProjectChatWindowChatIdInState(
      currentWindowing,
      instanceId,
      normalizedChatId,
    );
    const updatedWindow =
      nextProjectChatWindowing.instancesById[instanceId] ?? null;
    return {
      nextProjectChatWindowing,
      send: (projectConfigId, frontendOpId) =>
        callOpenAPI(
          setProjectChatWindowChatIdRequest({
            body: {
              projectConfigId,
              instanceId,
              chatId: normalizedChatId,
              frontendOpId,
            },
          } as Parameters<typeof setProjectChatWindowChatIdRequest>[0]),
        ),
      options: shouldSyncActiveProjectChatId(updatedWindow)
        ? {
            syncActiveChatId: updatedWindow?.chatId ?? undefined,
          }
        : {},
    };
  });
}

export type ProjectChatWindowCanvasBootTarget = {
  currentInstance: ProjectChatWindowInstance;
};

export function resolveProjectChatWindowCanvasBootTarget(
  instanceId: string,
): ProjectChatWindowCanvasBootTarget | null {
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  const currentInstance = currentWindowing.instancesById[instanceId];
  if (
    !currentInstance ||
    currentInstance.mode === ChatWindowModeEnum.git_graph_mode
  ) {
    return null;
  }
  return {
    currentInstance,
  };
}

export function restoreProjectChatCanvasViewport(
  viewportX: number,
  viewportY: number,
  viewportZoom: number,
): void {
  setViewport({ x: viewportX, y: viewportY, zoom: viewportZoom });
}

export async function resolveProjectChatWindowCanvasBootSectionId(
  instanceId: string,
  currentInstance: ProjectChatWindowInstance,
): Promise<string | null> {
  if (currentInstance.sectionIdOrNull) {
    return currentInstance.sectionIdOrNull;
  }
  const canvasSectionSize = resolveProjectChatCanvasBootSectionSize(instanceId);
  const { x: viewportX, y: viewportY, zoom: viewportZoom } = getViewport();
  const created = await createTopLevelSectionWithResult({
    implType: SectionTypeEnum.Chat,
    implOverrides: {
      type: SectionTypeEnum.Chat,
      ...(canvasSectionSize ? { size: canvasSectionSize } : {}),
    },
    position: resolveProjectChatCanvasBootPosition(instanceId),
    name: resolveProjectChatWindowTitle(currentInstance.title),
  });
  if (!created) {
    return null;
  }
  restoreProjectChatCanvasViewport(viewportX, viewportY, viewportZoom);
  return created.sectionId;
}

export function dispatchProjectChatWindowCanvasSectionMove(
  latestWindowing: ProjectChatWindowingState,
  instanceId: string,
  sectionId: string,
  mode: ChatWindowMode,
): void {
  const next = moveProjectChatWindowToCanvasSectionInState(
    latestWindowing,
    instanceId,
    {
      sectionId,
      mode,
    },
  );
  if (next === latestWindowing) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: moveProjectChatWindowToCanvasSectionInState(
      currentWindowing,
      instanceId,
      {
        sectionId,
        mode,
      },
    ),
  }));
}

export async function bootProjectChatWindowToCanvasSection(
  instanceId: string,
): Promise<string | null> {
  if (!canMutateProjectChatWindowingLayout()) {
    return null;
  }
  const bootTarget = resolveProjectChatWindowCanvasBootTarget(instanceId);
  if (!bootTarget) {
    return null;
  }
  const sectionId = await resolveProjectChatWindowCanvasBootSectionId(
    instanceId,
    bootTarget.currentInstance,
  );
  if (!sectionId) {
    return null;
  }
  const latestWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  const latestInstance = latestWindowing.instancesById[instanceId];
  if (!latestInstance) {
    return sectionId;
  }
  dispatchProjectChatWindowCanvasSectionMove(
    latestWindowing,
    instanceId,
    sectionId,
    latestInstance.mode,
  );
  return sectionId;
}

export function showSectionInProjectChatWindow(
  sectionId: string,
  placement: ChatWindowPlacement = ChatWindowPlacementEnum.floating,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    currentWindowing,
    sectionId,
  );
  const createdInstanceId =
    boundInstance?.instanceId ??
    addProjectChatWindowInstanceInState(currentWindowing, {
      placement,
      mode: ChatWindowModeEnum.section_mode,
      sectionIdOrNull: sectionId,
    }).instanceId;
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: showSectionInProjectChatWindowInState(
      latestWindowing,
      sectionId,
      {
        instanceId: createdInstanceId,
        placement,
      },
    ),
  }));
}

export function undockProjectChatWindowFromCanvasSection(
  instanceId: string,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const currentInstance = currentWindowing.instancesById[instanceId];
  if (
    !currentInstance ||
    currentInstance.placement !== ChatWindowPlacementEnum.canvas_section
  ) {
    return;
  }
  const next = undockProjectChatWindowFromCanvasSectionInState(
    currentWindowing,
    instanceId,
  );
  if (next === currentWindowing) {
    return;
  }
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: undockProjectChatWindowFromCanvasSectionInState(
      latestWindowing,
      instanceId,
    ),
  }));
}

export function setProjectChatWindowModeForSection(
  sectionId: string,
  mode: ChatWindowMode,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    currentWindowing,
    sectionId,
  );
  const createdInstanceId =
    boundInstance?.instanceId ??
    (mode === ChatWindowModeEnum.section_mode
      ? undefined
      : addProjectChatWindowInstanceInState(currentWindowing, {
          placement: ChatWindowPlacementEnum.canvas_section,
          mode,
          sectionIdOrNull: sectionId,
        }).instanceId);
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowModeForSectionInState(
      latestWindowing,
      sectionId,
      mode,
      {
        createInstanceId: createdInstanceId,
      },
    ),
  }));
}
