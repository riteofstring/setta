import {
  type ChatWindowBounds,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";
import { withUpdatedProjectChatWindowInState } from "./projectChatWindowingInstanceState";

export type SetDockFractionsOptions = {
  widthFractionsByInstanceId: Record<string, number>;
  dockContainerWidthPx?: number | null;
};

export type SetBoundsOptions = Partial<ChatWindowBounds>;
export type SetBoundsByInstanceIdOptions = Record<string, SetBoundsOptions>;

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
  return withUpdatedProjectChatWindowInState(state, instanceId, (current) => {
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
