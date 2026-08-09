import { useDndState } from "../dnd/dndState";
import { useReactFlow } from "./store";

// The reference suppresses section pointer events while a dnd mode is held (sorting or free
// move), while a marquee selection is being drawn, or while a multi-select/zoom activation key
// is held. Its `moveSectionActivationKeyPressed` term is dropped: that key has no shipped
// default binding, so the branch is unreachable in the reference.
export function useShouldDisablePointerEvents() {
  const isSortingOrMovingFree = useDndState((x) => x.isSorting || x.isMovingFree);
  const otherActivationPressed = useReactFlow(
    (x) =>
      (x.selectionKeyPressed && Boolean(x.userSelectionRect)) ||
      x.multiSelectionActive ||
      x.zoomActivationKeyPressed,
  );
  return isSortingOrMovingFree || otherActivationPressed;
}
