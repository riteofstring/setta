import type { RunActivityDetailsProjection } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ActivityApprovalDetails,
  ActivityDynamicToolDetails,
} from "./chat-transcript-activity-details";

describe("ActivityDynamicToolDetails", () => {
  test("renders typed dynamic tool success", () => {
    const html = renderToString(<ActivityDynamicToolDetails details={dynamicToolDetails(false)} />);

    expect(html).toContain("Success");
    expect(html).toContain("false");
    expect(html).toContain("tool output");
  });
});

describe("ActivityApprovalDetails", () => {
  test("renders typed approval request details", () => {
    const html = renderToString(<ActivityApprovalDetails details={approvalDetails()} />);

    expect(html).toContain("Command approval");
    expect(html).toContain("request_1");
    expect(html).toContain("go test ./...");
  });
});

function dynamicToolDetails(success: boolean | null): RunActivityDetailsProjection {
  return baseDetails({
    dynamicToolCall: {
      arguments: { value: "input" },
      category: "test",
      description: "Test dynamic tool",
      displayTitle: "Dynamic tool",
      durationMs: 12,
      error: "",
      namespace: "setta",
      result: {
        contentItems: [{ imageUrl: "", text: "tool output", type: "inputText" }],
        success,
      },
      resultSummary: "tool output",
      toolName: "fakeTool",
    },
  });
}

function approvalDetails(): RunActivityDetailsProjection {
  return baseDetails({
    approval: {
      action: null,
      actionType: "",
      approvalId: "approval_1",
      approvalKind: "command",
      approvalStatus: "pending",
      body: "Command approval",
      command: "go test ./...",
      cwd: "/workspace",
      filePath: "",
      options: [],
      permission: "",
      providerRequestId: "request_1",
      question: "",
      questions: [],
      review: null,
      reviewId: "",
      reviewStatus: "",
      structuredInput: null,
      title: "Command approval",
    },
  });
}

function baseDetails(
  overrides: Partial<RunActivityDetailsProjection> = {},
): RunActivityDetailsProjection {
  return {
    command: "",
    commandExecution: null,
    approval: null,
    cwd: "",
    details: null,
    diff: null,
    durationMs: 0,
    dynamicToolCall: null,
    error: "",
    exitCode: 0,
    fileChange: null,
    filePaths: [],
    mcpToolCall: null,
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
    ...overrides,
  };
}
