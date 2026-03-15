import { type ZustandProjectState } from "state/definitions";
import { type ProjectStateSingleConfig } from "utils/generatedTypes";
import { getCurrEffectiveSectionImpl } from "./sectionEffectiveImplSelectors";

export function getSectionShouldRender(
  visibility: boolean,
  isEditingViewMode: boolean,
): boolean {
  return isEditingViewMode || visibility;
}

export function getActiveViewModeConfig(state: ProjectStateSingleConfig) {
  const { activeViewModeId, viewModes } = state.projectConfig;
  if (!activeViewModeId) {
    throw new Error("Active view mode is not set");
  }
  const viewMode = viewModes[activeViewModeId];
  if (!viewMode) {
    throw new Error(`Active view mode ${activeViewModeId} not found`);
  }
  return viewMode;
}

function getSectionVisibilityForActiveViewMode(
  sectionId: string,
  state: ZustandProjectState,
): {
  visibility: boolean;
  viewMode: ReturnType<typeof getActiveViewModeConfig>;
} {
  const viewMode = getActiveViewModeConfig(state);
  const visibility = viewMode.visibilityBySectionId[sectionId];
  if (visibility === undefined) {
    throw new Error(
      `Missing visibility for section ${sectionId} in view mode ${viewMode.id}`,
    );
  }
  return {
    visibility,
    viewMode,
  };
}

export function getSectionViewModeVisibilityIfPresent(
  sectionId: string,
  state: ZustandProjectState,
): { visibility: boolean; isEditingViewMode: boolean } | null {
  const { isEditingViewMode } = state.projectConfig;
  const viewMode = getActiveViewModeConfig(state);
  const visibility = viewMode.visibilityBySectionId[sectionId];
  if (visibility === undefined) {
    return null;
  }
  return {
    visibility,
    isEditingViewMode,
  };
}

export function getSectionViewModeVisibility(
  sectionId: string,
  state: ZustandProjectState,
): { visibility: boolean; isEditingViewMode: boolean } {
  const { isEditingViewMode } = state.projectConfig;
  const { visibility } = getSectionVisibilityForActiveViewMode(
    sectionId,
    state,
  );
  return {
    visibility,
    isEditingViewMode,
  };
}

export function getAncestorSameVisibility(
  sectionId: string,
  state: ZustandProjectState,
): boolean {
  const { visibilityBySectionId, id: viewModeId } =
    getActiveViewModeConfig(state);
  let impl = getCurrEffectiveSectionImpl(state, sectionId);
  let { parentId } = impl;
  const targetVisibility = visibilityBySectionId[sectionId];
  if (targetVisibility === undefined) {
    throw new Error(
      `Missing visibility for section ${sectionId} in view mode ${viewModeId}`,
    );
  }

  while (parentId) {
    impl = getCurrEffectiveSectionImpl(state, parentId);
    const parentVisibility = visibilityBySectionId[parentId];
    if (parentVisibility === undefined) {
      throw new Error(
        `Missing visibility for section ${parentId} in view mode ${viewModeId}`,
      );
    }
    if (parentVisibility === targetVisibility) {
      return true;
    }

    ({ parentId } = impl);
  }

  return false;
}
