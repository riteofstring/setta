import {
  ChatWindowModeEnum,
  type ProjectChatWindowInstance,
  type ProjectChatWindowingState,
} from "utils/generatedTypes";

export function normalizeProjectChatWindowInstanceForState(
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

  const next = normalizeProjectChatWindowInstanceForState(updater(current));
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
