import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";

import { setProjectChatWindowingState } from "openapi/http";

import {
  NULL_PROJECT_CONFIG_ID,
  useAIStore,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";

import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowBounds,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";

import {
  getAuthoritativeProjectChatWindowingState,
  recordAuthoritativeProjectChatWindowingState,
} from "./projectChatWindowingAuthoritative";

import {
  reconcileProjectChatWindowingEphemeralState,
  replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject,
} from "./projectChatWindowingEphemeral";

import {
  CHAT_WINDOW_BOUNDS_FIELDS,
  MoveProjectChatWindowToCanvasSectionOptions,
  SetBoundsByInstanceIdOptions,
  SetBoundsOptions,
  SetDockFractionsOptions,
  UndockProjectChatWindowFromCanvasSectionOptions,
  addProjectChatWindowInstanceInState,
  getHighestWindowZIndex,
  getProjectChatWindowInstanceForSectionInState,
  getProjectChatWindowingStateFromStore,
  hasPositiveFiniteChatWindowSize,
  normalizeProjectChatWindowingState,
  pendingProjectChatWindowingMutationsByProjectId,
  pendingProjectChatWindowingWrites,
  projectChatWindowingWriteBarrierByProjectId,
  resolveDefaultFloatingChatBoundsFromRuntime,
  withUpdatedWindow,
} from "./instancesAndDocking";

export function resolveProjectChatWindowDockFractionUpdate(
  current: ProjectChatWindowInstance,
  widthFraction: number,
  dockContainerWidthPx: number | null,
): ProjectChatWindowInstance | null {
  if (!Number.isFinite(widthFraction) || widthFraction <= 0) {
    return null;
  }
  const nextPreferredWidthPx =
    typeof dockContainerWidthPx === "number" && dockContainerWidthPx > 0
      ? widthFraction * dockContainerWidthPx
      : current.dockMetrics.preferredWidthPx;
  if (
    current.dockMetrics.widthFraction === widthFraction &&
    current.dockMetrics.preferredWidthPx === nextPreferredWidthPx
  ) {
    return null;
  }
  return {
    ...current,
    dockMetrics: {
      ...current.dockMetrics,
      widthFraction,
      preferredWidthPx: nextPreferredWidthPx,
    },
  };
}

export function setProjectChatWindowPlacementInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  placement: ChatWindowPlacement,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    const isMaximized = placement === ChatWindowPlacementEnum.maximized;
    const nextLastPlacementBeforeMaximize = isMaximized
      ? current.placement === ChatWindowPlacementEnum.maximized
        ? current.lastPlacementBeforeMaximize
        : current.placement
      : current.lastPlacementBeforeMaximize;
    if (
      current.placement === placement &&
      current.isMaximized === isMaximized &&
      current.lastPlacementBeforeMaximize === nextLastPlacementBeforeMaximize
    ) {
      return current;
    }
    return {
      ...current,
      placement,
      isMaximized,
      lastPlacementBeforeMaximize: nextLastPlacementBeforeMaximize,
    };
  });
}

export function setProjectChatWindowModeInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  mode: ChatWindowMode,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (current.mode === mode) {
      return current;
    }
    return {
      ...current,
      mode,
    };
  });
}

export function maximizeProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (current.isMaximized) {
      return current;
    }
    const nextLastPlacementBeforeMaximize =
      current.placement === ChatWindowPlacementEnum.maximized
        ? current.lastPlacementBeforeMaximize
        : current.placement;
    return {
      ...current,
      isMaximized: true,
      placement: ChatWindowPlacementEnum.maximized,
      lastPlacementBeforeMaximize: nextLastPlacementBeforeMaximize,
    };
  });
}

export function unmaximizeProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  restorePriorStateOnUnmaximize: boolean = true,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (!current.isMaximized) {
      return current;
    }
    return {
      ...current,
      isMaximized: false,
      placement: restorePriorStateOnUnmaximize
        ? current.lastPlacementBeforeMaximize ??
          ChatWindowPlacementEnum.bottom_docked
        : ChatWindowPlacementEnum.bottom_docked,
      lastPlacementBeforeMaximize: null,
    };
  });
}

