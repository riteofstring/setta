import type {
  ChatMessage,
  Conversation,
  ConversationListItem,
  MessagePage,
  Run,
} from "@generated/backend";
import { create } from "zustand";

type ChatStatus = "idle" | "loading" | "ready" | "error";
type ChatOperation =
  | "approving"
  | "cancelling"
  | "creating"
  | "loading"
  | "loadingOlder"
  | "refreshing"
  | "sending"
  | null;

interface ChatStore {
  activeRun: Run | null;
  conversations: ConversationListItem[];
  error: string | null;
  hasMoreOlder: boolean;
  loadOlder: () => Promise<void>;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  messages: ChatMessage[];
  operation: ChatOperation;
  refreshActiveConversation: () => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  selectedConversation: Conversation | null;
  selectConversation: (conversationId: string) => Promise<void>;
  sendMessage: (prompt: string) => Promise<void>;
  status: ChatStatus;
  stopActiveRun: () => Promise<void>;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    cancelled: boolean,
  ) => Promise<void>;
  workspaceId: string | null;
}

type ChatPatch = Partial<
  Pick<
    ChatStore,
    | "activeRun"
    | "conversations"
    | "error"
    | "hasMoreOlder"
    | "messages"
    | "operation"
    | "selectedConversation"
    | "status"
    | "workspaceId"
  >
>;

const pageLimit = 40;
let operationSequence = 0;
let currentOperationId = 0;

export const useChatStore = create<ChatStore>((set, get) => {
  function beginOperation(patch: ChatPatch) {
    operationSequence += 1;
    currentOperationId = operationSequence;
    set(patch);
    return currentOperationId;
  }

  function commitCurrent(operationId: number, patch: ChatPatch) {
    if (operationId !== currentOperationId) {
      return;
    }
    currentOperationId = 0;
    set(patch);
  }

  async function loadConversationPage(workspaceId: string, conversation: Conversation) {
    const page = await window.setta.chat.messagePage(workspaceId, conversation.id, 0, pageLimit);
    const active = await window.setta.chat.activeRun(workspaceId, conversation.id);
    return pagePatch(page, active.hasActiveRun ? active.run : null);
  }

  async function reloadConversations(workspaceId: string) {
    return window.setta.chat.listConversations(workspaceId);
  }

  return {
    activeRun: null,
    conversations: [],
    createConversation: async (title = "") => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "creating" });
      try {
        const conversation = await window.setta.chat.createConversation(workspaceId, title);
        const list = await reloadConversations(workspaceId);
        const patch = await loadConversationPage(workspaceId, conversation);
        commitCurrent(operationId, {
          ...patch,
          conversations: list.conversations,
          operation: null,
          selectedConversation: conversation,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    error: null,
    hasMoreOlder: false,
    loadOlder: async () => {
      const { messages, selectedConversation, workspaceId } = get();
      const firstMessage = messages[0];
      if (!workspaceId || !selectedConversation || !firstMessage || !get().hasMoreOlder) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "loadingOlder" });
      try {
        const page = await window.setta.chat.messagePage(
          workspaceId,
          selectedConversation.id,
          firstMessage.ordinal,
          pageLimit,
        );
        commitCurrent(operationId, {
          hasMoreOlder: page.hasMoreOlder,
          messages: [...page.messages, ...messages],
          operation: null,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    loadWorkspace: async (workspaceId: string) => {
      const operationId = beginOperation({
        activeRun: null,
        error: null,
        hasMoreOlder: false,
        messages: [],
        operation: "loading",
        selectedConversation: null,
        status: "loading",
        workspaceId,
      });
      try {
        const list = await reloadConversations(workspaceId);
        const first = list.conversations[0]?.conversation ?? null;
        const patch = first
          ? await loadConversationPage(workspaceId, first)
          : emptyConversationPatch();
        commitCurrent(operationId, {
          ...patch,
          conversations: list.conversations,
          operation: null,
          selectedConversation: first,
          status: "ready",
          workspaceId,
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    messages: [],
    operation: null,
    refreshActiveConversation: async () => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      try {
        const [page, active, list] = await Promise.all([
          window.setta.chat.messagePage(workspaceId, selectedConversation.id, 0, pageLimit),
          window.setta.chat.activeRun(workspaceId, selectedConversation.id),
          reloadConversations(workspaceId),
        ]);
        const current = get();
        if (
          current.workspaceId !== workspaceId ||
          current.selectedConversation?.id !== selectedConversation.id
        ) {
          return;
        }
        set({
          ...pagePatch(page, active.hasActiveRun ? active.run : null),
          conversations: list.conversations,
          status: "ready",
        });
      } catch (error) {
        set(errorPatch(error));
      }
    },
    selectConversation: async (conversationId: string) => {
      const { conversations, workspaceId } = get();
      if (!workspaceId) {
        return;
      }
      const conversation =
        conversations.find((item) => item.conversation.id === conversationId)?.conversation ?? null;
      if (!conversation) {
        set({ error: `conversation not found: ${conversationId}`, status: "error" });
        return;
      }
      const operationId = beginOperation({ error: null, operation: "loading" });
      try {
        const patch = await loadConversationPage(workspaceId, conversation);
        commitCurrent(operationId, {
          ...patch,
          operation: null,
          selectedConversation: conversation,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    selectedConversation: null,
    sendMessage: async (prompt: string) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "sending" });
      try {
        const result = await window.setta.chat.sendMessage(
          workspaceId,
          selectedConversation.id,
          prompt,
        );
        const list = await reloadConversations(workspaceId);
        commitCurrent(operationId, {
          ...pagePatch(result.page, result.run),
          conversations: list.conversations,
          operation: null,
          selectedConversation: result.conversation,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    status: "idle",
    stopActiveRun: async () => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "cancelling" });
      try {
        const run = await window.setta.chat.cancelRun(workspaceId, selectedConversation.id);
        const page = await window.setta.chat.messagePage(
          workspaceId,
          selectedConversation.id,
          0,
          pageLimit,
        );
        commitCurrent(operationId, {
          ...pagePatch(page, run.status === "running" ? run : null),
          operation: null,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    submitApproval: async (approvalId, approved, response, cancelled) => {
      const { selectedConversation, workspaceId } = get();
      if (!workspaceId || !selectedConversation) {
        return;
      }
      const operationId = beginOperation({ error: null, operation: "approving" });
      try {
        const run = await window.setta.chat.submitApproval({
          approvalId,
          approved,
          cancelled,
          conversationId: selectedConversation.id,
          response,
          workspaceId,
        });
        commitCurrent(operationId, {
          activeRun: run.status === "running" ? run : null,
          operation: null,
          status: "ready",
        });
      } catch (error) {
        commitCurrent(operationId, errorPatch(error));
      }
    },
    workspaceId: null,
  };
});

function pagePatch(page: MessagePage, activeRun: Run | null): ChatPatch {
  return {
    activeRun,
    hasMoreOlder: page.hasMoreOlder,
    messages: page.messages,
    selectedConversation: page.conversation,
  };
}

function emptyConversationPatch(): ChatPatch {
  return {
    activeRun: null,
    hasMoreOlder: false,
    messages: [],
    selectedConversation: null,
  };
}

function errorPatch(error: unknown): ChatPatch {
  return {
    error: error instanceof Error ? error.message : "Chat operation failed",
    operation: null,
    status: "error",
  };
}
