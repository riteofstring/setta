import type { Run, RunLiveness, RunLivenessReason } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { activeRunPresentation, runLivenessPresentationKind } from "./chat-run-liveness";

describe("active run liveness presentation", () => {
  test.each([
    ["provider_ref_pending", "working"],
    ["provider_turn_linked", "working"],
    ["snapshot_load", "working"],
    ["wake_recheck", "working"],
    ["stream_resync", "reconnecting"],
    ["provider_restarted", "reconnecting"],
    ["user_retry", "reconnecting"],
    ["attachment_missing", "lost"],
    ["provider_unavailable", "lost"],
    ["turn_not_found", "lost"],
    ["run_terminal", "terminal"],
  ] satisfies Array<[RunLivenessReason, ReturnType<typeof runLivenessPresentationKind>]>)(
    "classifies reconciling/%s as %s",
    (reason, expectedKind) => {
      const run = runFixture();

      expect(
        runLivenessPresentationKind(
          runLivenessFixture(run, {
            reason,
            status: "reconciling",
          }),
        ),
      ).toBe(expectedKind);
    },
  );

  test("presents snapshot-load verification as visible working without steering", () => {
    const run = runFixture();

    expect(
      activeRunPresentation(
        run,
        runLivenessFixture(run, {
          reason: "snapshot_load",
          retryable: true,
          status: "reconciling",
        }),
      ),
    ).toMatchObject({
      canRetry: false,
      canSteer: false,
      canStop: true,
      kind: "working",
      running: true,
    });
  });

  test("presents stream resync as reconnecting", () => {
    const run = runFixture();

    expect(
      activeRunPresentation(
        run,
        runLivenessFixture(run, {
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
    lastProviderEventAt: "2026-05-29T20:00:00Z",
    lastReconciledAt: "",
    providerThreadId: "thread_api",
    providerTurnId: "turn_api",
    reason: "provider_turn_linked",
    retryable: false,
    runId: run.id,
    status: "attached",
    workspaceId: run.workspaceId,
    ...values,
  };
}
