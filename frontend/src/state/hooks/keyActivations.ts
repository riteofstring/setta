import { useDndState } from "forks/dnd-kit/dndState";
import { useReactFlow } from "forks/xyflow/core/store";

export function useShouldDisablePointerEvents() {
  const isDragging = useDndState((x) => x.activeId !== null);
  const otherSpecialKeysPressed = useReactFlow(
    (x) =>
      x.moveSectionActivationKeyPressed ||
      (x.selectionKeyPressed && Boolean(x.userSelectionRect)) ||
      x.multiSelectionActive ||
      x.zoomActivationKeyPressed,
  );
  return isDragging || otherSpecialKeysPressed;
}
