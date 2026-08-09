import { getSectionOrThrow } from "./documentSelectors";
import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import {
  runWithAtomicallyPublishedWorkspaceStores,
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
  type WorkspaceDocumentState,
} from "./stores";
import type { WorkspaceSection } from "./types";

// The reference's per-flag commit funnels (optimistic impl write + one backend route each:
// `setSectionName`, `togglePositionLocks`, `toggleMinimized`, `toggleGroupOrientation`,
// `deleteSections`). The package applies the same canonical writes directly; the Phase 2
// change-callback seam owns notifying the host from these funnels.

function setSectionValues(sectionId: string, values: Partial<WorkspaceSection>) {
  useWorkspaceDocument.setState((state) => {
    const section = getSectionOrThrow(state, sectionId);
    return {
      sections: { ...state.sections, [sectionId]: { ...section, ...values } },
    };
  });
}

export function setSectionName(sectionId: string, name: string) {
  setSectionValues(sectionId, { name });
}

export function togglePositionLock(sectionId: string) {
  const section = getSectionOrThrow(useWorkspaceDocument.getState(), sectionId);
  setSectionValues(sectionId, {
    positionAndSizeLocked: !section.positionAndSizeLocked,
  });
}

export function toggleMinimized(sectionId: string) {
  const section = getSectionOrThrow(useWorkspaceDocument.getState(), sectionId);
  setSectionValues(sectionId, { isMinimized: !section.isMinimized });
}

export function toggleGroupOrientation(sectionId: string) {
  const section = getSectionOrThrow(useWorkspaceDocument.getState(), sectionId);
  setSectionValues(sectionId, {
    isHorizontalOrientation: !section.isHorizontalOrientation,
  });
}

function collectSectionSubtreeIds(state: WorkspaceDocumentState, sectionId: string): Array<string> {
  const ids = [sectionId];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    if (currId !== undefined) {
      ids.push(...getSectionOrThrow(state, currId).children);
    }
    idx += 1;
  }
  return ids;
}

// Deletes a section and its descendants, mirroring the reference's `deleteSections` result:
// the subtree leaves the section records, top-level layouts, parent map, and selection, and the
// deleted section leaves its parent's children. The document, derived node geometry, and
// selection publish atomically, like every other canonical replacement.
export function deleteSection(sectionId: string) {
  const documentState = useWorkspaceDocument.getState();
  const deletedIds = new Set(collectSectionSubtreeIds(documentState, sectionId));

  const sections: Record<string, WorkspaceSection> = {};
  for (const [id, section] of Object.entries(documentState.sections)) {
    if (deletedIds.has(id)) {
      continue;
    }
    sections[id] = section.children.some((childId) => deletedIds.has(childId))
      ? { ...section, children: section.children.filter((childId) => !deletedIds.has(childId)) }
      : section;
  }

  const topLevelSections = Object.fromEntries(
    Object.entries(documentState.topLevelSections).filter(([id]) => !deletedIds.has(id)),
  );
  const parentSectionMap = Object.fromEntries(
    Object.entries(documentState.parentSectionMap).filter(([id]) => !deletedIds.has(id)),
  );

  const nextDocumentState: WorkspaceDocumentState = {
    sections,
    topLevelSections,
    viewport: documentState.viewport,
    parentSectionMap,
  };
  const nextNodesMap = createNodesMapFromDocumentChildren(
    nextDocumentState,
    useNodeInternals.getState().x,
  );
  const nextActiveSections = {
    activeIds: useActiveSections.getState().activeIds.filter((id) => !deletedIds.has(id)),
  };
  runWithAtomicallyPublishedWorkspaceStores(
    {
      document: nextDocumentState,
      nodeInternals: { x: nextNodesMap },
      activeSections: nextActiveSections,
    },
    () => {
      useNodeInternals.setState({ x: nextNodesMap });
      useWorkspaceDocument.setState(nextDocumentState);
      useActiveSections.setState(nextActiveSections);
    },
  );
}
