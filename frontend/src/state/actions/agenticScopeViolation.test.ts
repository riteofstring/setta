import { describe, expect, it } from "vitest";
import { extractAgenticScopeViolation } from "./agenticScopeViolation";
import { AgenticEdgeKindEnum, ToolChatMessage } from "utils/generatedTypes";

function buildToolMessage(result: unknown): ToolChatMessage {
  return {
    id: "tool-msg-1",
    role: "tool",
    tool_call_id: "tool-call-1",
    tool_name: "setta__set_section_name",
    arguments: {},
    result,
    content: [],
    is_error: true,
    started_at: "2020-01-01T00:00:00.000Z",
    completed_at: "2020-01-01T00:00:00.000Z",
  };
}

describe("extractAgenticScopeViolation", () => {
  it("prefers missingEdgesCanonical over missingEdges when present", () => {
    const message = buildToolMessage({
      structuredContent: {
        error: "ScopeViolation",
        message: "blocked",
        missingEdges: [
          {
            sourceSectionId: "tmp-source",
            targetSectionId: "tmp-target",
            kind: AgenticEdgeKindEnum.chat_section,
          },
        ],
        missingEdgesCanonical: [
          {
            sourceSectionId: "source",
            targetSectionId: "target",
            kind: AgenticEdgeKindEnum.chat_section,
          },
        ],
      },
    });

    const violation = extractAgenticScopeViolation(message);
    expect(violation).toEqual({
      message: "blocked",
      edges: [
        {
          sourceSectionId: "source",
          targetSectionId: "target",
          kind: AgenticEdgeKindEnum.chat_section,
        },
      ],
    });
  });

  it("falls back to missingEdges when missingEdgesCanonical is absent", () => {
    const message = buildToolMessage({
      structuredContent: {
        error: "ScopeViolation",
        message: "blocked",
        missingEdges: [
          {
            sourceSectionId: "source",
            targetSectionId: "target",
            kind: AgenticEdgeKindEnum.chat_chat,
          },
        ],
      },
    });

    const violation = extractAgenticScopeViolation(message);
    expect(violation).toEqual({
      message: "blocked",
      edges: [
        {
          sourceSectionId: "source",
          targetSectionId: "target",
          kind: AgenticEdgeKindEnum.chat_chat,
        },
      ],
    });
  });

  it("filters unknown edge kinds", () => {
    const message = buildToolMessage({
      structuredContent: {
        error: "ScopeViolation",
        message: "blocked",
        missingEdgesCanonical: [
          {
            sourceSectionId: "source",
            targetSectionId: "target",
            kind: "not-a-real-kind",
          },
        ],
      },
    });

    const violation = extractAgenticScopeViolation(message);
    expect(violation).toEqual({ message: "blocked", edges: [] });
  });
});

