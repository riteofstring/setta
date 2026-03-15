import { renderToStaticMarkup } from "react-dom/server";
import { useAIStore, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageTextContent,
  createMessageThinkingContent,
  createSharePolicy,
  type SharePolicy,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatMessageList, buildCopyTextForMessage } from "./ChatMessages";

function buildSharePolicy(overrides: Partial<SharePolicy> = {}): SharePolicy {
  return createSharePolicy(overrides);
}

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

function getButtonTagByAriaLabel(
  markup: string,
  ariaLabel: string,
): string | null {
  const marker = `aria-label="${ariaLabel}"`;
  const labelIndex = markup.indexOf(marker);
  if (labelIndex < 0) {
    return null;
  }
  const buttonStart = markup.lastIndexOf("<button", labelIndex);
  if (buttonStart < 0) {
    return null;
  }
  const buttonEnd = markup.indexOf(">", buttonStart);
  if (buttonEnd < 0) {
    return null;
  }
  return markup.slice(buttonStart, buttonEnd);
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

describe("ChatMessageList edit gating", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("disables edit when parent edit reason is provided", () => {
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: buildSharePolicy(),
    });
    syncStoreInitialState(useShareSession);

    const message = {
      id: "msg-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Hello" })],
      attachments: [],
    };

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={[message]}
        waitingForResponse={false}
        toolCallArguments={{}}
        onEditMessage={() => true}
        editDisabledReason="Engine unavailable."
      />,
    );

    const editButton = getButtonTagByAriaLabel(markup, "Edit message");
    const copyButton = getButtonTagByAriaLabel(markup, "Copy message");
    expect(copyButton).not.toBeNull();
    expect(copyButton).toContain("cursor-pointer");
    expect(editButton).not.toBeNull();
    expect(editButton).toContain("cursor-pointer");
    expect(editButton).toContain("disabled");
    expect(editButton).toContain('title="Engine unavailable."');
  });

  it("renders redo action for assistant messages", () => {
    const message: BaseChatMessageUnion = {
      id: "assistant-redo-1",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Initial response." })],
      attachments: [],
      tool_calls: null,
    };

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={[message]}
        waitingForResponse={false}
        toolCallArguments={{}}
        onRedoMessage={() => true}
      />,
    );

    const redoButton = getButtonTagByAriaLabel(markup, "Redo response");
    expect(redoButton).not.toBeNull();
    expect(redoButton).not.toContain('disabled=""');
  });

  it("does not render redo action for user messages", () => {
    const message: BaseChatMessageUnion = {
      id: "user-redo-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Question?" })],
      attachments: [],
    };

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={[message]}
        waitingForResponse={false}
        toolCallArguments={{}}
        onRedoMessage={() => true}
      />,
    );

    const redoButton = getButtonTagByAriaLabel(markup, "Redo response");
    expect(redoButton).toBeNull();
  });

  it("disables redo while assistant response is streaming", () => {
    const message: BaseChatMessageUnion = {
      id: "assistant-redo-streaming",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Streaming response..." })],
      attachments: [],
      tool_calls: null,
    };

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={[message]}
        waitingForResponse={true}
        toolCallArguments={{}}
        onRedoMessage={() => true}
      />,
    );

    const redoButton = getButtonTagByAriaLabel(markup, "Redo response");
    expect(redoButton).not.toBeNull();
    expect(redoButton).toContain('disabled=""');
    expect(redoButton).toContain('title="Wait for response to finish."');
  });
});

describe("ChatMessages assistant error rendering", () => {
  it("renders assistant [Error] text as an explicit error callout", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m1",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: "[Error] Your credit balance is too low.",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain('data-chat-assistant-error="true"');
    expect(markup).toContain("AI request failed");
    expect(markup).toContain("Your credit balance is too low.");
  });
});

