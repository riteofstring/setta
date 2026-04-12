import { renderToStaticMarkup } from "react-dom/server";
import { useAIStore } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  type BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageTextContent,
  createMessageThinkingContent,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatMessageList } from "./ChatMessages";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function getTagByMarker(markup: string, marker: string): string | null {
  const markerIndex = markup.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const tagStart = markup.lastIndexOf("<div", markerIndex);
  if (tagStart < 0) {
    return null;
  }
  const tagEnd = markup.indexOf(">", tagStart);
  if (tagEnd < 0) {
    return null;
  }
  return markup.slice(tagStart, tagEnd);
}

function getButtonTagByMarker(markup: string, marker: string): string | null {
  const markerIndex = markup.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const buttonStart = markup.lastIndexOf("<button", markerIndex);
  if (buttonStart < 0) {
    return null;
  }
  const buttonEnd = markup.indexOf(">", buttonStart);
  if (buttonEnd < 0) {
    return null;
  }
  return markup.slice(buttonStart, buttonEnd);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

function getDivHtmlByMarker(markup: string, marker: string): string | null {
  const markerIndex = markup.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const tagStart = markup.lastIndexOf("<div", markerIndex);
  if (tagStart < 0) {
    return null;
  }
  const divTagPattern = /<\/?div\b[^>]*>/g;
  divTagPattern.lastIndex = tagStart;
  let depth = 0;
  for (const match of markup.matchAll(divTagPattern)) {
    const matchStart = match.index;
    if (matchStart === undefined || matchStart < tagStart) {
      continue;
    }
    const tag = match[0];
    if (tag.startsWith("</div")) {
      depth -= 1;
      if (depth === 0) {
        return markup.slice(tagStart, matchStart + tag.length);
      }
      continue;
    }
    depth += 1;
  }
  return null;
}

function formatExpectedChatTimestamp(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestampMs);
}

function formatExpectedChatTimestampTitle(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(timestampMs);
}

