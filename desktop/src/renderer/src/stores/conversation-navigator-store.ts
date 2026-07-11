import type { NavigatorCursor, NavigatorItem, NavigatorPage } from "@generated/backend";
import { create } from "zustand";

const navigatorPageLimit = 80;

export interface ConversationNavigatorWorkspaceState {
  error: string | null;
  items: readonly NavigatorItem[];
  loading: boolean;
  nextCursor: NavigatorCursor | null;
}

interface ConversationNavigatorStore {
  loadMore: (workspaceId: string) => Promise<void>;
  query: string;
  resetRuntimeState: () => void;
  setQuery: (query: string) => void;
  syncWorkspaces: (workspaceIds: readonly string[]) => Promise<void>;
  workspaces: Readonly<Record<string, ConversationNavigatorWorkspaceState | undefined>>;
}

export const useConversationNavigatorStore = create<ConversationNavigatorStore>((set, get) => {
  let generation = 0;
  let activeWorkspaceIds = new Set<string>();

  async function loadPage(workspaceId: string, cursor: NavigatorCursor | null) {
    const requestGeneration = generation;
    const query = get().query;
    set((state) => ({
      workspaces: {
        ...state.workspaces,
        [workspaceId]: {
          error: null,
          items: cursor ? (state.workspaces[workspaceId]?.items ?? []) : [],
          loading: true,
          nextCursor: cursor,
        },
      },
    }));
    try {
      const page = await window.setta.conversations.list({
        cursor,
        limit: navigatorPageLimit,
        query,
        workspaceId,
      });
      if (requestGeneration !== generation || !activeWorkspaceIds.has(workspaceId)) {
        return;
      }
      assertNavigatorPageOwnership(page, workspaceId);
      set((state) => ({
        workspaces: {
          ...state.workspaces,
          [workspaceId]: loadedWorkspaceState(
            cursor ? (state.workspaces[workspaceId]?.items ?? []) : [],
            page,
          ),
        },
      }));
    } catch (error) {
      if (requestGeneration !== generation || !activeWorkspaceIds.has(workspaceId)) {
        return;
      }
      set((state) => ({
        workspaces: {
          ...state.workspaces,
          [workspaceId]: {
            error: errorMessage(error),
            items: state.workspaces[workspaceId]?.items ?? [],
            loading: false,
            nextCursor: cursor,
          },
        },
      }));
    }
  }

  return {
    loadMore: async (workspaceId) => {
      const workspace = get().workspaces[workspaceId];
      if (!workspace || workspace.loading || !workspace.nextCursor) {
        return;
      }
      await loadPage(workspaceId, workspace.nextCursor);
    },
    query: "",
    resetRuntimeState: () => {
      generation += 1;
      activeWorkspaceIds = new Set();
      set({ query: "", workspaces: {} });
    },
    setQuery: (query) => {
      if (query === get().query) {
        return;
      }
      generation += 1;
      set({ query, workspaces: {} });
    },
    syncWorkspaces: async (workspaceIds) => {
      activeWorkspaceIds = new Set(workspaceIds);
      set((state) => ({
        workspaces: retainActiveWorkspaces(state.workspaces, activeWorkspaceIds),
      }));
      await Promise.all(
        workspaceIds.map(async (workspaceId) => {
          if (get().workspaces[workspaceId]) {
            return;
          }
          await loadPage(workspaceId, null);
        }),
      );
    },
    workspaces: {},
  };
});

function loadedWorkspaceState(
  currentItems: readonly NavigatorItem[],
  page: NavigatorPage,
): ConversationNavigatorWorkspaceState {
  const byConversationId = new Map(
    currentItems.map((item) => [item.conversation.id, item] as const),
  );
  for (const item of page.items) {
    byConversationId.set(item.conversation.id, item);
  }
  return {
    error: null,
    items: [...byConversationId.values()],
    loading: false,
    nextCursor: page.nextCursor,
  };
}

function assertNavigatorPageOwnership(page: NavigatorPage, workspaceId: string) {
  for (const item of page.items) {
    if (item.conversation.workspaceId !== workspaceId) {
      throw new Error(
        `Conversation ${item.conversation.id} belongs to workspace ${item.conversation.workspaceId}, not ${workspaceId}.`,
      );
    }
    if (item.presentationProfile.conversationId !== item.conversation.id) {
      throw new Error(
        `Conversation ${item.conversation.id} has a mismatched presentation profile.`,
      );
    }
    if (item.branch && item.branch.childConversationId !== item.conversation.id) {
      throw new Error(`Conversation ${item.conversation.id} has mismatched fork lineage.`);
    }
  }
}

function retainActiveWorkspaces(
  workspaces: Readonly<Record<string, ConversationNavigatorWorkspaceState | undefined>>,
  activeWorkspaceIds: ReadonlySet<string>,
) {
  const retained: Record<string, ConversationNavigatorWorkspaceState> = {};
  for (const [workspaceId, state] of Object.entries(workspaces)) {
    if (state && activeWorkspaceIds.has(workspaceId)) {
      retained[workspaceId] = state;
    }
  }
  return retained;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Conversation navigator request failed";
}
