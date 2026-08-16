import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors";
import { getItemOrThrow } from "./itemTree";
import { useWorkspaceDocument } from "./stores";
import type { WorkspaceSectionData } from "./types";

// The custom-row persistence seam. Typed built-in rows use their dedicated label/value/kind/config
// funnels; this replacement remains only for a host-rendered item's opaque JSON payload.
export function setItemData(
  sectionId: string,
  itemId: string,
  data: WorkspaceSectionData,
): void {
  const documentState = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  const item = getItemOrThrow(itemTree, itemId);
  if (itemId === itemTree.rootId) {
    throw new Error(
      `Section ${sectionId} item ${itemId} is the structural root and has no data.`,
    );
  }
  if (item.presentation !== undefined) {
    throw new Error(
      `Section ${sectionId} item ${itemId} has a built-in presentation; use its typed mutation funnels.`,
    );
  }
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
