import { getVisibleTopLevelSectionIdsForDisplay } from "../document/savedViewDisplay";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { WorkspaceHost } from "../workspaceHost";

export function getOrderedTopLevelSectionIds(
  host: WorkspaceHost,
): Array<string> {
  const state = getWorkspaceDocumentStore(host).getState();
  return getVisibleTopLevelSectionIdsForDisplay(state)
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
