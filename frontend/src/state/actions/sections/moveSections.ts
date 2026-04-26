import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { moveSections, setCodeSectionAttachedTerminal } from "openapi/http";
import { addNodes, deleteNodes, moveNodes } from "state/actions/nodeInternals";
import {
  useNodeInternals,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
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
        return callOpenAPI(
          setCodeSectionAttachedTerminal({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId: stableNewParentId,
              terminalSectionId: stableSectionIds[0] ?? null,
              frontendOpId,
            },
          } as Parameters<typeof setCodeSectionAttachedTerminal>[0]),
        );
      }
      return callOpenAPI(
        moveSections({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionIds: stableSectionIds,
            newParentId: stableNewParentId,
            newIndex: stableNewIndex,
            positionsById: stablePositionsById,
            frontendOpId,
          },
        } as Parameters<typeof moveSections>[0]),
      );
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
  const existingMoves: Array<{
    id: string;
    position: Position;
  }> = [];
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
  for (const [parentId, ids] of groupSectionIdsByParent(
    sectionIds,
    parentsById,
  )) {
    removeChildSectionsFromParent(state, parentId, ids);
  }
  removeTopLevelNodeEntries(state, sectionIds, removeTopLevelNodes);
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
  const nextLayout = buildTopLevelSectionLayout(
    state.projectConfig.topLevelSections[sectionId],
    position,
    zIndex,
  );
  state.projectConfig.topLevelSections[sectionId] = nextLayout;
  const activeViewModeTopLevelSections =
    getActiveViewModeTopLevelSections(state);
  if (activeViewModeTopLevelSections) {
    activeViewModeTopLevelSections[sectionId] = nextLayout;
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
function groupSectionIdsByParent(
  sectionIds: string[],
  parentsById: Record<string, string | null>,
): Map<string, string[]> {
  const idsByParent = new Map<string, string[]>();
  for (const sectionId of sectionIds) {
    const parentId = parentsById[sectionId];
    if (!parentId) {
      continue;
    }
    const ids = idsByParent.get(parentId);
    if (ids) {
      ids.push(sectionId);
      continue;
    }
    idsByParent.set(parentId, [sectionId]);
  }
  return idsByParent;
}
function removeChildSectionsFromParent(
  state: ZustandProjectState,
  parentId: string,
  childSectionIds: string[],
) {
  const removalSet = new Set(childSectionIds);
  clearAttachedTerminalIfNeeded(state, parentId, removalSet);
  setSectionChildren(state, parentId, (children) =>
    children.filter((id) => !removalSet.has(id)),
  );
}
function clearAttachedTerminalIfNeeded(
  state: ZustandProjectState,
  parentId: string,
  removalSet: Set<string>,
) {
  if (!isCodeSection(state, parentId)) {
    return;
  }
  const parentImpl = getCurrEffectiveSectionImpl(state, parentId);
  if (
    !isBaseCodeSectionType(parentImpl.type) ||
    !parentImpl.attachedTerminalSectionId ||
    !removalSet.has(parentImpl.attachedTerminalSectionId)
  ) {
    return;
  }
  setCurrEffectiveSectionImplValue<"BaseCodeSection">(state, parentId, {
    attachedTerminalSectionId: null,
  });
}
function removeTopLevelNodeEntries(
  state: ZustandProjectState,
  sectionIds: string[],
  removeTopLevelNodes: boolean,
) {
  if (!removeTopLevelNodes || sectionIds.length === 0) {
    return;
  }
  // Defensive cleanup: if any of these sections have a top-level node/layout entry,
  // they must be removed when moving into a parent, even if their `parentSectionMap`
  // was already (incorrectly) non-null.
  const nodeIdsToDelete = sectionIds.filter((sectionId) => hasNode(sectionId));
  if (nodeIdsToDelete.length > 0) {
    deleteNodes(nodeIdsToDelete);
  }
  for (const sectionId of sectionIds) {
    deleteTopLevelSectionLayout(state, sectionId);
  }
}
function buildTopLevelSectionLayout(
  existing:
    | ZustandProjectState["projectConfig"]["topLevelSections"][string]
    | undefined,
  position: Position,
  zIndex: number | null,
) {
  return {
    x: position.x,
    y: position.y,
    zIndex: zIndex ?? existing?.zIndex ?? 0,
    w: existing?.w ?? null,
    h: existing?.h ?? null,
  };
}
function getActiveViewModeTopLevelSections(state: ZustandProjectState) {
  const activeViewModeId = state.projectConfig.activeViewModeId;
  if (!activeViewModeId) {
    return null;
  }
  const viewMode = state.projectConfig.viewModes[activeViewModeId];
  if (!viewMode) {
    return null;
  }
  if (!viewMode.topLevelSections) {
    viewMode.topLevelSections = {};
  }
  return viewMode.topLevelSections;
}
function deleteTopLevelSectionLayout(
  state: ZustandProjectState,
  sectionId: string,
) {
  delete state.projectConfig.topLevelSections[sectionId];
  for (const viewMode of Object.values(state.projectConfig.viewModes)) {
    if (!viewMode.topLevelSections) {
      continue;
    }
    delete viewMode.topLevelSections[sectionId];
  }
}
