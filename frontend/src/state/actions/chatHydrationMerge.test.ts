import { reconcileHydratedChatMessages } from "state/actions/chatHydrationMerge";
import {
  ChatRoleEnum,
  createMessageTextContent,
  createMessageThinkingContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("chatHydrationMerge", () => {
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

  it("prefers longer backend assistant text while preserving waiting-thread overlays", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "assistant-streaming",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Hello world" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "assistant-streaming",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Hel" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      preserveLocalOnlyMessages: true,
    });

    expect(reconciled[0]?.content).toEqual([
      createMessageTextContent({ text: "Hello world" }),
    ]);
  });

  it("takes the backend assistant text verbatim for completed hydration ties", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "assistant-complete",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "dog" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "assistant-complete",
          role: ChatRoleEnum.assistant,
          createdAt: 1234,
          content: [createMessageTextContent({ text: "cat" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      preserveLocalOnlyMessages: false,
    });

    expect(reconciled).toEqual([
      {
        id: "assistant-complete",
        role: ChatRoleEnum.assistant,
        createdAt: 1234,
        content: [createMessageTextContent({ text: "dog" })],
        attachments: [],
        tool_calls: null,
      },
    ]);
  });

  it("takes backend thinking text verbatim for completed hydration ties", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "assistant-thinking-complete",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking: "dog",
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
          createdAt: 5678,
          content: [
            createMessageThinkingContent({
              thinking: "cat",
            }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ],
      preserveLocalOnlyMessages: false,
    });

    expect(reconciled).toEqual([
      {
        id: "assistant-thinking-complete",
        role: ChatRoleEnum.assistant,
        createdAt: 5678,
        content: [
          createMessageThinkingContent({
            thinking: "dog",
          }),
        ],
        attachments: [],
        tool_calls: null,
      },
    ]);
  });

  it("prefers longer backend thinking text while preserving backend metadata", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "assistant-thinking",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking: "Longer backend thought",
              summary: "backend-summary",
              signature: "backend-signature",
            }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "assistant-thinking",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking: "Short",
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

    expect(reconciled[0]?.content).toEqual([
      createMessageThinkingContent({
        thinking: "Longer backend thought",
        summary: "backend-summary",
        signature: "backend-signature",
      }),
    ]);
  });

  it("keeps the backend assistant block structure when local streaming content has a different shape", () => {
    const reconciled = reconcileHydratedChatMessages({
      backendMessages: [
        {
          id: "assistant-mixed",
          role: ChatRoleEnum.assistant,
          content: [
            createMessageThinkingContent({
              thinking: "Server thought",
            }),
            createMessageTextContent({ text: "Server answer" }),
          ],
          attachments: [],
          tool_calls: null,
        },
      ],
      localMessages: [
        {
          id: "assistant-mixed",
          role: ChatRoleEnum.assistant,
          content: [createMessageTextContent({ text: "Local tail" })],
          attachments: [],
          tool_calls: null,
        },
      ],
      preserveLocalOnlyMessages: true,
    });

    expect(reconciled[0]?.content).toEqual([
      createMessageThinkingContent({
        thinking: "Server thought",
      }),
      createMessageTextContent({ text: "Server answer" }),
    ]);
  });
});
