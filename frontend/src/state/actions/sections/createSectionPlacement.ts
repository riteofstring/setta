import { useReactFlow } from "forks/xyflow/core/store";
import { getPaneRect } from "forks/xyflow/core/utils/graph";
import { useNodeInternals, useProjectState } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  type TopLevelSectionLayout,
  type ViewportBounds,
} from "utils/generatedTypes";
import { createTopLevelSectionLayoutDict } from "../topLevelSectionLayouts";

export type SmartPlacementContext = {
  topLevelSections: Record<string, TopLevelSectionLayout>;
  viewportBounds: ViewportBounds | null;
};

function getTopLevelSectionLayoutSnapshot() {
  const projectState = useProjectState.getState();
  const nodeInternals = useNodeInternals.getState().x;
  if (nodeInternals.size === 0) {
    return { ...projectState.projectConfig.topLevelSections };
  }
  return createTopLevelSectionLayoutDict(
    projectState.sections,
    nodeInternals,
    projectState.projectConfig.topLevelSections,
  );
}

function getViewportBoundsForPlacement(): ViewportBounds | null {
  const reactFlowState = useReactFlow.getState();
  const { width, height } = reactFlowState;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;
  const uiEditorWidth = useLocalStorage.getState().uiEditorTrueWidth;
  const paneRect = getPaneRect(reactFlowState, overviewWidth, uiEditorWidth);
  if (paneRect.width <= 0 || paneRect.height <= 0) {
    return null;
  }
  return {
    x: paneRect.x,
    y: paneRect.y,
    w: paneRect.width,
    h: paneRect.height,
  };
}

export function getSmartPlacementContext(): SmartPlacementContext {
  return {
    topLevelSections: getTopLevelSectionLayoutSnapshot(),
    viewportBounds: getViewportBoundsForPlacement(),
  };
}

export function getEmptySpacePosition() {
  const viewportBounds = getViewportBoundsForPlacement();
  const positionOffset = { x: 10, y: 10 };
  if (viewportBounds) {
    return {
      x: viewportBounds.x + positionOffset.x,
      y: viewportBounds.y + positionOffset.y,
    };
  }
  const {
    transform: [xOffset, yOffset, zoom],
  } = useReactFlow.getState();
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;
  const x = (overviewWidth - xOffset) / zoom;
  const y = -yOffset / zoom;
  return { x: x + positionOffset.x, y: y + positionOffset.y };
}
