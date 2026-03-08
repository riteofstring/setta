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

export function getActiveSectionUIIds() {
  return useActiveSectionUI.getState().activeIds;
}

export function setActiveSectionUIIds(nextActiveIds: Array<string>) {
  const current = useActiveSectionUI.getState().activeIds;
  if (areStringArraysEqual(current, nextActiveIds)) {
    return;
  }
  useActiveSectionUI.setState({ activeIds: [...nextActiveIds] });
}

export function hydrateActiveSectionUIIds(nextActiveIds: Array<string>) {
  const state = useActiveSectionUI.getState();
  if (
    areStringArraysEqual(state.activeIds, nextActiveIds) &&
    state.pendingBackendSyncOpIds.length === 0 &&
    state.scheduledBackendSync === null
  ) {
    return;
  }
  useActiveSectionUI.setState({
    activeIds: [...nextActiveIds],
    pendingBackendSyncOpIds: [],
    scheduledBackendSync: null,
  });
}

export function markPendingActiveSectionBackendSyncOp(opId: string) {
  const pending = useActiveSectionUI.getState().pendingBackendSyncOpIds;
  if (pending.includes(opId)) {
    return;
  }
  useActiveSectionUI.setState({
    pendingBackendSyncOpIds: [...pending, opId],
  });
}

export function clearPendingActiveSectionBackendSyncOp(opId: string) {
  const pending = useActiveSectionUI.getState().pendingBackendSyncOpIds;
  if (!pending.includes(opId)) {
    return;
  }
  useActiveSectionUI.setState({
    pendingBackendSyncOpIds: pending.filter(
      (pendingOpId) => pendingOpId !== opId,
    ),
  });
}

export function schedulePendingActiveSectionBackendSync(
  projectConfigId: string,
  activeIds: Array<string>,
) {
  const scheduled = useActiveSectionUI.getState().scheduledBackendSync;
  if (
    scheduled !== null &&
    scheduled.projectConfigId === projectConfigId &&
    areStringArraysEqual(scheduled.activeIds, activeIds)
  ) {
    return;
  }
  useActiveSectionUI.setState({
    scheduledBackendSync: {
      projectConfigId,
      activeIds: [...activeIds],
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

export function reconcileActiveSectionUIIdsFromBackend(
  backendActiveIds: Array<string>,
  completedOpIds: Array<string>,
  projectConfigId: string,
) {
  const state = useActiveSectionUI.getState();
  const completedOpIdSet = new Set(completedOpIds);
  const nextPendingBackendSyncOpIds = state.pendingBackendSyncOpIds.filter(
    (pendingOpId) => !completedOpIdSet.has(pendingOpId),
  );
  const pendingChanged =
    nextPendingBackendSyncOpIds.length !== state.pendingBackendSyncOpIds.length;
  const hasScheduledBackendSync =
    state.scheduledBackendSync !== null &&
    state.scheduledBackendSync.projectConfigId === projectConfigId;
  const shouldHydrateFromBackend =
    nextPendingBackendSyncOpIds.length === 0 &&
    !hasScheduledBackendSync &&
    !areStringArraysEqual(state.activeIds, backendActiveIds);

  if (!pendingChanged && !shouldHydrateFromBackend) {
    return;
  }

  const nextState: {
    activeIds?: Array<string>;
    pendingBackendSyncOpIds?: Array<string>;
  } = {};

  if (pendingChanged) {
    nextState.pendingBackendSyncOpIds = nextPendingBackendSyncOpIds;
  }
  if (shouldHydrateFromBackend) {
    nextState.activeIds = [...backendActiveIds];
  }

  useActiveSectionUI.setState(nextState);
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
