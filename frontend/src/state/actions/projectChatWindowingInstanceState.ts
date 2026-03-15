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
import { resolveDefaultFloatingChatBounds } from "./projectChatWindowingDefaultBounds";
import { normalizeProjectChatWindowingState } from "./projectChatWindowingStateNormalization";

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

export function resolveDefaultFloatingChatBoundsFromRuntime(): ChatWindowBounds {
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

export function getHighestProjectChatWindowZIndex(
  state: ProjectChatWindowingState,
): number {
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

export function withUpdatedProjectChatWindowInState(
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
  const nextZIndex = getHighestProjectChatWindowZIndex(normalized) + 1;
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
