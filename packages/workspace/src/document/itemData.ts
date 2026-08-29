import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors";
import { getItemOrThrow } from "./itemTree";
import { getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceSectionData } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

// The custom-row persistence seam. Typed built-in rows use their dedicated label/value/kind/config
// funnels; this replacement remains only for a host-rendered item's opaque JSON payload.
export function setItemData(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
  data: WorkspaceSectionData,
): void {
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
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
  documentStore.setState({
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
  notifyWorkspaceDocumentChange(host);
}
