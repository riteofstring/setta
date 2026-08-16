import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "./stores";
import type { WorkspaceSection, WorkspaceSectionItemTree } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

// The package equivalent of the reference's `SectionTypeEnum.Group`: groups are the one
// package-owned section kind (nested children, orientation, group chrome). Every other kind is
// host-registered and rendered through the content seam.
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

// The reference's `getHasSelectedParams` answers false for section types without params.
export function getSectionHasSelectedItems(
  state: WorkspaceDocumentState,
  sectionId: string,
): boolean {
  return (
    (getSectionOrThrow(state, sectionId).itemTree?.selectedItemIds.length ??
      0) > 0
  );
}

// Only true top-level sections render as canvas nodes. A loaded document may carry a stale
// layout entry for a section that currently has a parent; the entry is ignored here and, as in
// the reference, purged at the first layout write (`commitTopLevelLayoutToDocument`).
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

// The reference resolves this through the variant indirection (`getSectionIsHorizontalOrientation`
// in `state/actions/sectionInfos.ts`); the package reads the resolved section. Non-groups are
// never horizontal, exactly as the reference answers for non-group section types.
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
  const parentSectionMap = getWorkspaceDocumentStore(host).getState()
    .parentSectionMap;
  let parentId = parentSectionMap[sectionId] ?? null;
  let highestAncestor = sectionId;
  while (parentId) {
    highestAncestor = parentId;
    parentId = parentSectionMap[parentId] ?? null;
  }
  return highestAncestor;
}
