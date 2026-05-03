import { GPU_FLOW_SELECTORS } from "gpuFlow/gpuFlowDomClasses";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "utils/constants";

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
  GPU_FLOW_SELECTORS.handle,
  GPU_FLOW_SELECTORS.portalRoot,
  ".section-resize-handle",
  `.${NO_DRAG_CLASS_NAME}`,
  `.${NO_PAN_CLASS_NAME}`,
  `.${NO_WHEEL_CLASS_NAME}`,
] as const;

type ProjectGpuNodeDragGuardInput = {
  readonly isFollowTransitioning: boolean;
  readonly panActivationKeyPressed: boolean;
};

export function isProjectGpuNodeDragDisabled({
  isFollowTransitioning,
  panActivationKeyPressed,
}: ProjectGpuNodeDragGuardInput): boolean {
  return panActivationKeyPressed || isFollowTransitioning;
}

type ProjectGpuEdgeInteractionGuardInput = {
  readonly connectionActive: boolean;
  readonly isFollowTransitioning: boolean;
  readonly userSelectionActive: boolean;
  readonly viewportInteractionActive: boolean;
};

export function isProjectGpuEdgeInteractionDisabled({
  connectionActive,
  isFollowTransitioning,
  userSelectionActive,
  viewportInteractionActive,
}: ProjectGpuEdgeInteractionGuardInput): boolean {
  return (
    connectionActive ||
    isFollowTransitioning ||
    userSelectionActive ||
    viewportInteractionActive
  );
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
