import {
  PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX,
  PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX,
  resolveProjectChatFloatingBottomInsetPx,
  resolveProjectChatFloatingWorkspaceTopInsetPx,
} from "components/ChatWindowing/projectChatViewport";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  createProjectChatWindowInstance as createProjectChatWindowInstanceModel,
  type ChatWindowBounds,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import {
  getProjectChatWindowInstanceForSectionInState,
  normalizeProjectChatWindowingState,
  resolveDefaultFloatingChatBounds,
} from "./projectChatWindowingSelectors";

export type CreateProjectChatWindowInstanceOptions = {
  instanceId?: string;
  placement?: ChatWindowPlacement;
  mode?: ChatWindowMode;
  sectionIdOrNull?: string | null;
  title?: string | null;
  chatId?: string | null;
  bounds?: ChatWindowBounds | null;
  nowMs?: number;
};

export type SetDockFractionsOptions = {
  widthFractionsByInstanceId: Record<string, number>;
  dockContainerWidthPx?: number | null;
};

export type SetBoundsOptions = Partial<ChatWindowBounds>;
export type SetBoundsByInstanceIdOptions = Record<string, SetBoundsOptions>;

export type MoveProjectChatWindowToCanvasSectionOptions = {
  sectionId: string;
  nowMs?: number;
  mode?: ChatWindowMode;
};

export type UndockProjectChatWindowFromCanvasSectionOptions = {
  nowMs?: number;
};

const DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_WIDTH_PX =
  PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX;
const DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX =
  PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;

function resolveFloatingWorkspaceTopInsetPx(): number {
  return resolveProjectChatFloatingWorkspaceTopInsetPx();
}

function resolveFloatingBottomInsetPx(): number {
  return resolveProjectChatFloatingBottomInsetPx();
}

function resolveDefaultFloatingChatBoundsFromRuntime(): ChatWindowBounds {
  const viewportWidthPx =
    typeof window !== "undefined"
      ? window.innerWidth
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_WIDTH_PX;
  const viewportHeightPx =
    typeof window !== "undefined"
      ? window.innerHeight
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;
  return resolveDefaultFloatingChatBounds({
    viewportWidthPx,
    viewportHeightPx,
    workspaceTopInsetPx: resolveFloatingWorkspaceTopInsetPx(),
    bottomInsetPx: resolveFloatingBottomInsetPx(),
  });
}

function normalizeWorkspaceProjectChatWindowInstance(
  instance: ProjectChatWindowInstance,
): ProjectChatWindowInstance {
  if (
    instance.mode !== ChatWindowModeEnum.section_mode ||
    instance.chatId === null
  ) {
    return instance;
  }
  return {
    ...instance,
    chatId: null,
  };
}

function getNextWindowInstanceId(state: ProjectChatWindowingState): {
  instanceId: string;
  nextInstanceNumber: number;
} {
  let nextInstanceNumber = Math.max(1, state.nextInstanceNumber);
  for (;;) {
    const candidateId = `project-chat-window-${nextInstanceNumber}`;
    if (!state.instancesById[candidateId]) {
      return {
        instanceId: candidateId,
        nextInstanceNumber: nextInstanceNumber + 1,
      };
    }
    nextInstanceNumber += 1;
  }
}

function getHighestWindowZIndex(state: ProjectChatWindowingState): number {
  let maxZIndex = 0;
  for (const instance of Object.values(state.instancesById)) {
    if (instance.zIndex > maxZIndex) {
      maxZIndex = instance.zIndex;
    }
  }
  return maxZIndex;
}

function buildNextWindowInstances(
  state: ProjectChatWindowingState,
  instanceId: string,
  updater: (instance: ProjectChatWindowInstance) => ProjectChatWindowInstance,
): Record<string, ProjectChatWindowInstance> {
  const current = state.instancesById[instanceId];
  if (!current) {
    return state.instancesById;
  }
  const next = normalizeWorkspaceProjectChatWindowInstance(updater(current));
  if (next === current) {
    return state.instancesById;
  }
  return {
    ...state.instancesById,
    [instanceId]: next,
  };
}

function withUpdatedWindow(
  state: ProjectChatWindowingState,
  instanceId: string,
  updater: (instance: ProjectChatWindowInstance) => ProjectChatWindowInstance,
): ProjectChatWindowingState {
  const nextInstancesById = buildNextWindowInstances(
    state,
    instanceId,
    updater,
  );
  if (nextInstancesById === state.instancesById) {
    return state;
  }
  return {
    ...state,
    instancesById: nextInstancesById,
  };
}

