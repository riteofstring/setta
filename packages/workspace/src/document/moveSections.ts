import { insertIntoArray } from "./arrayUtils";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getSectionOrThrow } from "./documentSelectors";
import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
  runWithAtomicallyPublishedWorkspaceStores,
  type WorkspaceDocumentState,
} from "./stores";
import type { Position, WorkspaceSection } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

// The reference's single dnd commit funnel (`moveSectionsWithBackend`,
// `state/actions/sections/moveSections.ts`) minus the app-only branches: the optimistic-op
// plumbing and backend routes stay application-side (the host publishes an updated snapshot
// instead), and the code-section attached-terminal handling left with that feature. The
// canonical document changes once per gesture, and the document, derived node geometry, and
// selection publish atomically.

type MoveSectionsInput = {
  sectionIds: Array<string>;
  newParentId: string | null;
  newIndex: number | null;
  positionsById: Record<string, Position> | null;
};

export function moveSections(
  host: WorkspaceHost,
  { sectionIds, newParentId, newIndex, positionsById }: MoveSectionsInput,
) {
  if (sectionIds.length === 0) {
    return;
  }
  // The reference reads z-order from the live node internals; the package mirrors the current
  // node z-indices into the layout snapshot first so raises that have not reached a drag-end
  // layout commit survive the node-map rebuild below.
  const documentState = withNodeZIndicesMirrored(
    getWorkspaceDocumentStore(host).getState(),
    getNodeInternalsStore(host).getState().x,
  );
  const nextDocumentState =
    newParentId === null
      ? moveSectionsToPane({ documentState, sectionIds, positionsById })
      : moveSectionsIntoParent({
          documentState,
          sectionIds,
          newParentId,
          newIndex,
        });

  const nextNodesMap = createNodesMapFromDocumentChildren(
    host,
    nextDocumentState,
    getNodeInternalsStore(host).getState().x,
  );
  const activeSections = getActiveSectionsStore(host).getState();
  runWithAtomicallyPublishedWorkspaceStores(
    host,
    {
      document: nextDocumentState,
      nodeInternals: { x: nextNodesMap },
      activeSections,
    },
    () => {
      getNodeInternalsStore(host).setState({ x: nextNodesMap });
      getWorkspaceDocumentStore(host).setState(nextDocumentState);
    },
  );
  notifyWorkspaceDocumentChange(host);
}

function moveSectionsToPane({
  documentState,
  sectionIds,
  positionsById,
}: {
  documentState: WorkspaceDocumentState;
  sectionIds: Array<string>;
  positionsById: Record<string, Position> | null;
}): WorkspaceDocumentState {
  if (!positionsById) {
    throw new Error("Expected positionsById when moving sections to pane.");
  }
  for (const sectionId of sectionIds) {
    if (!positionsById[sectionId]) {
      throw new Error(`Missing position for section ${sectionId}.`);
    }
  }

  const movingSet = new Set(sectionIds);
  return {
    sections: removeSectionsFromParentChildren(documentState, movingSet),
    topLevelSections: buildPaneDropLayouts(
      documentState,
      sectionIds,
      positionsById,
    ),
    viewport: documentState.viewport,
    parentSectionMap: withoutParentEntries(
      documentState.parentSectionMap,
      movingSet,
    ),
  };
}

// The reference assigns each newly top-level node the next z-index above the current maximum
// while sections that already had a node keep theirs.
function buildPaneDropLayouts(
  documentState: WorkspaceDocumentState,
  sectionIds: Array<string>,
  positionsById: Record<string, Position>,
): WorkspaceDocumentState["topLevelSections"] {
  let maxZIndex = getMaxTopLevelZIndex(documentState);
  const topLevelSections = { ...documentState.topLevelSections };
  for (const sectionId of sectionIds) {
    const position = positionsById[sectionId];
    if (!position) {
      throw new Error(`Missing position for section ${sectionId}.`);
    }
    const existingLayout = topLevelSections[sectionId];
    const wasTopLevel =
      existingLayout !== undefined &&
      (documentState.parentSectionMap[sectionId] ?? null) === null;
    if (!wasTopLevel) {
      maxZIndex += 1;
    }
    topLevelSections[sectionId] = buildPaneDropLayout({
      position,
      existingLayout,
      zIndex: wasTopLevel && existingLayout ? existingLayout.zIndex : maxZIndex,
    });
  }
  return topLevelSections;
}

