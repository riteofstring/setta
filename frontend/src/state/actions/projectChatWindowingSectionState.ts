import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import {
  addProjectChatWindowInstanceInState,
  resolveDefaultFloatingChatBoundsFromRuntime,
} from "./projectChatWindowingInstanceCreation";
import { withUpdatedProjectChatWindowInState } from "./projectChatWindowingInstanceUpdates";
import {
  focusProjectChatWindowInState,
  setProjectChatWindowPlacementInState,
} from "./projectChatWindowingPlacementState";
import { getProjectChatWindowInstanceForSectionInState } from "./projectChatWindowingSelectors";

export type MoveProjectChatWindowToCanvasSectionOptions = {
  sectionId: string;
  nowMs?: number;
  mode?: ChatWindowMode;
};

export type UndockProjectChatWindowFromCanvasSectionOptions = {
  nowMs?: number;
};

function setProjectChatWindowModeInState(
  state: ProjectChatWindowingState,
  instanceId: string,
  mode: ChatWindowMode,
): ProjectChatWindowingState {
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
    if (current.mode === mode) {
      return current;
    }
    return {
      ...current,
      mode,
    };
  });
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
  const withOpenWindow = withUpdatedProjectChatWindowInState(
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
  const withOpenWindow = withUpdatedProjectChatWindowInState(
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
  next = withUpdatedProjectChatWindowInState(
    next,
    boundInstance.instanceId,
    (current) => {
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
    },
  );
  return focusProjectChatWindowInState(next, boundInstance.instanceId, nowMs);
}