export function addProjectChatWindowInstanceInState(
  state: ProjectChatWindowingState,
  {
    instanceId: explicitInstanceId,
    placement = ChatWindowPlacementEnum.bottom_docked,
    mode = ChatWindowModeEnum.project_ai_mode,
    sectionIdOrNull = null,
    title = null,
    chatId = null,
    bounds = null,
    nowMs = Date.now(),
  }: CreateProjectChatWindowInstanceOptions = {},
): {
  state: ProjectChatWindowingState;
  instanceId: string;
} {
  const normalized = normalizeProjectChatWindowingState(state);
  const { instanceId, nextInstanceNumber } = (() => {
    if (!explicitInstanceId) {
      return getNextWindowInstanceId(normalized);
    }
    const explicitMatch = explicitInstanceId.match(
      /^project-chat-window-(\d+)$/,
    );
    const explicitNextInstanceNumber = explicitMatch
      ? Number.parseInt(explicitMatch[1], 10) + 1
      : normalized.nextInstanceNumber;
    return {
      instanceId: explicitInstanceId,
      nextInstanceNumber: Math.max(
        normalized.nextInstanceNumber,
        explicitNextInstanceNumber,
      ),
    };
  })();
  const nextZIndex = getHighestWindowZIndex(normalized) + 1;
  const resolvedBounds =
    bounds ??
    (placement === ChatWindowPlacementEnum.floating
      ? resolveDefaultFloatingChatBoundsFromRuntime()
      : null);
  const normalizedTitle = title?.trim() ? title.trim() : null;
  const nextInstance = normalizeWorkspaceProjectChatWindowInstance(
    createProjectChatWindowInstanceModel({
      instanceId,
      placement,
      mode,
      sectionIdOrNull,
      title: normalizedTitle,
      chatId,
      isClosed: false,
      isMinimized: false,
      isMaximized: placement === ChatWindowPlacementEnum.maximized,
      lastFocusedAt: nowMs,
      zIndex: nextZIndex,
      ...(resolvedBounds ? { bounds: resolvedBounds } : {}),
    }),
  );
  return {
    instanceId,
    state: {
      ...normalized,
      instancesById: {
        ...normalized.instancesById,
        [instanceId]: nextInstance,
      },
      order: [...normalized.order, instanceId],
      nextInstanceNumber,
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

function setProjectChatWindowModeInState(
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
  let changed = false;
  const hasDockContainerWidth =
    typeof dockContainerWidthPx === "number" && dockContainerWidthPx > 0;
  for (const [instanceId, widthFraction] of Object.entries(
    widthFractionsByInstanceId,
  )) {
    const current = state.instancesById[instanceId];
    if (!current) {
      continue;
    }
    if (!Number.isFinite(widthFraction) || widthFraction <= 0) {
      continue;
    }
    const nextPreferredWidthPx = hasDockContainerWidth
      ? widthFraction * dockContainerWidthPx
      : current.dockMetrics.preferredWidthPx;
    if (
      current.dockMetrics.widthFraction === widthFraction &&
      current.dockMetrics.preferredWidthPx === nextPreferredWidthPx
    ) {
      continue;
    }
    if (!nextInstancesById) {
      nextInstancesById = { ...state.instancesById };
    }
    nextInstancesById[instanceId] = {
      ...current,
      dockMetrics: {
        ...current.dockMetrics,
        widthFraction,
        preferredWidthPx: nextPreferredWidthPx,
      },
    };
    changed = true;
  }

  if (!changed || !nextInstancesById) {
    return state;
  }
  return {
    ...state,
    instancesById: nextInstancesById,
  };
}

export function setProjectChatWindowBoundsInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  bounds: SetBoundsOptions,
): ProjectChatWindowingState {
  return withUpdatedWindow(state, instanceId, (current) => {
    let changed = false;
    const nextBounds: ChatWindowBounds = { ...current.bounds };

    if (
      typeof bounds.x === "number" &&
      Number.isFinite(bounds.x) &&
      nextBounds.x !== bounds.x
    ) {
      nextBounds.x = bounds.x;
      changed = true;
    }
    if (
      typeof bounds.y === "number" &&
      Number.isFinite(bounds.y) &&
      nextBounds.y !== bounds.y
    ) {
      nextBounds.y = bounds.y;
      changed = true;
    }
    if (
      typeof bounds.width === "number" &&
      Number.isFinite(bounds.width) &&
      bounds.width > 0 &&
      nextBounds.width !== bounds.width
    ) {
      nextBounds.width = bounds.width;
      changed = true;
    }
    if (
      typeof bounds.height === "number" &&
      Number.isFinite(bounds.height) &&
      bounds.height > 0 &&
      nextBounds.height !== bounds.height
    ) {
      nextBounds.height = bounds.height;
      changed = true;
    }

    if (!changed) {
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
    const shouldSeedFloatingBounds =
      placement === ChatWindowPlacementEnum.floating &&
      (boundInstance.placement !== ChatWindowPlacementEnum.floating ||
        !Number.isFinite(current.bounds.width) ||
        current.bounds.width <= 0 ||
        !Number.isFinite(current.bounds.height) ||
        current.bounds.height <= 0);
    const resolvedBounds = shouldSeedFloatingBounds
      ? resolveDefaultFloatingChatBoundsFromRuntime()
      : current.bounds;
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
