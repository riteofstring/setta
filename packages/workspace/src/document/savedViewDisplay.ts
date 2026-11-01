import {
  getSectionChildren,
  getTopLevelSectionIdsForDisplay,
} from "./documentSelectors.js";
import { isWorkspaceSavedViewSectionVisible } from "../saved-views/state.js";
import type { WorkspaceDocumentState } from "./stores.js";

export function isWorkspaceSectionVisible(
  state: WorkspaceDocumentState,
  sectionId: string,
): boolean {
  return isWorkspaceSavedViewSectionVisible(
    state.savedViews,
    state.parentSectionMap,
    sectionId,
  );
}

export function getVisibleTopLevelSectionIdsForDisplay(
  state: WorkspaceDocumentState,
): Array<string> {
  return getTopLevelSectionIdsForDisplay(state).filter((sectionId) =>
    isWorkspaceSectionVisible(state, sectionId),
  );
}

export function getVisibleSectionChildrenForDisplay(
  state: WorkspaceDocumentState,
  sectionId: string,
): Array<string> {
  return getSectionChildren(state, sectionId).filter((childId) =>
    isWorkspaceSectionVisible(state, childId),
  );
}
