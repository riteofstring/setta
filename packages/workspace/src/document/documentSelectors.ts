import { useWorkspaceDocument, type WorkspaceDocumentState } from "./stores";
import type { WorkspaceSection } from "./types";

// The package equivalent of the reference's `SectionTypeEnum.Group`: groups are the one
// package-owned section kind (nested children, orientation, group chrome). Every other kind is
// host-registered and rendered through the content seam.
export const GROUP_SECTION_KIND = "group";

export function isGroupSection(section: WorkspaceSection): boolean {
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

// Only true top-level sections render as canvas nodes. A section that currently has a parent
// keeps its top-level layout entry (layout memory), but is rendered via the nested tree.
export function getTopLevelSectionIdsForDisplay(state: WorkspaceDocumentState): Array<string> {
  return Object.keys(state.topLevelSections).filter((sectionId) => {
    const parentId = state.parentSectionMap[sectionId] ?? null;
    return parentId === null;
  });
}

export function getHighestAncestor(sectionId: string): string {
  const parentSectionMap = useWorkspaceDocument.getState().parentSectionMap;
  let parentId = parentSectionMap[sectionId] ?? null;
  let highestAncestor = sectionId;
  while (parentId) {
    highestAncestor = parentId;
    parentId = parentSectionMap[parentId] ?? null;
  }
  return highestAncestor;
}
