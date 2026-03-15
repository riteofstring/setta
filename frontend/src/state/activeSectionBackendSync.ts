import { areActiveSectionIdArraysEqual } from "./activeSectionSelection";
import { useActiveSectionUI } from "./storeDefinitions";

type ActiveSectionUIStatePatch = Partial<
  ReturnType<typeof useActiveSectionUI.getState>
>;

type ActiveSectionSyncOwnershipState = Pick<
  ReturnType<typeof useActiveSectionUI.getState>,
  | "selectionGeneration"
  | "pendingBackendSyncOpIds"
  | "pendingBackendSyncGenerationByOpId"
  | "scheduledBackendSync"
>;

export function restoreBackendAuthoritativeActiveSectionUIIds(
  nextActiveIds: Array<string>,
) {
  const state = useActiveSectionUI.getState();
  const activeIdsChanged = !areActiveSectionIdArraysEqual(
    state.activeIds,
    nextActiveIds,
  );
  const nextSelectionGeneration = activeIdsChanged
    ? state.selectionGeneration + 1
    : state.selectionGeneration;
  const nextState: ActiveSectionUIStatePatch = {};

  if (activeIdsChanged) {
    nextState.activeIds = [...nextActiveIds];
    nextState.selectionGeneration = nextSelectionGeneration;
  }
  if (state.backendGeneration !== nextSelectionGeneration) {
    nextState.backendGeneration = nextSelectionGeneration;
  }
  if (!state.backendHydrationEnabled) {
    nextState.backendHydrationEnabled = true;
  }
  if (Object.keys(nextState).length === 0) {
    return;
  }
  useActiveSectionUI.setState(nextState);
}

export function getHydratedActiveSectionUIState(nextActiveIds: Array<string>) {
  const state = useActiveSectionUI.getState();
  const generationsAlreadyAuthoritative =
    state.selectionGeneration === state.backendGeneration &&
    state.backendHydrationEnabled;
  if (
    areActiveSectionIdArraysEqual(state.activeIds, nextActiveIds) &&
    generationsAlreadyAuthoritative &&
    state.pendingBackendSyncOpIds.length === 0 &&
    state.scheduledBackendSync === null
  ) {
    return null;
  }
  const nextGeneration = state.selectionGeneration + 1;
  return {
    activeIds: [...nextActiveIds],
    selectionGeneration: nextGeneration,
    backendGeneration: nextGeneration,
    backendHydrationEnabled: true,
    pendingBackendSyncOpIds: [],
    pendingBackendSyncGenerationByOpId: {},
    scheduledBackendSync: null,
  } satisfies ActiveSectionUIStatePatch;
}

export function disableActiveSectionUIBackendHydration() {
  if (!useActiveSectionUI.getState().backendHydrationEnabled) {
    return;
  }
  useActiveSectionUI.setState({ backendHydrationEnabled: false });
}

function hasLocalActiveSectionOwnershipForCurrentGeneration(
  state: ActiveSectionSyncOwnershipState,
  projectConfigId?: string,
) {
  const currentGenerationStillPending = state.pendingBackendSyncOpIds.some(
    (pendingOpId) =>
      state.pendingBackendSyncGenerationByOpId[pendingOpId] ===
      state.selectionGeneration,
  );
  const scheduledCurrentGeneration =
    state.scheduledBackendSync !== null &&
    state.scheduledBackendSync.generation === state.selectionGeneration &&
    (projectConfigId === undefined ||
      state.scheduledBackendSync.projectConfigId === projectConfigId);

  return currentGenerationStillPending || scheduledCurrentGeneration;
}

export function markPendingActiveSectionBackendSyncOp(
  opId: string,
  generation: number,
) {
  const state = useActiveSectionUI.getState();
  const pending = state.pendingBackendSyncOpIds;
  if (pending.includes(opId)) {
    return;
  }
  useActiveSectionUI.setState({
    pendingBackendSyncOpIds: [...pending, opId],
    pendingBackendSyncGenerationByOpId: {
      ...state.pendingBackendSyncGenerationByOpId,
      [opId]: generation,
    },
  });
}

export function failPendingActiveSectionBackendSyncOp(opId: string) {
  const state = useActiveSectionUI.getState();
  const pending = state.pendingBackendSyncOpIds;
  if (!pending.includes(opId)) {
    return;
  }
  const failedGeneration = state.pendingBackendSyncGenerationByOpId[opId];
  const nextPendingBackendSyncOpIds = pending.filter(
    (pendingOpId) => pendingOpId !== opId,
  );
  const nextPendingBackendSyncGenerationByOpId = {
    ...state.pendingBackendSyncGenerationByOpId,
  };
  delete nextPendingBackendSyncGenerationByOpId[opId];
  const enableBackendHydration =
    failedGeneration === state.selectionGeneration &&
    !hasLocalActiveSectionOwnershipForCurrentGeneration({
      selectionGeneration: state.selectionGeneration,
      pendingBackendSyncOpIds: nextPendingBackendSyncOpIds,
      pendingBackendSyncGenerationByOpId:
        nextPendingBackendSyncGenerationByOpId,
      scheduledBackendSync: state.scheduledBackendSync,
    });

  useActiveSectionUI.setState({
    pendingBackendSyncOpIds: nextPendingBackendSyncOpIds,
    pendingBackendSyncGenerationByOpId: nextPendingBackendSyncGenerationByOpId,
    backendHydrationEnabled: enableBackendHydration
      ? true
      : state.backendHydrationEnabled,
  });
}

