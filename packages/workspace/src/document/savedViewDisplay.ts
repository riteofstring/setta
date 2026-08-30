import {
  getSectionChildren,
  getTopLevelSectionIdsForDisplay,
} from "./documentSelectors";
import { isWorkspaceSavedViewSectionVisible } from "../saved-views/state";
import type { WorkspaceDocumentState } from "./stores";

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
