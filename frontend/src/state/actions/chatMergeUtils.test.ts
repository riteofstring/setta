import {
  mergeChatMessages,
  reconcileHydratedChatMessages,
} from "state/actions/chatMergeUtils";
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

  it("drops local-only messages when hydrate is not preserving in-flight overlays", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "msg-remote",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Remote message" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "msg-local",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Local only" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      preserveLocalOnlyActivityMessages: false,
    });

    expect(reconciled.map((message) => message.id)).toEqual(["msg-remote"]);
  });

  it("keeps only local activity rows when hydrate preserves local-only activity", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "msg-remote",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Remote message" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "assistant-local-only",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Local only" })],
          attachments: [],
          tool_calls: null,
        },
        {
          id: "tool-local-activity",
          role: ChatRoleEnum.tool,
          tool_call_id: "call-local",
          tool_name: "setta__tool",
          arguments: {},
          result: null,
          content: [],
          is_error: false,
          started_at: "2026-03-01T00:00:00Z",
          completed_at: null,
        },
      ],
      preserveLocalOnlyActivityMessages: true,
    });

    expect(reconciled.map((message) => message.id)).toEqual([
      "msg-remote",
      "tool-local-activity",
    ]);
  });
});
