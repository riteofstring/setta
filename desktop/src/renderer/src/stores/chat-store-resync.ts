import type {
  BackgroundTerminalListProjection,
  Conversation,
  ListConversationsResponse,
  MessagePage,
  Run,
  RunLiveness,
} from "@generated/backend";

import { isChatBackendLifecycleAbort } from "./chat-store-backend-lifecycle";
import { backgroundTerminalsReplacedPatch } from "./chat-store-background-terminals";
import { conversationListLoadedPatch } from "./chat-store-conversation-lists";
import { errorPatch } from "./chat-store-helpers";
import type { ChatOperationToken } from "./chat-store-operations";
import { emptyConversationPatch, resyncPagePatch } from "./chat-store-page-patches";
import type { ChatPatch, ChatStore } from "./chat-store-types";

interface ConversationPageSnapshot {
  activeRun: Run | null;
  activeRunLiveness: RunLiveness | null;
  backgroundTerminals: BackgroundTerminalListProjection;
  page: MessagePage;
}

interface ChatResyncControllerDeps {
  assertBackendReadCurrent: (generation: number) => void;
  backendOnline: () => boolean;
  backendReadGeneration: () => number;
  beginOperation: (scope: "eventResync", patch: ChatPatch) => ChatOperationToken;
  cancelEventResyncOperation: (patch?: ChatPatch) => void;
  commitCurrent: (token: ChatOperationToken, patch: ChatPatch) => void;
  commitCurrentFromState: (
    token: ChatOperationToken,
    patchForState: (state: ChatStore) => ChatPatch,
  ) => void;
  get: () => ChatStore;
  loadConversationPageSnapshot: (
    workspaceId: string,
    conversation: Conversation,
    generation: number,
  ) => Promise<ConversationPageSnapshot>;
  reloadConversations: (
    workspaceId: string,
    generation: number,
  ) => Promise<ListConversationsResponse>;
}

export function createChatResyncController(deps: ChatResyncControllerDeps) {
  let resyncPromise: Promise<void> | null = null;
  let resyncQueued = false;

  async function runSingleResync() {
    const request = beginResyncRequest(deps);
    if (!request) {
      return;
    }
    const operation = deps.beginOperation("eventResync", {
      error: null,
      operation: "refreshing",
    });
    try {
      await loadAndCommitResync(deps, operation, request);
    } catch (error) {
      completeFailedResync(deps, operation, error);
    }
  }

  async function resyncActiveConversation() {
    if (!deps.backendOnline()) {
      deps.cancelEventResyncOperation({});
      return;
    }
    if (resyncPromise) {
      resyncQueued = true;
      return resyncPromise;
    }
    resyncPromise = (async () => {
      do {
        resyncQueued = false;
        await runSingleResync();
      } while (resyncQueued && deps.backendOnline());
    })().finally(() => {
      resyncPromise = null;
      resyncQueued = false;
    });
    return resyncPromise;
  }

  return {
    clearQueuedResync: () => {
      resyncQueued = false;
    },
    resyncActiveConversation,
  };
}

function beginResyncRequest(
  deps: ChatResyncControllerDeps,
): { generation: number; selectedConversation: Conversation | null; workspaceId: string } | null {
  const { selectedConversation, workspaceId } = deps.get();
  if (!workspaceId) {
    return null;
  }
  try {
    return { generation: deps.backendReadGeneration(), selectedConversation, workspaceId };
  } catch (error) {
    if (isChatBackendLifecycleAbort(error)) {
      deps.cancelEventResyncOperation({});
      return null;
    }
    throw error;
  }
}

async function loadAndCommitResync(
  deps: ChatResyncControllerDeps,
  operation: ChatOperationToken,
  request: { generation: number; selectedConversation: Conversation | null; workspaceId: string },
) {
  const { generation, selectedConversation, workspaceId } = request;
  const list = await deps.reloadConversations(workspaceId, generation);
  const nextConversation = nextResyncConversation(list, selectedConversation, workspaceId);
  const snapshot = nextConversation
    ? await deps.loadConversationPageSnapshot(workspaceId, nextConversation, generation)
    : null;
  deps.assertBackendReadCurrent(generation);
  deps.commitCurrentFromState(operation, (current) => ({
    ...(snapshot
      ? {
          ...resyncPagePatch(
            current,
            snapshot.page,
            snapshot.activeRun,
            snapshot.activeRunLiveness,
          ),
          ...backgroundTerminalsReplacedPatch(
            current,
            snapshot.page.conversation.id,
            snapshot.backgroundTerminals.terminals,
          ),
        }
      : emptyConversationPatch()),
    ...conversationListLoadedPatch(current, workspaceId, list, true),
    operation: null,
    selectedConversation: nextConversation,
    status: "ready",
  }));
}

function nextResyncConversation(
  list: ListConversationsResponse,
  selectedConversation: Conversation | null,
  workspaceId: string,
) {
  if (!selectedConversation || selectedConversation.workspaceId !== workspaceId) {
    return list.conversations[0]?.conversation ?? null;
  }
  return (
    list.conversations.find((item) => item.conversation.id === selectedConversation.id)
      ?.conversation ?? selectedConversation
  );
}

function completeFailedResync(
  deps: ChatResyncControllerDeps,
  operation: ChatOperationToken,
  error: unknown,
) {
  if (isChatBackendLifecycleAbort(error)) {
    deps.commitCurrent(operation, { operation: null });
    return;
  }
  deps.commitCurrent(operation, errorPatch(error));
}
