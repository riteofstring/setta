import { addNodes, deleteNodes, moveNodes } from "state/actions/nodeInternals";
import {
  useNodeInternals,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { route_move_sections } from "utils/generatedEndpoints";
import { Position, SectionTypeEnum } from "utils/generatedTypes";
import { insertIntoArray } from "utils/utils";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
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
  const { sectionIds: resolvedSectionIds, positionsById: resolvedPositions } =
    resolveMoveSectionsWithAttachedTerminals({
      sectionIds,
      positionsById,
      state: useProjectState.getState(),
    });
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      moveSectionsInState({
        sectionIds: resolvedSectionIds,
        newParentId,
        newIndex,
        positionsById: resolvedPositions,
        state,
      });
    },
    send: (frontendOpId) =>
      route_move_sections({
        projectConfigId: getCurrProjectConfigId(),
        sectionIds: resolvedSectionIds,
        newParentId,
        newIndex,
        positionsById: resolvedPositions,
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
  const existingMoves: Array<{ id: string; position: Position }> = [];
  const terminalMoves: Array<{ id: string; position: Position }> = [];
  const movedTerminalIds = new Set<string>();
  for (const sectionId of sectionIds) {
    const position = positionsById[sectionId];
    const previousLayout = state.projectConfig.topLevelSections[sectionId];
    const delta = previousLayout
      ? { x: position.x - previousLayout.x, y: position.y - previousLayout.y }
      : null;
    const attachedTerminalId = resolveAttachedTerminalId(state, sectionId);
    if (
      delta &&
      attachedTerminalId &&
      !movedTerminalIds.has(attachedTerminalId) &&
      !sectionIds.includes(attachedTerminalId)
    ) {
      const terminalLayout =
        state.projectConfig.topLevelSections[attachedTerminalId];
      if (terminalLayout) {
        const terminalPosition = {
          x: terminalLayout.x + delta.x,
          y: terminalLayout.y + delta.y,
        };
        updateTopLevelLayout(
          state,
          attachedTerminalId,
          terminalPosition,
          getNodeZIndex(attachedTerminalId),
        );
        if (hasNode(attachedTerminalId)) {
          terminalMoves.push({
            id: attachedTerminalId,
            position: terminalPosition,
          });
        }
        movedTerminalIds.add(attachedTerminalId);
      }
    }
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
  moveNodes([...existingMoves, ...terminalMoves]);
  for (const sectionId of sectionIds) {
    state.parentSectionMap[sectionId] = null;
  }
}

function resolveAttachedTerminalId(
  state: ZustandProjectState,
  sectionId: string,
): string | null {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (impl.type !== SectionTypeEnum.Code) {
    return null;
  }
  if (!impl.attachedTerminalSectionId) {
    return null;
  }
  const terminalId = impl.attachedTerminalSectionId;
  if (!(terminalId in state.sections)) {
    return null;
  }
  const terminalImpl = getCurrEffectiveSectionImpl(state, terminalId);
  if (terminalImpl.type !== SectionTypeEnum.Terminal) {
    return null;
  }
  return terminalId;
}

function resolveMoveSectionsWithAttachedTerminals({
  sectionIds,
  positionsById,
  state,
}: {
  sectionIds: string[];
  positionsById: Record<string, Position> | null;
  state: ZustandProjectState;
}): {
  sectionIds: string[];
  positionsById: Record<string, Position> | null;
} {
  if (!positionsById) {
    return { sectionIds, positionsById };
  }
  const nextSectionIds = [...sectionIds];
  const nextPositionsById = { ...positionsById };
  const includedIds = new Set(nextSectionIds);

  for (const sectionId of sectionIds) {
    const attachedTerminalId = resolveAttachedTerminalId(state, sectionId);
    if (!attachedTerminalId || includedIds.has(attachedTerminalId)) {
      continue;
    }
    const currentLayout = state.projectConfig.topLevelSections[sectionId];
    const nextLayout = positionsById[sectionId];
    const terminalLayout =
      state.projectConfig.topLevelSections[attachedTerminalId];
    if (!currentLayout || !nextLayout || !terminalLayout) {
      continue;
    }
    const delta = {
      x: nextLayout.x - currentLayout.x,
      y: nextLayout.y - currentLayout.y,
    };
    nextSectionIds.push(attachedTerminalId);
    nextPositionsById[attachedTerminalId] = {
      x: terminalLayout.x + delta.x,
      y: terminalLayout.y + delta.y,
    };
    includedIds.add(attachedTerminalId);
  }

  return {
    sectionIds: nextSectionIds,
    positionsById: nextPositionsById,
  };
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
