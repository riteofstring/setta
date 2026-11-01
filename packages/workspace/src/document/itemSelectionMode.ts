import { createContext, useContext } from "react";
import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils.js";
import {
  useWorkspaceHost,
  useWorkspaceStore,
} from "../workspaceHostContext.js";
import { createHostStoreGetter } from "../state/hostStore.js";
import type { WorkspaceHost } from "../workspaceHost.js";

export type ItemSelectionModeState = { isSelectingItems: boolean };

function createItemSelectionModeStore() {
  return createStore(
    withResetFn<ItemSelectionModeState>(() => ({
      isSelectingItems: false,
    })),
  );
}

export const getItemSelectionModeStore = createHostStoreGetter(
  createItemSelectionModeStore,
);

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
