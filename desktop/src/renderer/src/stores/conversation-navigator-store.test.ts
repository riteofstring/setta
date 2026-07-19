import type {
  ConversationEvent,
  ConversationSnapshot,
  ListTopicConversationsRequest,
  NavigatorItem,
  NavigatorPage,
} from "@generated/backend";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useConversationNavigatorStore } from "./conversation-navigator-store";

describe("conversation navigator store", () => {
  beforeEach(() => {
    useConversationNavigatorStore.getState().resetRuntimeState();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("loads independent workspace pages through the typed API", async () => {
    const list = vi.fn(
      async (request: { workspaceId: string }): Promise<NavigatorPage> => ({
        items: [navigatorItem(`conversation_${request.workspaceId}`, request.workspaceId)],
        nextCursor: null,
      }),
    );
    installConversationAPI(list);

    await useConversationNavigatorStore
      .getState()
      .syncWorkspaces(["workspace_api", "workspace_web"]);

    expect(list).toHaveBeenCalledTimes(2);
    expect(
      useConversationNavigatorStore.getState().workspaces.workspace_api?.items[0]?.conversation.id,
    ).toBe("conversation_workspace_api");
    expect(
      useConversationNavigatorStore.getState().workspaces.workspace_web?.items[0]?.conversation.id,
    ).toBe("conversation_workspace_web");
  });

  test("appends a keyset page without duplicating a conversation", async () => {
    const cursor = { conversationId: "conversation_a", updatedAt: testTime };
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [navigatorItem("conversation_a", "workspace_api")],
        nextCursor: cursor,
      })
      .mockResolvedValueOnce({
        items: [
          navigatorItem("conversation_a", "workspace_api"),
          navigatorItem("conversation_b", "workspace_api"),
        ],
        nextCursor: null,
      });
    installConversationAPI(list);

    await useConversationNavigatorStore.getState().syncWorkspaces(["workspace_api"]);
    await useConversationNavigatorStore.getState().loadMore("workspace_api");

    expect(list).toHaveBeenLastCalledWith({
      cursor,
      limit: 80,
      query: "",
      workspaceId: "workspace_api",
    });
    expect(
      useConversationNavigatorStore
        .getState()
        .workspaces.workspace_api?.items.map((item) => item.conversation.id),
    ).toEqual(["conversation_a", "conversation_b"]);
  });

  test("does not restore a workspace removed while its page is loading", async () => {
    let resolvePage: ((page: NavigatorPage) => void) | undefined;
    installConversationAPI(
      vi.fn(
        () =>
          new Promise<NavigatorPage>((resolve) => {
            resolvePage = resolve;
          }),
      ),
    );

    const initialLoad = useConversationNavigatorStore.getState().syncWorkspaces(["workspace_api"]);
    await useConversationNavigatorStore.getState().syncWorkspaces([]);
    resolvePage?.({
      items: [navigatorItem("conversation_removed", "workspace_api")],
      nextCursor: null,
    });
    await initialLoad;

    expect(useConversationNavigatorStore.getState().workspaces).toEqual({});
  });

  test("exposes cross-workspace ownership failures instead of accepting the page", async () => {
    installConversationAPI(
      vi.fn(async () => ({
        items: [navigatorItem("conversation_wrong", "workspace_web")],
        nextCursor: null,
      })),
    );

    await useConversationNavigatorStore.getState().syncWorkspaces(["workspace_api"]);

    expect(useConversationNavigatorStore.getState().workspaces.workspace_api).toMatchObject({
      error: expect.stringContaining("belongs to workspace workspace_web"),
      items: [],
      loading: false,
    });
  });

  test("adds a newly created snapshot to an active navigator", async () => {
    installConversationAPI(vi.fn(async () => ({ items: [], nextCursor: null })));
    await useConversationNavigatorStore.getState().syncWorkspaces(["workspace_api"]);

    useConversationNavigatorStore
      .getState()
      .upsertSnapshot(navigatorSnapshot("conversation_unmatched", "workspace_api"));

    expect(
      useConversationNavigatorStore.getState().workspaces.workspace_api?.items[0]?.conversation.id,
    ).toBe("conversation_unmatched");
  });

  test("removes archived conversations from snapshots and live projection events", async () => {
    installConversationAPI(
      vi.fn(async () => ({
        items: [
          navigatorItem("conversation_snapshot", "workspace_api"),
          navigatorItem("conversation_event", "workspace_api"),
        ],
        nextCursor: null,
      })),
    );
    await useConversationNavigatorStore.getState().syncWorkspaces(["workspace_api"]);

    const archivedSnapshot = navigatorSnapshot("conversation_snapshot", "workspace_api");
    archivedSnapshot.conversation.archivedAt = "2026-07-11T20:01:00Z";
    archivedSnapshot.conversation.updatedAt = archivedSnapshot.conversation.archivedAt;
    useConversationNavigatorStore.getState().upsertSnapshot(archivedSnapshot);

    const archivedEventConversation = navigatorItem(
      "conversation_event",
      "workspace_api",
    ).conversation;
    archivedEventConversation.archivedAt = "2026-07-11T20:02:00Z";
    archivedEventConversation.updatedAt = archivedEventConversation.archivedAt;
    useConversationNavigatorStore
      .getState()
      .applyEvent(conversationUpdatedEvent(archivedEventConversation));

    expect(useConversationNavigatorStore.getState().workspaces.workspace_api?.items).toEqual([]);
  });

  test("rejects an archived conversation returned by the navigator endpoint", async () => {
    const archived = navigatorItem("conversation_archived", "workspace_api");
    archived.conversation.archivedAt = "2026-07-11T20:01:00Z";
    archived.conversation.updatedAt = archived.conversation.archivedAt;
    installConversationAPI(vi.fn(async () => ({ items: [archived], nextCursor: null })));

    await useConversationNavigatorStore.getState().syncWorkspaces(["workspace_api"]);

    expect(useConversationNavigatorStore.getState().workspaces.workspace_api).toMatchObject({
      error: expect.stringContaining("is archived"),
      items: [],
      loading: false,
    });
  });
});

