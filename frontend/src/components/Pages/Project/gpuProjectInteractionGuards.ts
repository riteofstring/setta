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
