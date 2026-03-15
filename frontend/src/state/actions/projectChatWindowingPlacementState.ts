import {
  ChatWindowPlacementEnum,
  type ChatWindowPlacement,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import {
  getHighestProjectChatWindowZIndex,
  withUpdatedProjectChatWindowInState,
} from "./projectChatWindowingInstanceUpdates";
import { normalizeProjectChatWindowingState } from "./projectChatWindowingStateNormalization";

export function setProjectChatWindowPlacementInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  placement: ChatWindowPlacement,
): ProjectChatWindowingState {
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
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

export function maximizeProjectChatWindowInState(
  state: ProjectChatWindowingState,
  instanceId: string,
): ProjectChatWindowingState {
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
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
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
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
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
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
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
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
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
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
  const highestZIndex = getHighestProjectChatWindowZIndex(normalized);
  const highestZIndexCount = Object.values(normalized.instancesById).filter(
    (instance) => instance.zIndex === highestZIndex,
  ).length;
  return withUpdatedProjectChatWindowInState(
    normalized,
    instanceId,
    (current: ProjectChatWindowInstance) => {
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
    },
  );
}
