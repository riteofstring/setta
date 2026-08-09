import {
  applyLoadedDocumentViewport,
  armLoadedDocumentFitView,
} from "../canvas/documentViewportSync";
import { maybeCompleteInitialFitView } from "../canvas/nodeInternalsActions";
import { resetDndSessionForLoadedDocument } from "../dnd/dndState";
import { assertNoReservedItemDndTokens } from "../dnd/itemDndState";
import { resetItemDragState } from "../items/itemDragHandlers";
import { runWithWorkspaceDocumentChangeNotificationsSuppressed } from "./documentChangeCallback";
import { isGroupSection } from "./documentSelectors";
import { deactivateItemSelect } from "./itemSelectionMode";
import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import { getRegisteredSectionKindOrThrow } from "./sectionKindRegistry";
import {
  runWithAtomicallyPublishedWorkspaceStores,
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
  type WorkspaceDocumentState,
} from "./stores";
import type {
  SectionSize,
  WorkspaceDocumentInput,
  WorkspaceSection,
  WorkspaceSectionInput,
  WorkspaceSectionItemTree,
} from "./types";

// The reference's `createSectionSize()` default: sections materialized without an explicit
// size are auto-sized in both dimensions.
const DEFAULT_LOADED_SECTION_SIZE: SectionSize = { width: "auto", height: "auto" };

// Every non-group kind must be registered before its documents load, and a section without an
// explicit size resolves to its kind's registered default — the load-time equivalent of the
// reference's generated per-type constructors filling `size` from their defaults.
function resolveLoadedSections(
  sections: Record<string, WorkspaceSectionInput>,
): Record<string, WorkspaceSection> {
  const resolved: Record<string, WorkspaceSection> = {};
  for (const [sectionId, section] of Object.entries(sections)) {
    const definition = isGroupSection(section)
      ? null
      : getRegisteredSectionKindOrThrow(section.kind);
    resolved[sectionId] = {
      ...section,
      size: section.size ?? definition?.defaultSize ?? DEFAULT_LOADED_SECTION_SIZE,
    };
  }
  return resolved;
}

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

// A section's item tree must be exactly one tree rooted at `rootId`: every child claim unique,
// the root never claimed, and every item reachable from the root (which together also rule out
// cycles). Selection can only name real non-root items — the root is a move target, not a row.
function assertValidSectionItemTree(sectionId: string, itemTree: WorkspaceSectionItemTree) {
  if (!(itemTree.rootId in itemTree.items)) {
    throw new Error(`Section ${sectionId} item tree is missing its root item ${itemTree.rootId}.`);
  }
  assertValidItemChildClaims(sectionId, itemTree);
  assertItemsReachableFromRoot(sectionId, itemTree);
  assertValidItemSelection(sectionId, itemTree);
}

function assertValidItemChildClaims(sectionId: string, itemTree: WorkspaceSectionItemTree) {
  const parentByChild: Record<string, string> = {};
  for (const [itemId, item] of Object.entries(itemTree.items)) {
    if (item.id !== itemId) {
      throw new Error(
        `Section ${sectionId} item record key ${itemId} does not match item id ${item.id}.`,
      );
    }
    assertNoReservedItemDndTokens(itemId, `Section ${sectionId} item id`);
    for (const childId of item.children) {
      if (!(childId in itemTree.items)) {
        throw new Error(`Section ${sectionId} item ${itemId} lists unknown child ${childId}.`);
      }
      if (childId === itemTree.rootId) {
        throw new Error(`Section ${sectionId} item ${itemId} claims the root item as a child.`);
      }
      const existingParentId = parentByChild[childId];
      if (existingParentId !== undefined) {
        throw new Error(
          `Section ${sectionId} item ${childId} is claimed by parents ${existingParentId} and ${itemId}.`,
        );
      }
      parentByChild[childId] = itemId;
    }
  }
}

