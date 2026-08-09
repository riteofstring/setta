import { useReactFlow } from "./store";

// The reference suppresses section pointer events while a marquee selection is being drawn or a
// multi-select/zoom activation key is held. The dnd-mode half of the reference hook (sorting or
// free-moving) arrives with the dnd batch that owns that state.
export function useShouldDisablePointerEvents() {
  return useReactFlow(
    (x) =>
      (x.selectionKeyPressed && Boolean(x.userSelectionRect)) ||
      x.multiSelectionActive ||
      x.zoomActivationKeyPressed,
  );
}
