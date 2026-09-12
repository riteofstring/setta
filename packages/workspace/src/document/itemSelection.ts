import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors";
import { getItemOrThrow } from "./itemTree";
import { getWorkspaceDocumentStore } from "./stores";
import type { WorkspaceSection } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

export function toggleItemSelected(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
) {
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  getItemOrThrow(itemTree, itemId);
  if (itemId === itemTree.rootId) {
    throw new Error(
      `Cannot select the root item ${itemId} of section ${sectionId}.`,
    );
  }
  const wasSelected = itemTree.selectedItemIds.includes(itemId);
  const selectedItemIds = wasSelected
    ? itemTree.selectedItemIds.filter((id) => id !== itemId)
    : [...itemTree.selectedItemIds, itemId];
  documentStore.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: { ...section, itemTree: { ...itemTree, selectedItemIds } },
    },
  });
  notifyWorkspaceDocumentChange(host, null);
  applyActiveSectionChange(host, {
    interaction: wasSelected ? "item-unselect" : "item-select",
    sectionId,
  });
}

export function setSelectedItems(
  host: WorkspaceHost,
  sectionId: string,
  itemIds: Array<string>,
) {
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  for (const itemId of itemIds) {
    getItemOrThrow(itemTree, itemId);
    if (itemId === itemTree.rootId) {
      throw new Error(
        `Cannot select the root item ${itemId} of section ${sectionId}.`,
      );
    }
  }
  if (areItemIdListsEqual(itemTree.selectedItemIds, itemIds)) {
    return;
  }
  documentStore.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: {
        ...section,
        itemTree: { ...itemTree, selectedItemIds: itemIds },
      },
    },
  });
  notifyWorkspaceDocumentChange(host, null);
  applyActiveSectionChange(host, { interaction: "item-select", sectionId });
}

function areItemIdListsEqual(
  current: ReadonlyArray<string>,
  next: ReadonlyArray<string>,
): boolean {
  return (
    current.length === next.length &&
    current.every((itemId, index) => itemId === next[index])
  );
}

export function unselectAllItems(host: WorkspaceHost): boolean {
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const sections: Record<string, WorkspaceSection> = {
    ...documentState.sections,
  };
  let changed = false;
  for (const [sectionId, section] of Object.entries(documentState.sections)) {
    if (!section.itemTree || section.itemTree.selectedItemIds.length === 0) {
      continue;
    }
    sections[sectionId] = {
      ...section,
      itemTree: { ...section.itemTree, selectedItemIds: [] },
    };
    changed = true;
  }
  if (!changed) {
    return false;
  }
  documentStore.setState({ sections });
  notifyWorkspaceDocumentChange(host, null);
  return true;
}

export function selectOnlyItem(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
) {
  const itemTree = getSectionItemTreeOrThrow(
    getWorkspaceDocumentStore(host).getState(),
    sectionId,
  );
  if (
    itemTree.selectedItemIds.length === 1 &&
    itemTree.selectedItemIds[0] === itemId
  ) {
    return;
  }
  unselectAllItems(host);
  toggleItemSelected(host, sectionId, itemId);
}
