import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "./stores.js";
import type { WorkspaceSection, WorkspaceSectionItemTree } from "./types.js";
import type { WorkspaceHost } from "../workspaceHost.js";

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
  if (!Object.hasOwn(state.sections, sectionId)) {
    throw new Error(`Unknown section ${sectionId}.`);
  }
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
    const parentId = Object.hasOwn(state.parentSectionMap, sectionId)
      ? (state.parentSectionMap[sectionId] ?? null)
      : null;
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
  let parentId = Object.hasOwn(parentSectionMap, sectionId)
    ? (parentSectionMap[sectionId] ?? null)
    : null;
  let highestAncestor = sectionId;
  while (parentId) {
    highestAncestor = parentId;
    parentId = Object.hasOwn(parentSectionMap, parentId)
      ? (parentSectionMap[parentId] ?? null)
      : null;
  }
  return highestAncestor;
}
