import type { Run, RunLiveness } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { activeRunPresentation } from "./chat-run-liveness";

describe("active run liveness presentation", () => {
  test("does not present approval-blocked attached runs as normal working", () => {
    const run = runFixture();

    expect(activeRunPresentation(run, runLivenessFixture(run))).toMatchObject({
      canRetry: false,
      canSteer: false,
      canStop: true,
      kind: "blocked",
      running: true,
    });
  });
});

function runFixture(): Run {
  return {
    assistantMessageId: "",
    completedAt: "",
    conversationId: "conversation_api",
    error: "",
    harness: "codex",
    id: "run_api",
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
    promptSummary: "test",
    schemaVersion: 1,
    startedAt: "2026-05-29T20:00:00Z",
    status: "running",
    triggerMessageId: "message_user",
    workspaceId: "workspace_api",
  };
}

function runLivenessFixture(run: Run): RunLiveness {
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
  };
}
