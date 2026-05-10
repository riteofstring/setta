import { renderToStaticMarkup } from "react-dom/server";
import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { ChatMessageList } from "./ChatMessages";
import {
  countOccurrences,
  getTagByMarker,
} from "./ChatMessagesReasoning.testHelpers";

describe("ChatMessages assistant reasoning basic layout", () => {
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

  it("highlights matched conversation search terms inside rendered chat bubbles", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "search-user",
        role: ChatRoleEnum.user,
        createdAt: 1,
        content: [createMessageTextContent({ text: "Queue kickoff request" })],
        attachments: [],
      },
      {
        id: "search-assistant",
        role: ChatRoleEnum.assistant,
        createdAt: 2,
        content: [
          createMessageTextContent({
            text: "Existing queue reply queue follow up",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={messages}
        allMessagesForToolResults={messages}
        waitingForResponse={false}
        toolCallArguments={{}}
        conversationSearchTerms={["queue"]}
      />,
    );

    expect(countOccurrences(markup, 'data-chat-search-highlight="true"')).toBe(
      3,
    );
    expect(markup).toContain(">Queue</mark>");
    expect(markup).toContain(">queue</mark>");
  });

  it("skips fenced and inline code when rendering conversation search highlights", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "search-markdown",
        role: ChatRoleEnum.assistant,
        createdAt: 1,
        content: [
          createMessageTextContent({
            text: "Visible alpha\n\n```ts\nalpha in code\n```\n`alpha inline`\nalpha outside",
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
        toolCallArguments={{}}
        conversationSearchTerms={["alpha"]}
      />,
    );

    expect(countOccurrences(markup, 'data-chat-search-highlight="true"')).toBe(
      2,
    );
    expect(markup).toContain(">alpha</mark>");
    expect(markup).not.toContain(">alpha in code</mark>");
    expect(markup).not.toContain(">alpha inline</mark>");
  });

  it("highlights attachment labels in the transcript", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "search-attachment",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [
          {
            id: "attachment-1",
            name: "release-plan.md",
          },
        ],
        tool_calls: null,
      },
    ];

    const markup = renderToStaticMarkup(
      <ChatMessageList
        messages={messages}
        waitingForResponse={false}
        toolCallArguments={{}}
        conversationSearchTerms={["release"]}
      />,
    );

    expect(countOccurrences(markup, 'data-chat-search-highlight="true"')).toBe(
      1,
    );
    expect(markup).toContain(">release</mark>-plan.md");
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
});