export function closeProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (current.isClosed && !current.isMinimized) {
      return current;
    }
    return {
      ...current,
      isClosed: true,
      isMinimized: false,
    };
  });
}

export function minimizeProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (!current.isClosed && current.isMinimized) {
      return current;
    }
    return {
      ...current,
      isClosed: false,
      isMinimized: true,
    };
  });
}

export function reopenProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (!current.isClosed && !current.isMinimized) {
      return current;
    }
    return {
      ...current,
      isClosed: false,
      isMinimized: false,
    };
  });
}

export function focusProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  nowMs: number = Date.now(),
): ProjectChatWindowingState {
  const normalized = normalizeProjectChatWindowingState(state);
  const highestZIndex = getHighestWindowZIndex(normalized);
  const highestZIndexCount = Object.values(normalized.instancesById).filter(
    (instance) => instance.zIndex === highestZIndex,
  ).length;
  return withUpdatedWindow(normalized, instanceId, (current) => {
    if (current.zIndex === highestZIndex && highestZIndexCount === 1) {
      if (current.lastFocusedAt === nowMs) {
        return current;
      }
      return {
        ...current,
        lastFocusedAt: nowMs,
      };
    }
    return {
      ...current,
      zIndex: highestZIndex + 1,
      lastFocusedAt: nowMs,
    };
  });
}

export function setProjectChatWindowDockFractionsInState(
  state: ProjectChatWindowingState,
  {
    widthFractionsByInstanceId,
    dockContainerWidthPx = null,
  }: SetDockFractionsOptions,
): ProjectChatWindowingState {
  let nextInstancesById: Record<string, ProjectChatWindowInstance> | null =
    null;
  for (const [instanceId, widthFraction] of Object.entries(
    widthFractionsByInstanceId,
  )) {
    const current = state.instancesById[instanceId];
    if (!current) {
      continue;
    }
    const nextInstance = resolveProjectChatWindowDockFractionUpdate(
      current,
      widthFraction,
      dockContainerWidthPx,
    );
    if (!nextInstance) {
      continue;
    }
    if (!nextInstancesById) {
      nextInstancesById = { ...state.instancesById };
    }
    nextInstancesById[instanceId] = nextInstance;
  }
  if (!nextInstancesById) {
    return state;
  }
  return {
    ...state,
    instancesById: nextInstancesById,
  };
}

export function resolveProjectChatWindowBoundsUpdate(
  currentBounds: ChatWindowBounds,
  bounds: SetBoundsOptions,
): ChatWindowBounds | null {
  let changed = false;
  const nextBounds: ChatWindowBounds = { ...currentBounds };
  for (const { key, requirePositive } of CHAT_WINDOW_BOUNDS_FIELDS) {
    const value = bounds[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    if (requirePositive && value <= 0) {
      continue;
    }
    if (nextBounds[key] === value) {
      continue;
    }
    nextBounds[key] = value;
    changed = true;
  }
  return changed ? nextBounds : null;
}

export function setProjectChatWindowBoundsInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  bounds: SetBoundsOptions,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    const nextBounds = resolveProjectChatWindowBoundsUpdate(
      current.bounds,
      bounds,
    );
    if (!nextBounds) {
      return current;
    }
    return {
      ...current,
      bounds: nextBounds,
    };
  });
}

export function setProjectChatWindowBoundsByIdInState(
  state: ProjectChatWindowingState,
  boundsByInstanceId: SetBoundsByInstanceIdOptions,
): ProjectChatWindowingState {
  let nextState = state;
  for (const [instanceId, bounds] of Object.entries(boundsByInstanceId)) {
    nextState = setProjectChatWindowBoundsInState(
      nextState,
      instanceId,
      bounds,
    );
  }
  return nextState;
}

export function moveProjectChatWindowToCanvasSectionInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  {
    sectionId,
    nowMs = Date.now(),
    mode = ChatWindowModeEnum.section_mode,
  }: MoveProjectChatWindowToCanvasSectionOptions,
): ProjectChatWindowingState {
  if (mode === ChatWindowModeEnum.git_graph_mode) {
    return state;
  }
  const withCanvasPlacement = setProjectChatWindowPlacementInState(
    state,
    instanceId,
    ChatWindowPlacementEnum.canvas_section,
  );
  const withOpenWindow = withUpdatedWindow(
    withCanvasPlacement,
    instanceId,
    (current) => {
      if (
        current.sectionIdOrNull === sectionId &&
        current.mode === mode &&
        !current.isClosed &&
        !current.isMinimized
      ) {
        return current;
      }
      return {
        ...current,
        sectionIdOrNull: sectionId,
        mode,
        title: null,
        isClosed: false,
        isMinimized: false,
      };
    },
  );
  return focusProjectChatWindowInState(withOpenWindow, instanceId, nowMs);
}

export function undockProjectChatWindowFromCanvasSectionInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  { nowMs = Date.now() }: UndockProjectChatWindowFromCanvasSectionOptions = {},
): ProjectChatWindowingState {
  const withFloatingPlacement = setProjectChatWindowPlacementInState(
    state,
    instanceId,
    ChatWindowPlacementEnum.floating,
  );
  const withOpenWindow = withUpdatedWindow(
    withFloatingPlacement,
    instanceId,
    (current) => {
      if (!current.isClosed && !current.isMinimized) {
        return current;
      }
      return {
        ...current,
        isClosed: false,
        isMinimized: false,
      };
    },
  );
  return focusProjectChatWindowInState(withOpenWindow, instanceId, nowMs);
}

export function setProjectChatWindowModeForSectionInState(
  state: ProjectChatWindowingState,
  sectionId: string,
  mode: ChatWindowMode,
  {
    createInstanceId,
  }: {
    createInstanceId?: string;
  } = {},
): ProjectChatWindowingState {
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
  );
  if (!boundInstance) {
    if (mode === ChatWindowModeEnum.section_mode) {
      return state;
    }
    return addProjectChatWindowInstanceInState(state, {
      instanceId: createInstanceId,
      placement: ChatWindowPlacementEnum.canvas_section,
      mode,
      sectionIdOrNull: sectionId,
    }).state;
  }
  return setProjectChatWindowModeInState(state, boundInstance.instanceId, mode);
}

export function resolveSectionWindowRevealBounds(
  current: ProjectChatWindowInstance,
  previousPlacement: ChatWindowPlacement,
  nextPlacement: ChatWindowPlacement,
): ChatWindowBounds {
  const shouldSeedFloatingBounds =
    nextPlacement === ChatWindowPlacementEnum.floating &&
    (previousPlacement !== ChatWindowPlacementEnum.floating ||
      !hasPositiveFiniteChatWindowSize(current.bounds));
  return shouldSeedFloatingBounds
    ? resolveDefaultFloatingChatBoundsFromRuntime()
    : current.bounds;
}

export function showSectionInProjectChatWindowInState(
  state: ProjectChatWindowingState,
  sectionId: string,
  {
    instanceId,
    placement = ChatWindowPlacementEnum.floating,
    nowMs = Date.now(),
  }: {
    instanceId?: string;
    placement?: ChatWindowPlacement;
    nowMs?: number;
  } = {},
): ProjectChatWindowingState {
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    state,
    sectionId,
  );
  if (!boundInstance) {
    return addProjectChatWindowInstanceInState(state, {
      instanceId,
      placement,
      mode: ChatWindowModeEnum.section_mode,
      sectionIdOrNull: sectionId,
      nowMs,
    }).state;
  }
  let next = setProjectChatWindowPlacementInState(
    state,
    boundInstance.instanceId,
    placement,
  );
  next = withUpdatedWindow(next, boundInstance.instanceId, (current) => {
    const resolvedBounds = resolveSectionWindowRevealBounds(
      current,
      boundInstance.placement,
      placement,
    );
    if (
      current.sectionIdOrNull === sectionId &&
      !current.isClosed &&
      !current.isMinimized &&
      current.bounds === resolvedBounds
    ) {
      return current;
    }
    return {
      ...current,
      sectionIdOrNull: sectionId,
      title: null,
      isClosed: false,
      isMinimized: false,
      bounds: resolvedBounds,
    };
  });
  return focusProjectChatWindowInState(next, boundInstance.instanceId, nowMs);
}

export function setProjectChatWindowTitleInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  title: string | null,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    const normalizedTitle = current.sectionIdOrNull
      ? null
      : title?.trim()
        ? title.trim()
        : null;
    if (current.title === normalizedTitle) {
      return current;
    }
    return {
      ...current,
      title: normalizedTitle,
    };
  });
}

export function setProjectChatWindowChatIdInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  chatId: string | null | undefined,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    if (current.mode !== ChatWindowModeEnum.project_ai_mode) {
      return current;
    }
    const normalizedChatId = chatId?.trim() ? chatId.trim() : null;
    if (current.chatId === normalizedChatId) {
      return current;
    }
    return {
      ...current,
      chatId: normalizedChatId,
    };
  });
}

export type ProjectChatWindowingStoreOptions = {
  syncActiveChatId?: string | undefined;
  nextGitPaneVisibleInstanceIds?: Array<string> | undefined;
};

export type ProjectChatWindowingSend = (
  projectConfigId: string,
  frontendOpId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
) => Promise<ProjectChatWindowingTrackedResponse>;

export type ProjectChatWindowingMutationResult = {
  nextProjectChatWindowing: ProjectChatWindowingState;
  alwaysSend?: boolean;
  options?: ProjectChatWindowingStoreOptions;
  send?: ProjectChatWindowingSend;
};

export type ProjectChatWindowingMutation = (
  currentWindowing: ProjectChatWindowingState,
) => ProjectChatWindowingMutationResult;

export type PendingProjectChatWindowingMutation = {
  alwaysSend: boolean;
  mutation: ProjectChatWindowingMutation;
  opId: string;
  send: ProjectChatWindowingSend;
};

export type ProjectChatWindowingWriteResponse =
  ResponseDataAndStatus<ProjectChatWindowingState>;

export type SyntheticProjectChatWindowingWriteResponse =
  ProjectChatWindowingWriteResponse & {
    data: ProjectChatWindowingState;
    hasResponse: true;
    status: 200;
  };

export type ProjectChatWindowingTrackedResponse =
  | ProjectChatWindowingWriteResponse
  | SyntheticProjectChatWindowingWriteResponse;

export type ProjectChatWindowingSnapshotForMutation = {
  authoritativeWindowing: ProjectChatWindowingState;
  nextProjectChatWindowing: ProjectChatWindowingState;
};

export function getPendingProjectChatWindowingMutations(
  projectConfigId: string,
): Array<PendingProjectChatWindowingMutation> {
  return (
    pendingProjectChatWindowingMutationsByProjectId.get(projectConfigId) ?? []
  );
}

export function applyProjectChatWindowingEphemeralState(
  projectConfigId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
  options: ProjectChatWindowingStoreOptions,
): void {
  if (Object.hasOwn(options, "nextGitPaneVisibleInstanceIds")) {
    replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject(
      projectConfigId,
      options.nextGitPaneVisibleInstanceIds ?? [],
    );
  }
  reconcileProjectChatWindowingEphemeralState(
    nextProjectChatWindowing,
    projectConfigId,
  );
}

export function restoreProjectChatWindowingEphemeralState(
  projectConfigId: string,
  previousProjectChatWindowing: ProjectChatWindowingState,
  previousGitPaneVisibleInstanceIds: Array<string>,
): void {
  replaceProjectChatGitGraphEmbeddedPaneVisibilityForProject(
    projectConfigId,
    previousGitPaneVisibleInstanceIds,
  );
  reconcileProjectChatWindowingEphemeralState(
    previousProjectChatWindowing,
    projectConfigId,
  );
}

export function enqueueProjectChatWindowingWrite<T extends Promise<unknown>>(
  request: T,
): T {
  pendingProjectChatWindowingWrites.add(request);
  void request.finally(() => {
    pendingProjectChatWindowingWrites.delete(request);
  });
  return request;
}

export function primeAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
  projectChatWindowing: ProjectChatWindowingState,
): void {
  if (getPendingProjectChatWindowingMutations(projectConfigId).length > 0) {
    return;
  }
  recordAuthoritativeProjectChatWindowingState(
    projectConfigId,
    projectChatWindowing,
  );
}

