import { useAIStore } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatFileAttachment,
  ChatPermissionModeEnum,
  createMessageTextContent,
  createUserChatMessage,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDefaultChatDetails } from "./aiChatDetails";
import {
  buildChatUserMessage,
  buildEditedMessageRequestPayload,
  buildSubmitMessageRequestPayload,
  getNextMessagesForSubmit,
  resolveChatExecutionSettings,
} from "./aiChatSubmissionRequestPayload";

function buildAttachment(
  overrides: Partial<ChatFileAttachment>,
): ChatFileAttachment {
  return {
    id: "artifacts/attachment.bin",
    name: "attachment.bin",
    mimeType: "application/octet-stream",
    size: 10,
    ...overrides,
  };
}

describe("aiChatSubmissionRequestPayload", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("builds a user message payload with text content and attachments", () => {
    // Request-payload assembly should produce the same user-message shape the backend expects.
    const attachment = buildAttachment({
      name: "notes.txt",
      mimeType: "text/plain",
    });

    const userMessage = buildChatUserMessage({
      messageId: "message-1",
      message: "Hello world",
      attachments: [attachment],
    });

    expect(userMessage).toMatchObject({
      id: "message-1",
      attachments: [attachment],
      content: [createMessageTextContent({ text: "Hello world" })],
    });
  });

  it("resolves next submit messages from the pending surface when no chat exists yet", () => {
    // Pending-surface submits should append onto the local draft history instead of starting from scratch.
    const existingMessage = createUserChatMessage({
      id: "existing-message",
      content: [createMessageTextContent({ text: "Earlier prompt" })],
      attachments: [],
    });
    useAIStore.setState({
      pendingChatDetailsBySurfaceId: {
        surfaceA: {
          ...getDefaultChatDetails(),
          messages: [existingMessage],
        },
      },
    });
    const userMessage = buildChatUserMessage({
      messageId: "message-2",
      message: "Follow up",
      attachments: [],
    });

    const nextMessages = getNextMessagesForSubmit({
      chatId: null,
      userMessage,
      resolvedPendingSurfaceId: "surfaceA",
    });

    expect(nextMessages).toEqual([existingMessage, userMessage]);
  });

  it("builds submit payloads with allow-unscoped and execution settings", () => {
    // Generic request-payload assembly should own the backend-facing execution fields.
    const executionSettings = resolveChatExecutionSettings({
      permissionMode: ChatPermissionModeEnum.accept_edits,
      searchEnabled: false,
    });
    const userMessage = buildChatUserMessage({
      messageId: "message-1",
      message: "Ship it",
      attachments: [],
    });

    const requestPayload = buildSubmitMessageRequestPayload({
      userMessage,
      thinking: true,
      chatId: "chat-1",
      continueFromChatId: "chat-0",
      engineConfigId: "engine-1",
      agentProfileId: "agent-1",
      sectionId: null,
      executionSettings,
      appGenerationMode: "prompt_builder",
      appGenerationByMessageId: {
        "message-1": "prompt_builder",
      },
    });

    expect(requestPayload).toMatchObject({
      message: userMessage,
      thinking: true,
      chatId: "chat-1",
      continueFromChatId: "chat-0",
      engineConfigId: "engine-1",
      agentProfileId: "agent-1",
      allowUnscoped: true,
      permissionMode: ChatPermissionModeEnum.accept_edits,
      searchEnabled: false,
      appGenerationMode: "prompt_builder",
      appGenerationByMessageId: {
        "message-1": "prompt_builder",
      },
    });
  });

  it("builds edited payloads with branch metadata", () => {
    // Edited-message payload assembly should keep the fork metadata separate from orchestration.
    const editedMessage = buildChatUserMessage({
      messageId: "message-1",
      message: "Edited prompt",
      attachments: [],
    });

    const requestPayload = buildEditedMessageRequestPayload({
      editedMessage,
      thinking: false,
      engineConfigId: "engine-1",
      agentProfileId: null,
      sectionId: "section-1",
      executionSettings: resolveChatExecutionSettings(null),
      appGenerationMode: null,
      appGenerationByMessageId: {},
      parentChatId: "chat-parent",
      messageId: "message-1",
    });

    expect(requestPayload).toMatchObject({
      message: editedMessage,
      chatId: null,
      branchParentChatId: "chat-parent",
      branchFromMessageId: "message-1",
      sectionId: "section-1",
      allowUnscoped: false,
    });
  });
});
