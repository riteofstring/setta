import { getTopLevelSectionIdsForDisplay } from "../document/documentSelectors";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { WorkspaceHost } from "../workspaceHost";

// The reference's `getOrderedTopLevelSectionIds` (`utils/focusManager.ts`): keyboard reading
// order across the canvas is the saved layout itself — top to bottom, then left to right, with
// the stacking order and finally the id deciding sections that share a position, so the order is
// total and never depends on object key order.
export function getOrderedTopLevelSectionIds(host: WorkspaceHost): Array<string> {
  const state = getWorkspaceDocumentStore(host).getState();
  return getTopLevelSectionIdsForDisplay(state)
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