export function addPendingProjectChatWindowingMutation(
  projectConfigId: string,
  pendingMutation: PendingProjectChatWindowingMutation,
): void {
  pendingProjectChatWindowingMutationsByProjectId.set(projectConfigId, [
    ...getPendingProjectChatWindowingMutations(projectConfigId),
    pendingMutation,
  ]);
}

export function removePendingProjectChatWindowingMutation(
  projectConfigId: string,
  opId: string,
): void {
  const remainingMutations = getPendingProjectChatWindowingMutations(
    projectConfigId,
  ).filter((pendingMutation) => pendingMutation.opId !== opId);
  if (remainingMutations.length === 0) {
    pendingProjectChatWindowingMutationsByProjectId.delete(projectConfigId);
    projectChatWindowingWriteBarrierByProjectId.delete(projectConfigId);
    return;
  }
  pendingProjectChatWindowingMutationsByProjectId.set(
    projectConfigId,
    remainingMutations,
  );
}

export function buildProjectChatWindowingSnapshotForMutation(
  projectConfigId: string,
  opId: string,
): ProjectChatWindowingSnapshotForMutation | null {
  const pendingMutations =
    getPendingProjectChatWindowingMutations(projectConfigId);
  const targetIndex = pendingMutations.findIndex(
    (pendingMutation) => pendingMutation.opId === opId,
  );
  if (targetIndex < 0) {
    return null;
  }
  const authoritativeWindowing =
    getAuthoritativeProjectChatWindowingState(projectConfigId) ??
    useProjectState.getState().projectChatWindowing;
  let nextProjectChatWindowing = authoritativeWindowing;
  for (let index = 0; index <= targetIndex; index += 1) {
    const pendingMutation = pendingMutations[index];
    if (!pendingMutation) {
      continue;
    }
    nextProjectChatWindowing = pendingMutation.mutation(
      nextProjectChatWindowing,
    ).nextProjectChatWindowing;
  }
  return {
    authoritativeWindowing,
    nextProjectChatWindowing,
  };
}

export function getPendingProjectChatWindowingMutationsAfter(
  projectConfigId: string,
  opId: string,
): Array<PendingProjectChatWindowingMutation> {
  const pendingMutations =
    getPendingProjectChatWindowingMutations(projectConfigId);
  const acknowledgedMutationIndex = pendingMutations.findIndex(
    (pendingMutation) => pendingMutation.opId === opId,
  );
  if (acknowledgedMutationIndex < 0) {
    return pendingMutations;
  }
  return pendingMutations.slice(acknowledgedMutationIndex + 1);
}

export function publishAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
  acknowledgedOpId: string,
  authoritativeWindowing: ProjectChatWindowingState,
): void {
  recordAuthoritativeProjectChatWindowingState(
    projectConfigId,
    authoritativeWindowing,
  );
  if (useProjectState.getState().projectConfig.id !== projectConfigId) {
    return;
  }
  const pendingMutations = getPendingProjectChatWindowingMutationsAfter(
    projectConfigId,
    acknowledgedOpId,
  );
  applyProjectChatWindowingEphemeralState(
    projectConfigId,
    authoritativeWindowing,
    {},
  );
  useProjectState.setState((state) => {
    if (state.projectConfig.id !== projectConfigId) {
      return;
    }
    state.projectChatWindowing = authoritativeWindowing;
    for (const pendingMutation of pendingMutations) {
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        pendingMutation.mutation,
      );
    }
  });
}

export function sendProjectChatWindowingSnapshot(
  projectConfigId: string,
  frontendOpId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
): Promise<ProjectChatWindowingWriteResponse> {
  return callOpenAPI(
    setProjectChatWindowingState({
      body: {
        projectConfigId,
        state: nextProjectChatWindowing,
        frontendOpId,
      },
    } as Parameters<typeof setProjectChatWindowingState>[0]),
  );
}

export function buildSyntheticProjectChatWindowingWriteResponse(
  projectConfigId: string,
): SyntheticProjectChatWindowingWriteResponse {
  return {
    data:
      getAuthoritativeProjectChatWindowingState(projectConfigId) ??
      useProjectState.getState().projectChatWindowing,
    status: 200,
    hasResponse: true,
  };
}

