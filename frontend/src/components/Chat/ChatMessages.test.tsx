import { renderToStaticMarkup } from "react-dom/server";
import { useShareSession } from "state/definitions";
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
import {
  ChatMessageList,
  buildCopyTextForMessage,
  classifyDiffLineForChat,
  isUnifiedDiffText,
  resolveStructuredOutputPayload,
} from "./ChatMessages";

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

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  return haystack.split(needle).length - 1;
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
});

describe("ChatMessages structured tool output rendering", () => {
  it("classifies object payloads as json code output", () => {
    const payload = resolveStructuredOutputPayload({
      value: { ok: true, items: [1, 2, 3] },
      toolName: "mcp__workspace__read_file",
      part: "output",
      contextValue: { path: "config.json" },
    });

    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("code");
    expect(payload?.language).toBe("json");
    expect(payload?.text).toContain('"ok": true');
    expect(payload?.text).toContain('"items": [');
  });

  it("classifies unified diff payloads and line kinds deterministically", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1 +1 @@",
      "-const value = 1;",
      "+const value = 2;",
      " context line",
    ].join("\n");
    const payload = resolveStructuredOutputPayload({
      value: diff,
      toolName: "file_change",
      part: "output",
      contextValue: { path: "src/app.ts" },
    });

    expect(isUnifiedDiffText(diff)).toBe(true);
    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("diff");
    expect(classifyDiffLineForChat("diff --git a/x b/x")).toBe("meta");
    expect(classifyDiffLineForChat("--- a/x")).toBe("file");
    expect(classifyDiffLineForChat("@@ -1 +1 @@")).toBe("hunk");
    expect(classifyDiffLineForChat("-a")).toBe("del");
    expect(classifyDiffLineForChat("+b")).toBe("add");
    expect(classifyDiffLineForChat(" context")).toBe("context");
  });

  it("uses path hints to classify text output language as yaml", () => {
    const payload = resolveStructuredOutputPayload({
      value: "name: setta\nenabled: true",
      toolName: "mcp__workspace__read_file",
      part: "output",
      contextValue: { path: "configs/app.yaml" },
    });

    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("code");
    expect(payload?.language).toBe("yaml");
    expect(payload?.text).toContain("name: setta");
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

    expect(markup).toContain("Stopped Mid-Tool Call");
    expect(markup).toContain("Stopped");
    expect(markup).not.toContain("gg-spinner");
  });

  it("renders tool calls inside a single expandable section container", () => {
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
      markup.match(/data-chat-tool-call-section="true"/g) ?? []
    ).length;
    expect(sectionCount).toBe(1);
    expect(markup).toContain("Tool calls");
    expect(markup).toContain('data-chat-tool-call-count-badge="true"');
    expect(markup).toContain('data-chat-tool-call-section-chevron="true"');
    expect(markup).toContain(">2<");
    expect(markup).toContain('data-chat-assistant-tool-call-card="true"');
    expect(markup).toContain('data-chat-tool-call-section-rail="true"');
    expect(markup).toContain('data-chat-assistant-bubble="true"');
    expect(markup).toContain("grid-cols-[1.75rem_minmax(0,1fr)]");
    expect(markup).not.toContain("grid-cols-[1.5rem_minmax(0,1fr)]");
    expect(markup).not.toContain("px-0.5 pb-0.5");
  });

  it("shows elapsed timers while tool and action sections are running", () => {
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

    expect(markup).toContain("Working");
    expect(markup).toContain('data-chat-run-timer="true"');
    expect(markup).toContain("00:00");
  });

  it("shows finalized elapsed time for completed tool sections", () => {
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

    expect(markup).toContain('data-chat-run-complete-icon="true"');
    expect(markup).toContain('data-chat-run-timer="true"');
    expect(markup).toContain("00:05");
  });

  it("groups consecutive tool-only assistant messages into a single tool-call section", () => {
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
      markup.match(/data-chat-tool-call-section="true"/g) ?? []
    ).length;
    expect(sectionCount).toBe(1);
    expect(markup).toContain("Tool calls");
    expect(markup).toContain('data-chat-tool-call-count-badge="true"');
    expect(markup).toContain(">2<");
    expect(markup).not.toContain('data-chat-assistant-bubble="true"');
    expect(markup).toContain(
      "group flex w-full max-w-[min(90%,820px)] flex-col items-start gap-2",
    );
  });

  it("renders command and file operations in an actions section separate from tool calls", () => {
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

    expect(markup).toContain('data-chat-action-section="true"');
    expect(markup).toContain('data-chat-action-count-badge="true"');
    expect(markup).toContain('data-chat-action-section-chevron="true"');
    expect(markup).toContain("Actions");
    expect(markup).toContain("rg --files");
    expect(markup).toContain('data-chat-tool-call-section="true"');
    expect(markup).toContain("Tool calls");
  });

  it("renders compacted context summaries in a dedicated reasoning-like section", () => {
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

    expect(markup).toContain('data-chat-context-compaction-section="true"');
    expect(markup).toContain('data-chat-context-compaction-chevron="true"');
    expect(markup).toContain("Context compacted");
    expect(markup).toContain(
      "Summary: earlier file reads and edit intents were compacted.",
    );
    expect(markup).toContain('data-chat-run-timer="true"');
    expect(markup).toContain("00:01");
    expect(markup).not.toContain('data-chat-tool-call-section="true"');
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
    expect(assistantBubbleTag).toContain("w-fit");
    expect(assistantBubbleTag).not.toContain(" w-full ");
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

  it("keeps streaming thought previews stable as Thinking... until completion", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-reasoning-streaming-stable-summary",
        role: ChatRoleEnum.assistant,
        content: [
          createMessageThinkingContent({
            thinking: "Interim reasoning body that changes quickly.",
            summary:
              "Interim summary text that should not appear while streaming.",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={true} />,
    );

    expect(markup).toContain("Thought: Thinking...");
    expect(markup).toContain("Thinking...");
    expect(markup).not.toContain(
      "Interim summary text that should not appear while streaming.",
    );
  });

  it("shows a checkmark-only status for completed reasoning sections", () => {
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

    expect(markup).toContain('data-chat-thinking-complete-icon="true"');
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

    expect(countOccurrences(markup, summary)).toBe(2);
    expect(markup).not.toContain("top-bottom-fade");
  });

  it("renders grouped thinking summaries in a collapsed parent row", () => {
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

    expect(markup).toContain('data-chat-thinking-list-section="true"');
    expect(markup).toContain('data-chat-thinking-list-latest-summary="true"');
    expect(markup).toContain('data-chat-thinking-list-expandable="false"');
    expect(markup).not.toContain('data-chat-thinking-list-chevron="true"');
    expect(markup).not.toContain('data-chat-thinking-trigger="true"');
    expect(markup).not.toContain('data-chat-thinking-summary-expanded="true"');
  });

  it("shows grouped thinking rows with a list chevron affordance", () => {
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

    expect(markup).toContain('data-chat-thinking-list-section="true"');
    expect(markup).toContain('data-chat-thinking-list-expandable="true"');
    expect(markup).toContain('data-chat-thinking-list-chevron="true"');
    expect(markup).toContain("Thought: Reviewing approach");
  });

  it("groups consecutive thinking items into one thought section and uses the latest summary", () => {
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

    expect(
      countOccurrences(markup, 'data-chat-thinking-list-section="true"'),
    ).toBe(1);
    expect(markup).toContain('title="2 thought sections"');
    expect(markup).toContain("Thought: Second summary");
    expect(markup).not.toContain("Thought: First summary");
  });

  it("groups consecutive thinking-only assistant messages into one thought section", () => {
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
      countOccurrences(markup, 'data-chat-thinking-list-section="true"'),
    ).toBe(1);
    expect(markup).toContain('title="2 thought sections"');
    expect(markup).toContain("Thought: Second summary");
    expect(markup).not.toContain("Thought: First summary");
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
      countOccurrences(markup, 'data-chat-thinking-list-section="true"'),
    ).toBe(1);
    expect(countOccurrences(markup, 'data-chat-action-section="true"')).toBe(1);
    expect(countOccurrences(markup, 'data-chat-tool-call-section="true"')).toBe(
      1,
    );
    expect(markup).toContain("Thoughts");
    expect(markup).toContain("Actions");
    expect(markup).toContain("Tool calls");
  });

  it("uses a summary placeholder in collapsed view when summary is unavailable", () => {
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
      "Summary unavailable. Expand to view full reasoning.",
    );
    expect(markup).not.toContain("top-bottom-fade");
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
    expect(markup).toContain('data-chat-thinking-list-section="true"');
  });

  it("does not show full reasoning text in collapsed summary when summary mirrors thinking text", () => {
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

    expect(markup).toContain(
      "Summary unavailable. Expand to view full reasoning.",
    );
    expect(markup).not.toContain("**Confirming no slash commands**");
  });

  it("shows <1s for completed sections when elapsed time is sub-second", () => {
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

    expect(markup).toContain('data-chat-run-complete-icon="true"');
    expect(markup).toContain("&lt;1s");
  });

  it("shows <1s when completed timestamps round to the same second", () => {
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

    expect(markup).toContain('data-chat-run-complete-icon="true"');
    expect(markup).toContain("&lt;1s");
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

  it("shows the inline typing indicator when waiting before assistant output starts", () => {
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
    expect(markup).toContain('class="chat-typing-inline"');
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
      "pointer-events-none inline-flex items-center gap-1",
    );
    expect(markup).toContain("group-hover:opacity-100");
    expect(markup).toContain(
      "rounded-md border border-setta-200/90 bg-setta-100/95",
    );
    expect(markup).toContain("dark:bg-setta-925/95");
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
