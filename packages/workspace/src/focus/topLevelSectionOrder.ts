import { getTopLevelSectionIdsForDisplay } from "../document/documentSelectors.js";
import { getVisibleTopLevelSectionIdsForDisplay } from "../document/savedViewDisplay.js";
import { getWorkspaceDocumentStore } from "../document/stores.js";
import { isWorkspaceSavedViewEditing } from "../saved-views/editingState.js";
import type { WorkspaceHost } from "../workspaceHost.js";

export function getOrderedTopLevelSectionIds(
  host: WorkspaceHost,
): Array<string> {
  const state = getWorkspaceDocumentStore(host).getState();
  const sectionIds =
    state.savedViews !== null && isWorkspaceSavedViewEditing(host)
      ? getTopLevelSectionIdsForDisplay(state)
      : getVisibleTopLevelSectionIdsForDisplay(state);
  return sectionIds
    .map((sectionId) => {
      const layout = state.topLevelSections[sectionId];
      if (!layout) {
        throw new Error(
          `Top-level workspace section ${sectionId} has no layout.`,
        );
      }
      return { sectionId, layout };
    })
    .sort((a, b) => {
      if (a.layout.y !== b.layout.y) {
        return a.layout.y - b.layout.y;
      }
      if (a.layout.x !== b.layout.x) {
        return a.layout.x - b.layout.x;
      }
      if (a.layout.zIndex !== b.layout.zIndex) {
        return a.layout.zIndex - b.layout.zIndex;
      }
      return a.sectionId.localeCompare(b.sectionId);
    })
    .map((entry) => entry.sectionId);
}
