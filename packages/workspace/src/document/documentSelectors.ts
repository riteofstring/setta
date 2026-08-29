import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "./stores";
import type { WorkspaceSection, WorkspaceSectionItemTree } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

export const GROUP_SECTION_KIND = "group";

export function isGroupSection(
  section: Pick<WorkspaceSection, "kind">,
): boolean {
  return section.kind === GROUP_SECTION_KIND;
}

export function getSectionOrThrow(
  state: WorkspaceDocumentState,
  sectionId: string,
): WorkspaceSection {
  const section = state.sections[sectionId];
  if (!section) {
    throw new Error(`Unknown section ${sectionId}.`);
  }
  return section;
}

export function getSectionItemTreeOrThrow(
  state: WorkspaceDocumentState,
  sectionId: string,
): WorkspaceSectionItemTree {
  const itemTree = getSectionOrThrow(state, sectionId).itemTree;
  if (!itemTree) {
    throw new Error(`Section ${sectionId} has no item tree.`);
  }
  return itemTree;
}

export function getSectionHasSelectedItems(
  state: WorkspaceDocumentState,
  sectionId: string,
): boolean {
  return (
    (getSectionOrThrow(state, sectionId).itemTree?.selectedItemIds.length ??
      0) > 0
  );
}

export function getTopLevelSectionIdsForDisplay(
  state: WorkspaceDocumentState,
): Array<string> {
  return Object.keys(state.topLevelSections).filter((sectionId) => {
    const parentId = state.parentSectionMap[sectionId] ?? null;
    return parentId === null;
  });
}

export function getSectionChildren(
  state: WorkspaceDocumentState,
  sectionId: string,
): Array<string> {
  return getSectionOrThrow(state, sectionId).children;
}

export function getSectionIsHorizontalOrientation(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  const section = getSectionOrThrow(
    getWorkspaceDocumentStore(host).getState(),
    sectionId,
  );
  return isGroupSection(section) && section.isHorizontalOrientation;
}

export function getHighestAncestor(
  host: WorkspaceHost,
  sectionId: string,
): string {
  const parentSectionMap =
    getWorkspaceDocumentStore(host).getState().parentSectionMap;
  let parentId = parentSectionMap[sectionId] ?? null;
  let highestAncestor = sectionId;
  while (parentId) {
    highestAncestor = parentId;
    parentId = parentSectionMap[parentId] ?? null;
  }
  return highestAncestor;
}
