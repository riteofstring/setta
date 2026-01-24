import {
  addNodes,
  deleteNodes,
  justMoveANode,
} from "state/actions/nodeInternals";
import { useNodeInternals, ZustandProjectState } from "state/definitions";
import { route_move_sections } from "utils/generatedEndpoints";
import { Position } from "utils/generatedTypes";
import { insertIntoArray } from "utils/utils";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setSectionChildren,
} from "../sectionInfos";

type MoveSectionsInput = {
  sectionIds: string[];
  newParentId: string | null;
  newIndex: number | null;
  positionsById: Record<string, Position> | null;
};

type MoveSectionsStateInput = MoveSectionsInput & {
  state: ZustandProjectState;
};

export function moveSectionsWithBackend({
  sectionIds,
  newParentId,
  newIndex,
  positionsById,
}: MoveSectionsInput) {
  if (sectionIds.length === 0) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      moveSectionsInState({
        sectionIds,
        newParentId,
        newIndex,
        positionsById,
        state,
      });
    },
    send: (frontendOpId) =>
      route_move_sections({
        projectConfigId: getCurrProjectConfigId(),
        sectionIds,
        newParentId,
        newIndex,
        positionsById,
        frontendOpId,
      }),
  });
}

function moveSectionsInState({
  sectionIds,
  newParentId,
  newIndex,
  positionsById,
  state,
}: MoveSectionsStateInput) {
  const parentsById = resolveParentIds(state, sectionIds);
  if (newParentId === null) {
    moveSectionsToPane({
      sectionIds,
      positionsById,
      parentsById,
      state,
    });
    return;
  }
  if (newIndex === null) {
    throw new Error("Expected newIndex when moving sections into parent.");
  }
  removeSectionsFromParents({
    sectionIds,
    parentsById,
    state,
    removeTopLevelNodes: true,
  });
  const movingSet = new Set(sectionIds);
  setSectionChildren(state, newParentId, (children) => {
    const nextChildren = children.filter((id) => !movingSet.has(id));
    return insertIntoArray(nextChildren, newIndex, ...sectionIds);
  });
  for (const sectionId of sectionIds) {
    state.parentSectionMap[sectionId] = newParentId;
  }
}

function moveSectionsToPane({
  sectionIds,
  positionsById,
  parentsById,
  state,
}: {
  sectionIds: string[];
  positionsById: Record<string, Position> | null;
  parentsById: Record<string, string | null>;
  state: ZustandProjectState;
}) {
  if (!positionsById) {
    throw new Error("Expected positionsById when moving sections to pane.");
  }
  for (const sectionId of sectionIds) {
    if (!positionsById[sectionId]) {
      throw new Error(`Missing position for section ${sectionId}.`);
    }
  }
  removeSectionsFromParents({
    sectionIds,
    parentsById,
    state,
    removeTopLevelNodes: false,
  });
  let maxZIndex = getMaxZIndex();
  for (const sectionId of sectionIds) {
    const position = positionsById[sectionId];
    if (hasNode(sectionId)) {
      justMoveANode(sectionId, position);
      updateTopLevelLayout(
        state,
        sectionId,
        position,
        getNodeZIndex(sectionId),
      );
      continue;
    }
    maxZIndex += 1;
    addNodes([
      {
        id: sectionId,
        position,
        zIndex: maxZIndex,
        tempZIndex: maxZIndex,
        width: null,
        height: null,
      },
    ]);
    updateTopLevelLayout(state, sectionId, position, maxZIndex);
  }
  for (const sectionId of sectionIds) {
    state.parentSectionMap[sectionId] = null;
  }
}

function removeSectionsFromParents({
  sectionIds,
  parentsById,
  state,
  removeTopLevelNodes,
}: {
  sectionIds: string[];
  parentsById: Record<string, string | null>;
  state: ZustandProjectState;
  removeTopLevelNodes: boolean;
}) {
  const idsByParent: Record<string, string[]> = {};
  const topLevelIds: string[] = [];
  for (const sectionId of sectionIds) {
    const parentId = parentsById[sectionId] ?? null;
    if (!parentId) {
      topLevelIds.push(sectionId);
      continue;
    }
    if (!idsByParent[parentId]) {
      idsByParent[parentId] = [];
    }
    idsByParent[parentId].push(sectionId);
  }

  for (const [parentId, ids] of Object.entries(idsByParent)) {
    const removalSet = new Set(ids);
    setSectionChildren(state, parentId, (children) =>
      children.filter((id) => !removalSet.has(id)),
    );
  }

  if (removeTopLevelNodes && topLevelIds.length > 0) {
    deleteNodes(topLevelIds);
    for (const sectionId of topLevelIds) {
      delete state.projectConfig.topLevelSections[sectionId];
    }
  }
}

function hasNode(sectionId: string): boolean {
  return useNodeInternals.getState().x.has(sectionId);
}

function getNodeZIndex(sectionId: string): number | null {
  const node = useNodeInternals.getState().x.get(sectionId);
  return node ? node.zIndex : null;
}

function getMaxZIndex(): number {
  let maxZIndex = -1;
  for (const node of useNodeInternals.getState().x.values()) {
    if (node.zIndex > maxZIndex) {
      maxZIndex = node.zIndex;
    }
  }
  return maxZIndex;
}

function updateTopLevelLayout(
  state: ZustandProjectState,
  sectionId: string,
  position: Position,
  zIndex: number | null,
) {
  const existing = state.projectConfig.topLevelSections[sectionId];
  state.projectConfig.topLevelSections[sectionId] = {
    x: position.x,
    y: position.y,
    zIndex: zIndex ?? existing?.zIndex ?? 0,
    w: existing?.w ?? null,
    h: existing?.h ?? null,
  };
}

function resolveParentIds(
  state: ZustandProjectState,
  sectionIds: string[],
): Record<string, string | null> {
  const parentsById: Record<string, string | null> = {};
  for (const sectionId of sectionIds) {
    parentsById[sectionId] = state.parentSectionMap[sectionId] ?? null;
  }
  return parentsById;
}