const testTime = "2026-07-11T20:00:00Z";

function installConversationAPI(
  list: (request: ListTopicConversationsRequest) => Promise<NavigatorPage>,
) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: { conversations: { list } } },
  });
}

function navigatorItem(id: string, workspaceId: string): NavigatorItem {
  return {
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: testTime,
      id,
      lastTrajectorySequence: 0,
      status: "idle",
      title: id,
      topicDescriptor: "",
      updatedAt: testTime,
      workspaceId,
    },
    presentationProfile: {
      conversationId: id,
      narratorSpeechEnabled: true,
      narratorVoiceReuse: null,
      narratorVoiceSelection: "auto_distinct",
      paletteReuse: null,
      paletteSelection: "auto_distinct",
      requestedNarratorVoiceId: null,
      requestedPaletteId: null,
      resolvedNarratorVoiceId: "alloy",
      resolvedPaletteId: "sky",
      updatedAt: testTime,
    },
  };
}

function navigatorSnapshot(id: string, workspaceId: string): ConversationSnapshot {
  const item = navigatorItem(id, workspaceId);
  return {
    artifacts: { artifacts: [], hasEarlier: false },
    branch: null,
    conversation: item.conversation,
    eventCursor: { sequence: 0, streamId: `conversation:${id}` },
    narration: { events: [], hasEarlier: false },
    narratorState: {
      checkpointText: "",
      checkpointThroughSequence: 0,
      conversationId: id,
      currentFocus: "",
      currentFocusRevision: 0,
      currentFocusSourceSequence: 0,
      degradation: null,
      lastInvocationAt: null,
      observedThroughSequence: 0,
      status: "ready",
      topicDescriptor: "",
      updatedAt: testTime,
    },
    pendingApprovals: [],
    presentationProfile: item.presentationProfile,
    queue: [],
    roleProfileOverrides: [],
    schemaVersion: 1,
    sideConversations: [],
    sideEvents: { events: [], hasEarlier: false, limit: 200 },
    threadBinding: null,
    trajectory: { events: [], hasEarlier: false },
    turns: { hasEarlier: false, turns: [] },
  };
}

function conversationUpdatedEvent(conversation: NavigatorItem["conversation"]): ConversationEvent {
  return {
    conversationId: conversation.id,
    emittedAt: conversation.updatedAt,
    eventId: `conversation:${conversation.id}:1`,
    payload: { conversation, type: "conversation.updated" },
    schemaVersion: 1,
    sequence: 1,
    streamId: `conversation:${conversation.id}`,
    workspaceId: conversation.workspaceId,
  };
}
