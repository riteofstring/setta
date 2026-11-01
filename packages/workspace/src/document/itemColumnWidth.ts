import { notifyWorkspaceDocumentChange } from "./documentChangeCallback.js";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors.js";
import { getWorkspaceDocumentStore } from "./stores.js";
import type { WorkspaceHost } from "../workspaceHost.js";

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
  notifyWorkspaceDocumentChange(host, "item-layout");
}
