import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors";
import { getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceHost } from "../workspaceHost";

// The canonical commit behind the package-owned item-column divider. Frozen main stores the
// corresponding width on its parameter-carrying section and sends one route when a drag/reset
// commits; the package stores the item-termed equivalent on the section's item tree and notifies
// its host once through the normal controlled-document seam.
export function setItemColumnWidth(
  host: WorkspaceHost,
  sectionId: string,
  itemColumnWidth: number,
): void {
  if (!Number.isFinite(itemColumnWidth)) {
    throw new Error(`Section ${sectionId} item column width must be finite.`);
  }

  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  documentStore.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: {
        ...section,
        itemTree: { ...itemTree, itemColumnWidth },
      },
    },
  });
  notifyWorkspaceDocumentChange(host);
}
