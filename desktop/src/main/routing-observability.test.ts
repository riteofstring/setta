import { Buffer } from "node:buffer";

import type {
  ConversationInputRoutingState,
  InputRoutingState,
  PermissionProfile,
  PresentationIntent,
  ResolvedInvocation,
  RoleProfile,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import { RouteObservability, type RoutingObservationEventType } from "./routing-observability";

interface RecordedObservation {
  payload: unknown;
  type: RoutingObservationEventType;
}

describe("route observability", () => {
  test("records one redacted semantic event for each local route decision", () => {
    const events: RecordedObservation[] = [];
    const observability = new RouteObservability((type, payload) => {
      events.push({ payload, type });
    });
    const state = conversationRoutingState();

    observability.recordConversationInputRoutingState(state);
    observability.recordConversationInputRoutingState(state);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      payload: {
        callKind: "input_route",
        context: {
          allowedDecisionKinds: ["send_to_parent", "clarify"],
          includedTrajectoryRange: { end: 8, start: 4 },
        },
        conversationId: "conversation_alpha",
        decision: {
          authoredInputBytes: Buffer.byteLength("Route private local text", "utf8"),
          kind: "send_to_parent",
        },
        decisionId: "conversation_route_alpha",
        executionStatus: "dispatched",
        inputId: "conversation_input_alpha",
        inputTextBytes: Buffer.byteLength("Route private local text", "utf8"),
        invocation: {
          contextUsage: { inputBytes: 420, outputBytes: 64 },
          requested: { role: "narrator" },
          resolved: { modelId: "narrator-model" },
        },
        resultingEffect: {
          authoredInputBytes: Buffer.byteLength("Route private local text", "utf8"),
          kind: "send_to_parent",
          turnId: "turn_alpha",
        },
        schemaVersion: 1,
        validationResult: "committed",
      },
      type: "conversation_route_observed",
    });
    expect(JSON.stringify(events)).not.toContain("Route private local text");
  });

  test("records redacted clarification linkage for the final local route", () => {
    const events: RecordedObservation[] = [];
    const observability = new RouteObservability((type, payload) => {
      events.push({ payload, type });
    });
    const state = conversationRoutingState();
    const replyText = "Private clarification reply";
    state.clarificationReply = {
      acceptedAt: "2026-07-14T10:00:04Z",
      failure: null,
      input: {
        conversationId: "conversation_alpha",
        id: "conversation_input_clarification",
        modality: "voice",
        replyToInputId: state.input.input.id,
        sourcePaneId: "pane_alpha_duplicate",
        submittedAt: "2026-07-14T10:00:04Z",
        text: replyText,
      },
      routingAttempt: 1,
      routingStartedAt: null,
      sequence: 4,
      status: "dispatched",
    };
    const decision = state.decisions[0];
    if (decision === undefined) {
      throw new Error("conversation routing fixture has no decision");
    }
    decision.clarificationInputId = state.clarificationReply.input.id;
    decision.routerContext.clarificationInputSequence = state.clarificationReply.sequence;

    observability.recordConversationInputRoutingState(state);

    expect(events[0]).toMatchObject({
      payload: {
        clarification: {
          inputId: "conversation_input_clarification",
          inputModality: "voice",
          inputTextBytes: Buffer.byteLength(replyText, "utf8"),
          parentInputId: "conversation_input_alpha",
          sequence: 4,
          sourcePaneId: "pane_alpha_duplicate",
          status: "dispatched",
        },
        clarificationInputId: "conversation_input_clarification",
      },
      type: "conversation_route_observed",
    });
    expect(JSON.stringify(events)).not.toContain(replyText);
  });

  test("attributes a clarification reply only to the decision that consumed it", () => {
    const events: RecordedObservation[] = [];
    const observability = new RouteObservability((type, payload) => {
      events.push({ payload, type });
    });
    const state = conversationRoutingState();
    const final = state.decisions[0];
    if (final === undefined) {
      throw new Error("conversation routing fixture has no decision");
    }
    const initial = structuredClone(final);
    initial.id = "conversation_route_clarify";
    initial.clarificationInputId = null;
    initial.routerContext.clarificationInputSequence = null;
    setClarifyDecision(initial, "Which request should I route?");
    const replyText = "Route the private follow-up";
    state.clarificationReply = {
      acceptedAt: "2026-07-14T10:00:04Z",
      failure: null,
      input: {
        conversationId: "conversation_alpha",
        id: "conversation_input_clarification",
        modality: "text",
        replyToInputId: state.input.input.id,
        sourcePaneId: "pane_alpha",
        submittedAt: "2026-07-14T10:00:04Z",
        text: replyText,
      },
      routingAttempt: 1,
      routingStartedAt: null,
      sequence: 4,
      status: "dispatched",
    };
    final.clarificationInputId = state.clarificationReply.input.id;
    final.routerContext.clarificationInputSequence = state.clarificationReply.sequence;
    state.decisions = [initial, final];

    observability.recordConversationInputRoutingState(state);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      payload: {
        clarification: null,
        clarificationInputId: null,
        decisionId: initial.id,
        executionStatus: "awaiting_clarification",
      },
      type: "conversation_route_observed",
    });
    expect(events[1]).toMatchObject({
      payload: {
        clarification: {
          inputId: state.clarificationReply.input.id,
          parentInputId: state.input.input.id,
        },
        clarificationInputId: state.clarificationReply.input.id,
        decisionId: final.id,
        executionStatus: "dispatched",
      },
      type: "conversation_route_observed",
    });
    expect(JSON.stringify(events)).not.toContain(replyText);
  });

  test("records a failed clarification reply as the failed routing input", () => {
    const events: RecordedObservation[] = [];
    const observability = new RouteObservability((type, payload) => {
      events.push({ payload, type });
    });
    const state = conversationRoutingState();
    const initial = state.decisions[0];
    if (initial === undefined) {
      throw new Error("conversation routing fixture has no decision");
    }
    setClarifyDecision(initial, "Which request should I route?");
    state.input.status = "awaiting_clarification";
    const replyText = "Private clarification that failed";
    state.clarificationReply = {
      acceptedAt: "2026-07-14T10:00:04Z",
      failure: {
        code: "model_unavailable",
        diagnosticReference: "diagnostic_clarification",
        message: "Private provider failure detail",
        retryable: true,
      },
      input: {
        conversationId: "conversation_alpha",
        id: "conversation_input_clarification",
        modality: "voice",
        replyToInputId: state.input.input.id,
        sourcePaneId: "pane_alpha_duplicate",
        submittedAt: "2026-07-14T10:00:04Z",
        text: replyText,
      },
      routingAttempt: 2,
      routingStartedAt: null,
      sequence: 4,
      status: "failed",
    };

    observability.recordConversationInputRoutingState(state);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      payload: {
        clarification: {
          inputId: "conversation_input_clarification",
          parentInputId: "conversation_input_alpha",
          status: "failed",
        },
        clarificationParentInputId: "conversation_input_alpha",
        failure: { code: "model_unavailable", retryable: true },
        inputId: "conversation_input_clarification",
        inputModality: "voice",
        inputTextBytes: Buffer.byteLength(replyText, "utf8"),
        routingAttempt: 2,
        sourcePaneId: "pane_alpha_duplicate",
      },
      type: "conversation_route_failed",
    });
    expect(JSON.stringify(events)).not.toContain(replyText);
    expect(JSON.stringify(events)).not.toContain("Private provider failure detail");
  });

  test("records redacted master route context, model resolution, and presentation intent", () => {
    const events: RecordedObservation[] = [];
    const observability = new RouteObservability((type, payload) => {
      events.push({ payload, type });
    });
    const state = masterRoutingState();
    const presentation = masterPresentationIntent();

    observability.recordMasterInputRoutingState(state);
    observability.recordMasterInputRoutingState(state);
    observability.recordMasterPresentationIntent(presentation);
    observability.recordMasterPresentationIntent(presentation);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      payload: {
        callKind: "route",
        context: {
          candidateQueryBytes: Buffer.byteLength("Open private Alpha topic", "utf8"),
          includedCandidateIds: ["conversation_alpha"],
          retrievedCandidates: [
            {
              conversationId: "conversation_alpha",
              lexicalRank: 0.25,
              workspaceId: "workspace_alpha",
            },
          ],
        },
        decision: { conversationId: "conversation_alpha", kind: "focus_conversation" },
        decisionId: "master_route_alpha",
        inputId: "master_input_alpha",
        inputSource: "shell",
        invocation: {
          configuration: {
            requestedModel: "master-model",
            resolvedModel: "master-model",
          },
          inputBytes: 512,
          outputBytes: 48,
        },
        masterSessionId: "master_session",
        resultingEffect: {
          kind: "focus_conversation",
          target: {
            conversationId: "conversation_alpha",
            preferredPaneId: "pane_alpha",
            workspaceId: "workspace_alpha",
          },
        },
        schemaVersion: 1,
        validationResult: "committed",
      },
      type: "master_route_observed",
    });
    expect(events[1]).toMatchObject({
      payload: {
        inputId: "master_input_alpha",
        intent: {
          kind: "focus_existing_conversation_pane",
          target: {
            conversationId: "conversation_alpha",
            preferredPaneId: "pane_alpha",
            workspaceId: "workspace_alpha",
          },
        },
        intentId: "master_intent_alpha",
        schemaVersion: 1,
      },
      type: "master_presentation_observed",
    });
    expect(JSON.stringify(events)).not.toContain("Open private Alpha topic");
    expect(JSON.stringify(events)).not.toContain("Private Alpha title");
  });

  test("records one redacted durable master cancellation", () => {
    const events: RecordedObservation[] = [];
    const observability = new RouteObservability((type, payload) => {
      events.push({ payload, type });
    });
    const decided = masterRoutingState();
    const state: InputRoutingState = {
      ...decided,
      cancellation: {
        cancelledAt: "2026-07-14T11:00:02Z",
        inputId: decided.input.input.id,
        routingAttempt: 1,
      },
      decision: null,
      status: "cancelled",
    };

    observability.recordMasterInputRoutingState(state);
    observability.recordMasterInputRoutingState(state);

    expect(events).toEqual([
      {
        payload: expect.objectContaining({
          cancelledAt: "2026-07-14T11:00:02Z",
          inputId: "master_input_alpha",
          inputTextBytes: Buffer.byteLength("Open private Alpha topic", "utf8"),
          routingAttempt: 1,
        }),
        type: "master_route_cancelled",
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("Open private Alpha topic");
  });

  test("records bounded route and observation failures once per attempt", () => {
    const events: RecordedObservation[] = [];
    const observability = new RouteObservability((type, payload) => {
      events.push({ payload, type });
    });
    const failedConversation = conversationRoutingState();
    failedConversation.decisions = [];
    failedConversation.input.status = "failed";
    failedConversation.input.failure = {
      code: "model_unavailable",
      diagnosticReference: "diagnostic_alpha",
      message: "Private provider failure detail",
      retryable: true,
    };

    observability.recordConversationInputRoutingState(failedConversation);
    observability.recordConversationInputRoutingState(failedConversation);
    observability.recordRoutingObservationFailure(
      "master",
      "master_input_alpha",
      new Error("audit read unavailable"),
    );
    observability.recordRoutingObservationFailure(
      "master",
      "master_input_alpha",
      new Error("audit read unavailable"),
    );

    expect(events).toMatchObject([
      {
        payload: {
          contextAvailable: false,
          failure: {
            code: "model_unavailable",
            diagnosticReference: "diagnostic_alpha",
            retryable: true,
          },
          inputId: "conversation_input_alpha",
          invocationAvailable: false,
          schemaVersion: 1,
        },
        type: "conversation_route_failed",
      },
      {
        payload: {
          error: {
            messageBytes: Buffer.byteLength("audit read unavailable", "utf8"),
            name: "Error",
          },
          inputId: "master_input_alpha",
          schemaVersion: 1,
          scope: "master",
        },
        type: "route_observation_failed",
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("Private provider failure detail");
    expect(JSON.stringify(events)).not.toContain("audit read unavailable");
  });
});

function conversationRoutingState(): ConversationInputRoutingState {
  const text = "Route private local text";
  return {
    clarificationReply: null,
    decisions: [
      {
        clarificationInputId: null,
        conversationId: "conversation_alpha",
        decidedAt: "2026-07-14T10:00:03Z",
        decision: {
          answerAsNarrator: null,
          clarify: null,
          createSideConversation: null,
          escalateToMaster: null,
          forkConversation: null,
          kind: "send_to_parent",
          queueParentTurn: null,
          sendToParent: { authoredInput: { text } },
          steerParentTurn: null,
        },
        id: "conversation_route_alpha",
        inputId: "conversation_input_alpha",
        resolvedInvocation: narratorInvocation(),
        resultingCommand: {
          answerAsNarrator: null,
          clarify: null,
          createSideConversation: null,
          escalateToMaster: null,
          forkConversation: null,
          kind: "send_to_parent",
          queueParentTurn: null,
          sendToParent: { authoredInput: { text }, turnId: "turn_alpha" },
          steerParentTurn: null,
        },
        routerContext: {
          allowedDecisionKinds: ["send_to_parent", "clarify"],
          availableTrajectoryRange: { end: 8, start: 1 },
          clarificationInputSequence: null,
          includedTrajectoryRange: { end: 8, start: 4 },
          inputSequence: 3,
          latestTrajectorySequence: 8,
          priorNarrationCount: 2,
          priorRouteDecisionCount: 1,
          validCompletedForkPointCount: 1,
        },
        routingAttempt: 1,
        streamSequence: 4,
      },
    ],
    input: {
      acceptedAt: "2026-07-14T10:00:01Z",
      failure: null,
      input: {
        conversationId: "conversation_alpha",
        id: "conversation_input_alpha",
        modality: "text",
        replyToInputId: null,
        sourcePaneId: "pane_alpha",
        submittedAt: "2026-07-14T10:00:00Z",
        text,
      },
      routingAttempt: 1,
      routingStartedAt: null,
      sequence: 3,
      status: "dispatched",
    },
  };
}

function setClarifyDecision(
  record: ConversationInputRoutingState["decisions"][number],
  question: string,
): void {
  record.decision = {
    answerAsNarrator: null,
    clarify: { question },
    createSideConversation: null,
    escalateToMaster: null,
    forkConversation: null,
    kind: "clarify",
    queueParentTurn: null,
    sendToParent: null,
    steerParentTurn: null,
  };
  record.resultingCommand = {
    answerAsNarrator: null,
    clarify: { question },
    createSideConversation: null,
    escalateToMaster: null,
    forkConversation: null,
    kind: "clarify",
    queueParentTurn: null,
    sendToParent: null,
    steerParentTurn: null,
  };
}

function narratorInvocation(): ResolvedInvocation {
  const requested = roleProfile("narrator", "narrator-model");
  return {
    contextUsage: {
      estimatedInputTokens: 105,
      estimatedOutputTokens: 16,
      inputBytes: 420,
      outputBytes: 64,
    },
    endedAt: "2026-07-14T10:00:03Z",
    failure: null,
    id: "narrator_route_invocation",
    modelReroutes: [],
    outcome: "succeeded",
    provider: "codex",
    providerReferences: {
      requestId: "request_alpha",
      responseId: null,
      threadId: "thread_alpha",
      turnId: "provider_turn_alpha",
    },
    requested,
    resolved: {
      modelId: "narrator-model",
      permissionProfile: requested.permissionProfile,
      reasoningEffort: "low",
      serviceTier: null,
    },
    role: "narrator",
    startedAt: "2026-07-14T10:00:02Z",
  };
}

function roleProfile(role: "narrator", modelId: string): RoleProfile {
  return {
    contextBudget: {
      maxInputBytes: 16_384,
      maxInputTokens: 4_096,
      reservedOutputTokens: 256,
    },
    modelSelection: { mode: "exact", modelId },
    permissionProfile: noToolPermissions(),
    provider: "codex",
    reasoningEffort: "low",
    role,
    serviceTier: null,
  };
}

function noToolPermissions(): PermissionProfile {
  return {
    approvalPolicy: "never",
    approvals: false,
    providerPermissionProfile: "read-only",
    toolAccess: { allowedTools: [], mode: "none" },
    workspaceMutation: false,
  };
}

function masterRoutingState(): InputRoutingState {
  const input = {
    focusedConversationId: "conversation_alpha",
    focusedPaneId: "pane_alpha",
    focusedWorkspaceId: "workspace_alpha",
    id: "master_input_alpha",
    modality: "text" as const,
    originatingConversationId: null,
    originatingConversationInputId: null,
    originatingPaneId: null,
    originatingWorkspaceId: null,
    source: "shell" as const,
    submittedAt: "2026-07-14T11:00:00Z",
    text: "Open private Alpha topic",
  };
  const target = {
    conversationId: "conversation_alpha",
    preferredPaneId: "pane_alpha",
    title: "Private Alpha title",
    workspaceId: "workspace_alpha",
  };
  return {
    decision: {
      context: {
        activeWorkspaceIds: ["workspace_alpha"],
        candidateQuery: input.text,
        candidateQueryTruncated: false,
        focusedConversationId: input.focusedConversationId,
        focusedWorkspaceId: input.focusedWorkspaceId,
        includedCandidateIds: ["conversation_alpha"],
        inputSequence: 9,
        originatingConversationId: null,
        priorDecisionCount: 3,
        retrievedCandidates: [
          {
            conversationId: "conversation_alpha",
            lexicalRank: 0.25,
            workspaceId: "workspace_alpha",
          },
        ],
        targetAuthorities: [
          {
            allowedDecisionKinds: ["focus_conversation"],
            completedForkTurnIds: [],
            conversationId: "conversation_alpha",
            workspaceId: "workspace_alpha",
          },
        ],
      },
      decidedAt: "2026-07-14T11:00:03Z",
      decision: {
        answerGlobal: null,
        askNarrator: null,
        clarify: null,
        createConversation: null,
        createSideConversation: null,
        focusConversation: { conversationId: "conversation_alpha" },
        forkConversation: null,
        kind: "focus_conversation",
        queueAgentTurn: null,
        sendToAgent: null,
        steerActiveTurn: null,
      },
      id: "master_route_alpha",
      inputId: input.id,
      masterSessionId: "master_session",
      resolvedInvocation: {
        configuration: {
          maxInputBytes: 32_768,
          requestedApprovalMode: "never",
          requestedModel: "master-model",
          requestedPermissionMode: "none",
          requestedProfile: { role: "master" },
          requestedReasoningEffort: "medium",
          requestedServiceTier: null,
          resolvedApprovalMode: "never",
          resolvedModel: "master-model",
          resolvedPermissionMode: "none",
          resolvedReasoningEffort: "medium",
          resolvedServiceTier: null,
        },
        endedAt: "2026-07-14T11:00:03Z",
        inputBytes: 512,
        outputBytes: 48,
        providerRequestId: "master_request_alpha",
        providerThreadId: "master_thread",
        providerTurnId: "master_turn_alpha",
        startedAt: "2026-07-14T11:00:02Z",
      },
      resultingCommand: {
        answerGlobal: null,
        askNarrator: null,
        clarify: null,
        createConversation: null,
        createSideConversation: null,
        focusConversation: { target },
        forkConversation: null,
        kind: "focus_conversation",
        queueAgentTurn: null,
        sendToAgent: null,
        steerActiveTurn: null,
      },
      routingAttempt: 1,
      streamSequence: 5,
    },
    cancellation: null,
    failure: null,
    input: {
      acceptedAt: "2026-07-14T11:00:01Z",
      input,
      replyDelivery: {
        originatingConversationId: null,
        originatingConversationInputId: null,
        originatingPaneId: null,
        originatingWorkspaceId: null,
      },
      sequence: 9,
    },
    routingAttempt: 1,
    routingStartedAt: null,
    status: "decided",
  };
}

function masterPresentationIntent(): PresentationIntent {
  return {
    focusExistingConversationPane: {
      target: {
        conversationId: "conversation_alpha",
        preferredPaneId: "pane_alpha",
        title: "Private Alpha title",
        workspaceId: "workspace_alpha",
      },
    },
    id: "master_intent_alpha",
    inputId: "master_input_alpha",
    kind: "focus_existing_conversation_pane",
    openConversationPane: null,
    openSideConversation: null,
    originatingConversationId: null,
    originatingConversationInputId: null,
    originatingPaneId: null,
    originatingWorkspaceId: null,
    showMasterReply: null,
    source: "shell",
  };
}
