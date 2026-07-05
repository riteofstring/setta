import type { Run, RunActiveStatusKind, RunLiveness, RunLivenessReason } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { activeRunPresentation, runLivenessPresentationKind } from "./chat-run-liveness";

describe("active run liveness presentation", () => {
  test.each([
    ["provider_ref_pending", "waiting_for_provider"],
    ["provider_turn_linked", "working"],
    ["provider_inactive", "stalled"],
    ["snapshot_load", "reconnecting"],
    ["wake_recheck", "reconnecting"],
    ["stream_resync", "reconnecting"],
    ["provider_restarted", "reconnecting"],
    ["user_retry", "reconnecting"],
    ["attachment_missing", "connection_lost"],
    ["provider_unavailable", "connection_lost"],
    ["turn_not_found", "connection_lost"],
    ["run_terminal", "finished"],
  ] satisfies Array<[RunLivenessReason, RunActiveStatusKind]>)(
    "uses backend active status for reconciling/%s as %s",
    (reason, expectedKind) => {
      const run = runFixture();

      expect(
        runLivenessPresentationKind(
          runLivenessFixture(run, {
            activeStatus: activeStatusFixture(expectedKind),
            reason,
            status: "reconciling",
          }),
        ),
      ).toBe(expectedKind);
    },
  );

  test("presents provider-pending runs as waiting without steering", () => {
    const run = runFixture();

    expect(
      activeRunPresentation(
        run,
        runLivenessFixture(run, {
          activeStatus: activeStatusFixture("waiting_for_provider", "Waiting for Codex"),
          phase: "waiting_for_provider",
          reason: "provider_ref_pending",
          steerable: false,
          steeringDisabledReason: "Codex has not linked a provider turn yet.",
          status: "reconciling",
        }),
      ),
    ).toMatchObject({
      canRetry: false,
      canSteer: false,
      canStop: true,
      headline: "Waiting for Codex",
      kind: "waiting_for_provider",
      running: true,
      steeringDisabledReason: "Codex has not linked a provider turn yet.",
    });
  });

  test("presents public reasoning headline as steerable thinking", () => {
    const run = runFixture();

    expect(
      activeRunPresentation(
        run,
        runLivenessFixture(run, {
          activeStatus: activeStatusFixture(
            "thinking",
            "Mapping parser modules",
            "public_reasoning",
          ),
        }),
      ),
    ).toMatchObject({
      canRetry: false,
      canSteer: true,
      canStop: true,
      headline: "Mapping parser modules",
      kind: "thinking",
      running: true,
    });
  });

  test("presents stream resync as reconnecting", () => {
    const run = runFixture();

    expect(
      activeRunPresentation(
        run,
        runLivenessFixture(run, {
          activeStatus: activeStatusFixture("reconnecting", "Reconnecting"),
          phase: "reconnecting",
          reason: "stream_resync",
          retryable: true,
          steerable: false,
          steeringDisabledReason: "Setta is reconnecting to Codex.",
          status: "reconciling",
        }),
      ),
    ).toMatchObject({
      canRetry: true,
      canSteer: false,
      canStop: true,
      headline: "Reconnecting",
      kind: "reconnecting",
      running: true,
    });
  });

  test("does not present approval-blocked attached runs as normal working", () => {
    const run = approvalRunFixture();

    expect(
      activeRunPresentation(
        run,
        runLivenessFixture(run, {
          activeStatus: activeStatusFixture("blocked", "Approval required", "approval"),
          phase: "blocked",
          steerable: false,
          steeringDisabledReason: "The run is waiting for approval.",
        }),
      ),
    ).toMatchObject({
      canRetry: false,
      canSteer: false,
      canStop: true,
      headline: "Approval required",
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
    activeStatus: activeStatusFixture("working"),
    cancellable: true,
    conversationId: run.conversationId,
    error: "",
    harness: run.harness,
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

function activeStatusFixture(
  kind: RunActiveStatusKind,
  headline = runActiveStatusHeadline(kind),
  headlineSource: RunLiveness["activeStatus"]["headlineSource"] = "liveness",
): RunLiveness["activeStatus"] {
  return {
    detail: "",
    headline,
    headlineSource: kind === "working" ? "fallback" : headlineSource,
    kind,
  };
}

function runActiveStatusHeadline(kind: RunActiveStatusKind) {
  return runActiveStatusHeadlines[kind];
}

const runActiveStatusHeadlines = {
  blocked: "Awaiting approval",
  connection_lost: "Connection lost",
  finished: "Finished",
  reconnecting: "Reconnecting",
  stalled: "Waiting for Codex activity",
  starting: "Starting Codex",
  thinking: "Thinking",
  waiting: "Waiting",
  waiting_for_provider: "Waiting for Codex",
  working: "Working",
} satisfies Record<RunActiveStatusKind, string>;
