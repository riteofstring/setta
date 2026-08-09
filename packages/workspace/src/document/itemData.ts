import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getSectionItemTreeOrThrow, getSectionOrThrow } from "./documentSelectors";
import { getItemOrThrow } from "./itemTree";
import { useWorkspaceDocument } from "./stores";
import type { WorkspaceSectionData } from "./types";

// The host-persistence seam behind the built-in controls' change callbacks: a control reports
// an edit, the host validates and commits its updated opaque item data through this funnel
// (the reference's param value commit is the app-side equivalent). The payload stays opaque to
// the package — one canonical commit, one host notification, at the control's per-change
// cadence.
export function setItemData(sectionId: string, itemId: string, data: WorkspaceSectionData): void {
  const documentState = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  const item = getItemOrThrow(itemTree, itemId);
  useWorkspaceDocument.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: {
        ...section,
        itemTree: {
          ...itemTree,
          items: { ...itemTree.items, [itemId]: { ...item, data } },
        },
      },
    },
  });
  notifyWorkspaceDocumentChange();
}
