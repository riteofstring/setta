import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import {
  runWithAtomicallyPublishedWorkspaceStores,
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
  type WorkspaceDocumentState,
} from "./stores";
import type { TopLevelSectionLayout, Viewport, WorkspaceSection } from "./types";

export type WorkspaceDocument = {
  sections: Record<string, WorkspaceSection>;
  topLevelSections: Record<string, TopLevelSectionLayout>;
  // null loads without a saved camera; the canvas fits the content on init.
  viewport: Viewport | null;
  activeIds: Array<string>;
};

function buildParentSectionMap(sections: Record<string, WorkspaceSection>): Record<string, string> {
  const parentSectionMap: Record<string, string> = {};
  for (const [sectionId, section] of Object.entries(sections)) {
    if (section.id !== sectionId) {
      throw new Error(`Section record key ${sectionId} does not match section id ${section.id}.`);
    }
    for (const childId of section.children) {
      if (!(childId in sections)) {
        throw new Error(`Section ${sectionId} lists unknown child ${childId}.`);
      }
      const existingParentId = parentSectionMap[childId];
      if (existingParentId !== undefined) {
        throw new Error(
          `Section ${childId} is claimed by parents ${existingParentId} and ${sectionId}.`,
        );
      }
      parentSectionMap[childId] = sectionId;
    }
  }
  return parentSectionMap;
}

function assertAcyclicParentChains(parentSectionMap: Record<string, string>) {
  for (const startId of Object.keys(parentSectionMap)) {
    const visited = new Set<string>([startId]);
    let parentId = parentSectionMap[startId] ?? null;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        throw new Error(`Section ${startId} has a cyclic parent chain.`);
      }
      visited.add(parentId);
      parentId = parentSectionMap[parentId] ?? null;
    }
  }
}

function assertKnownSectionIds(document: WorkspaceDocument, ids: Iterable<string>, role: string) {
  for (const sectionId of ids) {
    if (!(sectionId in document.sections)) {
      throw new Error(`${role} references unknown section ${sectionId}.`);
    }
  }
}

// Replaces the canonical workspace state. The document, its derived node geometry, and the
// selection publish atomically so no subscriber observes a mixture of old and new state.
export function loadWorkspaceDocument(document: WorkspaceDocument): void {
  const parentSectionMap = buildParentSectionMap(document.sections);
  assertAcyclicParentChains(parentSectionMap);
  assertKnownSectionIds(document, Object.keys(document.topLevelSections), "Top-level layout");
  assertKnownSectionIds(document, document.activeIds, "Active ids");

  const nextDocumentState: WorkspaceDocumentState = {
    sections: document.sections,
    topLevelSections: document.topLevelSections,
    viewport: document.viewport,
    parentSectionMap,
  };
  const nextNodesMap = createNodesMapFromDocumentChildren(
    nextDocumentState,
    useNodeInternals.getState().x,
  );
  const nextActiveSections = { activeIds: document.activeIds };
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
