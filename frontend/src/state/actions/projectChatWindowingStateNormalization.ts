import type { ProjectChatWindowingState } from "utils/generatedTypes";

type NormalizeResult = {
  state: ProjectChatWindowingState;
  changed: boolean;
};

export function normalizeProjectChatWindowingOrder(
  state: ProjectChatWindowingState,
): NormalizeResult {
  const seen = new Set<string>();
  const nextOrder: string[] = [];
  for (const instanceId of state.order) {
    if (!state.instancesById[instanceId]) {
      continue;
    }
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    nextOrder.push(instanceId);
  }
  for (const instanceId of Object.keys(state.instancesById)) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    nextOrder.push(instanceId);
  }
  const changed =
    nextOrder.length !== state.order.length ||
    nextOrder.some((id, index) => id !== state.order[index]);
  if (!changed) {
    return { state, changed: false };
  }
  return {
    state: {
      ...state,
      order: nextOrder,
    },
    changed: true,
  };
}

function normalizeProjectChatWindowingLayering(
  state: ProjectChatWindowingState,
): NormalizeResult {
  const seenZIndexes = new Set<number>();
  let hasDuplicateZIndex = false;
  for (const instance of Object.values(state.instancesById)) {
    if (seenZIndexes.has(instance.zIndex)) {
      hasDuplicateZIndex = true;
      break;
    }
    seenZIndexes.add(instance.zIndex);
  }
  if (!hasDuplicateZIndex) {
    return { state, changed: false };
  }

  const orderIndexById = new Map(
    state.order.map((instanceId, index) => [instanceId, index] as const),
  );
  const orderedInstances = Object.values(state.instancesById).sort(
    (left, right) => {
      if (left.zIndex !== right.zIndex) {
        return left.zIndex - right.zIndex;
      }
      if (left.lastFocusedAt !== right.lastFocusedAt) {
        return left.lastFocusedAt - right.lastFocusedAt;
      }
      const leftOrderIndex = orderIndexById.get(left.instanceId) ?? 0;
      const rightOrderIndex = orderIndexById.get(right.instanceId) ?? 0;
      if (leftOrderIndex !== rightOrderIndex) {
        return leftOrderIndex - rightOrderIndex;
      }
      return left.instanceId.localeCompare(right.instanceId);
    },
  );
  let changed = false;
  const nextInstancesById = { ...state.instancesById };
  orderedInstances.forEach((instance, index) => {
    const nextZIndex = index + 1;
    if (instance.zIndex === nextZIndex) {
      return;
    }
    changed = true;
    nextInstancesById[instance.instanceId] = {
      ...instance,
      zIndex: nextZIndex,
    };
  });
  if (!changed) {
    return { state, changed: false };
  }
  return {
    state: {
      ...state,
      instancesById: nextInstancesById,
    },
    changed: true,
  };
}

export function normalizeProjectChatWindowingState(
  state: ProjectChatWindowingState,
): ProjectChatWindowingState {
  const ordered = normalizeProjectChatWindowingOrder(state).state;
  return normalizeProjectChatWindowingLayering(ordered).state;
}
