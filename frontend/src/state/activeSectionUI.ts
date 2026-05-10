import { useActiveSectionUI } from "./definitions";

type ProjectStateWithActiveIds = {
  projectConfig: {
    activeIds: Array<string>;
  };
};

function areStringArraysEqual(left: Array<string>, right: Array<string>) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export { useActiveSectionUI } from "./definitions";

type ActiveSectionUIStatePatch = Partial<
  ReturnType<typeof useActiveSectionUI.getState>
>;

type ActiveSectionUIState = ReturnType<typeof useActiveSectionUI.getState>;

type ActiveSectionSyncOwnershipState = Pick<
  ActiveSectionUIState,
  | "selectionGeneration"
  | "pendingBackendSyncOpIds"
  | "pendingBackendSyncGenerationByOpId"
  | "scheduledBackendSync"
>;

type PendingBackendSyncReconciliation = {
  nextPendingBackendSyncOpIds: Array<string>;
  nextPendingBackendSyncGenerationByOpId: Record<string, number>;
  pendingChanged: boolean;
  completedCurrentGenerationSync: boolean;
};

type BackendAuthorityReconciliation = {
  currentGenerationStillOwnedLocally: boolean;
  backendHydrationEnabled: boolean;
  nextBackendGeneration: number;
  canHydrateFromBackend: boolean;
};

function getNextSelectionGeneration() {
  return useActiveSectionUI.getState().selectionGeneration + 1;
}

export function getActiveSectionUISelectionGeneration() {
  return useActiveSectionUI.getState().selectionGeneration;
}

export function getActiveSectionUIIds() {
  return useActiveSectionUI.getState().activeIds;
}

export function setActiveSectionUIIds(nextActiveIds: Array<string>) {
  const current = useActiveSectionUI.getState().activeIds;
  if (areStringArraysEqual(current, nextActiveIds)) {
    return;
  }
  useActiveSectionUI.setState({
    activeIds: [...nextActiveIds],
    backendHydrationEnabled: false,
    selectionGeneration: getNextSelectionGeneration(),
  });
}

