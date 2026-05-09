import { renderToStaticMarkup } from "react-dom/server";
import { useAIStore, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageTextContent,
  createMessageThinkingContent,
  createPolicy,
  type Policy,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatMessageList } from "./ChatMessages";

function buildSharePolicy(overrides: Partial<Policy> = {}): Policy {
  return createPolicy(overrides);
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

describe("ChatMessages markdown code rendering", () => {
  it("renders inline code and fenced code blocks with monospace formatting hooks", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-code-1",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: [
              "Path: `frontend/src/components/Chat/ChatMessages.tsx`",
              "",
              "```ts",
              "const path = 'frontend/src/components/Chat/ChatMessages.tsx';",
              "console.log(path);",
              "```",
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

    expect(markup).toContain('data-setta-inline-code="true"');
    expect(markup).toContain("frontend/src/components/Chat/ChatMessages.tsx");
    expect(markup).toContain('data-setta-code-block="true"');
    expect(markup).toContain('aria-label="Copy code"');
    expect(markup).toContain("cm-line");
  });

  it("wraps rich assistant markdown tables in an internal overflow container", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-assistant-table-overflow",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: [
              "## Summary: What to Cut/Simplify",
              "",
              "| Feature | Action |",
              "| --- | --- |",
              "| MetaControl sections | Merge with regular params |",
              "| Name sanitization ceremony | Use IDs primarily; name mapping only when needed |",
              "",
              "```ts",
              "const sectionKinds = ['chart', 'browser', 'terminal'];",
              "```",
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

    expect(markup).toContain('data-chat-markdown-table-wrapper="true"');
    expect(markup).toContain('class="w-full table-fixed');
    expect(markup).toContain('data-setta-code-block="true"');
  });

  it("renders assistant markdown as markdown while the response is still streaming", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-streaming-markdown",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageTextContent({
            text: [
              "Based on the docs:",
              "",
              "## Core Purpose",
              "",
              "- Build apps",
              "- Stream markdown",
              "Cur",
            ].join("\n"),
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    expect(markup).toContain('data-chat-streaming-markdown="true"');
    expect(markup).toContain(
      'data-chat-streaming-markdown-mode="full-markdown"',
    );
    expect(markup).toContain("<h2>Core Purpose</h2>");
    expect(markup).toContain("<li>Build apps</li>");
    expect(markup).toContain("Stream markdown");
    expect(markup).toContain("Cur");
    expect(markup).not.toContain("## Core Purpose");
    expect(markup).not.toContain('data-chat-streaming-markdown-tail="true"');
    expect(markup).not.toContain('data-chat-streaming-character="settled"');
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

  it("auto-expands pending approval tool calls so approval controls are visible", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-approval-1",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [],
        tool_calls: [
          {
            id: "approval-1",
            type: "function",
            function: {
              name: "setta.approval",
              arguments: {},
            },
          },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={messages}
        waitingForResponse={true}
        toolCallArguments={{
          "approval-1":
            '{"approvalId":"approval-1","toolName":"setta__get_setta_docs","input":{}}',
        }}
      />,
    );

    expect(markup).toContain('data-state="open"');
    expect(markup).toContain("Approve this action?");
    expect(markup).toContain("setta__get_setta_docs");
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
