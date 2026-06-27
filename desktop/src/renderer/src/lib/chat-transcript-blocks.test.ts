import type { RunItemStatus, RunItemType, TranscriptBlock } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { deriveTranscriptActivityGroups, orderTranscriptBlocks } from "./chat-transcript-blocks";

describe("orderTranscriptBlocks", () => {
  test("orders by run first appearance then run-local ordinal", () => {
    const ordered = orderTranscriptBlocks([
      block({ id: "a3", runId: "run_a", ordinal: 3 }),
      block({ id: "b1", runId: "run_b", ordinal: 1 }),
      block({ id: "a1", runId: "run_a", ordinal: 1 }),
      block({ id: "a2", runId: "run_a", ordinal: 2 }),
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual(["a1", "a2", "a3", "b1"]);
  });

  test("keeps a run anchored by its first-seen position even if a later run sorts lower", () => {
    // run_b appears first in the input, so it anchors before run_a regardless of
    // ordinals; within a run the run-local ordinal wins.
    const ordered = orderTranscriptBlocks([
      block({ id: "b2", runId: "run_b", ordinal: 2 }),
      block({ id: "b1", runId: "run_b", ordinal: 1 }),
      block({ id: "a1", runId: "run_a", ordinal: 1 }),
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual(["b1", "b2", "a1"]);
  });
});

describe("deriveTranscriptActivityGroups", () => {
  test("collapses adjacent activity rows into one group split by non-activity blocks", () => {
    const groups = deriveTranscriptActivityGroups([
      assistantText("text1"),
      activity("cmd_a", "command_execution", "completed"),
      activity("cmd_b", "command_execution", "completed"),
      assistantText("text2"),
      activity("cmd_c", "command_execution", "completed"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      id: "activity_group_cmd_a",
      category: "commands",
      count: 2,
      memberBlockIds: ["cmd_a", "cmd_b"],
      status: "completed",
    });
    expect(groups[1]).toMatchObject({
      id: "activity_group_cmd_c",
      count: 1,
      memberBlockIds: ["cmd_c"],
    });
  });

  test("a single activity row is still a group so the slim slot exists from the start", () => {
    const groups = deriveTranscriptActivityGroups([
      activity("only", "command_execution", "running"),
    ]);
    expect(groups).toEqual([
      {
        id: "activity_group_only",
        category: "commands",
        count: 1,
        memberBlockIds: ["only"],
        status: "running",
      },
    ]);
  });

  test("mixed activity categories collapse to the generic actions label", () => {
    const groups = deriveTranscriptActivityGroups([
      activity("cmd", "command_execution", "completed"),
      activity("tool", "mcp_tool_call", "completed"),
    ]);
    expect(groups[0]?.category).toBe("actions");
  });

  test("tool-only adjacency is labelled tools", () => {
    const groups = deriveTranscriptActivityGroups([
      activity("search", "web_search", "completed"),
      activity("tool", "mcp_tool_call", "completed"),
    ]);
    expect(groups[0]?.category).toBe("tools");
  });

  test("aggregate status prefers a live row, then the worst terminal outcome", () => {
    expect(statusOf(["completed", "running", "completed"])).toBe("running");
    expect(statusOf(["completed", "failed", "cancelled"])).toBe("failed");
    expect(statusOf(["completed", "cancelled"])).toBe("cancelled");
    expect(statusOf(["completed", "completed"])).toBe("completed");
  });
});

function statusOf(statuses: RunItemStatus[]): RunItemStatus {
  const groups = deriveTranscriptActivityGroups(
    statuses.map((status, index) => activity(`a${index}`, "command_execution", status)),
  );
  return groups[0]?.status ?? "completed";
}

function block(base: { id: string; runId: string; ordinal: number }): TranscriptBlock {
  return {
    activity: null,
    assistantText: null,
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    id: base.id,
    kind: "assistant_text",
    ordinal: base.ordinal,
    reasoning: null,
    runId: base.runId,
    runStatus: null,
    schemaVersion: 1,
    status: "complete",
    updatedAt: "2026-05-29T20:00:00Z",
    userMessage: null,
  };
}

function assistantText(id: string): TranscriptBlock {
  return {
    ...block({ id, ordinal: 0, runId: "run_a" }),
    assistantText: { format: "markdown", text: id },
  };
}

function activity(id: string, type: RunItemType, status: RunItemStatus): TranscriptBlock {
  return {
    ...block({ id, ordinal: 0, runId: "run_a" }),
    kind: "activity_item",
    assistantText: null,
    activity: {
      details: emptyDetails(),
      hasDetails: false,
      hasOutput: false,
      sourceRunItemId: `${id}_item`,
      status,
      title: id,
      type,
    },
  };
}

function emptyDetails() {
  return {
    command: "",
    cwd: "",
    details: null,
    diffSummary: "",
    durationMs: 0,
    error: "",
    exitCode: 0,
    filePaths: [],
    namespace: "",
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    processId: "",
    progress: "",
    requestId: "",
    result: "",
    reviewId: "",
    serverName: "",
    summary: "",
    toolName: "",
  };
}
