import { create } from "zustand";

import type { ConversationPaneResourceBinding } from "@generated/backend";

import type { WorkspaceScene } from "../workspace-layout/types";

export interface ConversationPaneWorkspaceState {
  focusedConversationId: string | null;
  focusedConversationResourceBindings: ConversationPaneResourceBinding[] | null;
  focusedPaneId: string;
  paneIdByConversationId: ReadonlyMap<string, string>;
  resourceBindingsByConversationId: ReadonlyMap<string, ConversationPaneResourceBinding[]>;
}

interface ConversationPaneStore {
  removeWorkspace: (workspaceId: string) => void;
  resetRuntimeState: () => void;
  syncWorkspace: (workspaceId: string, scene: WorkspaceScene, focusedPaneId: string) => void;
  workspaces: ReadonlyMap<string, ConversationPaneWorkspaceState>;
}

export const useConversationPaneStore = create<ConversationPaneStore>((set) => ({
  removeWorkspace: (workspaceId) =>
    set((state) => {
      if (!state.workspaces.has(workspaceId)) {
        return state;
      }
      const workspaces = new Map(state.workspaces);
      workspaces.delete(workspaceId);
      return { workspaces };
    }),
  resetRuntimeState: () => set({ workspaces: new Map() }),
  syncWorkspace: (workspaceId, scene, focusedPaneId) =>
    set((state) => {
      const next = conversationPaneWorkspaceState(scene, focusedPaneId);
      const current = state.workspaces.get(workspaceId);
      if (equalConversationPaneWorkspaceState(current, next)) {
        return state;
      }
      const workspaces = new Map(state.workspaces);
      workspaces.set(workspaceId, next);
      return { workspaces };
    }),
  workspaces: new Map(),
}));

function conversationPaneWorkspaceState(
  scene: WorkspaceScene,
  focusedPaneId: string,
): ConversationPaneWorkspaceState {
  const paneIdByConversationId = new Map<string, string>();
  const resourceBindingsByConversationId = new Map<string, ConversationPaneResourceBinding[]>();
  let focusedConversationId: string | null = null;
  let focusedConversationResourceBindings: ConversationPaneResourceBinding[] | null = null;
  for (const pane of scene.panes) {
    if (pane.surfaceKind !== "conversation") {
      continue;
    }
    const conversationId = pane.conversationConfig.conversationId;
    if (paneIdByConversationId.has(conversationId)) {
      throw new Error(`Conversation ${conversationId} is bound to multiple panes.`);
    }
    paneIdByConversationId.set(conversationId, pane.paneId);
    const resourceBindings = pane.conversationConfig.resourceBindings ?? [];
    resourceBindingsByConversationId.set(conversationId, resourceBindings);
    if (pane.paneId === focusedPaneId) {
      focusedConversationId = conversationId;
      focusedConversationResourceBindings = resourceBindings;
    }
  }
  return {
    focusedConversationId,
    focusedConversationResourceBindings,
    focusedPaneId,
    paneIdByConversationId,
    resourceBindingsByConversationId,
  };
}

function equalConversationPaneWorkspaceState(
  current: ConversationPaneWorkspaceState | undefined,
  next: ConversationPaneWorkspaceState,
) {
  if (!current) {
    return false;
  }
  return (
    equalFocusedConversationPaneState(current, next) && equalConversationPaneMaps(current, next)
  );
}

function equalFocusedConversationPaneState(
  current: ConversationPaneWorkspaceState,
  next: ConversationPaneWorkspaceState,
): boolean {
  return (
    current.focusedConversationId === next.focusedConversationId &&
    equalConversationPaneResourceBindings(
      current.focusedConversationResourceBindings,
      next.focusedConversationResourceBindings,
    ) &&
    current.focusedPaneId === next.focusedPaneId
  );
}

function equalConversationPaneMaps(
  current: ConversationPaneWorkspaceState,
  next: ConversationPaneWorkspaceState,
): boolean {
  if (!equalConversationPaneMapSizes(current, next)) {
    return false;
  }
  for (const [conversationId, nextPaneId] of next.paneIdByConversationId) {
    if (current.paneIdByConversationId.get(conversationId) !== nextPaneId) {
      return false;
    }
    if (
      !equalConversationPaneResourceBindings(
        current.resourceBindingsByConversationId.get(conversationId) ?? [],
        next.resourceBindingsByConversationId.get(conversationId) ?? [],
      )
    ) {
      return false;
    }
  }
  return true;
}

function equalConversationPaneMapSizes(
  current: ConversationPaneWorkspaceState,
  next: ConversationPaneWorkspaceState,
): boolean {
  return (
    current.paneIdByConversationId.size === next.paneIdByConversationId.size &&
    current.resourceBindingsByConversationId.size === next.resourceBindingsByConversationId.size
  );
}

function equalConversationPaneResourceBindings(
  current: readonly ConversationPaneResourceBinding[] | null,
  next: readonly ConversationPaneResourceBinding[] | null,
): boolean {
  if (current === next) {
    return true;
  }
  if (!current || !next || current.length !== next.length) {
    return false;
  }
  return current.every((binding, index) => {
    const nextBinding = next[index];
    if (!nextBinding || binding.kind !== nextBinding.kind) {
      return false;
    }
    return binding.folder.rootPath === nextBinding.folder.rootPath;
  });
}
