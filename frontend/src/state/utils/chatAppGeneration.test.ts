import { createAgentRun, createUserChatMessage } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  collectChatAppGenerationDetailsByChatId,
  deserializeChatAppGenerationByMessageId,
  getDefaultChatAppGenerationDetails,
  normalizeChatAppGenerationContext,
  resolveChatAppGenerationContextFromMessageState,
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

  it("records explicit plain-chat turns instead of reviving the earlier app-generation mode", () => {
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
    const recorded = setChatAppGenerationForMessage(
      baseDetails,
      [messageA],
      "msg-a",
      {
        mode: "prompt_builder",
      },
    );
    const extended = setChatAppGenerationForMessage(
      recorded,
      [messageA, messageB],
      "msg-b",
      {
        mode: "json_render",
      },
    );

    expect(extended.activeAppGeneration?.mode).toBe("json_render");
    expect(extended.appGenerationByMessageId["msg-a"]?.mode).toBe(
      "prompt_builder",
    );

    const removed = setChatAppGenerationForMessage(
      extended,
      [messageA, messageB],
      "msg-b",
      null,
    );

    expect(removed.activeAppGeneration).toBeNull();
    expect(removed.appGenerationByMessageId["msg-b"]).toEqual({
      mode: null,
    });
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

    const details = setChatAppGenerationForMessage(
      setChatAppGenerationForMessage(
        getDefaultChatAppGenerationDetails(),
        [messageA],
        "msg-a",
        { mode: "json_render" },
      ),
      [messageA, messageB, messageC],
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
    const baseDetails = setChatAppGenerationForMessage(
      getDefaultChatAppGenerationDetails(),
      [messageA, messageB],
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
    expect(nextDetails.appGenerationByMessageId).toEqual({
      "msg-a": { mode: null },
    });
  });

  it("serializes and deserializes app-generation provenance by message id", () => {
    const serialized = serializeChatAppGenerationByMessageId({
      activeAppGeneration: { mode: "prompt_builder" },
      appGenerationByMessageId: {
        "msg-a": { mode: "prompt_builder" },
        "msg-b": { mode: null },
      },
    });

    expect(serialized).toEqual({
      "msg-a": "prompt_builder",
      "msg-b": "plain_chat",
    });
    expect(
      deserializeChatAppGenerationByMessageId({
        "msg-a": "prompt_builder",
        "msg-b": "plain_chat",
        "msg-c": "not-a-mode",
      }),
    ).toEqual({
      "msg-a": { mode: "prompt_builder" },
      "msg-b": { mode: null },
      "msg-c": { mode: "not-a-mode" },
    });
  });

  it("resolves plain-chat message state to a null active context", () => {
    expect(
      resolveChatAppGenerationContextFromMessageState({
        mode: null,
      }),
    ).toBeNull();
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
          appGenerationByMessageId: {
            "msg-3": "plain_chat",
          },
          messages: [
            { id: "msg-3", role: "user", content: [], attachments: [] },
          ],
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
    expect(detailsByChatId["chat-2"]).toEqual({
      activeAppGeneration: null,
      appGenerationByMessageId: {
        "msg-3": {
          mode: null,
        },
      },
    });
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
