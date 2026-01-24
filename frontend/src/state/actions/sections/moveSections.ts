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
}: MoveSectionsInput & { state: ZustandProjectState }) {
  if (newParentId === null) {
    moveSectionsToPane({
      sectionIds,
      positionsById,
      state,
    });
    return;
  }
  if (newIndex === null) {
    throw new Error("Expected newIndex when moving sections into parent.");
  }
  removeSectionsFromParents({
    sectionIds,
    state,
    removeTopLevelNodes: true,
  });
  const movingSet = new Set(sectionIds);
  setSectionChildren(state, newParentId, (children) => {
    const nextChildren = children.filter((id) => !movingSet.has(id));
    return insertIntoArray(nextChildren, newIndex, ...sectionIds);
  });
}

function moveSectionsToPane({
  sectionIds,
  positionsById,
  state,
}: {
  sectionIds: string[];
  positionsById: Record<string, Position> | null;
  state: ZustandProjectState;
}) {
  if (!positionsById) {
    throw new Error("Expected positionsById when moving sections to pane.");
  }
  removeSectionsFromParents({
    sectionIds,
    state,
    removeTopLevelNodes: false,
  });
  let maxZIndex = getMaxZIndex();
  for (const sectionId of sectionIds) {
    const position = positionsById[sectionId];
    if (!position) {
      throw new Error(`Missing position for section ${sectionId}.`);
    }
    if (hasNode(sectionId)) {
      justMoveANode(sectionId, position);
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
  }
}

function removeSectionsFromParents({
  sectionIds,
  state,
  removeTopLevelNodes,
}: {
  sectionIds: string[];
  state: ZustandProjectState;
  removeTopLevelNodes: boolean;
}) {
  const idsByParent: Record<string, string[]> = {};
  const topLevelIds: string[] = [];
  for (const sectionId of sectionIds) {
    const parentId = state.parentSectionMap[sectionId] ?? null;
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
  }
}

function hasNode(sectionId: string): boolean {
  return useNodeInternals.getState().x.has(sectionId);
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
