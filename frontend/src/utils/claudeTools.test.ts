import { describe, expect, it } from "vitest";
import {
  extractSubAgentToolCallIdFromApproval,
  parseApprovalPayload,
} from "./claudeTools";

describe("extractSubAgentToolCallIdFromApproval", () => {
  it("reads parent tool call id from toolContext", () => {
    const payload = parseApprovalPayload({
      approvalId: "approval-1",
      toolContext: { parentToolCallId: "tool-123" },
    });
    expect(payload).not.toBeNull();
    const toolCallId = extractSubAgentToolCallIdFromApproval(payload!);
    expect(toolCallId).toBe("tool-123");
  });

  it("reads parent tool call id from tool_context", () => {
    const payload = parseApprovalPayload({
      approvalId: "approval-2",
      tool_context: { parent_tool_call_id: "tool-456" },
    });
    expect(payload).not.toBeNull();
    const toolCallId = extractSubAgentToolCallIdFromApproval(payload!);
    expect(toolCallId).toBe("tool-456");
  });
});
