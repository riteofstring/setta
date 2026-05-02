export type ProjectGpuDndMode = {
  readonly isMovingFree: boolean;
  readonly isSorting: boolean;
};

export type ProjectGpuNodeDragGuardInput = {
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

export type ProjectGpuViewportGestureGuardInput = {
  readonly dndMode: ProjectGpuDndMode;
  readonly isFollowTransitioning: boolean;
};

export function isProjectGpuViewportGestureDisabled({
  dndMode,
  isFollowTransitioning,
}: ProjectGpuViewportGestureGuardInput): boolean {
  return isFollowTransitioning || isProjectGpuDndModeActive(dndMode);
}

export type ProjectGpuEdgeInteractionGuardInput = {
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

export type ProjectGpuSelectionGuardInput = {
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

export type ProjectGpuSelectionBoundsShiftInput = {
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

function isProjectGpuDndModeActive(dndMode: ProjectGpuDndMode): boolean {
  return dndMode.isSorting || dndMode.isMovingFree;
}