function assertItemsReachableFromRoot(sectionId: string, itemTree: WorkspaceSectionItemTree) {
  const reachable = new Set<string>([itemTree.rootId]);
  const queue = [itemTree.rootId];
  let currentId = queue.pop();
  while (currentId !== undefined) {
    for (const childId of itemTree.items[currentId]?.children ?? []) {
      if (!reachable.has(childId)) {
        reachable.add(childId);
        queue.push(childId);
      }
    }
    currentId = queue.pop();
  }
  for (const itemId of Object.keys(itemTree.items)) {
    if (!reachable.has(itemId)) {
      throw new Error(
        `Section ${sectionId} item ${itemId} is not reachable from root ${itemTree.rootId}.`,
      );
    }
  }
}

function assertValidItemSelection(sectionId: string, itemTree: WorkspaceSectionItemTree) {
  const selectedSet = new Set<string>();
  for (const selectedId of itemTree.selectedItemIds) {
    if (!(selectedId in itemTree.items)) {
      throw new Error(`Section ${sectionId} selects unknown item ${selectedId}.`);
    }
    if (selectedId === itemTree.rootId) {
      throw new Error(`Section ${sectionId} selects its root item ${itemTree.rootId}.`);
    }
    if (selectedSet.has(selectedId)) {
      throw new Error(`Section ${sectionId} selects item ${selectedId} twice.`);
    }
    selectedSet.add(selectedId);
  }
}

function assertValidSectionItemTrees(sections: Record<string, WorkspaceSection>) {
  for (const [sectionId, section] of Object.entries(sections)) {
    if (!section.itemTree) {
      continue;
    }
    // The reference cannot represent params on a Group (its section-click policy guards on
    // `isBaseSectionWithParamsImpl`), so a group section never carries an item tree.
    if (isGroupSection(section)) {
      throw new Error(`Section ${sectionId} is a group section and cannot carry an item tree.`);
    }
    assertValidSectionItemTree(sectionId, section.itemTree);
  }
}

function assertKnownSectionIds(
  document: WorkspaceDocumentInput,
  ids: Iterable<string>,
  role: string,
) {
  for (const sectionId of ids) {
    if (!(sectionId in document.sections)) {
      throw new Error(`${role} references unknown section ${sectionId}.`);
    }
  }
}

// Replaces the canonical workspace state with a host-supplied document. The document, its
// derived node geometry, and the selection publish atomically so no subscriber observes a
// mixture of old and new state, and the whole load suppresses the document-change callback:
// a load is the host's own write, not a package-initiated change.
//
// This file is the deliberate composition point between the document layer and the canvas/dnd
// runtimes: a load on a mounted canvas re-applies the loaded camera (or re-arms fit-on-init)
// and resets the drag-session bookkeeping, replacing the Phase 1 load-before-mount-only seam.
// The funnel modules themselves stay canvas-free.
export function loadWorkspaceDocument(document: WorkspaceDocumentInput): void {
  const sections = resolveLoadedSections(document.sections);
  const parentSectionMap = buildParentSectionMap(sections);
  assertAcyclicParentChains(parentSectionMap);
  assertValidSectionItemTrees(sections);
  assertKnownSectionIds(document, Object.keys(document.topLevelSections), "Top-level layout");
  assertKnownSectionIds(document, document.activeIds, "Active ids");

  const nextDocumentState: WorkspaceDocumentState = {
    sections,
    topLevelSections: document.topLevelSections,
    viewport: document.viewport,
    parentSectionMap,
  };
  const nextNodesMap = createNodesMapFromDocumentChildren(
    nextDocumentState,
    useNodeInternals.getState().x,
  );
  const nextActiveSections = { activeIds: document.activeIds };
  runWithWorkspaceDocumentChangeNotificationsSuppressed(() => {
    // Arming precedes the publication so the sync mirror fired by the flag flip lands in the
    // outgoing document state, leaving the loaded null viewport intact.
    armLoadedDocumentFitView(document.viewport);
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
    resetDndSessionForLoadedDocument(new Set(Object.keys(document.sections)));
    // The item half of the drag-session reset: a load replaces the document the item drag
    // bookkeeping references, and item-select mode releases like the held section dnd modes.
    resetItemDragState();
    deactivateItemSelect();
    applyLoadedDocumentViewport(document.viewport);
  });
  // Outside the suppression: when surviving measurements let the armed fit complete
  // immediately, the fitted camera mirrors into the document and notifies the host — the same
  // canonical change the host would see when a ResizeObserver pass completes the fit later.
  maybeCompleteInitialFitView();
}
