import { addNodes, deleteNodes, moveNodes } from "state/actions/nodeInternals";
import {
  useNodeInternals,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import {
  route_move_sections,
  route_set_code_section_attached_terminal,
} from "utils/generatedEndpoints";
import { Position, SectionTypeEnum } from "utils/generatedTypes";
import { insertIntoArray } from "utils/utils";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  isBaseCodeSectionType,
  setCurrEffectiveSectionImplValue,
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
  const stableSectionIds = [...sectionIds];
  const stablePositionsById = positionsById
    ? Object.fromEntries(
        Object.entries(positionsById).map(([id, position]) => [
          id,
          { x: position.x, y: position.y },
        ]),
      )
    : null;
  const stableNewParentId = newParentId;
  const stableNewIndex = newIndex;
  const state = useProjectState.getState();
  const useAttachedTerminalRoute = shouldUseAttachedTerminalRoute({
    state,
    sectionIds: stableSectionIds,
    newParentId: stableNewParentId,
  });
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      moveSectionsInState({
        sectionIds: stableSectionIds,
        newParentId: stableNewParentId,
        newIndex: stableNewIndex,
        positionsById: stablePositionsById,
        state,
      });
    },
    send: (frontendOpId) => {
      if (useAttachedTerminalRoute && stableNewParentId) {
        return route_set_code_section_attached_terminal({
          projectConfigId: getCurrProjectConfigId(),
          sectionId: stableNewParentId,
          terminalSectionId: stableSectionIds[0] ?? null,
          frontendOpId,
        });
      }
      return route_move_sections({
        projectConfigId: getCurrProjectConfigId(),
        sectionIds: stableSectionIds,
        newParentId: stableNewParentId,
        newIndex: stableNewIndex,
        positionsById: stablePositionsById,
        frontendOpId,
      });
    },
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
  if (isCodeSection(state, newParentId)) {
    if (sectionIds.length === 1 && isTerminalSection(state, sectionIds[0])) {
      setCurrEffectiveSectionImplValue<"BaseCodeSection">(state, newParentId, {
        attachedTerminalSectionId: sectionIds[0],
      });
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
}) {
  const idsByParent: Record<string, string[]> = {};
  for (const sectionId of sectionIds) {
    const parentId = parentsById[sectionId] ?? null;
    if (!parentId) continue;
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
    // Defensive cleanup: if any of these sections have a top-level node/layout entry,
    // they must be removed when moving into a parent, even if their `parentSectionMap`
    // was already (incorrectly) non-null.
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
) {
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
  if (activeViewModeId && viewModes[activeViewModeId]) {
    viewModes[activeViewModeId].topLevelSections = {
      ...(viewModes[activeViewModeId].topLevelSections ?? {}),
      [sectionId]: nextLayout,
    };
  }
}

function isCodeSection(state: ZustandProjectState, sectionId: string): boolean {
  return isBaseCodeSectionType(
    getCurrEffectiveSectionImpl(state, sectionId).type,
  );
}

function isTerminalSection(
  state: ZustandProjectState,
  sectionId: string,
): boolean {
  return (
    getCurrEffectiveSectionImpl(state, sectionId).type ===
    SectionTypeEnum.Terminal
  );
}

function shouldUseAttachedTerminalRoute({
  state,
  sectionIds,
  newParentId,
}: {
  state: ZustandProjectState;
  sectionIds: string[];
  newParentId: string | null;
}): boolean {
  if (!newParentId) {
    return false;
  }
  if (sectionIds.length !== 1) {
    return false;
  }
  if (!isCodeSection(state, newParentId)) {
    return false;
  }
  return isTerminalSection(state, sectionIds[0]);
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

function deleteTopLevelSectionLayout(state: ZustandProjectState, sectionId: string) {
  delete state.projectConfig.topLevelSections[sectionId];
  for (const viewMode of Object.values(state.projectConfig.viewModes)) {
    if (!viewMode.topLevelSections) {
      continue;
    }
    delete viewMode.topLevelSections[sectionId];
  }
}
