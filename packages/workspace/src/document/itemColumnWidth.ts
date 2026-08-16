import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors";
import { useWorkspaceDocument } from "./stores";

// The canonical commit behind the package-owned item-column divider. Frozen main stores the
// corresponding width on its parameter-carrying section and sends one route when a drag/reset
// commits; the package stores the item-termed equivalent on the section's item tree and notifies
// its host once through the normal controlled-document seam.
export function setItemColumnWidth(
  sectionId: string,
  itemColumnWidth: number,
): void {
  if (!Number.isFinite(itemColumnWidth)) {
    throw new Error(`Section ${sectionId} item column width must be finite.`);
  }

  const documentState = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  useWorkspaceDocument.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: {
        ...section,
        itemTree: { ...itemTree, itemColumnWidth },
      },
    },
  });
  notifyWorkspaceDocumentChange();
}
