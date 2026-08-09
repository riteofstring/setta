import { useWorkspaceDocument, type WorkspaceDocumentState } from "./stores";
import type { WorkspaceSection } from "./types";

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
