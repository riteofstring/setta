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
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import { resolveDefaultFloatingChatBounds } from "./projectChatWindowingDefaultBounds";
import {
  getHighestProjectChatWindowZIndex,
  normalizeProjectChatWindowInstanceForState,
} from "./projectChatWindowingInstanceUpdates";
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
  const nextInstance = normalizeProjectChatWindowInstanceForState(
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
