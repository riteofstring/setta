import { useDndState } from "../dnd/dndState";
import { useReactFlow } from "./store";

export function useShouldDisablePointerEvents() {
  const isSortingOrMovingFree = useDndState(
    (x) => x.isSorting || x.isMovingFree,
  );
  const otherActivationPressed = useReactFlow(
    (x) =>
      (x.selectionKeyPressed && Boolean(x.userSelectionRect)) ||
      x.multiSelectionActive ||
      x.zoomActivationKeyPressed,
  );
  return isSortingOrMovingFree || otherActivationPressed;
}