export function schedulePendingActiveSectionBackendSync(
  projectConfigId: string,
  activeIds: Array<string>,
  generation: number,
) {
  const scheduled = useActiveSectionUI.getState().scheduledBackendSync;
  if (
    scheduled !== null &&
    scheduled.projectConfigId === projectConfigId &&
    scheduled.generation === generation &&
    areActiveSectionIdArraysEqual(scheduled.activeIds, activeIds)
  ) {
    return;
  }
  useActiveSectionUI.setState({
    scheduledBackendSync: {
      projectConfigId,
      activeIds: [...activeIds],
      generation,
    },
  });
}

export function getScheduledActiveSectionBackendSync() {
  const scheduled = useActiveSectionUI.getState().scheduledBackendSync;
  if (scheduled === null) {
    return null;
  }
  return {
    projectConfigId: scheduled.projectConfigId,
    activeIds: [...scheduled.activeIds],
    generation: scheduled.generation,
  };
}

export function clearScheduledActiveSectionBackendSync(
  projectConfigId?: string,
) {
  const scheduled = useActiveSectionUI.getState().scheduledBackendSync;
  if (scheduled === null) {
    return;
  }
  if (
    projectConfigId !== undefined &&
    scheduled.projectConfigId !== projectConfigId
  ) {
    return;
  }
  useActiveSectionUI.setState({ scheduledBackendSync: null });
}

export function getReconciledActiveSectionUIStateFromBackend(
  backendActiveIds: Array<string>,
  completedOpIds: Array<string>,
  projectConfigId: string,
  validSectionIds: Array<string>,
) {
  const state = useActiveSectionUI.getState();
  const validSectionIdSet = new Set(validSectionIds);
  const completedOpIdSet = new Set(completedOpIds);
  const nextPendingBackendSyncOpIds: Array<string> = [];
  const nextPendingBackendSyncGenerationByOpId: Record<string, number> = {};
  let completedCurrentGenerationSync = false;
  for (const pendingOpId of state.pendingBackendSyncOpIds) {
    const generation = state.pendingBackendSyncGenerationByOpId[pendingOpId];
    if (completedOpIdSet.has(pendingOpId)) {
      if (generation === state.selectionGeneration) {
        completedCurrentGenerationSync = true;
      }
      continue;
    }
    nextPendingBackendSyncOpIds.push(pendingOpId);
    if (generation !== undefined) {
      nextPendingBackendSyncGenerationByOpId[pendingOpId] = generation;
    }
  }
  const pendingChanged =
    nextPendingBackendSyncOpIds.length !== state.pendingBackendSyncOpIds.length;
  const currentGenerationStillOwnedLocally =
    hasLocalActiveSectionOwnershipForCurrentGeneration(
      {
        selectionGeneration: state.selectionGeneration,
        pendingBackendSyncOpIds: nextPendingBackendSyncOpIds,
        pendingBackendSyncGenerationByOpId:
          nextPendingBackendSyncGenerationByOpId,
        scheduledBackendSync: state.scheduledBackendSync,
      },
      projectConfigId,
    );
  const releasedCurrentGenerationOwnership =
    completedCurrentGenerationSync && !currentGenerationStillOwnedLocally;
  const backendHydrationEnabled =
    state.backendHydrationEnabled || releasedCurrentGenerationOwnership;
  const nextBackendGeneration = releasedCurrentGenerationOwnership
    ? state.selectionGeneration
    : state.backendGeneration;
  const canHydrateFromBackend =
    !currentGenerationStillOwnedLocally && backendHydrationEnabled;
  let reconciledActiveIds = state.activeIds.filter((sectionId) =>
    validSectionIdSet.has(sectionId),
  );
  let nextSelectionGeneration = state.selectionGeneration;

  const nextState: ActiveSectionUIStatePatch = {};

  if (pendingChanged) {
    nextState.pendingBackendSyncOpIds = nextPendingBackendSyncOpIds;
    nextState.pendingBackendSyncGenerationByOpId =
      nextPendingBackendSyncGenerationByOpId;
  }
  if (nextBackendGeneration !== state.backendGeneration) {
    nextState.backendGeneration = nextBackendGeneration;
  }
  if (backendHydrationEnabled !== state.backendHydrationEnabled) {
    nextState.backendHydrationEnabled = backendHydrationEnabled;
  }

  if (!areActiveSectionIdArraysEqual(state.activeIds, reconciledActiveIds)) {
    // Invalid-id pruning is backend reconciliation within the same local
    // selection ownership, not a newer user selection.
    nextState.activeIds = [...reconciledActiveIds];
  }

  if (
    canHydrateFromBackend &&
    !areActiveSectionIdArraysEqual(reconciledActiveIds, backendActiveIds)
  ) {
    nextSelectionGeneration += 1;
    reconciledActiveIds = [...backendActiveIds];
    nextState.activeIds = [...backendActiveIds];
    nextState.selectionGeneration = nextSelectionGeneration;
    nextState.backendGeneration = nextSelectionGeneration;
    nextState.backendHydrationEnabled = true;
  } else if (
    canHydrateFromBackend &&
    nextBackendGeneration !== nextSelectionGeneration
  ) {
    nextState.backendGeneration = nextSelectionGeneration;
  }

  if (Object.keys(nextState).length === 0) {
    return null;
  }
  return nextState;
}
