import type { Run, RunLiveness, RunLivenessPhase } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { activeRunPresentation, runLivenessPresentationKind } from "./chat-run-liveness";

describe("active run liveness presentation", () => {
  test.each([
    ["attached", "working"],
    ["blocked", "working"],
    ["starting", "reconnecting"],
    ["waiting_for_provider", "reconnecting"],
    ["stalled", "reconnecting"],
    ["reconnecting", "reconnecting"],
    ["lost", "lost"],
    ["terminal", "terminal"],
  ] satisfies Array<[RunLivenessPhase, ReturnType<typeof runLivenessPresentationKind>]>)(
    "classifies %s phase as %s",
    (phase, expectedKind) => {
      const run = runFixture();

      expect(
        runLivenessPresentationKind(
          runLivenessFixture(run, {
            phase,
          }),
        ),
      ).toBe(expectedKind);
    },
  );

  test("presents provider-ref-pending as reconnecting without steering", () => {
    const run = runFixture();

    expect(
      activeRunPresentation(
        run,
        runLivenessFixture(run, {
          phase: "starting",
          reason: "provider_ref_pending",
          retryable: true,
          status: "reconciling",
        }),
      ),
    ).toMatchObject({
      canRetry: true,
      canSteer: false,
      canStop: true,
      kind: "reconnecting",
      running: true,
    });
  });

  test("presents stream resync as reconnecting", () => {
    const run = runFixture();

    expect(
      activeRunPresentation(
        run,
        runLivenessFixture(run, {
          phase: "reconnecting",
          reason: "stream_resync",
          retryable: true,
          status: "reconciling",
        }),
      ),
    ).toMatchObject({
      canRetry: true,
      canSteer: false,
      canStop: true,
      kind: "reconnecting",
      running: true,
    });
  });

  test("does not present approval-blocked attached runs as normal working", () => {
    const run = approvalRunFixture();

    expect(activeRunPresentation(run, runLivenessFixture(run))).toMatchObject({
      canRetry: false,
      canSteer: false,
      canStop: true,
      kind: "blocked",
      running: true,
    });
  });
});

function runFixture(values: Partial<Run> = {}): Run {
  return {
    assistantMessageId: "",
    completedAt: "",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    id: "run_api",
    pendingApproval: null,
    promptSummary: "test",
    schemaVersion: 1,
    startedAt: "2026-05-29T20:00:00Z",
    status: "running",
    triggerMessageId: "message_user",
    workspaceId: "workspace_api",
    ...values,
  };
}

function approvalRunFixture(): Run {
  return runFixture({
    pendingApproval: {
      approved: false,
      body: "Codex wants input",
      command: "",
      createdAt: "2026-05-29T20:00:00Z",
      filePath: "",
      id: "approval_api",
      kind: "user_input",
      options: [],
      permission: "",
      providerItemId: "",
      question: "Continue?",
      questions: [],
      resolvedAt: "",
      response: "",
      runId: "run_api",
      runItemId: "",
      status: "pending",
      structuredInput: null,
      title: "Approval required",
    },
  });
}

function runLivenessFixture(run: Run, values: Partial<RunLiveness> = {}): RunLiveness {
  return {
    cancellable: true,
    conversationId: run.conversationId,
    error: "",
    harness: run.harness,
    activeStatus: {
      detail: "",
      headline: "Working",
      headlineSource: "fallback",
      kind: "working",
    },
    lastProviderEventAt: "2026-05-29T20:00:00Z",
    lastVisibleActivityAt: "2026-05-29T20:00:00Z",
    lastReconciledAt: "",
    phase: "attached",
    providerThreadId: "thread_api",
    providerTurnId: "turn_api",
    reason: "provider_turn_linked",
    retryable: false,
    runId: run.id,
    status: "attached",
    steerable: true,
    steeringDisabledReason: "",
    workspaceId: run.workspaceId,
    ...values,
  };
}
