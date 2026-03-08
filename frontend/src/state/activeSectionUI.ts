import { useProjectState, useActiveSectionUI } from "./definitions";

let activeSectionUIProjectSubscriptionInitialized = false;

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

export function ensureActiveSectionUISubscribedToProjectState() {
  if (activeSectionUIProjectSubscriptionInitialized) {
    return;
  }
  activeSectionUIProjectSubscriptionInitialized = true;
  useProjectState.subscribe(
    (state) => state.projectConfig.activeIds,
    (activeIds) => {
      const current = useActiveSectionUI.getState().activeIds;
      if (areStringArraysEqual(current, activeIds)) {
        return;
      }
      useActiveSectionUI.setState({ activeIds: [...activeIds] });
    },
    {
      equalityFn: areStringArraysEqual,
      fireImmediately: true,
    },
  );
}

export function getActiveSectionUIIds() {
  ensureActiveSectionUISubscribedToProjectState();
  return useActiveSectionUI.getState().activeIds;
}

export function setActiveSectionUIIds(nextActiveIds: Array<string>) {
  ensureActiveSectionUISubscribedToProjectState();
  const current = useActiveSectionUI.getState().activeIds;
  if (areStringArraysEqual(current, nextActiveIds)) {
    return;
  }
  useActiveSectionUI.setState({ activeIds: [...nextActiveIds] });
}

export function useIsSectionUIActive(sectionId: string) {
  ensureActiveSectionUISubscribedToProjectState();
  return useActiveSectionUI((state) => state.activeIds.includes(sectionId));
}

export function useIsAnySectionUIActive(sectionIds: Array<string>) {
  ensureActiveSectionUISubscribedToProjectState();
  return useActiveSectionUI((state) =>
    sectionIds.some((sectionId) => state.activeIds.includes(sectionId)),
  );
}

export function useIsSolelySectionUIActive(sectionId: string) {
  ensureActiveSectionUISubscribedToProjectState();
  return useActiveSectionUI(
    (state) =>
      state.activeIds.length === 1 && state.activeIds[0] === sectionId,
  );
}

export function useSolelyActiveSectionUIId() {
  ensureActiveSectionUISubscribedToProjectState();
  return useActiveSectionUI((state) =>
    state.activeIds.length === 1 ? state.activeIds[0] ?? null : null,
  );
}
