import { addNodes, moveNodes } from "state/actions/nodeInternals";
import { useNodeInternals, type ZustandProjectState } from "state/definitions";
import { type Position } from "utils/generatedTypes";

export function moveSectionsToPane({
  sectionIds,
  positionsById,
  state,
}: {
  sectionIds: string[];
  positionsById: Record<string, Position> | null;
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
