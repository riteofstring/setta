import { mergeChatMessages } from "state/actions/chatMergeUtils";
import { ChatRoleEnum, createMessageTextContent } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("chatMergeUtils", () => {
  it("prefers the more complete message when ids match", () => {
    const existing = [
      {
        id: "msg-1",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "short" })],
        attachments: [],
        tool_calls: null,
      },
    ];
    const incoming = [
      {
        id: "msg-1",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "longer content here" })],
        attachments: [],
        tool_calls: null,
      },
    ];

    const merged = mergeChatMessages(existing, incoming);

    expect(merged).toHaveLength(1);
    const message = merged[0];
    expect(message.role).toBe(ChatRoleEnum.assistant);
    expect(message.content?.[0]?.type).toBe("text");
    if (message.content?.[0]?.type === "text") {
      expect(message.content[0].text).toBe("longer content here");
    }
  });

  it("adds new messages by id", () => {
    const existing = [
      {
        id: "msg-1",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "First" })],
        attachments: [],
      },
    ];
    const incoming = [
      {
        id: "msg-2",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Second" })],
        attachments: [],
        tool_calls: null,
      },
    ];

    const merged = mergeChatMessages(existing, incoming);

    const mergedIds = merged.map((message) => message.id);
    expect(mergedIds).toContain("msg-1");
    expect(mergedIds).toContain("msg-2");
  });
});
