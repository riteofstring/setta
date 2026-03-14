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
      preserveLocalOnlyMessages: false,
    });

    expect(reconciled.map((message) => message.id)).toEqual(["msg-remote"]);
  });

  it("keeps local-only messages when hydrate preserves in-flight overlays", () => {
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
      preserveLocalOnlyMessages: true,
    });

    expect(reconciled.map((message) => message.id)).toEqual([
      "msg-remote",
      "msg-local",
    ]);
  });

  it("keeps local streaming thought text while accepting backend summary metadata", () => {
    const localThinking =
      "Reviewing grouped activity rows before final answer output.";
    const backendSummary = "Structured summary title from backend metadata.";

    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "msg-thinking",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking: "",
              summary: backendSummary,
              signature: "backend-signature",
            }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "msg-thinking",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking: localThinking,
              summary: "",
              signature: "",
            }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ],
      preserveLocalOnlyMessages: true,
    });

    expect(reconciled).toHaveLength(1);
    const message = reconciled[0];
    expect(message.role).toBe(ChatRoleEnum.assistant);
    expect(message.content).toEqual([
      createMessageThinkingContent({
        thinking: localThinking,
        summary: backendSummary,
        signature: "backend-signature",
      }),
    ]);
  });
});
