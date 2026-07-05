import type { ApprovalRequest, Run } from "@generated/backend";
import { describe, expect, it } from "vitest";

import {
  decideTranscriptScrollFollowAfterAtBottomStateChange,
  decideTranscriptScrollFollowAfterRangeChanged,
  decideTranscriptScrollFollowAfterScroll,
  transcriptAtAutoFollowBottom,
  transcriptAtStrictBottom,
  transcriptTailRevision,
  type TranscriptScrollMetrics,
} from "./chat-transcript-scroll-follow";

describe("transcript scroll follow decisions", () => {
  it("keeps auto-follow tolerant near the virtual tail", () => {
    expect(
      transcriptAtAutoFollowBottom({
        lastVisibleIndex: 9,
        metrics: scrollMetrics({ distanceFromBottom: 80, scrollTop: 920 }),
        rowCount: 10,
      }),
    ).toBe(true);
  });

  it("uses a stricter bottom for detached reattach than auto-follow tolerance", () => {
    expect(transcriptAtStrictBottom(scrollMetrics({ distanceFromBottom: 8 }))).toBe(false);
    expect(transcriptAtStrictBottom(scrollMetrics({ distanceFromBottom: 0 }))).toBe(true);
  });

  it("detaches on upward scroll intent even inside the auto-follow tolerance band", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        metrics: scrollMetrics({ distanceFromBottom: 12, scrollTop: 988 }),
        mode: "auto_follow",
        pointerScrollIntent: false,
        previousScrollTop: 1000,
        programmaticAutoFollow: false,
        tailScrollIntent: false,
        wheelScrollIntent: true,
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });
  });

  it("keeps auto-follow attached during tail-directed programmatic scrolls", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        metrics: scrollMetrics({ distanceFromBottom: 100, scrollTop: 900 }),
        mode: "auto_follow",
        pointerScrollIntent: false,
        previousScrollTop: 1000,
        programmaticAutoFollow: true,
        tailScrollIntent: false,
        wheelScrollIntent: false,
      }),
    ).toEqual({ mode: "auto_follow", shouldScrollToLatest: true });
  });

  it("does not reattach detached mode from tolerant range or at-bottom callbacks", () => {
    expect(
      decideTranscriptScrollFollowAfterRangeChanged({
        lastVisibleIndex: 9,
        metrics: scrollMetrics({ distanceFromBottom: 12, scrollTop: 988 }),
        mode: "user_detached",
        rowCount: 10,
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });

    expect(
      decideTranscriptScrollFollowAfterAtBottomStateChange({
        isAtBottom: true,
        mode: "user_detached",
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });
  });

  it("reattaches detached mode when the user scrolls back to the strict bottom", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        metrics: scrollMetrics({ distanceFromBottom: 0, scrollTop: 1000 }),
        mode: "user_detached",
        pointerScrollIntent: false,
        previousScrollTop: 988,
        programmaticAutoFollow: false,
        tailScrollIntent: true,
        wheelScrollIntent: false,
      }),
    ).toEqual({ mode: "auto_follow", shouldScrollToLatest: true });
  });

  it("does not reattach detached mode at strict bottom without tail-directed input", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        metrics: scrollMetrics({ distanceFromBottom: 0, scrollTop: 1000 }),
        mode: "user_detached",
        pointerScrollIntent: false,
        previousScrollTop: 988,
        programmaticAutoFollow: false,
        tailScrollIntent: false,
        wheelScrollIntent: false,
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });
  });
});

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

function scrollMetrics(overrides: Partial<TranscriptScrollMetrics> = {}): TranscriptScrollMetrics {
  return {
    clientHeight: 600,
    distanceFromBottom: 0,
    scrollHeight: 1600,
    scrollTop: 1000,
    ...overrides,
  };
}
