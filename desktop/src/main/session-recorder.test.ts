import { describe, expect, test } from "vitest";

import type {
  ConversationEvent,
  InvocationAttempt,
  ResolvedInvocation,
  Role,
  RoleProfile,
  TrajectoryEvent,
} from "@generated/backend";
import { ipcChannels } from "@shared/ipc";

import {
  conversationRecordingEvents,
  ipcRecordingFailure,
  ipcRecordingValue,
  recordingEventValue,
  sanitizeRecordingValue,
  summarizeRecordingValue,
} from "./session-recorder";

const redacted = { redacted: true, type: "sensitive_value" };

describe("session recording privacy", () => {
  test("redacts explicit secret and raw-audio fields while retaining safe context", () => {
    expect(
      sanitizeRecordingValue({
        audioBase64: "private-audio",
        nested: {
          apiKey: "private-api-key",
          bootstrap_token: "private-runtime-token",
          clientSecret: "private-client-secret",
          iconDataUrl: "data:image/png;base64,private-editor-icon",
          imageDataUrl: "data:image/png;base64,private-renderer-capture",
          title: "safe title",
        },
        response: {
          answers: [{ answers: ["private-approval-answer"], questionId: "secret" }],
          decision: "answered",
        },
      }),
    ).toEqual({
      audioBase64: redacted,
      nested: {
        apiKey: redacted,
        bootstrap_token: redacted,
        clientSecret: redacted,
        iconDataUrl: redacted,
        imageDataUrl: redacted,
        title: "safe title",
      },
      response: {
        answers: redacted,
        decision: "answered",
      },
    });
  });

  test("summarizes binary values and backend request bodies without copying content", () => {
    expect(sanitizeRecordingValue(Uint8Array.from([1, 2, 3, 4]))).toEqual({
      byteLength: 4,
      type: "binary",
    });
    expect(summarizeRecordingValue('{"apiKey":"private-api-key"}')).toEqual({
      length: 28,
      type: "string",
    });
  });

  test.each([
    [ipcChannels.appOpenExternalUrl, "external_url", "https://example.invalid/?code=private"],
    [
      ipcChannels.codexAccountStartLogin,
      "codex_account_login_request",
      { apiKey: "private-api-key", type: "apiKey" },
    ],
    [
      ipcChannels.conversationSubmitApproval,
      "conversation_approval_submission",
      { response: { answers: ["private-approval-answer"] } },
    ],
    [
      ipcChannels.runtimeAddByPairingUrl,
      "runtime_pairing_url",
      "setta://pair?tok=private-pairing-token",
    ],
  ])("redacts sensitive IPC start payloads for %s", (channel, type, value) => {
    expect(ipcRecordingValue(channel, "start", [value], true)).toEqual({
      redacted: true,
      type,
    });
  });

  test("redacts login credentials from non-sensitive IPC result structures", () => {
    expect(
      ipcRecordingValue(
        ipcChannels.codexAccountRead,
        "finish",
        {
          login: {
            authUrl: "https://example.invalid/private",
            userCode: "PRIVATE-CODE",
          },
          status: "login_pending",
        },
        true,
      ),
    ).toEqual({
      login: { authUrl: redacted, userCode: redacted },
      status: "login_pending",
    });
  });

  test("redacts sensitive IPC failure details", () => {
    const privateAnswer = "private-approval-answer";
    const recorded = ipcRecordingFailure(
      ipcChannels.conversationSubmitApproval,
      new Error(`approval rejected ${privateAnswer}`),
    );

    expect(recorded).toEqual({
      redacted: true,
      type: "conversation_approval_submission_failure",
    });
    expect(JSON.stringify(recorded)).not.toContain(privateAnswer);
  });

  test("redacts credential-bearing external URL events", () => {
    const privateURL = "https://example.invalid/callback?code=private-authorization-code";
    const recorded = recordingEventValue("external_url_open_blocked", { url: privateURL });

    expect(recorded).toEqual({ redacted: true, type: "external_url" });
    expect(JSON.stringify(recorded)).not.toContain(privateURL);
  });

  test("projects agent and narrator invocation metadata without authored or narrated text", () => {
    const authoredInput = "private authored objective";
    const finalSummary = "private narrator final summary";
    const failureMessage = "private provider failure detail";
    const rerouteReason = "private provider reroute detail";
    const invocation = resolvedInvocation("agent", failureMessage, rerouteReason);
    const turn = conversationRecordingEvents(
      conversationEvent({
        type: "conversation.turn.updated",
        turn: {
          acceptedAt: "2026-07-15T10:00:00Z",
          authoredInput: { text: authoredInput },
          conversationId: "conversation-recording",
          delivery: "normal",
          endedAt: invocation.endedAt,
          error: invocation.failure,
          id: "turn-recording",
          providerTurnId: "provider-turn-recording",
          requestedRoleProfile: invocation.requested,
          resolvedInvocation: invocation,
          startedAt: invocation.startedAt,
          status: "failed",
        },
      }),
    );
    const narration = conversationRecordingEvents(
      conversationEvent({
        event: {
          conversationId: "conversation-recording",
          createdAt: "2026-07-15T10:00:03Z",
          finalSummary: { text: finalSummary },
          id: "narration-recording",
          kind: "final_summary",
          milestone: null,
          resolvedInvocation: resolvedInvocation("narrator", failureMessage, rerouteReason),
          sourceSequenceEnd: 8,
          sourceSequenceStart: 4,
          statusReply: null,
          streamSequence: 2,
          topicDescriptor: null,
          trigger: "turn_terminal",
          turnId: "turn-recording",
        },
        type: "conversation.narration.created",
      }),
    );

    const recorded = [...turn, ...narration];
    expect(recorded).toMatchObject([
      {
        payload: {
          authoredInputBytes: 26,
          resolvedInvocation: {
            contextUsage: { estimatedInputTokens: 100, estimatedOutputTokens: 20 },
            failure: { messageBytes: 31 },
            modelReroutes: [{ reasonBytes: 31 }],
            providerReferences: { threadId: "provider-thread-recording" },
          },
        },
        type: "agent_invocation_observed",
      },
      {
        payload: {
          output: { finalSummaryBytes: 30 },
          resolvedInvocation: {
            contextUsage: { estimatedInputTokens: 100, estimatedOutputTokens: 20 },
            failure: { messageBytes: 31 },
            modelReroutes: [{ reasonBytes: 31 }],
          },
        },
        type: "narrator_output_observed",
      },
    ]);
    const serialized = JSON.stringify(recorded);
    for (const secret of [authoredInput, finalSummary, failureMessage, rerouteReason]) {
      expect(serialized).not.toContain(secret);
    }
  });

  test("projects typed invocation attempts and agent lifecycle without context text", () => {
    const failureMessage = "private checkpoint failure";
    const livenessMessage = "private liveness diagnosis";
    const metadataSecret = "private thread metadata";
    const attempt = invocationAttempt(failureMessage);
    const lifecycle = trajectoryEvent({
      agentLivenessChanged: {
        liveness: {
          cancellable: true,
          lastProviderEventAt: "2026-07-15T10:00:01Z",
          lastReconciledAt: null,
          message: livenessMessage,
          reason: "provider_turn_linked",
          retryable: false,
          status: "attached",
          steerable: true,
        },
      },
      kind: "agent_liveness_changed",
    });
    const failedTerminal = trajectoryEvent({
      kind: "turn_failed",
      turnFailed: {
        failure: {
          code: "provider_turn_failed",
          diagnosticReference: "diagnostic-recording",
          message: failureMessage,
          retryable: true,
        },
        usage: { cachedInputTokens: 11, inputTokens: 101, outputTokens: 29 },
      },
    });
    const recorded = [
      ...conversationRecordingEvents(
        conversationEvent({ attempt, type: "conversation.invocation_attempted" }),
      ),
      ...conversationRecordingEvents(
        conversationEvent({ event: lifecycle, type: "conversation.trajectory.appended" }, 2),
      ),
      ...conversationRecordingEvents(
        conversationEvent({ event: failedTerminal, type: "conversation.trajectory.appended" }, 3),
      ),
      ...conversationRecordingEvents(
        conversationEvent(
          {
            binding: {
              conversationId: "conversation-recording",
              createdAt: "2026-07-15T10:00:00Z",
              lastResumedAt: null,
              lastTurnId: "provider-turn-recording",
              provider: "codex",
              providerMetadata: { secret: metadataSecret },
              status: "linked",
              threadId: "provider-thread-recording",
            },
            type: "conversation.thread_binding.updated",
          },
          4,
        ),
      ),
    ];

    expect(recorded).toMatchObject([
      {
        payload: {
          attempt: {
            callKind: "checkpoint",
            commitDecision: "failure_committed",
            context: {
              includedRanges: [{ end: 8, start: 4 }],
              preCursor: { checkpointThroughSequence: 3, observedThroughSequence: 8 },
            },
            failure: { messageBytes: 26 },
            contextUsage: { estimatedInputTokens: 100, estimatedOutputTokens: 0 },
            outcome: "failed",
          },
        },
        type: "conversation_invocation_attempted",
      },
      {
        payload: {
          agentLiveness: { messageBytes: 26, reason: "provider_turn_linked" },
          eventKind: "agent_liveness_changed",
        },
        type: "agent_trajectory_observed",
      },
      {
        payload: {
          eventKind: "turn_failed",
          failure: { messageBytes: 26 },
          turnUsage: { cachedInputTokens: 11, inputTokens: 101, outputTokens: 29 },
        },
        type: "agent_trajectory_observed",
      },
      {
        payload: {
          metadataKeys: ["secret"],
          providerThreadId: "provider-thread-recording",
        },
        type: "agent_thread_binding_observed",
      },
    ]);
    const serialized = JSON.stringify(recorded);
    for (const secret of [failureMessage, livenessMessage, metadataSecret]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

function conversationEvent(payload: ConversationEvent["payload"], sequence = 1): ConversationEvent {
  return {
    conversationId: "conversation-recording",
    emittedAt: "2026-07-15T10:00:04Z",
    eventId: `conversation-event-${sequence}`,
    payload,
    schemaVersion: 1,
    sequence,
    streamId: "conversation:conversation-recording",
    workspaceId: "workspace-recording",
  };
}

function resolvedInvocation(
  role: Role,
  failureMessage: string,
  rerouteReason: string,
): ResolvedInvocation {
  const requested = roleProfile(role);
  return {
    contextUsage: {
      estimatedInputTokens: 100,
      estimatedOutputTokens: 20,
      inputBytes: 400,
      outputBytes: 80,
    },
    endedAt: "2026-07-15T10:00:02Z",
    failure: {
      code: "provider_unavailable",
      diagnosticReference: "diagnostic-recording",
      message: failureMessage,
      retryable: true,
    },
    id: `invocation-${role}`,
    modelReroutes: [
      { fromModelId: "requested-model", reason: rerouteReason, toModelId: "resolved-model" },
    ],
    outcome: "failed",
    provider: "codex",
    providerReferences: {
      requestId: "provider-request-recording",
      responseId: "provider-response-recording",
      threadId: "provider-thread-recording",
      turnId: "provider-turn-recording",
    },
    requested,
    resolved: {
      modelId: "resolved-model",
      permissionProfile: requested.permissionProfile,
      reasoningEffort: "low",
      serviceTier: "priority",
    },
    role,
    startedAt: "2026-07-15T10:00:01Z",
  };
}

function roleProfile(role: Role): RoleProfile {
  return {
    contextBudget: {
      maxInputBytes: 16_384,
      maxInputTokens: 4_096,
      reservedOutputTokens: 512,
    },
    modelSelection: { mode: "exact", modelId: "requested-model" },
    permissionProfile: {
      approvalPolicy: "never",
      approvals: false,
      providerPermissionProfile: "read-only",
      toolAccess: { allowedTools: [], mode: "none" },
      workspaceMutation: false,
    },
    provider: "codex",
    reasoningEffort: "low",
    role,
    serviceTier: "priority",
  };
}

function invocationAttempt(failureMessage: string): InvocationAttempt {
  const requested = roleProfile("narrator");
  return {
    callKind: "checkpoint",
    commitDecision: "failure_committed",
    context: {
      allowedDecisionKinds: [],
      availableRange: { end: 8, start: 1 },
      clarificationInputId: null,
      evaluationRange: null,
      eventCounts: [{ count: 2, kind: "plan_changed" }],
      includedRanges: [{ end: 8, start: 4 }],
      inputId: null,
      materialized: true,
      omittedStatusOnlyRange: null,
      omittedUnobservedRange: null,
      postCursor: null,
      preCursor: {
        checkpointThroughSequence: 3,
        currentFocusRevision: 2,
        observedThroughSequence: 8,
        updatedAt: "2026-07-15T10:00:00Z",
      },
      priorFinalSummaryCount: 1,
      priorMilestoneCount: 3,
      priorRouteDecisionCount: 0,
      proposedCheckpointThrough: null,
      proposedObservedThrough: null,
      remainingRange: null,
      requestedThroughSequence: null,
      sourceThroughSequence: 8,
      validCompletedForkPointCount: 0,
    },
    contextUsage: {
      estimatedInputTokens: 100,
      estimatedOutputTokens: 0,
      inputBytes: 400,
      outputBytes: 0,
    },
    endedAt: "2026-07-15T10:00:02Z",
    failure: {
      code: "provider_unavailable",
      diagnosticReference: "diagnostic-recording",
      message: failureMessage,
      retryable: true,
    },
    generation: 2,
    id: "checkpoint-attempt-recording",
    outcome: "failed",
    output: {
      checkpointSummaryBytes: 0,
      finalSummaryBytes: 0,
      milestoneCount: 0,
      statusReplyBytes: 0,
      structuredKind: null,
      topicDescriptorBytes: 0,
    },
    providerReferences: {
      requestId: "provider-request-recording",
      responseId: null,
      threadId: "provider-thread-recording",
      turnId: "provider-turn-recording",
    },
    requested,
    resolved: {
      modelId: "resolved-model",
      permissionProfile: requested.permissionProfile,
      reasoningEffort: "low",
      serviceTier: "priority",
    },
    startedAt: "2026-07-15T10:00:01Z",
    trigger: "checkpoint_window_exceeded",
    turnId: "turn-recording",
    validationResult: "not_run",
    conversationId: "conversation-recording",
  };
}

function trajectoryEvent(overrides: Partial<TrajectoryEvent>): TrajectoryEvent {
  return {
    activityCompleted: null,
    activityFailed: null,
    activityProgressed: null,
    activityStarted: null,
    actor: "agent",
    agentLivenessChanged: null,
    agentMessageCompleted: null,
    agentPublicTextDelta: null,
    approvalRequested: null,
    approvalResolved: null,
    artifactEmitted: null,
    conversationId: "conversation-recording",
    emittedAt: "2026-07-15T10:00:02Z",
    fileChangeCompleted: null,
    fileChangeProposed: null,
    id: "trajectory-recording",
    kind: "agent_liveness_changed",
    modelRerouted: null,
    planChanged: null,
    providerEventId: "provider-event-recording",
    providerLifecycleChanged: null,
    providerThreadId: "provider-thread-recording",
    providerTurnId: "provider-turn-recording",
    publicReasoningSummaryUpdated: null,
    sequence: 8,
    subagentCompleted: null,
    subagentStarted: null,
    subagentUpdated: null,
    turnCompleted: null,
    turnFailed: null,
    turnId: "turn-recording",
    turnInterrupted: null,
    turnPromoted: null,
    turnQueued: null,
    turnStarted: null,
    turnSteered: null,
    userInputAccepted: null,
    ...overrides,
  };
}
