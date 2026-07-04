import type { ApprovalRequest, Run } from "@generated/backend";
import { describe, expect, it } from "vitest";

import { transcriptTailRevision } from "./chat-transcript-scroll-follow";

describe("transcriptTailRevision", () => {
  it("changes when pending approval footer content changes", () => {
    const first = transcriptTailRevision({
      activeRun: runWithApproval({ command: "pnpm test" }),
      rows: [],
      runItemOutputIdsByRunItemId: {},
      runItemOutputPagesByRunItemId: {},
      runItemOutputsById: {},
    });
    const second = transcriptTailRevision({
      activeRun: runWithApproval({ command: "pnpm test -- --runInBand" }),
      rows: [],
      runItemOutputIdsByRunItemId: {},
      runItemOutputPagesByRunItemId: {},
      runItemOutputsById: {},
    });

    expect(second).not.toEqual(first);
  });
});

function runWithApproval(approvalOverrides: Partial<ApprovalRequest>): Run {
  return {
    assistantMessageId: "message_assistant",
    completedAt: "",
    conversationId: "conversation_scroll",
    error: "",
    harness: "codex",
    id: "run_scroll",
    pendingApproval: {
      approved: false,
      body: "Run the command?",
      command: "",
      createdAt: "2026-07-02T20:00:00Z",
      filePath: "",
      id: "approval_scroll",
      kind: "command",
      options: [],
      permission: "",
      providerItemId: "provider_approval",
      question: "",
      questions: [],
      resolvedAt: "",
      response: "",
      runId: "run_scroll",
      runItemId: "item_approval",
      status: "pending",
      structuredInput: null,
      title: "Run command",
      ...approvalOverrides,
    },
    promptSummary: "scroll",
    schemaVersion: 2,
    startedAt: "2026-07-02T20:00:00Z",
    status: "running",
    triggerMessageId: "message_user",
    workspaceId: "workspace_scroll",
  };
}
