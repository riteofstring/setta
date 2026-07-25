import { beforeEach, describe, expect, test } from "vitest";

import {
  conversationRoutingPresentation,
  useConversationRoutingStore,
} from "./conversation-routing-store";

describe("conversation routing presentation store", () => {
  beforeEach(() => {
    useConversationRoutingStore.getState().resetRuntimeState();
  });

  test("shares presentation state across views of one conversation without leaking", () => {
    useConversationRoutingStore.getState().applyResult({
      clarification: { inputId: "input_alpha", question: "Which Alpha request?" },
      conversationId: "conversation_alpha",
      inputId: "input_alpha",
      routingAttempt: 1,
      routingFailure: null,
      sequence: 7,
      workspaceId: "workspace_api",
    });

    const presentations = useConversationRoutingStore.getState().presentations;
    const firstView = conversationRoutingPresentation(
      presentations,
      "workspace_api",
      "conversation_alpha",
    );
    const duplicateView = conversationRoutingPresentation(
      presentations,
      "workspace_api",
      "conversation_alpha",
    );

    expect(firstView).toBe(duplicateView);
    expect(duplicateView?.clarification).toEqual({
      inputId: "input_alpha",
      question: "Which Alpha request?",
    });
    expect(
      conversationRoutingPresentation(presentations, "workspace_api", "conversation_beta"),
    ).toBeUndefined();
    expect(
      conversationRoutingPresentation(presentations, "workspace_other", "conversation_alpha"),
    ).toBeUndefined();
  });

  test("rejects late presentation results and master replies", () => {
    const store = useConversationRoutingStore.getState();
    store.applyResult({
      clarification: null,
      conversationId: "conversation_alpha",
      inputId: "input_first",
      routingAttempt: 1,
      routingFailure: null,
      sequence: 4,
      workspaceId: "workspace_api",
    });
    store.applyResult({
      clarification: null,
      conversationId: "conversation_alpha",
      inputId: "input_second",
      routingAttempt: 2,
      routingFailure: null,
      sequence: 5,
      workspaceId: "workspace_api",
    });
    store.setMasterReply({
      conversationId: "conversation_alpha",
      inputId: "input_first",
      masterReply: { kind: "answer", text: "Stale answer" },
      routingAttempt: 1,
      sequence: 4,
      workspaceId: "workspace_api",
    });
    store.applyResult({
      clarification: null,
      conversationId: "conversation_alpha",
      inputId: "input_second",
      routingAttempt: 1,
      routingFailure: {
        code: "conversation_router_state_unavailable",
        inputId: "input_second",
        message: "Stale retry failure",
        retryable: true,
      },
      sequence: 5,
      workspaceId: "workspace_api",
    });
    store.applyResult({
      clarification: { inputId: "input_first", question: "Stale question" },
      conversationId: "conversation_alpha",
      inputId: "input_first",
      routingAttempt: 1,
      routingFailure: null,
      sequence: 4,
      workspaceId: "workspace_api",
    });

    expect(
      conversationRoutingPresentation(
        useConversationRoutingStore.getState().presentations,
        "workspace_api",
        "conversation_alpha",
      ),
    ).toEqual({
      clarification: null,
      inputId: "input_second",
      masterReply: null,
      routingAttempt: 2,
      routingFailure: null,
      sequence: 5,
    });
  });

  test("shares a master reply only with the matching conversation result", () => {
    const store = useConversationRoutingStore.getState();
    store.applyResult({
      clarification: null,
      conversationId: "conversation_alpha",
      inputId: "input_escalated",
      routingAttempt: 2,
      routingFailure: null,
      sequence: 8,
      workspaceId: "workspace_api",
    });
    store.setMasterReply({
      conversationId: "conversation_alpha",
      inputId: "input_escalated",
      masterReply: { kind: "clarification", text: "Which global topic?" },
      routingAttempt: 2,
      sequence: 8,
      workspaceId: "workspace_api",
    });

    expect(
      conversationRoutingPresentation(
        useConversationRoutingStore.getState().presentations,
        "workspace_api",
        "conversation_alpha",
      )?.masterReply,
    ).toEqual({ kind: "clarification", text: "Which global topic?" });
    expect(
      conversationRoutingPresentation(
        useConversationRoutingStore.getState().presentations,
        "workspace_api",
        "conversation_beta",
      ),
    ).toBeUndefined();
  });

  test("clears only the matching durable failure", () => {
    const store = useConversationRoutingStore.getState();
    store.applyResult({
      clarification: null,
      conversationId: "conversation_alpha",
      inputId: "input_failed",
      routingAttempt: 1,
      routingFailure: {
        code: "conversation_router_state_unavailable",
        inputId: "input_failed",
        message: "Routing failed",
        retryable: true,
      },
      sequence: 3,
      workspaceId: "workspace_api",
    });

    store.discardFailure("workspace_api", "conversation_alpha", "input_other");
    expect(
      conversationRoutingPresentation(
        useConversationRoutingStore.getState().presentations,
        "workspace_api",
        "conversation_alpha",
      )?.routingFailure,
    ).not.toBeNull();

    store.discardFailure("workspace_api", "conversation_alpha", "input_failed");
    expect(
      conversationRoutingPresentation(
        useConversationRoutingStore.getState().presentations,
        "workspace_api",
        "conversation_alpha",
      )?.routingFailure,
    ).toBeNull();
  });
});