describe("ChatMessages timing and timestamps", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("shows success state for completed sections when elapsed time is sub-second", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-finished-sub-second",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Done quickly." })],
        attachments: [],
        tool_calls: [
          {
            id: "finished-tool-sub-second",
            type: "function",
            function: {
              name: "setta__quick_call",
              arguments: {},
            },
          },
        ],
      },
      {
        id: "tool-result-sub-second",
        role: ChatRoleEnum.tool,
        tool_call_id: "finished-tool-sub-second",
        tool_name: "setta__quick_call",
        arguments: {},
        result: { ok: true },
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:00.000Z",
        completed_at: "2026-01-01T00:00:00.400Z",
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("Tool state: success");
    expect(markup).not.toContain("gg-spinner");
  });

  it("shows activity total elapsed time and per-item elapsed time when timestamps are available", () => {
    const firstStartedAtMs = Date.parse("2026-01-01T00:00:00Z");
    const secondStartedAtMs = Date.parse("2026-01-01T00:00:06Z");
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-activity-timer-parent",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "activity-timer-action-call",
            type: "function",
            function: {
              name: "command_execution",
              arguments: { command: "rg --files" },
            },
          },
          {
            id: "activity-timer-tool-call",
            type: "function",
            function: {
              name: "setta__run_tests",
              arguments: { target: "chat" },
            },
          },
        ],
      },
      {
        id: "m-activity-timer-action-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "activity-timer-action-call",
        tool_name: "command_execution",
        arguments: { command: "rg --files" },
        result: "frontend/src/App.tsx",
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:00:05Z",
      },
      {
        id: "m-activity-timer-tool-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "activity-timer-tool-call",
        tool_name: "setta__run_tests",
        arguments: { target: "chat" },
        result: { ok: true },
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:06Z",
        completed_at: "2026-01-01T00:00:08Z",
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain('data-chat-assistant-activity-total-timer="true"');
    expect(markup).toContain("00:08");
    expect(
      countOccurrences(markup, 'data-chat-activity-item-timer="true"'),
    ).toBe(2);
    expect(
      countOccurrences(markup, 'data-chat-activity-item-timestamp="true"'),
    ).toBe(2);
    expect(markup).toContain("00:05");
    expect(markup).toContain("00:02");
    expect(markup).toContain(formatExpectedChatTimestamp(firstStartedAtMs));
    expect(markup).toContain(formatExpectedChatTimestamp(secondStartedAtMs));
    expect(markup).toContain(
      `title="${formatExpectedChatTimestampTitle(firstStartedAtMs)}"`,
    );
    expect(markup).toContain(
      `title="${formatExpectedChatTimestampTitle(secondStartedAtMs)}"`,
    );
  });

  it("hides redundant activity summaries when the parent and child accordions are already open", () => {
    useAIStore.setState({
      projectChatActivityAccordionOpenByDefault: true,
      projectChatActivityChildrenOpenByDefault: true,
    });
    syncStoreInitialState(useAIStore);
    try {
      const messages: BaseChatMessageUnion[] = [
        {
          id: "m-open-all-suppresses-summary-preview",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking: "Inspecting the graph state before applying a cleanup.",
              summary: "Graph state inspection summary",
            }),
          ],
          attachments: [],
          tool_calls: [
            {
              id: "m-open-all-suppresses-summary-preview-call",
              type: "function",
              function: {
                name: "command_execution",
                arguments: {
                  command: "pnpm exec vitest run src/components/Chat",
                },
              },
            },
          ],
        },
      ];

      const markup = renderToStaticMarkup(
        <ChatMessageList messages={messages} waitingForResponse={false} />,
      );

      const activityTitleTag = getDivHtmlByMarker(
        markup,
        'data-chat-assistant-activity-primary-label="true"',
      );
      expect(activityTitleTag).not.toBeNull();
      expect(activityTitleTag).toContain(
        "Action: pnpm exec vitest run src/components/Chat",
      );
      expect(activityTitleTag).not.toContain("Graph state inspection summary");
      expect(markup).toContain(
        'data-chat-assistant-activity-thought-preview-shell="true"',
      );
      expect(markup).toContain(
        'data-chat-assistant-activity-thought-preview-visible="false"',
      );

      const thoughtTriggerTag = getButtonTagByMarker(
        markup,
        'data-chat-thinking-trigger="true"',
      );
      expect(thoughtTriggerTag).not.toBeNull();
      expect(thoughtTriggerTag).not.toContain("Graph state inspection summary");
      expect(markup).toContain("Reasoning");
      expect(markup).not.toContain("Graph state inspection summary");
    } finally {
      useAIStore.setState({
        projectChatActivityAccordionOpenByDefault: false,
        projectChatActivityChildrenOpenByDefault: false,
      });
      syncStoreInitialState(useAIStore);
    }
  });

  it("renders child activity row metadata in a hover-only overlay so labels own the row width until hover", () => {
    const startedAtMs = Date.parse("2026-01-01T00:00:00Z");
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-activity-row-hover-meta",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "m-activity-row-hover-meta-call",
            type: "function",
            function: {
              name: "command_execution",
              arguments: {
                command: "pnpm exec vitest run src/components/Chat",
              },
            },
          },
        ],
      },
      {
        id: "m-activity-row-hover-meta-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "m-activity-row-hover-meta-call",
        tool_name: "command_execution",
        arguments: { command: "pnpm exec vitest run src/components/Chat" },
        result: "PASS src/components/Chat/ChatMessages.test.tsx",
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:00:05Z",
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain(
      `title="${formatExpectedChatTimestampTitle(startedAtMs)}"`,
    );
    const rowHoverMetaTag = getTagByMarker(
      markup,
      'data-chat-activity-item-hover-meta="true"',
    );
    expect(rowHoverMetaTag).not.toBeNull();
    expect(rowHoverMetaTag).toContain("opacity-0");
    expect(rowHoverMetaTag).toContain("pointer-events-none");
    const rowLabelTag = getTagByMarker(
      markup,
      'data-chat-activity-item-label="true"',
    );
    expect(rowLabelTag).not.toBeNull();
    expect(rowLabelTag).toContain("group-hover/chat-activity-row:pr-[");
  });

  it("hides activity timers when timing data is unavailable", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-activity-timer-missing-data",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Reviewing options before making a change.",
            summary: "Reviewing options",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).not.toContain(
      'data-chat-assistant-activity-total-timer="true"',
    );
    expect(markup).not.toContain('data-chat-activity-item-timer="true"');
    expect(markup).not.toContain('data-chat-activity-item-timestamp="true"');
  });

  it("shows success state when completed timestamps round to the same second", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-finished-rounded-zero",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Done." })],
        attachments: [],
        tool_calls: [
          {
            id: "finished-tool-rounded-zero",
            type: "function",
            function: {
              name: "setta__rounded_call",
              arguments: {},
            },
          },
        ],
      },
      {
        id: "tool-result-rounded-zero",
        role: ChatRoleEnum.tool,
        tool_call_id: "finished-tool-rounded-zero",
        tool_name: "setta__rounded_call",
        arguments: {},
        result: { ok: true },
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:00:00Z",
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("Tool state: success");
    expect(markup).not.toContain("gg-spinner");
    expect(markup).not.toContain(">Complete<");
  });

  it("renders message timestamps for chat bubbles and uses the robot icon for activity headers", () => {
    const userCreatedAtMs = Date.parse("2026-01-01T09:15:00Z");
    const assistantCreatedAtMs = Date.parse("2026-01-01T09:16:00Z");
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-user-timestamp",
        role: ChatRoleEnum.user,
        content: [
          createMessageTextContent({ text: "Can you run the checks?" }),
        ],
        attachments: [],
        createdAt: userCreatedAtMs,
      },
      {
        id: "m-assistant-activity-icon",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: "I ran the checks and collected the results.",
          }),
        ],
        attachments: [],
        tool_calls: [
          {
            id: "activity-icon-tool-call",
            type: "function",
            function: {
              name: "setta__run_tests",
              arguments: { target: "chat" },
            },
          },
        ],
        createdAt: assistantCreatedAtMs,
      },
      {
        id: "m-assistant-activity-icon-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "activity-icon-tool-call",
        tool_name: "setta__run_tests",
        arguments: { target: "chat" },
        result: { ok: true },
        content: [],
        is_error: false,
        started_at: "2026-01-01T09:16:05Z",
        completed_at: "2026-01-01T09:16:08Z",
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(countOccurrences(markup, 'data-chat-message-timestamp="true"')).toBe(
      2,
    );
    expect(markup).toContain(formatExpectedChatTimestamp(userCreatedAtMs));
    expect(markup).toContain(formatExpectedChatTimestamp(assistantCreatedAtMs));
    expect(markup).toContain(
      `title="${formatExpectedChatTimestampTitle(userCreatedAtMs)}"`,
    );
    expect(markup).toContain(
      `title="${formatExpectedChatTimestampTitle(assistantCreatedAtMs)}"`,
    );
    expect(markup).toContain('data-chat-assistant-activity-icon="robot"');
  });

  it("uses activity-row timestamps instead of a separate message footer for activity-only assistant messages", () => {
    const activityStartedAtMs = Date.parse("2026-01-01T09:16:05Z");
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-assistant-activity-only",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "activity-only-tool-call",
            type: "function",
            function: {
              name: "command_execution",
              arguments: {
                command: "pnpm exec vitest run src/components/Chat",
              },
            },
          },
        ],
        createdAt: Date.parse("2026-01-01T09:16:00Z"),
      },
      {
        id: "m-assistant-activity-only-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "activity-only-tool-call",
        tool_name: "command_execution",
        arguments: { command: "pnpm exec vitest run src/components/Chat" },
        result: "PASS src/components/Chat/ChatMessages.test.tsx",
        content: [],
        is_error: false,
        started_at: "2026-01-01T09:16:05Z",
        completed_at: "2026-01-01T09:16:08Z",
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).not.toContain('data-chat-assistant-bubble="true"');
    expect(countOccurrences(markup, 'data-chat-message-timestamp="true"')).toBe(
      0,
    );
    expect(
      countOccurrences(markup, 'data-chat-activity-item-timestamp="true"'),
    ).toBe(1);
    expect(markup).toContain(formatExpectedChatTimestamp(activityStartedAtMs));
    expect(markup).toContain(
      `title="${formatExpectedChatTimestampTitle(activityStartedAtMs)}"`,
    );
  });

  it("does not render a separate footer timestamp below activity-only assistant sections", () => {
    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={[
          {
            id: "m-assistant-activity-only-header-timestamp",
            role: ChatRoleEnum.assistant,
            content: [],
            attachments: [],
            tool_calls: [
              {
                id: "activity-only-header-tool-call",
                type: "function",
                function: {
                  name: "command_execution",
                  arguments: {
                    command: "pnpm exec vitest run src/components/Chat",
                  },
                },
              },
            ],
            createdAt: Date.parse("2026-01-01T09:16:00Z"),
          },
          {
            id: "m-assistant-activity-only-header-result",
            role: ChatRoleEnum.tool,
            tool_call_id: "activity-only-header-tool-call",
            tool_name: "command_execution",
            arguments: { command: "pnpm exec vitest run src/components/Chat" },
            result: "PASS src/components/Chat/ChatMessages.test.tsx",
            content: [],
            is_error: false,
            started_at: "2026-01-01T09:16:05Z",
            completed_at: "2026-01-01T09:16:08Z",
          },
        ]}
        waitingForResponse={false}
      />,
    );

    const activityHeader = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-trigger="true"',
    );
    expect(activityHeader).not.toBeNull();

    const assistantGroup = getDivHtmlByMarker(
      markup,
      'data-message-id="m-assistant-activity-only-header-timestamp"',
    );
    expect(assistantGroup).not.toBeNull();
    expect(assistantGroup).not.toContain('data-chat-message-timestamp="true"');
    expect(assistantGroup).not.toContain(
      '<div class="mt-0.5 flex justify-end">',
    );
  });

  it("renders thinking-row timestamps alongside their timers", () => {
    const thinkingCreatedAtMs = Date.parse("2026-01-01T09:16:00Z");
    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={[
          {
            id: "m-assistant-thinking-timestamp",
            role: ChatRoleEnum.assistant,
            content: [
              createMessageThinkingContent({
                thinking:
                  "Reviewing the implementation plan before producing the final answer.",
                summary: "Reviewing the implementation plan.",
                signature: null,
              }),
            ],
            attachments: [],
            tool_calls: null,
            createdAt: thinkingCreatedAtMs,
          },
        ]}
        waitingForResponse={true}
      />,
    );

    expect(
      countOccurrences(markup, 'data-chat-activity-item-timestamp="true"'),
    ).toBe(1);
    expect(markup).toContain(formatExpectedChatTimestamp(thinkingCreatedAtMs));
    expect(markup).toContain(
      `title="${formatExpectedChatTimestampTitle(thinkingCreatedAtMs)}"`,
    );
  });

  it("renders message timestamps outside fit-content user and assistant bubbles", () => {
    const userCreatedAtMs = Date.parse("2026-01-01T09:16:00Z");
    const assistantCreatedAtMs = Date.parse("2026-01-01T09:17:00Z");
    const userMessageId = "m-user-bubble-timestamp";
    const assistantMessageId = "m-assistant-bubble-timestamp";
    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={[
          {
            id: userMessageId,
            role: ChatRoleEnum.user,
            content: [
              createMessageTextContent({
                text: "Please create a simple app. Feel free to choose what to build.",
              }),
            ],
            attachments: [],
            createdAt: userCreatedAtMs,
          },
          {
            id: assistantMessageId,
            role: ChatRoleEnum.assistant,
            content: [
              createMessageTextContent({
                text: "I can help with that. Here is a plan for the first pass.",
              }),
            ],
            attachments: [],
            createdAt: assistantCreatedAtMs,
          },
        ]}
        waitingForResponse={false}
      />,
    );

    const userBubble = getDivHtmlByMarker(
      markup,
      'data-chat-user-bubble="true"',
    );
    expect(userBubble).not.toBeNull();
    expect(userBubble).not.toContain('data-chat-message-timestamp="true"');

    const assistantBubble = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-bubble="true"',
    );
    expect(assistantBubble).not.toBeNull();
    expect(assistantBubble).not.toContain('data-chat-message-timestamp="true"');

    const userGroup = getDivHtmlByMarker(
      markup,
      `data-message-id="${userMessageId}"`,
    );
    expect(
      countOccurrences(userGroup ?? "", 'data-chat-message-timestamp="true"'),
    ).toBe(1);
    expect(userGroup).toContain(formatExpectedChatTimestamp(userCreatedAtMs));

    const assistantGroup = getDivHtmlByMarker(
      markup,
      `data-message-id="${assistantMessageId}"`,
    );
    expect(
      countOccurrences(
        assistantGroup ?? "",
        'data-chat-message-timestamp="true"',
      ),
    ).toBe(1);
    expect(assistantGroup).toContain(
      formatExpectedChatTimestamp(assistantCreatedAtMs),
    );
  });
});
