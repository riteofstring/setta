import { useActiveSectionUI } from "./storeDefinitions";

type ProjectStateWithActiveIds = {
  projectConfig: {
    activeIds: Array<string>;
  };
};

export function areActiveSectionIdArraysEqual(
  left: Array<string>,
  right: Array<string>,
) {
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
  if (areActiveSectionIdArraysEqual(current, nextActiveIds)) {
    return;
  }
  useActiveSectionUI.setState({
    activeIds: [...nextActiveIds],
    backendHydrationEnabled: false,
    selectionGeneration: getNextSelectionGeneration(),
  });
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