describe("ChatMessages tool call status", () => {
  it("marks unresolved tool calls as stopped when streaming has ended", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-tool-1",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Working on it..." })],
        attachments: [],
        tool_calls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "setta__create_app",
              arguments: { prompt: "Create the app" },
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("Tool state: stopped");
    expect(markup).not.toContain('data-unicode-spinner="braille"');
  });

  it("renders tool calls inside a single activity container", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-tool-group-1",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Tool group test" })],
        attachments: [],
        tool_calls: [
          {
            id: "tool-group-1",
            type: "function",
            function: {
              name: "setta__first_tool",
              arguments: { one: 1 },
            },
          },
          {
            id: "tool-group-2",
            type: "function",
            function: {
              name: "setta__second_tool",
              arguments: { two: 2 },
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    const sectionCount = (
      markup.match(/data-chat-assistant-activity-section="true"/g) ?? []
    ).length;
    expect(sectionCount).toBe(1);
    expect(markup).toContain('data-chat-assistant-activity-count-badge="true"');
    expect(markup).toContain('title="2 activity items"');
    expect(countOccurrences(markup, 'data-chat-tool-call-item="true"')).toBe(2);
    expect(markup).toContain('data-chat-assistant-activity-items="true"');
    expect(markup).toContain('data-chat-assistant-tool-call-card="true"');
    expect(markup).toContain('data-chat-assistant-bubble="true"');
    expect(markup).toContain("grid-cols-[1.75rem_minmax(0,1fr)]");
    expect(markup).not.toContain("grid-cols-[1.5rem_minmax(0,1fr)]");
    expect(markup).not.toContain("px-0.5 pb-0.5");
  });

  it("shows braille activity indicators while rows are in flight", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-running-sections",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Executing..." })],
        attachments: [],
        tool_calls: [
          {
            id: "running-action-1",
            type: "function",
            function: {
              name: "command_execution",
              arguments: { command: "ls -la" },
            },
          },
          {
            id: "running-tool-1",
            type: "function",
            function: {
              name: "setta__list_files",
              arguments: { scope: "repo" },
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    expect(markup).toContain('data-unicode-spinner="braille"');
    expect(markup).toContain("⠋");
  });

  it("shows completed activity rows without running spinners", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-finished-tool-section",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Done." })],
        attachments: [],
        tool_calls: [
          {
            id: "finished-tool-1",
            type: "function",
            function: {
              name: "setta__list_files",
              arguments: { scope: "repo" },
            },
          },
        ],
      },
      {
        id: "tool-result-finished-1",
        role: ChatRoleEnum.tool,
        tool_call_id: "finished-tool-1",
        tool_name: "setta__list_files",
        arguments: { scope: "repo" },
        result: { files: ["A.ts", "B.ts"] },
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:00:05Z",
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).not.toContain('data-unicode-spinner="braille"');
    expect(markup).toContain('data-chat-tool-call-item="true"');
  });

  it("groups consecutive tool-only assistant messages into a single activity section", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-tool-only-1",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "tool-only-1",
            type: "function",
            function: {
              name: "setta__first_tool",
              arguments: { one: 1 },
            },
          },
        ],
      },
      {
        id: "m-tool-only-2",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "tool-only-2",
            type: "function",
            function: {
              name: "setta__second_tool",
              arguments: { two: 2 },
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    const sectionCount = (
      markup.match(/data-chat-assistant-activity-section="true"/g) ?? []
    ).length;
    expect(sectionCount).toBe(1);
    expect(markup).toContain('data-chat-assistant-activity-count-badge="true"');
    expect(markup).toContain('title="2 activity items"');
    expect(countOccurrences(markup, 'data-chat-tool-call-item="true"')).toBe(2);
    expect(markup).not.toContain('data-chat-assistant-bubble="true"');
    expect(markup).toContain(
      "group flex w-full max-w-[min(90%,820px)] flex-col items-start gap-2",
    );
  });

  it("renders command and tool operations sequentially under one activity parent", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-action-mix",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Applying updates..." })],
        attachments: [],
        tool_calls: [
          {
            id: "action-tool-1",
            type: "function",
            function: {
              name: "command_execution",
              arguments: { command: "rg --files" },
            },
          },
          {
            id: "regular-tool-1",
            type: "function",
            function: {
              name: "setta__create_app",
              arguments: { prompt: "Create app" },
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain('data-chat-assistant-activity-section="true"');
    expect(markup).toContain('data-chat-assistant-activity-count-badge="true"');
    expect(markup).toContain("rg --files");
    expect(markup).toContain('data-chat-action-item="true"');
    expect(markup).toContain('data-chat-tool-call-item="true"');
  });

  it("renders active terminal and subagent rows with dedicated runtime treatment", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-runtime-rows",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "runtime-terminal-call",
            type: "function",
            function: {
              name: "command_execution",
              arguments: { command: "pnpm exec vitest run" },
            },
          },
          {
            id: "runtime-subagent-call",
            type: "function",
            function: {
              name: "mcp__setta__run_agent_profile",
              arguments: {
                profileId: "research_profile",
                inputs: {
                  prompt: "Trace the current runtime regression.",
                },
              },
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    // Runtime tool rows should render as dedicated terminal/subagent rows
    // instead of falling back to the generic action/tool variants.
    expect(markup).toContain('data-chat-terminal-item="true"');
    expect(markup).toContain('data-chat-subagent-item="true"');
    expect(markup).not.toContain('data-chat-action-item="true"');
    expect(markup).not.toContain('data-chat-tool-call-item="true"');
    expect(markup).toContain('aria-label="Terminal state: running"');
    expect(markup).toContain('aria-label="Subagent state: running"');
    expect(markup).toContain("pnpm exec vitest run");
    expect(markup).toContain("research_profile");
    expect(markup).toContain("Subagent: research_profile");
    expect(markup).toContain('data-chat-terminal-item-content="true"');
    expect(markup).toContain('data-chat-subagent-item-content="true"');
  });

  it("renders compacted context summaries as sequential activity items", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-compaction-1",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "compact-tool-1",
            type: "function",
            function: {
              name: "compacted",
              arguments: { note: "Compacted earlier messages" },
            },
          },
        ],
      },
      {
        id: "m-compaction-result-1",
        role: ChatRoleEnum.tool,
        tool_call_id: "compact-tool-1",
        tool_name: "compacted",
        arguments: {},
        result: "Summary: earlier file reads and edit intents were compacted.",
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:00:01Z",
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain('data-chat-assistant-activity-section="true"');
    expect(markup).toContain("Context compaction");
    expect(markup).toContain(
      "Summary: earlier file reads and edit intents were compacted.",
    );
    expect(markup).not.toContain('data-chat-context-compaction-section="true"');
  });

  it("respects persisted defaults for opening parent and child activity accordions", () => {
    useAIStore.setState({
      projectChatActivityAccordionOpenByDefault: true,
      projectChatActivityChildrenOpenByDefault: true,
    });
    syncStoreInitialState(useAIStore);
    try {
      const messages: BaseChatMessageUnion[] = [
        {
          id: "m-open-default-1",
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: [
            {
              id: "m-open-default-call-1",
              type: "function",
              function: {
                name: "setta__list_files",
                arguments: { scope: "frontend" },
              },
            },
          ],
        },
      ];

      const markup = renderToStaticMarkup(
        <ChatMessageList messages={messages} waitingForResponse={false} />,
      );

      const activityTriggerTag = getTagByMarker(
        markup,
        'data-chat-assistant-activity-trigger="true"',
      );
      const toolCallTriggerTag = getButtonTagByMarker(
        markup,
        'data-chat-tool-call-item-trigger="true"',
      );
      expect(markup).toContain(
        'data-chat-assistant-activity-open-all-button="true"',
      );
      expect(markup).toContain('title="Close all activity details"');
      expect(markup).toContain(">Close all</button>");
      expect(activityTriggerTag).not.toBeNull();
      expect(activityTriggerTag).toContain('aria-expanded="true"');
      expect(toolCallTriggerTag).not.toBeNull();
      expect(toolCallTriggerTag).toContain('aria-expanded="true"');
      expect(toolCallTriggerTag).toContain("bg-setta-50/95");
      expect(toolCallTriggerTag).toContain("hover:bg-setta-100/95");
      expect(toolCallTriggerTag).toContain("dark:bg-setta-875");
      expect(toolCallTriggerTag).toContain("dark:hover:bg-setta-850");
      expect(markup).not.toContain("animate-slideUp");
      expect(markup).not.toContain("animate-slideDown");
    } finally {
      useAIStore.setState({
        projectChatActivityAccordionOpenByDefault: false,
        projectChatActivityChildrenOpenByDefault: false,
      });
      syncStoreInitialState(useAIStore);
    }
  });

  it("uses swapped base and hover backgrounds for thought activity child triggers", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-thought-row-background",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Verifying activity child trigger background classes.",
          }),
        ],
        attachments: [],
        tool_calls: [],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    const thoughtTriggerTag = getButtonTagByMarker(
      markup,
      'data-chat-thinking-trigger="true"',
    );
    expect(thoughtTriggerTag).not.toBeNull();
    expect(thoughtTriggerTag).toContain("bg-setta-875");
    expect(thoughtTriggerTag).toContain("hover:bg-setta-850");
  });
});

