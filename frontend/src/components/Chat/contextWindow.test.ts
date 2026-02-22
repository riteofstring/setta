import {
  type BaseChatMessageUnion,
  ChatRoleEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  estimateChatHistoryTokens,
  estimateTokenCountFromText,
  isLikelyCodexModel,
  resolveCodexContextWindowTokens,
  resolveEstimatedContextWindowTokens,
} from "./contextWindow";

describe("contextWindow", () => {
  it("estimates text tokens from character length", () => {
    expect(estimateTokenCountFromText("")).toBe(0);
    expect(estimateTokenCountFromText("1234")).toBe(1);
    expect(estimateTokenCountFromText("12345")).toBe(2);
  });

  it("estimates history tokens across messages and tool payloads", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "m-user",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "hello world" })],
        attachments: [],
      },
      {
        id: "m-assistant",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "done" })],
        attachments: [],
        tool_calls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "command_execution",
              arguments: { command: "ls -la" },
            },
          },
        ],
      },
    ];

    expect(estimateChatHistoryTokens(messages)).toBeGreaterThan(0);
  });

  it("resolves codex context windows with a safe default", () => {
    expect(resolveCodexContextWindowTokens("gpt-5-codex")).toBe(200000);
    expect(resolveCodexContextWindowTokens("unknown-model")).toBe(200000);
    expect(resolveCodexContextWindowTokens(null)).toBe(200000);
  });

  it("resolves estimated context windows with a safe default", () => {
    expect(resolveEstimatedContextWindowTokens("gpt-5-codex")).toBe(200000);
    expect(resolveEstimatedContextWindowTokens("unknown-model")).toBe(200000);
    expect(resolveEstimatedContextWindowTokens(null)).toBe(200000);
  });

  it("detects codex models from configured ids and names", () => {
    expect(isLikelyCodexModel("gpt-5-codex")).toBe(true);
    expect(isLikelyCodexModel("codex-latest")).toBe(true);
    expect(isLikelyCodexModel("gpt-4o")).toBe(false);
    expect(isLikelyCodexModel(null)).toBe(false);
  });
});
