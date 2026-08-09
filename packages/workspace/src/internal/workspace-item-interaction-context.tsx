import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

import type { InteractionInput } from "./interaction-owner.js";
import {
  IDLE_WORKSPACE_INTERACTION_ACTIVATION_STORE,
  itemTreeActivationEnabled,
  type WorkspaceInteractionActivationStore,
} from "./workspace-interaction-activation.js";

type WorkspaceItemInteractionContextValue = Readonly<{
  activation: WorkspaceInteractionActivationStore;
  finish(treeId: string, type: "cancel" | "complete"): void;
  start(treeId: string, input: InteractionInput): boolean;
  zoom: number;
}>;

const STANDALONE_ITEM_INTERACTION: WorkspaceItemInteractionContextValue = {
  activation: IDLE_WORKSPACE_INTERACTION_ACTIVATION_STORE,
  finish: () => undefined,
  start: () => true,
  zoom: 1,
};

const WorkspaceItemInteractionContext = createContext(STANDALONE_ITEM_INTERACTION);

export function WorkspaceItemInteractionProvider({
  activation,
  children,
  finish,
  start,
  zoom,
}: WorkspaceItemInteractionContextValue & Readonly<{ children: ReactNode }>) {
  const value = useMemo<WorkspaceItemInteractionContextValue>(
    () => ({ activation, finish, start, zoom }),
    [activation, finish, start, zoom],
  );
  return (
    <WorkspaceItemInteractionContext.Provider value={value}>
      {children}
    </WorkspaceItemInteractionContext.Provider>
  );
}

export function useWorkspaceItemInteraction(treeId: string) {
  const context = useContext(WorkspaceItemInteractionContext);
  const activation = context.activation;
  const owned = useSyncExternalStore(
    activation.subscribe,
    () => activation.getSnapshot().activeItemTreeId === treeId,
    () => activation.getSnapshot().activeItemTreeId === treeId,
  );
  const enabled = useSyncExternalStore(
    activation.subscribe,
    () => itemTreeMovementEnabled(activation, treeId),
    () => itemTreeMovementEnabled(activation, treeId),
  );
  return {
    enabled,
    finish: (type: "cancel" | "complete") => context.finish(treeId, type),
    owned,
    start: (input: InteractionInput) => context.start(treeId, input),
    zoom: context.zoom,
  };
}

function itemTreeMovementEnabled(
  activation: WorkspaceInteractionActivationStore,
  treeId: string,
): boolean {
  const snapshot = activation.getSnapshot();
  return (
    (itemTreeActivationEnabled(snapshot) && snapshot.activeItemTreeId === null) ||
    snapshot.activeItemTreeId === treeId
  );
}
