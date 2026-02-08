import { renderToStaticMarkup } from "react-dom/server";
import { C } from "utils/c";
import { BaseChatMessageUnion, ChatRoleEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { ChatMessageList } from "./ChatMessages";

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
});

