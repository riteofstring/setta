import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { InteractionInput } from "./interaction-owner.js";

type WorkspaceItemInteractionContextValue = Readonly<{
  activeTreeId: string | null;
  itemTreeEnabled: boolean;
  finish(treeId: string, type: "cancel" | "complete"): void;
  start(treeId: string, input: InteractionInput): boolean;
  zoom: number;
}>;

const STANDALONE_ITEM_INTERACTION: WorkspaceItemInteractionContextValue = {
  activeTreeId: null,
  finish: () => undefined,
  itemTreeEnabled: true,
  start: () => true,
  zoom: 1,
};

const WorkspaceItemInteractionContext = createContext(STANDALONE_ITEM_INTERACTION);

export function WorkspaceItemInteractionProvider({
  activeTreeId,
  children,
  finish,
  itemTreeEnabled,
  start,
  zoom,
}: WorkspaceItemInteractionContextValue & Readonly<{ children: ReactNode }>) {
  const value = useMemo<WorkspaceItemInteractionContextValue>(
    () => ({ activeTreeId, finish, itemTreeEnabled, start, zoom }),
    [activeTreeId, finish, itemTreeEnabled, start, zoom],
  );
  return (
    <WorkspaceItemInteractionContext.Provider value={value}>
      {children}
    </WorkspaceItemInteractionContext.Provider>
  );
}

export function useWorkspaceItemInteraction(treeId: string) {
  const context = useContext(WorkspaceItemInteractionContext);
  const ownedByThisTree = context.activeTreeId === treeId;
  return {
    enabled: (context.itemTreeEnabled && context.activeTreeId === null) || ownedByThisTree,
    finish: (type: "cancel" | "complete") => context.finish(treeId, type),
    owned: ownedByThisTree,
    start: (input: InteractionInput) => context.start(treeId, input),
    zoom: context.zoom,
  };
}
