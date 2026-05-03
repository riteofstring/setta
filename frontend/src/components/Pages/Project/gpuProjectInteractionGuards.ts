import { GPU_FLOW_SELECTORS } from "gpuFlow/gpuFlowDomClasses";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "utils/constants";

export type ProjectGpuDndMode = {
  readonly isMovingFree: boolean;
  readonly isSorting: boolean;
};

const PROJECT_GPU_PANE_BACKGROUND_ANCESTOR_SELECTORS = [
  "[data-gpu-flow-surface='true']",
  ".setta-gpu-flow",
] as const;

const PROJECT_GPU_PANE_BACKGROUND_TARGET_SELECTORS = [
  GPU_FLOW_SELECTORS.root,
  GPU_FLOW_SELECTORS.pane,
] as const;

const PROJECT_GPU_PANE_NON_BACKGROUND_SELECTORS = [
  ".setta-gpu-flow__node",
  GPU_FLOW_SELECTORS.node,
  GPU_FLOW_SELECTORS.nodesSelectionRect,
  GPU_FLOW_SELECTORS.selection,
  GPU_FLOW_SELECTORS.handle,
  GPU_FLOW_SELECTORS.portalRoot,
  ".section-resize-handle",
  `.${NO_DRAG_CLASS_NAME}`,
  `.${NO_PAN_CLASS_NAME}`,
  `.${NO_WHEEL_CLASS_NAME}`,
] as const;

type ProjectGpuNodeDragGuardInput = {
  readonly dndMode: ProjectGpuDndMode;
  readonly isFollowTransitioning: boolean;
  readonly panActivationKeyPressed: boolean;
};

export function isProjectGpuNodeDragDisabled({
  dndMode,
  isFollowTransitioning,
  panActivationKeyPressed,
}: ProjectGpuNodeDragGuardInput): boolean {
  return (
    panActivationKeyPressed ||
    isFollowTransitioning ||
    dndMode.isSorting ||
    dndMode.isMovingFree
  );
}

type ProjectGpuViewportGestureGuardInput = {
  readonly dndMode: ProjectGpuDndMode;
};

export function isProjectGpuViewportGestureDisabled({
  dndMode,
}: ProjectGpuViewportGestureGuardInput): boolean {
  return isProjectGpuDndModeActive(dndMode);
}

type ProjectGpuEdgeInteractionGuardInput = {
  readonly connectionActive: boolean;
  readonly dndMode: ProjectGpuDndMode;
  readonly isDndActive: boolean;
  readonly isFollowTransitioning: boolean;
  readonly userSelectionActive: boolean;
  readonly viewportInteractionActive: boolean;
};

export function isProjectGpuEdgeInteractionDisabled({
  connectionActive,
  dndMode,
  isDndActive,
  isFollowTransitioning,
  userSelectionActive,
  viewportInteractionActive,
}: ProjectGpuEdgeInteractionGuardInput): boolean {
  return (
    connectionActive ||
    isDndActive ||
    isFollowTransitioning ||
    userSelectionActive ||
    viewportInteractionActive ||
    isProjectGpuDndModeActive(dndMode)
  );
}

type ProjectGpuSelectionGuardInput = {
  readonly dndMode: ProjectGpuDndMode;
};

export function isProjectGpuSelectionDisabled({
  dndMode,
}: ProjectGpuSelectionGuardInput): boolean {
  return isProjectGpuDndModeActive(dndMode);
}

export function isProjectGpuSelectionBoxDragDisabled({
  dndMode,
}: ProjectGpuSelectionGuardInput): boolean {
  return isProjectGpuDndModeActive(dndMode);
}

type ProjectGpuSelectionBoundsShiftInput = {
  readonly activeSelectedNodeIds: readonly string[];
  readonly movedNodeIds: readonly string[];
};

export function shouldShiftProjectGpuSelectionBoundsForNodeMove({
  activeSelectedNodeIds,
  movedNodeIds,
}: ProjectGpuSelectionBoundsShiftInput): boolean {
  if (activeSelectedNodeIds.length === 0) {
    return false;
  }
  const movedIds = new Set(movedNodeIds);
  if (movedIds.size !== activeSelectedNodeIds.length) {
    return false;
  }
  return activeSelectedNodeIds.every((nodeId) => movedIds.has(nodeId));
}

export function isProjectPaneBackgroundTarget(target: EventTarget): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (
    closestMatchesAnyProjectPaneSelector(
      target,
      PROJECT_GPU_PANE_NON_BACKGROUND_SELECTORS,
    )
  ) {
    return false;
  }
  return (
    targetMatchesAnyProjectPaneSelector(
      target,
      PROJECT_GPU_PANE_BACKGROUND_TARGET_SELECTORS,
    ) ||
    closestMatchesAnyProjectPaneSelector(
      target,
      PROJECT_GPU_PANE_BACKGROUND_ANCESTOR_SELECTORS,
    )
  );
}

function isProjectGpuDndModeActive(dndMode: ProjectGpuDndMode): boolean {
  return dndMode.isSorting || dndMode.isMovingFree;
}

function closestMatchesAnyProjectPaneSelector(
  target: Element,
  selectors: readonly string[],
): boolean {
  return selectors.some((selector) => target.closest(selector) !== null);
}

function targetMatchesAnyProjectPaneSelector(
  target: Element,
  selectors: readonly string[],
): boolean {
  return selectors.some((selector) => target.matches(selector));
}
