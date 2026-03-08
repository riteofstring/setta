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

function clearPendingActiveSectionBackendSyncOp(opId: string) {
  const state = useActiveSectionUI.getState();
  const pending = state.pendingBackendSyncOpIds;
  if (!pending.includes(opId)) {
    return;
  }
  const nextPendingBackendSyncGenerationByOpId = {
    ...state.pendingBackendSyncGenerationByOpId,
  };
  delete nextPendingBackendSyncGenerationByOpId[opId];
  useActiveSectionUI.setState({
    pendingBackendSyncOpIds: pending.filter(
      (pendingOpId) => pendingOpId !== opId,
    ),
    pendingBackendSyncGenerationByOpId: nextPendingBackendSyncGenerationByOpId,
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
  const currentGenerationStillPending = nextPendingBackendSyncOpIds.some(
    (pendingOpId) =>
      nextPendingBackendSyncGenerationByOpId[pendingOpId] ===
      state.selectionGeneration,
  );
  const scheduledCurrentGeneration =
    state.scheduledBackendSync !== null &&
    state.scheduledBackendSync.generation === state.selectionGeneration;
  const enableBackendHydration =
    failedGeneration === state.selectionGeneration &&
    !currentGenerationStillPending &&
    !scheduledCurrentGeneration;

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

export function getReconciledActiveSectionUIStateFromBackend(
  backendActiveIds: Array<string>,
  completedOpIds: Array<string>,
  projectConfigId: string,
) {
  const state = useActiveSectionUI.getState();
  const completedOpIdSet = new Set(completedOpIds);
  const nextPendingBackendSyncOpIds: Array<string> = [];
  const nextPendingBackendSyncGenerationByOpId: Record<string, number> = {};
  let completedCurrentGeneration = false;
  for (const pendingOpId of state.pendingBackendSyncOpIds) {
    const generation = state.pendingBackendSyncGenerationByOpId[pendingOpId];
    if (completedOpIdSet.has(pendingOpId)) {
      if (generation === state.selectionGeneration) {
        completedCurrentGeneration = true;
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
  const hasScheduledBackendSync =
    state.scheduledBackendSync !== null &&
    state.scheduledBackendSync.projectConfigId === projectConfigId;
  const backendHydrationEnabled =
    state.backendHydrationEnabled || completedCurrentGeneration;
  const nextBackendGeneration = completedCurrentGeneration
    ? state.selectionGeneration
    : state.backendGeneration;
  const canHydrateFromBackend =
    !hasScheduledBackendSync && backendHydrationEnabled;

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
  if (
    canHydrateFromBackend &&
    !areStringArraysEqual(state.activeIds, backendActiveIds)
  ) {
    const nextGeneration = state.selectionGeneration + 1;
    nextState.activeIds = [...backendActiveIds];
    nextState.selectionGeneration = nextGeneration;
    nextState.backendGeneration = nextGeneration;
    nextState.backendHydrationEnabled = true;
  }
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
