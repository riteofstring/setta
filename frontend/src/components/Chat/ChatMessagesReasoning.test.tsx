import { renderToStaticMarkup } from "react-dom/server";
import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageTextContent,
  createMessageThinkingContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { ChatMessageList } from "./ChatMessages";
import {
  countOccurrences,
  getDivHtmlByMarker,
  getTagByMarker,
} from "./ChatMessagesReasoning.testHelpers";

describe("ChatMessages assistant reasoning layout", () => {
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
});
