import { renderToStaticMarkup } from "react-dom/server";
import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { C } from "utils/c";
import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageTextContent,
  createSharePolicy,
  type SharePolicy,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatMessageList } from "./ChatMessages";

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
    expect(editButton).not.toBeNull();
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
          {
            type: C.LLM_TEXT,
            text: "[Error] Your credit balance is too low.",
          },
        ],
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

  it("strips no_thinking wrapper tags from assistant text", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m2",
        role: ChatRoleEnum.assistant,
        content: [
          {
            type: C.LLM_TEXT,
            text: "<no_thinking>Build complete</no_thinking>",
          },
        ],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("Build complete");
    expect(markup).not.toContain("no_thinking");
  });

  it("renders text-encoded function calls as failed tool cards", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m3",
        role: ChatRoleEnum.assistant,
        content: [
          {
            type: C.LLM_TEXT,
            text: [
              "I will call tools now.",
              "<function_calls>",
              '<invoke name="setta__create_top_level_section">',
              '<parameter name="projectConfigId">13</parameter>',
              '<parameter name="implType">GlobalVariables</parameter>',
              '<parameter name="name">Config</parameter>',
              "</invoke>",
              "</function_calls>",
            ].join("\n"),
          },
        ],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("setta__create_top_level_section");
    expect(markup).toContain("text-red-500");
    expect(markup).not.toContain("&lt;function_calls&gt;");
    expect(markup).not.toContain("&lt;invoke");
  });

  it("does not render fallback failed cards when real tool calls exist", () => {
    const toolCallId = "tc-1";
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m4",
        role: ChatRoleEnum.assistant,
        content: [
          {
            type: C.LLM_TEXT,
            text: [
              "<function_calls>",
              '<invoke name="setta__get_app_catalog">',
              '<parameter name="projectConfigId">13</parameter>',
              "</invoke>",
              "</function_calls>",
            ].join("\n"),
          },
        ],
        tool_calls: [
          {
            id: toolCallId,
            type: "function",
            function: {
              name: "setta__get_app_catalog",
              arguments: { projectConfigId: 13 },
            },
          },
        ],
      },
      {
        id: "tool-msg-1",
        role: ChatRoleEnum.tool,
        tool_call_id: toolCallId,
        tool_name: "setta__get_app_catalog",
        arguments: { projectConfigId: 13 },
        result: { ok: true },
        content: [],
        is_error: false,
        started_at: "2026-01-01T00:00:00Z",
        completed_at: "2026-01-01T00:00:01Z",
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList messages={messages} waitingForResponse={false} />,
    );

    expect(markup).toContain("setta__get_app_catalog");
    expect(markup).not.toContain(
      "Tool call was returned as plain text and was not executed.",
    );
  });
});
