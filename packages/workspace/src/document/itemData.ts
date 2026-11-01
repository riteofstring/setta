import { notifyWorkspaceDocumentChange } from "./documentChangeCallback.js";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors.js";
import { getItemOrThrow } from "./itemTree.js";
import { getWorkspaceDocumentStore } from "./stores.js";
import type { WorkspaceSectionData } from "./types.js";
import type { WorkspaceHost } from "../workspaceHost.js";

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
  notifyWorkspaceDocumentChange(host, null);
}