describe("ChatMessages assistant reasoning layout", () => {
  it("keeps assistant groups at the same max width cap as user bubbles", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-assistant-width",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: "This long assistant response should use the compact max width class.",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("max-w-[min(90%,820px)]");
    expect(markup).toContain(
      "group flex w-full max-w-[min(90%,820px)] flex-col items-start gap-2",
    );
    expect(markup).toContain("mb-2 mt-1.5 flex justify-start");
    expect(markup).toContain("border border-transparent bg-white");
    expect(markup).toContain("dark:bg-setta-850");
  });

  it("keeps assistant speech bubbles content-fit instead of filling the group width", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-assistant-fit-width",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Short reply" })],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    const assistantBubbleTag = getTagByMarker(
      markup,
      'data-chat-assistant-bubble="true"',
    );
    expect(assistantBubbleTag).not.toBeNull();
    expect(assistantBubbleTag).toContain("inline-flex");
    expect(assistantBubbleTag).not.toContain(" w-full ");
  });

  it("keeps long assistant markdown on a wrapping root contract in narrow bubbles", () => {
    const assistantText =
      "I'll create a simple app for you! Let me start by checking what UI components are available.";
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-assistant-wrap-width",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: assistantText })],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain('data-chat-assistant-bubble="true"');
    expect(markup).toContain(
      'class="inline-block max-w-full align-top prose prose-sm max-w-full',
    );
    expect(markup).not.toContain('class="w-max max-w-full prose prose-sm');
  });

  it("does not highlight hidden tool payload details", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "search-tool",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "file_change",
              arguments: {
                path: "notes.txt",
                diff: "secret payload",
              },
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={messages}
        waitingForResponse={false}
        toolCallArguments={{}}
        conversationSearchTerms={["secret"]}
      />,
    );

    expect(markup).not.toContain('data-chat-search-highlight="true"');
  });

  it("highlights visible assistant activity labels", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "search-tool-label",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "file_change",
              arguments: {
                path: "notes.txt",
              },
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={messages}
        waitingForResponse={false}
        toolCallArguments={{}}
        conversationSearchTerms={["notes"]}
      />,
    );

    expect(countOccurrences(markup, 'data-chat-search-highlight="true"')).toBe(
      1,
    );
    expect(markup).toContain(">notes</mark>.txt");
  });

  it("keeps user markdown content on a wrapping width contract in narrow bubbles", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-user-wrap-width",
        role: ChatRoleEnum.user,
        content: [
          createMessageTextContent({
            text: "Please create a simple app. Feel free to spawn subagents to do this. You can choose what to create.",
          }),
        ],
        attachments: [],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain('data-chat-user-bubble="true"');
    expect(markup).toContain('class="w-full max-w-full');
    expect(markup).toContain("text-setta-950");
    expect(markup).not.toContain('class="w-max max-w-full text-setta-950');
  });

  it("applies markdown hierarchy spacing classes for readable chat text density", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-markdown-density",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: [
              "## Heading",
              "",
              "Paragraph one.",
              "",
              "- item one",
              "- item two",
            ].join("\n"),
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("prose-headings:mt-5");
    expect(markup).toContain("prose-headings:mb-2");
    expect(markup).toContain("prose-p:my-0");
    expect(markup).toContain("prose-ul:my-1");
    expect(markup).toContain("prose-ul:leading-[1.45]");
    expect(markup).toContain("prose-ul:text-[13px]");
    expect(markup).toContain("prose-li:my-0");
    expect(markup).toContain("prose-li:text-[13px]");
  });

  it("renders reasoning cards separately from assistant bubble content", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-1",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Analyzing requirements before generating code.",
            summary: "Planning",
          }),
          createMessageTextContent({
            text: "I created a complete front-to-back app scaffold.",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    const reasoningIndex = markup.indexOf(
      'data-chat-assistant-reasoning-card="true"',
    );
    const bubbleIndex = markup.indexOf('data-chat-assistant-bubble="true"');

    expect(reasoningIndex).toBeGreaterThan(-1);
    expect(bubbleIndex).toBeGreaterThan(-1);
    expect(reasoningIndex).toBeLessThan(bubbleIndex);
    expect(markup).toContain('data-chat-thinking-section="true"');
    expect(markup).toContain('data-chat-assistant-activity-section="true"');
    expect(markup).not.toContain("rounded-md border border-setta-200/70");
    expect(markup).toContain(
      "group flex w-full max-w-[min(90%,820px)] flex-col items-start gap-2",
    );
  });

  it("does not render an empty assistant bubble when message only has reasoning", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-only",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Evaluating options.",
            summary: "Reasoning",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain('data-chat-assistant-reasoning-card="true"');
    expect(markup).not.toContain('data-chat-assistant-bubble="true"');
  });

  it("shows a thinking timer when a reasoning block is actively streaming", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-streaming",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Reviewing the code paths before making edits.",
            summary: "Reviewing code paths",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    expect(markup).toContain('data-chat-thinking-timer="true"');
    expect(markup).toContain("00:00");
  });

  it("keeps streaming activity titles stable while summary metadata updates in the thought row", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-streaming-stable-summary",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Interim reasoning body that changes quickly.",
            summary: "Interim summary text available while streaming.",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    const activityTitleTag = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(activityTitleTag).toContain("Thinking");
    expect(markup).toContain("Interim summary text available while streaming.");
    expect(markup).toContain(
      'data-chat-assistant-activity-thought-scroll="true"',
    );
    expect(markup).toContain(
      'data-chat-assistant-activity-thought-scroll-enabled="false"',
    );
  });

  it("keeps streaming activity titles generic instead of mirroring the full thought sentence", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-streaming-meaningful-line",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking:
              "-\n- \n1.\nReviewing grouped activity rows before final answer output.",
            summary: "",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    const activityTitleTag = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(activityTitleTag).toContain("Thinking");
    expect(markup).toContain(
      "Reviewing grouped activity rows before final answer output.",
    );
  });

  it("marks thoughts complete once answer text has started streaming", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-streaming-with-text",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Drafting a concise answer for the user.",
            summary: "",
          }),
          createMessageTextContent({
            text: "Here is the answer while remaining tokens stream.",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    const activityTitleTag = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(activityTitleTag).toContain("Reasoning");
    expect(markup).toContain("Drafting a concise answer for the user.");
    expect(markup).toContain(
      'data-chat-assistant-activity-thought-scroll-enabled="false"',
    );
  });

  it("keeps thought rows streaming until visible answer text is present", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-streaming-empty-text",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Refining activity title timing before answer output.",
            summary: "",
          }),
          createMessageTextContent({
            text: "   ",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    expect(markup).toContain('data-chat-thinking-item-rail-state="running"');
    const activityTitleTag = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(activityTitleTag).toContain("Thinking");
    expect(markup).not.toContain('data-chat-assistant-bubble="true"');
  });

  it("does not show right-side checkmarks for completed reasoning sections", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-complete-status",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Reasoning content that can be expanded.",
            summary: "Reasoning summary",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).not.toContain('data-chat-thinking-complete-icon="true"');
    expect(markup).not.toContain(">Complete<");
  });

  it("does not duplicate summary text into preview when thinking body is empty", () => {
    const summary = "Evaluating workspace navigator priority";
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-summary-fallback",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "",
            summary,
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(countOccurrences(markup, summary)).toBeGreaterThanOrEqual(2);
    expect(markup).not.toContain(
      'data-chat-assistant-activity-thought-scroll="true"',
    );
  });

  it("renders thinking summaries inside the sequential actions list", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-summary-non-expandable",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "",
            summary: "Short summary",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain('data-chat-assistant-activity-items="true"');
    expect(countOccurrences(markup, 'data-chat-thinking-section="true"')).toBe(
      1,
    );
    expect(markup).toContain('data-chat-thinking-expandable="false"');
    expect(markup).not.toContain('data-chat-thinking-chevron="true"');
    expect(markup).not.toContain(
      'data-chat-assistant-activity-thought-scroll="true"',
    );
  });

  it("shows thinking rows with chevron affordances when expandable", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-expandable-chevron",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Analyzing dependency graph before writing output.",
            summary: "Reviewing approach",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(countOccurrences(markup, 'data-chat-thinking-section="true"')).toBe(
      1,
    );
    expect(markup).toContain('data-chat-thinking-expandable="true"');
    expect(markup).toContain('data-chat-thinking-chevron="true"');
    const activityTitleTag = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(activityTitleTag).toContain("Reasoning");
    expect(markup).toContain("Reviewing approach");
  });

  it("preserves sequential thought ordering and latest summary in the activity header", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-grouped-thoughts",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "First thought body",
            summary: "First summary",
          }),
          createMessageThinkingContent({
            thinking: "Second thought body",
            summary: "Second summary",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(countOccurrences(markup, 'data-chat-thinking-section="true"')).toBe(
      2,
    );
    const activityTitleTag = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(activityTitleTag).toContain("Thoughts");
    expect(markup).toContain("First summary");
    expect(markup).toContain("Second summary");
  });

  it("groups consecutive thinking-only assistant messages into one sequential activity section", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-consecutive-1",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "First message thought body",
            summary: "First summary",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
      {
        id: "m-reasoning-consecutive-2",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Second message thought body",
            summary: "Second summary",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(
      countOccurrences(markup, 'data-chat-assistant-activity-section="true"'),
    ).toBe(1);
    expect(
      countOccurrences(markup, 'data-chat-assistant-activity-items="true"'),
    ).toBe(1);
    expect(countOccurrences(markup, 'data-chat-thinking-section="true"')).toBe(
      2,
    );
    const activityTitleTag = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(activityTitleTag).toContain("Thoughts");
    expect(markup).not.toContain('data-chat-assistant-bubble="true"');
  });

  it("groups consecutive thought, action, and tool-call messages under one parent activity section", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-activity-mix-thought",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Planning the next steps.",
            summary: "Planning",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
      {
        id: "m-activity-mix-action",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "activity-action-call",
            type: "function",
            function: {
              name: "command_execution",
              arguments: { command: "rg --files" },
            },
          },
        ],
      },
      {
        id: "m-activity-mix-tool",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "activity-tool-call",
            type: "function",
            function: {
              name: "setta__list_files",
              arguments: { scope: "frontend" },
            },
          },
        ],
      },
      {
        id: "m-activity-mix-action-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "activity-action-call",
        tool_name: "command_execution",
        arguments: { command: "rg --files" },
        result: "frontend/src/App.tsx",
        content: [],
        is_error: false,
      },
      {
        id: "m-activity-mix-tool-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "activity-tool-call",
        tool_name: "setta__list_files",
        arguments: { scope: "frontend" },
        result: { files: ["App.tsx"] },
        content: [],
        is_error: false,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(
      countOccurrences(markup, 'data-chat-assistant-activity-section="true"'),
    ).toBe(1);
    expect(
      countOccurrences(markup, 'data-chat-assistant-activity-items="true"'),
    ).toBe(1);
    expect(countOccurrences(markup, 'data-chat-thinking-section="true"')).toBe(
      1,
    );
    expect(countOccurrences(markup, 'data-chat-tool-call-item="true"')).toBe(1);
    expect(countOccurrences(markup, 'data-chat-tool-call-item="true"')).toBe(1);
  });

  it("merges trailing assistant thought activity into the preceding activity-only run", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-activity-merge-action",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "activity-merge-tool-call",
            type: "function",
            function: {
              name: "setta__get_latest_lsp_diagnostics",
              arguments: {},
            },
          },
        ],
      },
      {
        id: "m-activity-merge-tool-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "activity-merge-tool-call",
        tool_name: "setta__get_latest_lsp_diagnostics",
        arguments: {},
        result: { diagnostics: [] },
        content: [],
        is_error: false,
      },
      {
        id: "m-activity-merge-bubble",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking:
              "Perfect! No diagnostics errors. Let me create a summary for the user.",
            summary: "No diagnostics errors.",
          }),
          createMessageTextContent({
            text: "No diagnostics were found. Everything looks good.",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(
      countOccurrences(markup, 'data-chat-assistant-activity-section="true"'),
    ).toBe(1);
    expect(countOccurrences(markup, 'data-chat-thinking-section="true"')).toBe(
      1,
    );
    expect(countOccurrences(markup, 'data-chat-tool-call-item="true"')).toBe(1);
    expect(countOccurrences(markup, 'data-chat-assistant-bubble="true"')).toBe(
      1,
    );
  });

  it("renders row copy controls with row copies hidden by default", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-activity-copy-controls",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Reviewing files before making a change.",
            summary: "Reviewing files",
          }),
        ],
        attachments: [],
        tool_calls: [
          {
            id: "m-activity-copy-action-call",
            type: "function",
            function: {
              name: "command_execution",
              arguments: { command: "rg --files" },
            },
          },
          {
            id: "m-activity-copy-tool-call",
            type: "function",
            function: {
              name: "setta__list_files",
              arguments: { scope: "frontend" },
            },
          },
        ],
      },
      {
        id: "m-activity-copy-action-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "m-activity-copy-action-call",
        tool_name: "command_execution",
        arguments: { command: "rg --files" },
        result: "frontend/src/App.tsx",
        content: [],
        is_error: false,
      },
      {
        id: "m-activity-copy-tool-result",
        role: ChatRoleEnum.tool,
        tool_call_id: "m-activity-copy-tool-call",
        tool_name: "setta__list_files",
        arguments: { scope: "frontend" },
        result: { files: ["App.tsx"] },
        content: [],
        is_error: false,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).not.toContain(
      'data-chat-assistant-activity-copy-button="true"',
    );
    expect(markup).toContain('data-chat-assistant-activity-trigger="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('data-state="closed"');
    const activitySectionTag = getTagByMarker(
      markup,
      'data-chat-assistant-activity-section="true"',
    );
    expect(activitySectionTag).not.toBeNull();
    expect(activitySectionTag).toContain(
      'class="w-full overflow-hidden bg-transparent"',
    );
    const activityAnchorTag = getTagByMarker(
      markup,
      'data-chat-assistant-activity-anchor="true"',
    );
    expect(activityAnchorTag).not.toBeNull();
    expect(activityAnchorTag).toContain("mt-4");
    const activityContentTag = getTagByMarker(
      markup,
      'data-chat-assistant-activity-content="true"',
    );
    expect(activityContentTag).not.toBeNull();
    expect(activityContentTag).toContain("overflow-hidden");
    expect(activityContentTag).toContain("pt-1");
    expect(activityContentTag).not.toContain("pl-0.5");
    expect(activityContentTag).not.toContain("pr-");
    expect(activityContentTag).toContain("data-[state=closed]:hidden");
    expect(activityContentTag).toContain("data-[state=open]:block");
    expect(activityContentTag).not.toContain("data-[state=closed]:h-0");
    expect(activityContentTag).not.toContain("animate-slideUp");
    expect(activityContentTag).not.toContain("animate-slideDown");
    expect(markup).toContain(
      "flex w-full flex-col border border-setta-200/70 dark:border-setta-700/70",
    );
    expect(activityContentTag).not.toContain("border-t");
    expect(markup).toContain("items-stretch text-left");
    expect(markup).not.toContain("items-stretch pl-0.5 text-left");
    expect(markup).not.toContain("px-2 pb-1");
    expect(markup).toContain(
      'data-chat-assistant-activity-open-all-button="true"',
    );
    expect(markup).toContain('title="Open all activity details"');
    expect(markup).toContain(">Open all</button>");
    const parentHoverMetaTag = getTagByMarker(
      markup,
      'data-chat-assistant-activity-hover-meta="true"',
    );
    expect(parentHoverMetaTag).not.toBeNull();
    expect(parentHoverMetaTag).toContain("opacity-0");
    expect(parentHoverMetaTag).toContain("pointer-events-none");
    expect(markup).toContain('data-chat-assistant-activity-header-row="true"');
    expect(markup).toContain(
      'data-chat-assistant-activity-header-top-row="true"',
    );
    expect(markup).not.toContain(
      'data-chat-assistant-activity-preview-row="true"',
    );
    expect(markup).toContain("h-9");
    expect(markup).toContain("overflow-hidden");
    const activityTitleTag = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(activityTitleTag).not.toBeNull();
    expect(activityTitleTag).toContain("Action: setta__list_files");
    expect(
      countOccurrences(markup, 'data-chat-activity-item-copy-button="true"'),
    ).toBe(0);
    expect(markup).not.toContain('data-chat-activity-item-copy-kind="thought"');
    expect(markup).not.toContain('data-chat-activity-item-copy-kind="action"');
    expect(markup).not.toContain('data-chat-activity-item-copy-kind="tool"');
  });

  it("shows thought preview text when latest activity row is an action", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-action-latest-with-thought-preview",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Reviewing command sequence order for the timeline.",
            summary: "",
          }),
        ],
        attachments: [],
        tool_calls: [
          {
            id: "m-action-latest-with-thought-preview-call",
            type: "function",
            function: {
              name: "command_execution",
              arguments: { command: "/bin/zsh -lc ls" },
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("Action: /bin/zsh -lc ls");
    expect(markup).toContain(
      'data-chat-assistant-activity-thought-scroll="true"',
    );
    const activityTitleTag = getDivHtmlByMarker(
      markup,
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(activityTitleTag).not.toBeNull();
    expect(activityTitleTag).toContain("Action: /bin/zsh -lc ls");
    expect(markup).not.toContain(
      'data-chat-assistant-activity-preview-row="true"',
    );
    const activityTriggerTag = getTagByMarker(
      markup,
      'data-chat-assistant-activity-trigger="true"',
    );
    expect(activityTriggerTag).not.toBeNull();
    expect(activityTriggerTag).toContain("flex-col");
    const previewShellTag = getTagByMarker(
      markup,
      'data-chat-assistant-activity-thought-preview-shell="true"',
    );
    expect(previewShellTag).not.toBeNull();
    expect(previewShellTag).toContain("w-full");
  });

  it("derives a collapsed thought title from thinking text when summary is unavailable", () => {
    const thinking = "Comparing candidate implementations for chat rendering.";
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-thinking-only",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking,
            summary: "",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain(
      "Comparing candidate implementations for chat rendering.",
    );
    expect(markup).not.toContain(
      "Summary unavailable. Expand to view full reasoning.",
    );
    expect(markup).toContain(
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(markup).toContain(
      'data-chat-assistant-activity-thought-scroll="true"',
    );
    expect(markup).toContain(
      'data-chat-assistant-activity-thought-markdown-preview="true"',
    );
    expect(markup).toContain("top-bottom-fade");
    expect(markup).toContain("h-9");
    expect(markup).toContain("pb-1.5");
  });

  it("renders thought previews through the compact markdown surface", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-thinking-preview-markdown",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: [
              "Preview heading",
              "",
              "- compact bullet",
              "- second",
            ].join("\n"),
            summary: "",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain(
      'data-chat-assistant-activity-thought-markdown-preview="true"',
    );
    expect(markup).toContain("<li>compact bullet</li>");
    expect(markup).toContain("<li>second</li>");
  });

  it("renders collapsed reasoning summaries as markdown inline", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-markdown-summary",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking:
              "Detailed reasoning body that should stay in expanded content.",
            summary: "**Confirming no slash commands**",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("<strong>Confirming no slash commands</strong>");
    expect(markup).not.toContain("**Confirming no slash commands**");
  });

  it("shows only the first summary line in collapsed view when detailed thinking exists", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-summary-first-line-only",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking:
              "Detailed reasoning body that should only be visible when expanded.",
            summary:
              "**Confirming no slash commands**\nI don't support slash commands; I'll ask what specific functionality or help is needed instead.",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("<strong>Confirming no slash commands</strong>");
    expect(markup).not.toContain(
      "I don't support slash commands; I'll ask what specific functionality or help is needed instead.",
    );
  });

  it("shows only the first summary line in collapsed view for summary-only reasoning", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-summary-only-first-line",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "",
            summary:
              "**Confirming no slash commands**\nI don't support slash commands; I'll ask what specific functionality or help is needed instead.",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("<strong>Confirming no slash commands</strong>");
    expect(markup).not.toContain(
      "I don't support slash commands; I'll ask what specific functionality or help is needed instead.",
    );
    expect(markup).toContain('data-chat-thinking-section="true"');
  });

  it("derives a concise collapsed title when summary mirrors thinking text", () => {
    const mirroredText =
      "**Confirming no slash commands** I don't support slash commands.";
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-mirrored-summary",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: mirroredText,
            summary: mirroredText,
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
      "Summary unavailable. Expand to view full reasoning.",
    );
    expect(markup).toContain(
      'data-chat-assistant-activity-primary-label="true"',
    );
    expect(markup).toContain(
      'data-chat-assistant-activity-thought-scroll="true"',
    );
    expect(markup).toContain("Confirming no slash commands");
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

  it("does not inject a typing marker class inside assistant bubbles", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-streaming-empty",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: "Streaming response body",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    expect(markup).toContain('data-chat-assistant-bubble="true"');
    expect(markup).not.toContain('class="chat-typing"');
    expect(markup).not.toContain('class="chat-typing-inline"');
  });

  it("shows the braille typing indicator when waiting before assistant output starts", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-user-pending",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Run a command" })],
        attachments: [],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    expect(markup).toContain('data-chat-assistant-typing-indicator="true"');
    expect(markup).toContain('data-unicode-spinner="braille"');
    expect(markup).not.toContain('class="chat-typing-inline"');
    expect(markup).not.toContain('data-chat-assistant-bubble="true"');
  });

  it("does not render fully empty assistant messages after streaming completes", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-empty-assistant",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).not.toContain("m-empty-assistant");
    expect(markup).not.toContain('data-chat-assistant-bubble="true"');
  });

  it("anchors actions outside bubble sides with hover-only visibility", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-user-actions",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Action styling check" })],
        attachments: [],
      },
      {
        id: "m-assistant-actions",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: "Assistant action placement check",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={messages}
        waitingForResponse={false}
        onEditMessage={() => true}
      />,
    );

    expect(markup).toContain("pt-1");
    expect(markup).toContain('data-chat-actions-anchor="left"');
    expect(markup).toContain('data-chat-actions-anchor="right"');
    expect(markup).toContain("absolute right-full top-1/2");
    expect(markup).toContain("absolute left-full top-1/2");
    expect(markup).toContain(
      "pointer-events-none relative z-[1] inline-flex flex-col items-center gap-1 rounded-md",
    );
    expect(markup).toContain("@[40rem]/chat-message:flex-row");
    expect(markup).toContain("group-hover:opacity-100");
    expect(markup).toContain(
      "rounded-md border border-setta-200/90 bg-setta-100/95",
    );
    expect(markup).toContain("dark:bg-setta-925/95");
    expect(markup).toContain("@container/chat-message");
  });

  it("keeps assistant actions available when message only has tool-call sections", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-assistant-tool-only",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "tool-only-1",
            type: "function",
            function: {
              name: "mcp__workspace__read_file",
              arguments: {
                path: "README.md",
              },
            },
          },
        ],
      },
      {
        id: "m-tool-result-1",
        role: ChatRoleEnum.tool,
        tool_call_id: "tool-only-1",
        tool_name: "mcp__workspace__read_file",
        arguments: {
          path: "README.md",
        },
        result: "ok",
        is_error: false,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain('data-chat-assistant-tool-call-card="true"');
    expect(markup).toContain('data-chat-actions-anchor="right"');
    expect(markup).toContain('data-chat-message-actions="true"');
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

describe("buildCopyTextForMessage", () => {
  it("includes tool call details when assistant content is empty", () => {
    const message: BaseChatMessageUnion = {
      id: "assistant-tool-copy",
      role: ChatRoleEnum.assistant,
      content: [],
      attachments: [],
      tool_calls: [
        {
          id: "tool-copy-1",
          type: "function",
          function: {
            name: "mcp__figma-desktop__get_design_context",
            arguments: { nodeId: "1:2" },
          },
        },
      ],
    };
    const text = buildCopyTextForMessage({
      message,
      toolCallArguments: {},
      toolResultsById: {
        "tool-copy-1": {
          role: ChatRoleEnum.tool,
          tool_call_id: "tool-copy-1",
          tool_name: "mcp__figma-desktop__get_design_context",
          arguments: { nodeId: "1:2" },
          result: { ok: true },
          content: [],
          is_error: false,
          started_at: "2026-01-01T00:00:00Z",
          completed_at: null,
          id: "tool-result-1",
        },
      },
    });

    expect(text).toContain("mcp__figma-desktop__get_design_context");
    expect(text).toContain("Arguments:");
    expect(text).toContain('"nodeId": "1:2"');
    expect(text).toContain("Result:");
    expect(text).toContain('"ok": true');
  });
});
