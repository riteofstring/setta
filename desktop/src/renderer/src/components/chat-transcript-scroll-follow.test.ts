import type { ApprovalRequest, Run } from "@generated/backend";
import { describe, expect, it } from "vitest";

import {
  classifyTranscriptScrollGeometry,
  decideTranscriptScrollFollowAfterAtBottomStateChange,
  decideTranscriptScrollFollowAfterRangeChanged,
  decideTranscriptScrollFollowAfterScroll,
  transcriptScrollCanJumpToLatest,
  type TranscriptScrollMetrics,
} from "./chat-transcript-scroll-follow";
import { transcriptTailRevision } from "./chat-transcript-tail-revision";

describe("transcript scroll follow decisions", () => {
  it("classifies unscrollable transcripts as at bottom with no jump action", () => {
    const geometry = geometryFromMetrics({
      clientHeight: 600,
      scrollHeight: 560,
      scrollTop: 0,
    });

    expect(geometry.hasScrollableOverflow).toBe(false);
    expect(geometry.atBottom).toBe(true);
    expect(transcriptScrollCanJumpToLatest("user_detached", geometry)).toBe(false);
  });

  it("uses the shared bottom threshold for follow and jump visibility", () => {
    const geometry = geometryFromMetrics({ scrollTop: 988 });

    expect(geometry.distanceFromBottom).toBe(12);
    expect(geometry.atBottom).toBe(true);
    expect(geometry.awayFromBottom).toBe(false);
    expect(transcriptScrollCanJumpToLatest("user_detached", geometry)).toBe(false);
  });

  it("detaches when user history scroll intent moves away from the bottom threshold", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        geometry: geometryFromMetrics({ scrollTop: 920 }),
        keyboardScrollIntent: false,
        mode: "auto_follow",
        pointerScrollIntent: false,
        previousScrollTop: 988,
        programmaticScrollActive: false,
        tailScrollIntent: false,
        wheelScrollIntent: true,
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });
  });

  it("detaches upward wheel intent inside the bottom threshold", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        geometry: geometryFromMetrics({ scrollTop: 990 }),
        keyboardScrollIntent: false,
        mode: "auto_follow",
        pointerScrollIntent: false,
        previousScrollTop: 1000,
        programmaticScrollActive: false,
        tailScrollIntent: false,
        wheelScrollIntent: true,
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });
  });

  it("does not detach from programmatic scroll events", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        geometry: geometryFromMetrics({ scrollTop: 920 }),
        keyboardScrollIntent: false,
        mode: "auto_follow",
        pointerScrollIntent: false,
        previousScrollTop: 988,
        programmaticScrollActive: true,
        tailScrollIntent: false,
        wheelScrollIntent: false,
      }),
    ).toEqual({ mode: "auto_follow", shouldScrollToLatest: true });
  });

  it("detaches from explicit user history scroll even during programmatic settle", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        geometry: geometryFromMetrics({ scrollTop: 920 }),
        keyboardScrollIntent: false,
        mode: "auto_follow",
        pointerScrollIntent: false,
        previousScrollTop: 988,
        programmaticScrollActive: true,
        tailScrollIntent: false,
        wheelScrollIntent: true,
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });
  });

  it("detaches upward wheel intent inside the bottom threshold during programmatic settle", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        geometry: geometryFromMetrics({ scrollTop: 990 }),
        keyboardScrollIntent: false,
        mode: "auto_follow",
        pointerScrollIntent: false,
        previousScrollTop: 1000,
        programmaticScrollActive: true,
        tailScrollIntent: false,
        wheelScrollIntent: true,
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });
  });

  it("does not auto-scroll from browser scroll adjustments without user or programmatic intent", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        geometry: geometryFromMetrics({ scrollTop: 1000 }),
        keyboardScrollIntent: false,
        mode: "auto_follow",
        pointerScrollIntent: false,
        previousScrollTop: 988,
        programmaticScrollActive: false,
        tailScrollIntent: false,
        wheelScrollIntent: false,
      }),
    ).toEqual({ mode: "auto_follow", shouldScrollToLatest: false });

    expect(
      decideTranscriptScrollFollowAfterScroll({
        geometry: geometryFromMetrics({ scrollTop: 920 }),
        keyboardScrollIntent: false,
        mode: "auto_follow",
        pointerScrollIntent: false,
        previousScrollTop: 988,
        programmaticScrollActive: false,
        tailScrollIntent: false,
        wheelScrollIntent: false,
      }),
    ).toEqual({ mode: "auto_follow", shouldScrollToLatest: false });
  });

  it("does not reattach detached mode from range or at-bottom callbacks", () => {
    expect(
      decideTranscriptScrollFollowAfterRangeChanged({
        geometry: geometryFromMetrics({ scrollTop: 988 }),
        mode: "user_detached",
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });

    expect(
      decideTranscriptScrollFollowAfterAtBottomStateChange({
        geometry: geometryFromMetrics({ scrollTop: 1000 }),
        isAtBottom: true,
        mode: "user_detached",
      }),
    ).toEqual({ mode: "user_detached", shouldScrollToLatest: false });
  });

  it("does not auto-scroll from range or at-bottom measurement callbacks", () => {
    expect(
      decideTranscriptScrollFollowAfterRangeChanged({
        geometry: geometryFromMetrics({ scrollTop: 988 }),
        mode: "auto_follow",
      }),
    ).toEqual({ mode: "auto_follow", shouldScrollToLatest: false });

    expect(
      decideTranscriptScrollFollowAfterAtBottomStateChange({
        geometry: geometryFromMetrics({ scrollTop: 1000 }),
        isAtBottom: true,
        mode: "auto_follow",
      }),
    ).toEqual({ mode: "auto_follow", shouldScrollToLatest: false });
  });

  it("reattaches detached mode when the user scrolls back to the bottom", () => {
    expect(
      decideTranscriptScrollFollowAfterScroll({
        geometry: geometryFromMetrics({ scrollTop: 1000 }),
        keyboardScrollIntent: false,
        mode: "user_detached",
        pointerScrollIntent: false,
        previousScrollTop: 988,
        programmaticScrollActive: false,
        tailScrollIntent: true,
        wheelScrollIntent: false,
      }),
    ).toEqual({ mode: "auto_follow", shouldScrollToLatest: true });
  });

  it("reattaches when content no longer overflows", () => {
    expect(
      decideTranscriptScrollFollowAfterRangeChanged({
        geometry: geometryFromMetrics({ clientHeight: 600, scrollHeight: 580, scrollTop: 0 }),
        mode: "user_detached",
      }),
    ).toEqual({ mode: "auto_follow", shouldScrollToLatest: false });
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

function geometryFromMetrics(overrides: Partial<TranscriptScrollMetrics> = {}) {
  return classifyTranscriptScrollGeometry(scrollMetrics(overrides));
}
