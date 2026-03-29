import {
  mergeChatMessages,
  reconcileHydratedChatMessages,
} from "state/actions/chatMergeUtils";
import {
  ChatRoleEnum,
  createMessageTextContent,
  createMessageThinkingContent,
} from "utils/generatedTypes";
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

  it("drops local-only messages when backend hydration is authoritative", () => {
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
    });

    expect(reconciled.map((message) => message.id)).toEqual(["msg-remote"]);
  });

  it("replaces same-id assistant content with backend state", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "msg-streaming",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Backend canonical" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "msg-streaming",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Local speculative" })],
          attachments: [],
          tool_calls: null,
        },
      ],
    });

    expect(reconciled).toEqual([
      {
        id: "msg-streaming",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Backend canonical" })],
        attachments: [],
        tool_calls: null,
      },
    ]);
  });

  it("preserves local createdAt when backend replaces a message", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "assistant-complete",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageTextContent({ text: "Backend canonical" }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "assistant-complete",
          role: ChatRoleEnum.assistant,
          createdAt: 1234,
          content: [
            createMessageTextContent({ text: "Local stale" }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ],
    });

    expect(reconciled).toEqual([
      {
        id: "assistant-complete",
        role: ChatRoleEnum.assistant,
        createdAt: 1234,
        content: [createMessageTextContent({ text: "Backend canonical" })],
        attachments: [],
        tool_calls: null,
      },
    ]);
  });

  it("takes backend thinking text verbatim for same-id hydration replacement", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "assistant-thinking-complete",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking: "Backend thought",
              summary: "Backend summary",
            }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "assistant-thinking-complete",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking: "Local stale thought",
              summary: "",
            }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ],
    });

    expect(reconciled[0]?.content).toEqual([
      createMessageThinkingContent({
        thinking: "Backend thought",
        summary: "Backend summary",
      }),
    ]);
  });

  it("drops local-only messages even when backend returns no messages", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [],
      localMessages: [
        {
          id: "assistant-local-only",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Local only" })],
          attachments: [],
          tool_calls: null,
        },
      ],
    });

    expect(reconciled).toEqual([]);
  });
});
