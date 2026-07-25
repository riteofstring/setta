import { create } from "zustand";

import type { WorkspaceScene } from "../workspace-layout/types";

export interface ConversationPaneWorkspaceState {
  focusedConversationId: string | null;
  focusedPaneId: string;
  paneIdByConversationId: ReadonlyMap<string, string>;
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
  let focusedConversationId: string | null = null;
  for (const pane of scene.panes) {
    if (pane.surfaceKind !== "easy-button") {
      continue;
    }
    const conversationId = pane.easyButtonConfig.conversationId;
    if (paneIdByConversationId.has(conversationId)) {
      throw new Error(`Conversation ${conversationId} is bound to multiple panes.`);
    }
    paneIdByConversationId.set(conversationId, pane.paneId);
    if (pane.paneId === focusedPaneId) {
      focusedConversationId = conversationId;
    }
  }
  return { focusedConversationId, focusedPaneId, paneIdByConversationId };
}

function equalConversationPaneWorkspaceState(
  current: ConversationPaneWorkspaceState | undefined,
  next: ConversationPaneWorkspaceState,
) {
  if (
    !current ||
    current.focusedConversationId !== next.focusedConversationId ||
    current.focusedPaneId !== next.focusedPaneId ||
    current.paneIdByConversationId.size !== next.paneIdByConversationId.size
  ) {
    return false;
  }
  for (const [conversationId, nextPaneId] of next.paneIdByConversationId) {
    if (current.paneIdByConversationId.get(conversationId) !== nextPaneId) {
      return false;
    }
  }
  return true;
}
