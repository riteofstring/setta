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

    const sectionCount = (markup.match(/data-chat-tool-call-section="true"/g) ?? [])
      .length;
    expect(sectionCount).toBe(1);
    expect(markup).toContain("Tool calls (2)");
    expect(markup).toContain('data-chat-assistant-tool-call-card="true"');
    expect(markup).toContain('data-chat-tool-call-section-rail="true"');
    expect(markup).toContain('data-chat-assistant-bubble="true"');
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

    const sectionCount = (markup.match(/data-chat-tool-call-section="true"/g) ?? [])
      .length;
    expect(sectionCount).toBe(1);
    expect(markup).toContain("Tool calls (2)");
    expect(markup).not.toContain('data-chat-assistant-bubble="true"');
    expect(markup).toContain(
      "group flex w-full max-w-[min(88%,800px)] flex-col items-start gap-2",
    );
  });
});

describe("ChatMessages assistant reasoning layout", () => {
  it("keeps assistant groups at the reduced max width to leave right-side room", () => {
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

    expect(markup).toContain("max-w-[min(88%,800px)]");
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
    expect(markup).toContain("border-setta-100");
    expect(markup).toContain(
      "group flex w-full max-w-[min(88%,800px)] flex-col items-start gap-2",
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

  it("keeps bubble bottom padding compact and anchors actions by role", () => {
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

    expect(markup).not.toContain("pb-6");
    expect(markup).not.toContain("bg-setta-50/85");
    expect(markup).not.toContain("border-setta-200/90");
    expect(markup).toContain("absolute bottom-0 right-0");
    expect(markup).toContain("absolute bottom-0 left-0");
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
