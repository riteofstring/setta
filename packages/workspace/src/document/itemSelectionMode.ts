import { createContext, useContext } from "react";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";

// The reference's param-select mode (`isSelectingParams` on `useMisc`, held active by the
// `paramSelect` shortcut through `activateParamSelect`/`deactivateParamSelect`): runtime
// interaction state, not part of the controlled document. Selection toggles and section clicks
// consult it through the active-section policy, the dnd monitor gates item drags on it, and
// the canvas key activations hold it through the Mod+Shift chord; hosts may also drive it
// directly through these actions.

export type ItemSelectionModeState = { isSelectingItems: boolean };

export const useItemSelectionMode = createWithEqualityFn(
  withResetFn<ItemSelectionModeState>(() => ({
    isSelectingItems: false,
  })),
);

// Canvas rows suppress their editors while item-selection mode owns pointer input. The Inspector
// renders the editable item label in a separate configuration surface, so its subtree opts out
// without changing the global mode or making multi-item selection unreachable.
export const ItemSelectionModeAffectsControlsContext = createContext(true);

export function useItemSelectionModeForControl(): boolean {
  const affectsControls = useContext(ItemSelectionModeAffectsControlsContext);
  return useItemSelectionMode((state) => affectsControls && state.isSelectingItems);
}

export function activateItemSelect() {
  useItemSelectionMode.setState({ isSelectingItems: true });
}

export function deactivateItemSelect() {
  useItemSelectionMode.setState({ isSelectingItems: false });
}
