import { addNodes, deleteNodes, moveNodes } from "state/actions/nodeInternals";
import { useNodeInternals, type ZustandProjectState } from "state/definitions";
import { type Position } from "utils/generatedTypes";
import { insertIntoArray } from "utils/utils";
import { setCurrEffectiveSectionImplValue } from "../sectionEffectiveImplMutations";
import { getCurrEffectiveSectionImpl } from "../sectionEffectiveImplSelectors";
import { setSectionChildren } from "../sectionHierarchy";
import { isBaseCodeSectionType } from "../sectionLayoutQueries";
import {
  isCodeSection,
  isTerminalSection,
  resolveParentIds,
} from "./moveSectionQueries";

export type MoveSectionsInput = {
  sectionIds: string[];
  newParentId: string | null;
  newIndex: number | null;
  positionsById: Record<string, Position> | null;
};

type MoveSectionsStateInput = MoveSectionsInput & {
  state: ZustandProjectState;
};

export function moveSectionsInState({
  sectionIds,
  newParentId,
  newIndex,
  positionsById,
  state,
}: MoveSectionsStateInput): void {
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
  if (isCodeSection(state, newParentId)) {
    if (sectionIds.length === 1 && isTerminalSection(state, sectionIds[0])) {
      const terminalSectionId = sectionIds[0];
      const parentImpl = getCurrEffectiveSectionImpl(state, newParentId);
      setCurrEffectiveSectionImplValue<"BaseCodeSection">(state, newParentId, {
        attachedTerminalSectionId: terminalSectionId,
      });
      if (
        isBaseCodeSectionType(parentImpl.type) &&
        parentImpl.size.width !== "auto"
      ) {
        setCurrEffectiveSectionImplValue(state, terminalSectionId, {
          size: (currSize) => ({
            ...currSize,
            width: parentImpl.size.width,
          }),
        });
      }
    }
  }
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
}): void {
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
  const existingMoves: Array<{ id: string; position: Position }> = [];
  for (const sectionId of sectionIds) {
    const position = positionsById[sectionId];
    if (hasNode(sectionId)) {
      existingMoves.push({ id: sectionId, position });
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
  moveNodes(existingMoves);
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
}): void {
  const idsByParent: Record<string, string[]> = {};
  for (const sectionId of sectionIds) {
    const parentId = parentsById[sectionId] ?? null;
    if (!parentId) {
      continue;
    }
    if (!idsByParent[parentId]) {
      idsByParent[parentId] = [];
    }
    idsByParent[parentId].push(sectionId);
  }

  for (const [parentId, ids] of Object.entries(idsByParent)) {
    const removalSet = new Set(ids);
    if (isCodeSection(state, parentId)) {
      const parentImpl = getCurrEffectiveSectionImpl(state, parentId);
      if (
        isBaseCodeSectionType(parentImpl.type) &&
        parentImpl.attachedTerminalSectionId &&
        removalSet.has(parentImpl.attachedTerminalSectionId)
      ) {
        setCurrEffectiveSectionImplValue<"BaseCodeSection">(state, parentId, {
          attachedTerminalSectionId: null,
        });
      }
    }
    setSectionChildren(state, parentId, (children) =>
      children.filter((id) => !removalSet.has(id)),
    );
  }

  if (removeTopLevelNodes && sectionIds.length > 0) {
    // Defensive cleanup: if any of these sections have a top-level node/layout
    // entry, they must be removed when moving into a parent.
    const nodeIdsToDelete = sectionIds.filter((sectionId) =>
      hasNode(sectionId),
    );
    if (nodeIdsToDelete.length > 0) {
      deleteNodes(nodeIdsToDelete);
    }
    for (const sectionId of sectionIds) {
      deleteTopLevelSectionLayout(state, sectionId);
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
): void {
  const existing = state.projectConfig.topLevelSections[sectionId];
  const nextLayout = {
    x: position.x,
    y: position.y,
    zIndex: zIndex ?? existing?.zIndex ?? 0,
    w: existing?.w ?? null,
    h: existing?.h ?? null,
  };
  state.projectConfig.topLevelSections[sectionId] = nextLayout;
  const { activeViewModeId, viewModes } = state.projectConfig;
  if (activeViewModeId) {
    const viewMode = viewModes[activeViewModeId];
    if (viewMode) {
      if (!viewMode.topLevelSections) {
        viewMode.topLevelSections = {};
      }
      viewMode.topLevelSections[sectionId] = nextLayout;
    }
  }
}

function deleteTopLevelSectionLayout(
  state: ZustandProjectState,
  sectionId: string,
): void {
  delete state.projectConfig.topLevelSections[sectionId];
  for (const viewMode of Object.values(state.projectConfig.viewModes)) {
    if (!viewMode.topLevelSections) {
      continue;
    }
    delete viewMode.topLevelSections[sectionId];
  }
}