function buildPaneDropLayout({
  position,
  existingLayout,
  zIndex,
}: {
  position: Position;
  existingLayout:
    WorkspaceDocumentState["topLevelSections"][string] | undefined;
  zIndex: number;
}): WorkspaceDocumentState["topLevelSections"][string] {
  return {
    x: position.x,
    y: position.y,
    zIndex,
    w: existingLayout?.w ?? null,
    h: existingLayout?.h ?? null,
  };
}

function moveSectionsIntoParent({
  documentState,
  sectionIds,
  newParentId,
  newIndex,
}: {
  documentState: WorkspaceDocumentState;
  sectionIds: Array<string>;
  newParentId: string;
  newIndex: number | null;
}): WorkspaceDocumentState {
  if (newIndex === null) {
    throw new Error("Expected newIndex when moving sections into parent.");
  }
  getSectionOrThrow(documentState, newParentId);

  const movingSet = new Set(sectionIds);
  const sections = removeSectionsFromParentChildren(documentState, movingSet);
  const newParent = sections[newParentId];
  if (!newParent) {
    throw new Error(`Unknown section ${newParentId}.`);
  }
  sections[newParentId] = {
    ...newParent,
    children: insertIntoArray(
      newParent.children.filter((childId) => !movingSet.has(childId)),
      newIndex,
      ...sectionIds,
    ),
  };

  // Sections nested into a parent lose their top-level layout entry, mirroring the reference's
  // defensive node/layout cleanup when moving into a parent.
  const topLevelSections = Object.fromEntries(
    Object.entries(documentState.topLevelSections).filter(
      ([id]) => !movingSet.has(id),
    ),
  );
  const parentSectionMap = withoutParentEntries(
    documentState.parentSectionMap,
    movingSet,
  );
  for (const sectionId of sectionIds) {
    parentSectionMap[sectionId] = newParentId;
  }

  return {
    sections,
    topLevelSections,
    viewport: documentState.viewport,
    parentSectionMap,
  };
}

function removeSectionsFromParentChildren(
  documentState: WorkspaceDocumentState,
  movingSet: Set<string>,
): Record<string, WorkspaceSection> {
  const sections: Record<string, WorkspaceSection> = {};
  for (const [sectionId, section] of Object.entries(documentState.sections)) {
    sections[sectionId] = section.children.some((childId) =>
      movingSet.has(childId),
    )
      ? {
          ...section,
          children: section.children.filter(
            (childId) => !movingSet.has(childId),
          ),
        }
      : section;
  }
  return sections;
}

function withNodeZIndicesMirrored(
  documentState: WorkspaceDocumentState,
  nodes: ReturnType<ReturnType<typeof getNodeInternalsStore>["getState"]>["x"],
): WorkspaceDocumentState {
  const topLevelSections = { ...documentState.topLevelSections };
  let changed = false;
  for (const [sectionId, layout] of Object.entries(topLevelSections)) {
    const node = nodes.get(sectionId);
    if (!node || node.zIndex === layout.zIndex) {
      continue;
    }
    topLevelSections[sectionId] = { ...layout, zIndex: node.zIndex };
    changed = true;
  }
  if (!changed) {
    return documentState;
  }
  return { ...documentState, topLevelSections };
}

function withoutParentEntries(
  parentSectionMap: WorkspaceDocumentState["parentSectionMap"],
  movingSet: Set<string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(parentSectionMap).filter(
      ([sectionId]) => !movingSet.has(sectionId),
    ),
  );
}

function getMaxTopLevelZIndex(documentState: WorkspaceDocumentState): number {
  let maxZIndex = -1;
  for (const [sectionId, layout] of Object.entries(
    documentState.topLevelSections,
  )) {
    if ((documentState.parentSectionMap[sectionId] ?? null) !== null) {
      continue;
    }
    maxZIndex = Math.max(maxZIndex, layout.zIndex);
  }
  return maxZIndex;
}
