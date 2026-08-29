import { createContext, useContext } from "react";
import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";

// The reference's param-select mode (`isSelectingParams` on `useMisc`, held active by the
// `paramSelect` shortcut through `activateParamSelect`/`deactivateParamSelect`): runtime
// interaction state, not part of the controlled document. Selection toggles and section clicks
// consult it through the active-section policy, the dnd monitor gates item drags on it, and
// the canvas key activations hold it through the Mod+Shift chord; hosts may also drive it
// directly through these actions.

export type ItemSelectionModeState = { isSelectingItems: boolean };

function createItemSelectionModeStore() {
  return createStore(
    withResetFn<ItemSelectionModeState>(() => ({
      isSelectingItems: false,
    })),
  );
}

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createItemSelectionModeStore>
>();

export function getItemSelectionModeStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createItemSelectionModeStore();
  storesByHost.set(host, store);
  return store;
}

export function useItemSelectionMode<T>(
  selector: (state: ItemSelectionModeState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getItemSelectionModeStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

// Canvas rows suppress their editors while item-selection mode owns pointer input. The Inspector
// renders the editable item label in a separate configuration surface, so its subtree opts out
// without changing the global mode or making multi-item selection unreachable.
export const ItemSelectionModeAffectsControlsContext = createContext(true);

export function useItemSelectionModeForControl(): boolean {
  const affectsControls = useContext(ItemSelectionModeAffectsControlsContext);
  return useItemSelectionMode(
    (state) => affectsControls && state.isSelectingItems,
  );
}

export function activateItemSelect(host: WorkspaceHost) {
  getItemSelectionModeStore(host).setState({ isSelectingItems: true });
}

export function deactivateItemSelect(host: WorkspaceHost) {
  getItemSelectionModeStore(host).setState({ isSelectingItems: false });
}