export function createProjectChatWindowingWriteBarrier(
  request: Promise<unknown>,
): Promise<void> {
  return request
    .finally(
      () =>
        new Promise<void>((resolve) => {
          queueMicrotask(resolve);
        }),
    )
    .then(
      () => undefined,
      () => undefined,
    );
}

export function enqueueSerializedProjectChatWindowingWrite(
  projectConfigId: string,
  opId: string,
  pendingMutation: PendingProjectChatWindowingMutation,
): Promise<ProjectChatWindowingTrackedResponse> {
  addPendingProjectChatWindowingMutation(projectConfigId, pendingMutation);
  const previousBarrier =
    projectChatWindowingWriteBarrierByProjectId.get(projectConfigId) ??
    Promise.resolve();
  const request = previousBarrier.then(async () => {
    const pendingMutations =
      getPendingProjectChatWindowingMutations(projectConfigId);
    const targetMutation = pendingMutations.find(
      (candidate) => candidate.opId === opId,
    );
    const snapshot = buildProjectChatWindowingSnapshotForMutation(
      projectConfigId,
      opId,
    );
    if (!snapshot || !targetMutation) {
      return buildSyntheticProjectChatWindowingWriteResponse(projectConfigId);
    }
    const { authoritativeWindowing, nextProjectChatWindowing } = snapshot;
    if (
      !targetMutation.alwaysSend &&
      nextProjectChatWindowing === authoritativeWindowing
    ) {
      return buildSyntheticProjectChatWindowingWriteResponse(projectConfigId);
    }
    const response = await targetMutation.send(
      projectConfigId,
      opId,
      nextProjectChatWindowing,
    );
    if (res200(response)) {
      publishAuthoritativeProjectChatWindowingState(
        projectConfigId,
        opId,
        response.data,
      );
    }
    return response;
  });
  const barrier = createProjectChatWindowingWriteBarrier(
    request.finally(() => {
      removePendingProjectChatWindowingMutation(projectConfigId, opId);
    }),
  );
  projectChatWindowingWriteBarrierByProjectId.set(projectConfigId, barrier);
  return enqueueProjectChatWindowingWrite(request);
}

export function applyProjectChatWindowingMutation(
  currentWindowing: ProjectChatWindowingState,
  projectConfigId: string | null,
  mutation: ProjectChatWindowingMutation,
) {
  const resolvedMutation = mutation(currentWindowing);
  const options = resolvedMutation.options ?? {};
  const shouldSyncActiveChatId = Object.hasOwn(options, "syncActiveChatId");
  if (
    projectConfigId &&
    projectConfigId !== NULL_PROJECT_CONFIG_ID &&
    resolvedMutation.nextProjectChatWindowing !== currentWindowing
  ) {
    applyProjectChatWindowingEphemeralState(
      projectConfigId,
      resolvedMutation.nextProjectChatWindowing,
      options,
    );
  }
  if (resolvedMutation.nextProjectChatWindowing !== currentWindowing) {
    useProjectState.setState((state) => {
      state.projectChatWindowing = resolvedMutation.nextProjectChatWindowing;
    });
  }
  if (shouldSyncActiveChatId) {
    useAIStore.setState({
      activeChatId: options.syncActiveChatId,
    });
  }
  return {
    nextProjectChatWindowing: resolvedMutation.nextProjectChatWindowing,
    options,
  };
}

export function applyProjectChatWindowingMutationToState(
  state: ZustandProjectState,
  projectConfigId: string,
  mutation: ProjectChatWindowingMutation,
): void {
  if (state.projectConfig.id !== projectConfigId) {
    return;
  }
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const { nextProjectChatWindowing, options } = mutation(currentWindowing);
  if (nextProjectChatWindowing === currentWindowing) {
    return;
  }
  applyProjectChatWindowingEphemeralState(
    projectConfigId,
    nextProjectChatWindowing,
    options ?? {},
  );
  state.projectChatWindowing = nextProjectChatWindowing;
  if (options && Object.hasOwn(options, "syncActiveChatId")) {
    useAIStore.setState({
      activeChatId: options.syncActiveChatId,
    });
  }
}
