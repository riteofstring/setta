import { useAIStore } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { PLAIN_CHAT_APP_GENERATION_MESSAGE_MODE } from "state/utils/chatAppGeneration";
import {
  createMessageTextContent,
  createUserChatMessage,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultChatDetails } from "./aiChatDetails";
import {
  prepareEditedMessageRequest,
  prepareSubmitMessageRequest,
} from "./aiChatSubmissionPayload";

vi.mock("state/actions/aiAgentRuns", async () => {
  const actual =
    await vi.importActual<typeof import("./aiAgentRuns")>("./aiAgentRuns");
  return {
    ...actual,
    loadAgentRuns: vi.fn(async () => {}),
  };
});

describe("aiChatSubmissionPayload", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("prepares submit payloads with retained app-generation metadata", () => {
    // Submitting from a pending surface should preserve prior app-generation metadata.
    useAIStore.setState({
      pendingChatDetailsBySurfaceId: {
        surfaceA: {
          ...getDefaultChatDetails(),
          messages: [
            createUserChatMessage({
              id: "existing-message",
              content: [createMessageTextContent({ text: "Earlier prompt" })],
              attachments: [],
            }),
          ],
        },
      },
      pendingChatAppGenerationDetailsBySurfaceId: {
        surfaceA: {
          activeAppGeneration: null,
          appGenerationByMessageId: {
            "existing-message": { mode: "image_generation" },
          },
        },
      },
    });

    const prepared = prepareSubmitMessageRequest({
      chatId: null,
      message: "Follow up on the generated image",
      attachments: [],
      thinking: true,
      engineConfigId: "engine-primary",
      options: {
        pendingSurfaceId: "surfaceA",
      },
    });

    expect(prepared).not.toBeNull();
    expect(prepared?.resolvedPendingSurfaceId).toBe("surfaceA");
    expect(prepared?.requestPayload.appGenerationMode).toBeNull();
    expect(prepared?.requestPayload.appGenerationByMessageId).toEqual({
      "existing-message": "image_generation",
      [prepared!.requestPayload.message.id]:
        PLAIN_CHAT_APP_GENERATION_MESSAGE_MODE,
    });
  });

  it("prepares edited-message payloads with branch metadata and app-generation mode", async () => {
    // Edited requests should carry the branch metadata the backend uses to fork history.
    const prepared = await prepareEditedMessageRequest({
      parentChatId: "chat-parent",
      messages: [
        createUserChatMessage({
          id: "msg-1",
          content: [createMessageTextContent({ text: "Original app prompt" })],
          attachments: [],
        }),
      ],
      messageId: "msg-1",
      message: "Edited app prompt",
      attachments: [],
      thinking: false,
      engineConfigId: "engine-1",
      pendingSurfaceId: "surface-target",
      appGeneration: {
        mode: "prompt_builder",
      },
    });

    expect(prepared).not.toBeNull();
    expect(prepared?.resolvedPendingSurfaceId).toBe("surface-target");
    expect(prepared?.requestPayload.branchParentChatId).toBe("chat-parent");
    expect(prepared?.requestPayload.branchFromMessageId).toBe("msg-1");
    expect(prepared?.requestPayload.appGenerationMode).toBe("prompt_builder");
    expect(prepared?.requestPayload.appGenerationByMessageId).toEqual({
      "msg-1": "prompt_builder",
    });
  });
});
