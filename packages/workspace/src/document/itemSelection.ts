import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors";
import { getItemOrThrow } from "./itemTree";
import { useWorkspaceDocument } from "./stores";
import type { WorkspaceSection } from "./types";

// The reference's param selection primitives (`toggleParamSelected`/`unselectAllParams` in
// `state/actions/sectionInfos.ts`, `selectOnlyParam` in `moveParams.ts`) minus the app-only
// branches: the optimistic-op plumbing and per-toggle backend routes stay application-side —
// the document-change callback notifies the host instead. Selection lives on the canonical
// item tree, so a toggle is a canonical commit followed by the same active-section policy
// decision the reference applies.

export function toggleItemSelected(sectionId: string, itemId: string) {
  const documentState = useWorkspaceDocument.getState();
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
  useWorkspaceDocument.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: { ...section, itemTree: { ...itemTree, selectedItemIds } },
    },
  });
  notifyWorkspaceDocumentChange();
  applyActiveSectionChange({
    interaction: wasSelected ? "item-unselect" : "item-select",
    sectionId,
  });
}

// Replaces one section's item selection in a single canonical commit. `toggleItemSelected`
// builds the same commit one row at a time; an operation that selects a whole set of rows at
// once notifies the host once instead of once per row.
export function setSelectedItems(sectionId: string, itemIds: Array<string>) {
  const documentState = useWorkspaceDocument.getState();
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
  useWorkspaceDocument.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: {
        ...section,
        itemTree: { ...itemTree, selectedItemIds: itemIds },
      },
    },
  });
  notifyWorkspaceDocumentChange();
  applyActiveSectionChange({ interaction: "item-select", sectionId });
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

// Clears item selection across every section in one canonical commit; answers whether anything
// was selected so callers (the reference's escape handling) can consume the keypress.
export function unselectAllItems(): boolean {
  const documentState = useWorkspaceDocument.getState();
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
  useWorkspaceDocument.setState({ sections });
  notifyWorkspaceDocumentChange();
  return true;
}

export function selectOnlyItem(sectionId: string, itemId: string) {
  const itemTree = getSectionItemTreeOrThrow(
    useWorkspaceDocument.getState(),
    sectionId,
  );
  if (
    itemTree.selectedItemIds.length === 1 &&
    itemTree.selectedItemIds[0] === itemId
  ) {
    return;
  }
  unselectAllItems();
  toggleItemSelected(sectionId, itemId);
}
