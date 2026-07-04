import type { RunActivityDetailsProjection } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ActivityDynamicToolDetails } from "./chat-transcript-activity-details";

describe("ActivityDynamicToolDetails", () => {
  test("renders typed dynamic tool success", () => {
    const html = renderToString(<ActivityDynamicToolDetails details={dynamicToolDetails(false)} />);

    expect(html).toContain("Success");
    expect(html).toContain("false");
    expect(html).toContain("tool output");
  });
});

function dynamicToolDetails(success: boolean | null): RunActivityDetailsProjection {
  return {
    command: "",
    commandExecution: null,
    cwd: "",
    details: null,
    diff: null,
    durationMs: 0,
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
  };
}
