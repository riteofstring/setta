import {
  ChatRoleEnum,
  createMessageTextContent,
  createMessageThinkingContent,
  type ToolChatMessage,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  type AssistantChatMessage,
  buildActivityTimelineEntries,
  buildCopyTextForActivityTimelineEntry,
  isAssistantActivityOnlyMessage,
  resolveLatestActivityPreview,
  resolveLatestThinkingSummary,
} from "./chatAssistantActivity";

describe("chatAssistantActivity", () => {
  it("classifies a streaming command_execution row as terminal activity and previews the command label", () => {
    const message: AssistantChatMessage = {
      id: "assistant-terminal-activity",
      role: ChatRoleEnum.assistant,
      content: [
        createMessageThinkingContent({
          thinking: "Inspecting the current chat renderer before cleanup.",
        }),
      ],
      attachments: [],
      tool_calls: [
        {
          id: "command-execution-call",
          type: "function",
          function: {
            name: "command_execution",
            arguments: {
              command: "pnpm exec vitest run src/components/Chat",
            },
          },
        },
      ],
    };

    const timelineEntries = buildActivityTimelineEntries(
      [{ message, isStreaming: true, wasInterrupted: false }],
      {},
    );

    // The runtime tool row should stay on the terminal pathway while it is still streaming.
    expect(timelineEntries.map((entry) => entry.kind)).toEqual([
      "thinking",
      "terminal",
    ]);

    // The collapsed activity preview should surface the actual command, not a generic label.
    expect(
      resolveLatestActivityPreview({
        timelineEntries,
        toolResultsById: {},
        toolCallArguments: {},
      }),
    ).toMatchObject({
      kind: "terminal",
      label: "Terminal: pnpm exec vitest run src/components/Chat",
    });
  });

  it("only treats assistant messages with hidden reasoning or tool rows as activity-only messages", () => {
    const activityOnlyMessage: AssistantChatMessage = {
      id: "assistant-activity-only",
      role: ChatRoleEnum.assistant,
      content: [
        createMessageThinkingContent({
          thinking: "Checking whether the message has any visible output.",
        }),
      ],
      attachments: [],
      tool_calls: null,
    };
    const visibleMessage: AssistantChatMessage = {
      id: "assistant-visible-content",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Visible assistant answer" })],
      attachments: [],
      tool_calls: null,
    };

    // Pure reasoning content should be groupable into the assistant-activity shell.
    expect(isAssistantActivityOnlyMessage(activityOnlyMessage)).toBe(true);

    // Visible text content must stay in the normal message flow instead of the activity-only path.
    expect(isAssistantActivityOnlyMessage(visibleMessage)).toBe(false);
  });

  it("derives the latest thinking summary headline from markdown content when the summary mirrors the full thought", () => {
    const thinkingItems = [
      createMessageThinkingContent({
        thinking: "# Investigate render path\nLook for mixed responsibilities.",
        summary: "Investigate render path\nLook for mixed responsibilities.",
      }),
    ];

    // When the backend summary is just the full thought repeated, the helper should derive a stable headline.
    expect(resolveLatestThinkingSummary(thinkingItems, false)).toBe(
      "Investigate render path",
    );
  });

  it("builds copied activity text from the resolved tool arguments and tool result payload", () => {
    const message: AssistantChatMessage = {
      id: "assistant-copy-entry",
      role: ChatRoleEnum.assistant,
      content: [],
      attachments: [],
      tool_calls: [
        {
          id: "docs-call",
          type: "function",
          function: {
            name: "setta__get_setta_docs",
            arguments: { docId: "examples" },
          },
        },
      ],
    };
    const toolResultsById: Record<string, ToolChatMessage> = {
      "docs-call": {
        id: "tool-result-docs-call",
        role: ChatRoleEnum.tool,
        tool_call_id: "docs-call",
        tool_name: "setta__get_setta_docs",
        arguments: { docId: "examples" },
        result: {
          docs: [{ doc_id: "examples", path: "docs/reference.md" }],
        },
        content: [],
        is_error: false,
      },
    };

    const [entry] = buildActivityTimelineEntries(
      [{ message, isStreaming: false, wasInterrupted: false }],
      toolResultsById,
    );
    if (!entry) {
      throw new Error("Expected an activity entry to copy.");
    }

    const copyText = buildCopyTextForActivityTimelineEntry({
      entry,
      toolResultsById,
      toolCallArguments: {},
    });

    // Copy text should preserve the tool name plus the best-known arguments and result payload.
    expect(copyText).toContain("setta__get_setta_docs");
    expect(copyText).toContain('"docId": "examples"');
    expect(copyText).toContain('"path": "docs/reference.md"');
  });
});