export function restoreBackendAuthoritativeActiveSectionUIIds(
  nextActiveIds: Array<string>,
) {
  const state = useActiveSectionUI.getState();
  const activeIdsChanged = !areStringArraysEqual(
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
    areStringArraysEqual(state.activeIds, nextActiveIds) &&
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
    areStringArraysEqual(scheduled.activeIds, activeIds)
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

function reconcilePendingBackendSyncOps(
  state: ActiveSectionUIState,
  completedOpIds: Array<string>,
): PendingBackendSyncReconciliation {
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

  return {
    nextPendingBackendSyncOpIds,
    nextPendingBackendSyncGenerationByOpId,
    pendingChanged:
      nextPendingBackendSyncOpIds.length !==
      state.pendingBackendSyncOpIds.length,
    completedCurrentGenerationSync,
  };
}

function reconcileBackendAuthority(
  state: ActiveSectionUIState,
  projectConfigId: string,
  pendingSync: PendingBackendSyncReconciliation,
): BackendAuthorityReconciliation {
  const currentGenerationStillOwnedLocally =
    hasLocalActiveSectionOwnershipForCurrentGeneration(
      {
        selectionGeneration: state.selectionGeneration,
        pendingBackendSyncOpIds: pendingSync.nextPendingBackendSyncOpIds,
        pendingBackendSyncGenerationByOpId:
          pendingSync.nextPendingBackendSyncGenerationByOpId,
        scheduledBackendSync: state.scheduledBackendSync,
      },
      projectConfigId,
    );
  const releasedCurrentGenerationOwnership =
    pendingSync.completedCurrentGenerationSync &&
    !currentGenerationStillOwnedLocally;
  const backendHydrationEnabled =
    state.backendHydrationEnabled || releasedCurrentGenerationOwnership;
  return {
    currentGenerationStillOwnedLocally,
    backendHydrationEnabled,
    nextBackendGeneration: releasedCurrentGenerationOwnership
      ? state.selectionGeneration
      : state.backendGeneration,
    canHydrateFromBackend:
      !currentGenerationStillOwnedLocally && backendHydrationEnabled,
  };
}

function applyPendingAndAuthorityReconciliation(
  nextState: ActiveSectionUIStatePatch,
  state: ActiveSectionUIState,
  pendingSync: PendingBackendSyncReconciliation,
  authority: BackendAuthorityReconciliation,
) {
  if (pendingSync.pendingChanged) {
    nextState.pendingBackendSyncOpIds = pendingSync.nextPendingBackendSyncOpIds;
    nextState.pendingBackendSyncGenerationByOpId =
      pendingSync.nextPendingBackendSyncGenerationByOpId;
  }
  if (authority.nextBackendGeneration !== state.backendGeneration) {
    nextState.backendGeneration = authority.nextBackendGeneration;
  }
  if (authority.backendHydrationEnabled !== state.backendHydrationEnabled) {
    nextState.backendHydrationEnabled = authority.backendHydrationEnabled;
  }
}

function getValidActiveSectionIds(
  activeIds: Array<string>,
  validSectionIds: Array<string>,
) {
  const validSectionIdSet = new Set(validSectionIds);
  return activeIds.filter((sectionId) => validSectionIdSet.has(sectionId));
}

function applyActiveIdReconciliation(
  nextState: ActiveSectionUIStatePatch,
  state: ActiveSectionUIState,
  backendActiveIds: Array<string>,
  validSectionIds: Array<string>,
  authority: BackendAuthorityReconciliation,
) {
  const validActiveIds = getValidActiveSectionIds(
    state.activeIds,
    validSectionIds,
  );

  if (!areStringArraysEqual(state.activeIds, validActiveIds)) {
    // Invalid-id pruning is backend reconciliation within the same local
    // selection ownership, not a newer user selection.
    nextState.activeIds = [...validActiveIds];
  }
  if (!authority.canHydrateFromBackend) {
    return;
  }
  if (!areStringArraysEqual(validActiveIds, backendActiveIds)) {
    const nextSelectionGeneration = state.selectionGeneration + 1;
    nextState.activeIds = [...backendActiveIds];
    nextState.selectionGeneration = nextSelectionGeneration;
    nextState.backendGeneration = nextSelectionGeneration;
    nextState.backendHydrationEnabled = true;
    return;
  }
  if (authority.nextBackendGeneration !== state.selectionGeneration) {
    nextState.backendGeneration = state.selectionGeneration;
  }
}

export function getReconciledActiveSectionUIStateFromBackend(
  backendActiveIds: Array<string>,
  completedOpIds: Array<string>,
  projectConfigId: string,
  validSectionIds: Array<string>,
) {
  const state = useActiveSectionUI.getState();
  const pendingSync = reconcilePendingBackendSyncOps(state, completedOpIds);
  const authority = reconcileBackendAuthority(
    state,
    projectConfigId,
    pendingSync,
  );
  const nextState: ActiveSectionUIStatePatch = {};

  applyPendingAndAuthorityReconciliation(
    nextState,
    state,
    pendingSync,
    authority,
  );
  applyActiveIdReconciliation(
    nextState,
    state,
    backendActiveIds,
    validSectionIds,
    authority,
  );
  if (Object.keys(nextState).length === 0) {
    return null;
  }
  return nextState;
}

export function sanitizeProjectStateActiveIds<
  T extends ProjectStateWithActiveIds,
>(projectState: T): T {
  if (projectState.projectConfig.activeIds.length === 0) {
    return projectState;
  }
  return {
    ...projectState,
    projectConfig: {
      ...projectState.projectConfig,
      activeIds: [],
    },
  };
}

export function useIsSectionUIActive(sectionId: string) {
  return useActiveSectionUI((state) => state.activeIds.includes(sectionId));
}

export function useIsSolelySectionUIActive(sectionId: string) {
  return useActiveSectionUI(
    (state) => state.activeIds.length === 1 && state.activeIds[0] === sectionId,
  );
}

export function useSolelyActiveSectionUIId() {
  return useActiveSectionUI((state) =>
    state.activeIds.length === 1 ? state.activeIds[0] ?? null : null,
  );
}
