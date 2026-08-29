import { insertIntoArray } from "./arrayUtils";
import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getSectionOrThrow } from "./documentSelectors";
import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import {
  canWorkspaceSectionAcceptNestedSection,
  canWorkspaceSectionOwnNestedSections,
} from "./sectionKindRegistry";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
  runWithAtomicallyPublishedWorkspaceStores,
  type WorkspaceDocumentState,
} from "./stores";
import type { Position, WorkspaceSection } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

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

  const documentState = withNodeZIndicesMirrored(
    getWorkspaceDocumentStore(host).getState(),
    getNodeInternalsStore(host).getState().x,
  );
  assertValidMoveSectionsInput(host, documentState, sectionIds, newParentId);
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

function assertValidMoveSectionsInput(
  host: WorkspaceHost,
  documentState: WorkspaceDocumentState,
  sectionIds: Array<string>,
  newParentId: string | null,
): void {
  const movingSet = assertValidMovingSectionSelection(
    documentState,
    sectionIds,
  );
  if (newParentId === null) {
    return;
  }

  assertValidMoveParent(host, documentState, movingSet, newParentId);
}

function assertValidMovingSectionSelection(
  documentState: WorkspaceDocumentState,
  sectionIds: Array<string>,
): Set<string> {
  const movingSet = new Set(sectionIds);
  if (movingSet.size !== sectionIds.length) {
    throw new Error("A section move cannot contain duplicate section ids.");
  }
  for (const sectionId of sectionIds) {
    getSectionOrThrow(documentState, sectionId);
    assertSectionHasNoMovingAncestor(documentState, sectionId, movingSet);
  }
  return movingSet;
}

function assertSectionHasNoMovingAncestor(
  documentState: WorkspaceDocumentState,
  sectionId: string,
  movingSet: ReadonlySet<string>,
): void {
  let parentId = documentState.parentSectionMap[sectionId] ?? null;
  while (parentId !== null) {
    if (movingSet.has(parentId)) {
      throw new Error(
        "A section move cannot include both a section and its ancestor.",
      );
    }
    parentId = documentState.parentSectionMap[parentId] ?? null;
  }
}

function assertValidMoveParent(
  host: WorkspaceHost,
  documentState: WorkspaceDocumentState,
  movingSet: ReadonlySet<string>,
  newParentId: string,
): void {
  const newParent = getSectionOrThrow(documentState, newParentId);
  if (!canWorkspaceSectionOwnNestedSections(host, newParent)) {
    throw new Error(`Section ${newParentId} cannot own nested sections.`);
  }
  for (const sectionId of movingSet) {
    if (
      !canWorkspaceSectionAcceptNestedSection(
        host,
        newParent,
        getSectionOrThrow(documentState, sectionId),
      )
    ) {
      throw new Error(
        `Section ${sectionId} cannot be nested in ${newParentId}.`,
      );
    }
  }
  let ancestorId: string | null = newParentId;
  while (ancestorId !== null) {
    if (movingSet.has(ancestorId)) {
      throw new Error(
        "A section move cannot place a section inside itself or its descendant.",
      );
    }
    ancestorId = documentState.parentSectionMap[ancestorId] ?? null;
  }
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
