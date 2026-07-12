import type {
  ConversationInputRoutingState,
  ConversationInputState,
  ConversationRouteCommand,
} from "@generated/backend";
import { beforeEach, describe, expect, test } from "vitest";

import {
  conversationRoutingPresentation,
  useConversationRoutingStore,
} from "../../stores/conversation-routing-store";
import {
  applyConversationRoutingPresentation,
  isConversationRoutingFailure,
} from "./conversation-routing-presentation";

describe("conversation routing presentation", () => {
  beforeEach(() => {
    useConversationRoutingStore.getState().resetRuntimeState();
  });

  test("settles ordinary routed work without an originating pane listener", async () => {
    const state = routingState(
      conversationInputState({ id: "input_voice", sequence: 9, status: "dispatched" }),
      routeCommand({
        kind: "send_to_parent",
        sendToParent: { authoredInput: { text: "Continue the topic" }, turnId: "turn_next" },
      }),
    );

    await expect(
      applyConversationRoutingPresentation("workspace_api", state),
    ).resolves.toBeUndefined();
    expect(
      conversationRoutingPresentation(
        useConversationRoutingStore.getState().presentations,
        "workspace_api",
        "conversation_alpha",
      ),
    ).toMatchObject({ inputId: "input_voice", sequence: 9 });
  });

  test("publishes clarification and failures to conversation-scoped state", async () => {
    const clarification = routingState(
      conversationInputState({
        id: "input_clarify",
        sequence: 10,
        status: "awaiting_clarification",
      }),
      routeCommand({
        clarify: { question: "Which request should I send?" },
        kind: "clarify",
      }),
    );

    await applyConversationRoutingPresentation("workspace_api", clarification);
    expect(
      conversationRoutingPresentation(
        useConversationRoutingStore.getState().presentations,
        "workspace_api",
        "conversation_alpha",
      )?.clarification,
    ).toEqual({
      inputId: "input_clarify",
      question: "Which request should I send?",
    });

    const failed = routingState(
      conversationInputState({ id: "input_failed", sequence: 11, status: "failed" }),
      routeCommand({
        kind: "send_to_parent",
        sendToParent: { authoredInput: { text: "Continue" }, turnId: "turn_failed" },
      }),
    );
    failed.input.failure = {
      code: "routing_failed",
      diagnosticReference: "diagnostic",
      message: "The narrator route failed.",
      retryable: true,
    };

    const failure = applyConversationRoutingPresentation("workspace_api", failed);
    await expect(failure).rejects.toThrow("The narrator route failed.");
    await failure.catch((error: unknown) => expect(isConversationRoutingFailure(error)).toBe(true));
    expect(
      conversationRoutingPresentation(
        useConversationRoutingStore.getState().presentations,
        "workspace_api",
        "conversation_alpha",
      )?.routingFailure,
    ).toEqual({
      inputId: "input_failed",
      message: "The narrator route failed.",
      retryable: true,
    });
  });
});

function conversationInputState({
  id,
  sequence,
  status,
}: {
  id: string;
  sequence: number;
  status: ConversationInputState["status"];
}): ConversationInputState {
  return {
    acceptedAt: "2026-07-14T12:00:00Z",
    failure: null,
    input: {
      conversationId: "conversation_alpha",
      id,
      modality: "voice",
      replyToInputId: null,
      sourcePaneId: "pane_alpha",
      submittedAt: "2026-07-14T12:00:00Z",
      text: "Continue the topic",
    },
    routingAttempt: 1,
    routingStartedAt: "2026-07-14T12:00:01Z",
    sequence,
    status,
    invocationAttempt: null,
  };
}

function routingState(
  input: ConversationInputState,
  resultingCommand: ConversationRouteCommand,
): ConversationInputRoutingState {
  return {
    clarificationReply: null,
    decisions: [
      {
        resultingCommand,
      } as ConversationInputRoutingState["decisions"][number],
    ],
    input,
  };
}

function routeCommand(
  selected: Partial<ConversationRouteCommand> & Pick<ConversationRouteCommand, "kind">,
): ConversationRouteCommand {
  return {
    answerAsNarrator: null,
    clarify: null,
    createSideConversation: null,
    escalateToMaster: null,
    forkConversation: null,
    queueParentTurn: null,
    sendToParent: null,
    steerParentTurn: null,
    ...selected,
  };
}
