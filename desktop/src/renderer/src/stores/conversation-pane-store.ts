import { create } from "zustand";

import type { WorkspaceScene } from "../workspace-layout/types";

export interface ConversationPaneWorkspaceState {
  focusedConversationId: string | null;
  paneIdsByConversationId: ReadonlyMap<string, readonly string[]>;
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
  const paneIdsByConversationId = new Map<string, string[]>();
  let focusedConversationId: string | null = null;
  for (const pane of scene.panes) {
    const conversationId = pane.easyButtonConfig?.conversationId;
    if (pane.surfaceKind !== "easy-button" || !conversationId) {
      continue;
    }
    const paneIds = paneIdsByConversationId.get(conversationId) ?? [];
    paneIds.push(pane.paneId);
    paneIdsByConversationId.set(conversationId, paneIds);
    if (pane.paneId === focusedPaneId) {
      focusedConversationId = conversationId;
    }
  }
  return { focusedConversationId, paneIdsByConversationId };
}

function equalConversationPaneWorkspaceState(
  current: ConversationPaneWorkspaceState | undefined,
  next: ConversationPaneWorkspaceState,
) {
  if (
    !current ||
    current.focusedConversationId !== next.focusedConversationId ||
    current.paneIdsByConversationId.size !== next.paneIdsByConversationId.size
  ) {
    return false;
  }
  for (const [conversationId, nextPaneIds] of next.paneIdsByConversationId) {
    const currentPaneIds = current.paneIdsByConversationId.get(conversationId);
    if (
      !currentPaneIds ||
      currentPaneIds.length !== nextPaneIds.length ||
      currentPaneIds.some((paneId, index) => paneId !== nextPaneIds[index])
    ) {
      return false;
    }
  }
  return true;
}
