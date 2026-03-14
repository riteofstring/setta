import { createAgentRun, createUserChatMessage } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  collectChatAppGenerationDetailsByChatId,
  deserializeChatAppGenerationByMessageId,
  getDefaultChatAppGenerationDetails,
  normalizeChatAppGenerationContext,
  recordChatAppGenerationForMessage,
  removeChatAppGenerationForMessage,
  retainChatAppGenerationDetailsForMessages,
  serializeChatAppGenerationByMessageId,
  setChatAppGenerationForMessage,
} from "./chatAppGeneration";

describe("chatAppGeneration", () => {
  it("normalizes invalid app-generation values to null", () => {
    expect(normalizeChatAppGenerationContext(null)).toBeNull();
    expect(normalizeChatAppGenerationContext({ mode: "json_render" })).toEqual({
      mode: "json_render",
    });
  });

  it("records app-generation context on the submitted message and removes it cleanly", () => {
    const baseDetails = getDefaultChatAppGenerationDetails();
    const messageA = createUserChatMessage({
      id: "msg-a",
      content: [],
      attachments: [],
    });
    const messageB = createUserChatMessage({
      id: "msg-b",
      content: [],
      attachments: [],
    });
    const recorded = recordChatAppGenerationForMessage(baseDetails, "msg-a", {
      mode: "prompt_builder",
    });
    const extended = recordChatAppGenerationForMessage(recorded, "msg-b", {
      mode: "json_render",
    });

    expect(extended.activeAppGeneration?.mode).toBe("json_render");
    expect(extended.appGenerationByMessageId["msg-a"]?.mode).toBe(
      "prompt_builder",
    );

    const removed = removeChatAppGenerationForMessage(
      extended,
      [messageA, messageB],
      "msg-b",
    );

    expect(removed.activeAppGeneration?.mode).toBe("prompt_builder");
    expect(removed.appGenerationByMessageId["msg-b"]).toBeUndefined();
  });

  it("retains only the preserved message provenance when branch history is truncated", () => {
    const messageA = createUserChatMessage({
      id: "msg-a",
      content: [],
      attachments: [],
    });
    const messageB = createUserChatMessage({
      id: "msg-b",
      content: [],
      attachments: [],
    });
    const messageC = createUserChatMessage({
      id: "msg-c",
      content: [],
      attachments: [],
    });

    const details = recordChatAppGenerationForMessage(
      recordChatAppGenerationForMessage(
        getDefaultChatAppGenerationDetails(),
        "msg-a",
        { mode: "json_render" },
      ),
      "msg-c",
      { mode: "mcp_server" },
    );

    const retained = retainChatAppGenerationDetailsForMessages(details, [
      messageA,
      messageB,
    ]);

    expect(retained.activeAppGeneration?.mode).toBe("json_render");
    expect(retained.appGenerationByMessageId).toEqual({
      "msg-a": { mode: "json_render" },
    });
  });

  it("updates a retained branch message without inheriting the latest chat mode", () => {
    const messageA = createUserChatMessage({
      id: "msg-a",
      content: [],
      attachments: [],
    });
    const messageB = createUserChatMessage({
      id: "msg-b",
      content: [],
      attachments: [],
    });
    const baseDetails = recordChatAppGenerationForMessage(
      getDefaultChatAppGenerationDetails(),
      "msg-b",
      { mode: "mcp_server" },
    );

    const nextDetails = setChatAppGenerationForMessage(
      retainChatAppGenerationDetailsForMessages(baseDetails, [messageA]),
      [messageA],
      "msg-a",
      null,
    );

    expect(nextDetails.activeAppGeneration).toBeNull();
    expect(nextDetails.appGenerationByMessageId).toEqual({});
  });

  it("serializes and deserializes app-generation provenance by message id", () => {
    const serialized = serializeChatAppGenerationByMessageId({
      activeAppGeneration: { mode: "prompt_builder" },
      appGenerationByMessageId: {
        "msg-a": { mode: "prompt_builder" },
        "msg-b": { mode: "json_render" },
      },
    });

    expect(serialized).toEqual({
      "msg-a": "prompt_builder",
      "msg-b": "json_render",
    });
    expect(
      deserializeChatAppGenerationByMessageId({
        "msg-a": "prompt_builder",
        "msg-b": "json_render",
        "msg-c": "not-a-mode",
      }),
    ).toEqual({
      "msg-a": { mode: "prompt_builder" },
      "msg-b": { mode: "json_render" },
    });
  });

  it("rebuilds app-generation context from authoritative per-message runs by chat id", () => {
    const detailsByChatId = collectChatAppGenerationDetailsByChatId([
      createAgentRun({
        id: "run-early",
        startedAt: "2026-03-10T00:00:00Z",
        finishedAt: "2026-03-10T00:00:01Z",
        inputs: {
          chatId: "chat-1",
          appGenerationByMessageId: {
            "msg-1": "prompt_builder",
            "msg-2": "json_render",
          },
          messages: [
            { id: "msg-1", role: "user", content: [], attachments: [] },
            { id: "msg-2", role: "user", content: [], attachments: [] },
          ],
        },
      }),
      createAgentRun({
        id: "run-late",
        startedAt: "2026-03-10T00:00:02Z",
        finishedAt: "2026-03-10T00:00:03Z",
        inputs: {
          chatId: "chat-1",
          appGenerationByMessageId: {
            "msg-1": "prompt_builder",
            "msg-2": "json_render",
            "msg-3": "mcp_server",
          },
          appGenerationMode: "mcp_server",
          messages: [
            { id: "msg-1", role: "user", content: [], attachments: [] },
            { id: "msg-2", role: "user", content: [], attachments: [] },
            { id: "msg-3", role: "user", content: [], attachments: [] },
          ],
        },
      }),
      createAgentRun({
        id: "run-plain-chat",
        startedAt: "2026-03-10T00:00:04Z",
        finishedAt: "2026-03-10T00:00:05Z",
        inputs: {
          chatId: "chat-2",
          messages: [{ id: "msg-3" }],
        },
      }),
    ]);

    expect(detailsByChatId["chat-1"]).toEqual({
      activeAppGeneration: {
        mode: "mcp_server",
      },
      appGenerationByMessageId: {
        "msg-1": {
          mode: "prompt_builder",
        },
        "msg-2": {
          mode: "json_render",
        },
        "msg-3": {
          mode: "mcp_server",
        },
      },
    });
    expect(detailsByChatId["chat-2"]).toBeUndefined();
  });

  it("ignores legacy run-level app-generation mode when per-message provenance is missing", () => {
    const detailsByChatId = collectChatAppGenerationDetailsByChatId([
      createAgentRun({
        id: "run-legacy-only",
        startedAt: "2026-03-10T00:00:00Z",
        finishedAt: "2026-03-10T00:00:01Z",
        inputs: {
          chatId: "chat-legacy",
          appGenerationMode: "mcp_server",
          messages: [
            { id: "msg-legacy", role: "user", content: [], attachments: [] },
          ],
        },
      }),
    ]);

    expect(detailsByChatId["chat-legacy"]).toBeUndefined();
  });
});
