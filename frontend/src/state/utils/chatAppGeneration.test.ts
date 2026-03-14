import { createAgentRun, createUserChatMessage } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  collectChatAppGenerationDetailsByChatId,
  getDefaultChatAppGenerationDetails,
  normalizeChatAppGenerationContext,
  recordChatAppGenerationForMessage,
  removeChatAppGenerationForMessage,
} from "./chatAppGeneration";

describe("chatAppGeneration", () => {
  it("normalizes missing or empty app-generation values to nulls", () => {
    expect(normalizeChatAppGenerationContext(null)).toBeNull();
    expect(
      normalizeChatAppGenerationContext({
        mode: "json_render",
        referenceImageUrl: "  ",
        referenceImageNotes: "  layout first  ",
      }),
    ).toEqual({
      mode: "json_render",
      referenceImageUrl: null,
      referenceImageNotes: "layout first",
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
      referenceImageUrl: null,
      referenceImageNotes: null,
    });
    const extended = recordChatAppGenerationForMessage(recorded, "msg-b", {
      mode: "json_render",
      referenceImageUrl: null,
      referenceImageNotes: null,
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

  it("rebuilds app-generation context from authoritative runs by chat id", () => {
    const detailsByChatId = collectChatAppGenerationDetailsByChatId([
      createAgentRun({
        id: "run-early",
        startedAt: "2026-03-10T00:00:00Z",
        finishedAt: "2026-03-10T00:00:01Z",
        inputs: {
          chatId: "chat-1",
          appGenerationMode: "prompt_builder",
          messages: [{ id: "msg-1" }],
        },
      }),
      createAgentRun({
        id: "run-late",
        startedAt: "2026-03-10T00:00:02Z",
        finishedAt: "2026-03-10T00:00:03Z",
        inputs: {
          chatId: "chat-1",
          appGenerationMode: "json_render_with_image",
          appGenerationReferenceImageUrl: "https://example.com/reference.png",
          appGenerationReferenceImageNotes: "Preserve the layout rhythm.",
          messages: [{ id: "msg-2" }],
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
        mode: "json_render_with_image",
        referenceImageUrl: "https://example.com/reference.png",
        referenceImageNotes: "Preserve the layout rhythm.",
      },
      appGenerationByMessageId: {
        "msg-1": {
          mode: "prompt_builder",
          referenceImageUrl: null,
          referenceImageNotes: null,
        },
        "msg-2": {
          mode: "json_render_with_image",
          referenceImageUrl: "https://example.com/reference.png",
          referenceImageNotes: "Preserve the layout rhythm.",
        },
      },
    });
    expect(detailsByChatId["chat-2"]).toBeUndefined();
  });
});
