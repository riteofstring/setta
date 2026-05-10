import { useDndState } from "forks/dnd-kit/dndState";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";

export function useShouldDisablePointerEvents() {
  const isSortingOrMovingFree = useDndState(
    (x) => x.isSorting || x.isMovingFree,
  );
  const otherSpecialKeysPressed = useGpuFlowViewportStore(
    (x) =>
      x.moveSectionActivationKeyPressed ||
      (x.selectionKeyPressed && Boolean(x.userSelectionRect)) ||
      x.multiSelectionActive ||
      x.zoomActivationKeyPressed,
  );
  return isSortingOrMovingFree || otherSpecialKeysPressed;
}
