import { useActiveSectionUI } from "./definitions";

type ProjectStateWithActiveIds = {
  projectConfig: {
    activeIds: Array<string>;
  };
};

export function areStringArraysEqual(left: Array<string>, right: Array<string>) {
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
    state.pendingBackendSyncOpIds.length === 0
  ) {
    return;
  }
  useActiveSectionUI.setState({
    activeIds: [...nextActiveIds],
    pendingBackendSyncOpIds: [],
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
    pendingBackendSyncOpIds: pending.filter((pendingOpId) => pendingOpId !== opId),
  });
}

export function reconcileActiveSectionUIIdsFromBackend(
  backendActiveIds: Array<string>,
  completedOpIds: Array<string>,
) {
  const state = useActiveSectionUI.getState();
  const completedOpIdSet = new Set(completedOpIds);
  const nextPendingBackendSyncOpIds = state.pendingBackendSyncOpIds.filter(
    (pendingOpId) => !completedOpIdSet.has(pendingOpId),
  );
  const pendingChanged =
    nextPendingBackendSyncOpIds.length !== state.pendingBackendSyncOpIds.length;
  const shouldHydrateFromBackend =
    nextPendingBackendSyncOpIds.length === 0 &&
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

export function sanitizeProjectStateActiveIds<T extends ProjectStateWithActiveIds>(
  projectState: T,
): T {
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

export function useIsAnySectionUIActive(sectionIds: Array<string>) {
  return useActiveSectionUI((state) =>
    sectionIds.some((sectionId) => state.activeIds.includes(sectionId)),
  );
}

export function useIsSolelySectionUIActive(sectionId: string) {
  return useActiveSectionUI(
    (state) =>
      state.activeIds.length === 1 && state.activeIds[0] === sectionId,
  );
}

export function useSolelyActiveSectionUIId() {
  return useActiveSectionUI((state) =>
    state.activeIds.length === 1 ? state.activeIds[0] ?? null : null,
  );
}
