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

export function activateItemSelect() {
  useItemSelectionMode.setState({ isSelectingItems: true });
}

export function deactivateItemSelect() {
  useItemSelectionMode.setState({ isSelectingItems: false });
}
