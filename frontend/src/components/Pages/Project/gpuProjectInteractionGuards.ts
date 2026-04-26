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
