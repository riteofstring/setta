import type {
  ConversationEvent,
  ConversationSnapshot,
  NavigatorCursor,
  NavigatorItem,
  NavigatorPage,
} from "@generated/backend";
import { create } from "zustand";

const navigatorPageLimit = 80;

export interface ConversationNavigatorWorkspaceState {
  error: string | null;
  items: readonly NavigatorItem[];
  loading: boolean;
  nextCursor: NavigatorCursor | null;
}

interface ConversationNavigatorStore {
  applyEvent: (event: ConversationEvent) => void;
  applyEvents: (events: readonly ConversationEvent[]) => void;
  loadMore: (workspaceId: string) => Promise<void>;
  query: string;
  resetRuntimeState: () => void;
  setQuery: (query: string) => void;
  syncWorkspaces: (workspaceIds: readonly string[]) => Promise<void>;
  upsertSnapshot: (snapshot: ConversationSnapshot) => void;
  workspaces: Readonly<Record<string, ConversationNavigatorWorkspaceState | undefined>>;
}

type NavigatorMutatingEventType =
  | "conversation.updated"
  | "conversation.presentation_profile.updated"
  | "conversation.branch.created";
type NavigatorIgnoredEventType = Exclude<
  ConversationEvent["payload"]["type"],
  NavigatorMutatingEventType
>;

const navigatorIgnoredEventTypes = {
  "conversation.artifact.created": true,
  "conversation.narration.created": true,
  "conversation.narrator_state.updated": true,
  "conversation.queue.updated": true,
  "conversation.resync_required": true,
  "conversation.role_profile_override.removed": true,
  "conversation.role_profile_override.updated": true,
  "conversation.side_conversation.updated": true,
  "conversation.side_event.appended": true,
  "conversation.thread_binding.updated": true,
  "conversation.trajectory.appended": true,
  "conversation.turn.updated": true,
} satisfies Record<NavigatorIgnoredEventType, true>;

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
    applyEvent: (event) => set((state) => navigatorEventsPatch(state, [event])),
    applyEvents: (events) => set((state) => navigatorEventsPatch(state, events)),
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
    upsertSnapshot: (snapshot) => {
      const workspaceId = snapshot.conversation.workspaceId;
      if (snapshot.conversation.archivedAt !== null) {
        set((state) => removeNavigatorConversation(state, workspaceId, snapshot.conversation.id));
        return;
      }
      // A bounded snapshot is not evidence that the conversation matches the
      // backend-owned navigator query. Keep filtered pages authoritative
      // instead of guessing at full-text search semantics in the renderer.
      if (get().query.trim() !== "" || !activeWorkspaceIds.has(workspaceId)) {
        return;
      }
      const current = get().workspaces[workspaceId] ?? {
        error: null,
        items: [],
        loading: false,
        nextCursor: null,
      };
      const item: NavigatorItem = {
        branch: snapshot.branch,
        conversation: snapshot.conversation,
        presentationProfile: snapshot.presentationProfile,
      };
      set((state) => ({
        workspaces: {
          ...state.workspaces,
          [workspaceId]: {
            ...current,
            items: sortNavigatorItems([
              ...current.items.filter(
                (candidate) => candidate.conversation.id !== snapshot.conversation.id,
              ),
              item,
            ]),
          },
        },
      }));
    },
    workspaces: {},
  };
});

function navigatorEventsPatch(
  state: ConversationNavigatorStore,
  events: readonly ConversationEvent[],
): ConversationNavigatorStore | Pick<ConversationNavigatorStore, "workspaces"> {
  let next: Record<string, ConversationNavigatorWorkspaceState | undefined> | null = null;
  for (const event of events) {
    const workspaces = next ?? state.workspaces;
    const workspace = workspaces[event.workspaceId];
    if (!workspace) {
      continue;
    }
    const items = applyNavigatorEvent(workspace.items, event);
    if (items === workspace.items) {
      continue;
    }
    next ??= { ...state.workspaces };
    next[event.workspaceId] = { ...workspace, items };
  }
  return next ? { workspaces: next } : state;
}

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

function applyNavigatorEvent(
  current: readonly NavigatorItem[],
  event: ConversationEvent,
): readonly NavigatorItem[] {
  switch (event.payload.type) {
    case "conversation.updated": {
      const payload = event.payload;
      if (payload.conversation.archivedAt !== null) {
        return current.filter((item) => item.conversation.id !== event.conversationId);
      }
      return updateNavigatorItem(current, event.conversationId, (item) => ({
        ...item,
        conversation: payload.conversation,
      }));
    }
    case "conversation.presentation_profile.updated": {
      const payload = event.payload;
      return updateNavigatorItem(current, event.conversationId, (item) => ({
        ...item,
        presentationProfile: payload.profile,
      }));
    }
    case "conversation.branch.created": {
      const payload = event.payload;
      return updateNavigatorItem(current, event.conversationId, (item) => ({
        ...item,
        branch: payload.branch,
      }));
    }
    default: {
      const ignoredType: NavigatorIgnoredEventType = event.payload.type;
      void navigatorIgnoredEventTypes[ignoredType];
      return current;
    }
  }
}

function removeNavigatorConversation(
  state: ConversationNavigatorStore,
  workspaceId: string,
  conversationId: string,
): ConversationNavigatorStore | Pick<ConversationNavigatorStore, "workspaces"> {
  const workspace = state.workspaces[workspaceId];
  if (!workspace || !workspace.items.some((item) => item.conversation.id === conversationId)) {
    return state;
  }
  return {
    workspaces: {
      ...state.workspaces,
      [workspaceId]: {
        ...workspace,
        items: workspace.items.filter((item) => item.conversation.id !== conversationId),
      },
    },
  };
}

function updateNavigatorItem(
  current: readonly NavigatorItem[],
  conversationId: string,
  update: (item: NavigatorItem) => NavigatorItem,
): readonly NavigatorItem[] {
  const index = current.findIndex((item) => item.conversation.id === conversationId);
  if (index < 0) {
    return current;
  }
  return sortNavigatorItems(
    current.map((item, candidate) => (candidate === index ? update(item) : item)),
  );
}

function sortNavigatorItems(items: readonly NavigatorItem[]): NavigatorItem[] {
  return [...items].sort(
    (left, right) =>
      right.conversation.updatedAt.localeCompare(left.conversation.updatedAt) ||
      right.conversation.id.localeCompare(left.conversation.id),
  );
}

function assertNavigatorPageOwnership(page: NavigatorPage, workspaceId: string) {
  for (const item of page.items) {
    if (item.conversation.workspaceId !== workspaceId) {
      throw new Error(
        `Conversation ${item.conversation.id} belongs to workspace ${item.conversation.workspaceId}, not ${workspaceId}.`,
      );
    }
    if (item.conversation.archivedAt !== null) {
      throw new Error(`Conversation ${item.conversation.id} is archived.`);
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
