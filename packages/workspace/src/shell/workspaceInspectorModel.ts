import { getSectionOrThrow } from "../document/documentSelectors";
import { getItemOrThrow } from "../document/itemTree";
import type { WorkspaceDocumentState } from "../document/stores";
import type { WorkspaceItem, WorkspaceSection } from "../document/types";

export type WorkspaceInspectorSelection =
  | { type: "empty" }
  | { type: "section"; section: WorkspaceSection }
  | { type: "item"; section: WorkspaceSection; item: WorkspaceItem }
  | { type: "multiple-items"; section: WorkspaceSection; itemCount: number }
  | { type: "multiple-sections"; sections: Array<WorkspaceSection> };

type WorkspaceInspectorLockState = "locked" | "mixed" | "unlocked";

function getSingleSectionInspectorSelection(
  state: WorkspaceDocumentState,
  sectionId: string,
): WorkspaceInspectorSelection {
  const section = getSectionOrThrow(state, sectionId);
  const itemTree = section.itemTree;
  if (!itemTree || itemTree.selectedItemIds.length === 0) {
    return { type: "section", section };
  }
  if (itemTree.selectedItemIds.length > 1) {
    return {
      type: "multiple-items",
      section,
      itemCount: itemTree.selectedItemIds.length,
    };
  }
  const itemId = itemTree.selectedItemIds[0];
  if (!itemId) {
    throw new Error(`Section ${section.id} has an empty selected item id.`);
  }
  return { type: "item", section, item: getItemOrThrow(itemTree, itemId) };
}

export function getWorkspaceInspectorSelection(
  state: WorkspaceDocumentState,
  activeSectionIds: ReadonlyArray<string>,
): WorkspaceInspectorSelection {
  if (activeSectionIds.length === 0) {
    return { type: "empty" };
  }
  if (activeSectionIds.length > 1) {
    return {
      type: "multiple-sections",
      sections: activeSectionIds.map((sectionId) =>
        getSectionOrThrow(state, sectionId),
      ),
    };
  }
  const sectionId = activeSectionIds[0];
  if (!sectionId) {
    throw new Error("A single Inspector selection requires one section id.");
  }
  return getSingleSectionInspectorSelection(state, sectionId);
}

export function getWorkspaceInspectorSelectionKey(
  selection: WorkspaceInspectorSelection,
): string {
  switch (selection.type) {
    case "empty":
      return "empty";
    case "section":
      return `section:${selection.section.id}`;
    case "item":
      return `item:${selection.section.id}:${selection.item.id}`;
    case "multiple-items":
      return `items:${selection.section.id}:${selection.itemCount}`;
    case "multiple-sections":
      return `sections:${selection.sections.map((section) => section.id).join(",")}`;
  }
}

export function getWorkspaceInspectorSelectionStatus(
  selection: WorkspaceInspectorSelection,
): string {
  switch (selection.type) {
    case "empty":
      return "No section selected.";
    case "section":
      return `Editing section ${selection.section.name || selection.section.id}.`;
    case "item":
      return `Editing item ${selection.item.presentation?.label || selection.item.id}.`;
    case "multiple-items":
      return `${selection.itemCount} items selected. Select one item to edit it.`;
    case "multiple-sections":
      return `${selection.sections.length} sections selected.`;
  }
}

export function getWorkspaceInspectorLockState(
  sections: ReadonlyArray<WorkspaceSection>,
): WorkspaceInspectorLockState {
  const lockedCount = sections.filter(
    (section) => section.positionAndSizeLocked,
  ).length;
  if (lockedCount === 0) {
    return "unlocked";
  }
  return lockedCount === sections.length ? "locked" : "mixed";
}

export function canGroupWorkspaceSections(
  state: WorkspaceDocumentState,
  sections: ReadonlyArray<WorkspaceSection>,
): boolean {
  if (sections.length < 2) {
    return false;
  }
  const first = sections[0];
  if (!first) {
    return false;
  }
  const parentId = state.parentSectionMap[first.id] ?? null;
  return sections.every(
    (section) => (state.parentSectionMap[section.id] ?? null) === parentId,
  );
}
