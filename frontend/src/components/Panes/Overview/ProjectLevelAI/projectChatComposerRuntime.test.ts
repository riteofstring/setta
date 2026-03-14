import {
  createAssistantChatMessage,
  createMessageTextContent,
  createUserChatMessage,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  editProjectChatComposerMessage,
  redoProjectChatComposerMessage,
  stopProjectChatComposerResponse,
  submitProjectChatComposerMessage,
  transcribeProjectChatComposerAudio,
} from "./projectChatComposerRuntime";

describe("projectChatComposerRuntime", () => {
  it("submits a first-draft project chat message and settles the new thread", async () => {
    const lifecycleEvents: Array<string> = [];
    const submitCalls: unknown[] = [];

    const submitted = await submitProjectChatComposerMessage({
      message: "Summarize this project",
      attachments: [],
      chatId: null,
      thinking: true,
      engineConfigId: "engine-1",
      isExternalEngine: false,
      externalEngineAvailable: true,
      hasLLMConfig: true,
      requiresNewThreadContinuation: false,
      newThreadSeedChatId: "seed-chat",
      surfaceId: "surface-1",
      executionSettings: {
        permissionMode: "minimal",
        searchEnabled: true,
      },
      onStartNewChat: () => {
        lifecycleEvents.push("start");
      },
      onSettleNewChat: (newChatId, succeeded) => {
        lifecycleEvents.push(`settle:${newChatId}:${String(succeeded)}`);
      },
      dependencies: {
        submitMessage: async (...args) => {
          submitCalls.push(args);
          return "chat-1";
        },
      },
    });

    expect(submitted).toBe(true);
    expect(lifecycleEvents).toEqual(["start", "settle:chat-1:true"]);
    expect(submitCalls).toEqual([
      [
        null,
        "Summarize this project",
        [],
        true,
        "engine-1",
        false,
        {
          continueFromChatId: "seed-chat",
          pendingSurfaceId: "surface-1",
          executionSettings: {
            permissionMode: "minimal",
            searchEnabled: true,
          },
        },
      ],
    ]);
  });

  it("stops project chat runtime through the extracted helper", async () => {
    const stopCalls: unknown[] = [];

    await stopProjectChatComposerResponse({
      chatId: "chat-1",
      isExternalEngine: true,
      surfaceId: "surface-1",
      dependencies: {
        stopProjectChatResponse: async (...args) => {
          stopCalls.push(args);
          return true;
        },
      },
    });

    expect(stopCalls).toEqual([["chat-1", true, "surface-1"]]);
  });

  it("edits project chat messages and selects the returned branch chat", async () => {
    const selectedChatIds: string[] = [];
    const submitEditedMessageCalls: unknown[] = [];
    const messages = [
      createUserChatMessage({
        id: "message-1",
        content: [createMessageTextContent({ text: "Original prompt" })],
      }),
    ];

    const edited = await editProjectChatComposerMessage({
      resolvedChatId: "chat-1",
      messageId: "message-1",
      text: "Updated prompt",
      attachments: [],
      requiresNewThreadContinuation: false,
      isExternalEngine: false,
      externalEngineAvailable: true,
      messages,
      thinking: false,
      engineConfigId: "engine-1",
      surfaceId: "surface-1",
      executionSettings: {
        permissionMode: "minimal",
        searchEnabled: false,
      },
      onSelectChatId: (chatId) => {
        selectedChatIds.push(chatId);
      },
      dependencies: {
        submitEditedMessage: async (args) => {
          submitEditedMessageCalls.push(args);
          return "chat-2";
        },
      },
    });

    expect(edited).toBe(true);
    expect(selectedChatIds).toEqual(["chat-2"]);
    expect(submitEditedMessageCalls).toEqual([
      {
        parentChatId: "chat-1",
        messages,
        messageId: "message-1",
        message: "Updated prompt",
        attachments: [],
        thinking: false,
        engineConfigId: "engine-1",
        isExternalEngine: false,
        agentProfileId: null,
        sectionId: null,
        pendingSurfaceId: "surface-1",
        executionSettings: {
          permissionMode: "minimal",
          searchEnabled: false,
        },
      },
    ]);
  });

  it("redos an assistant response by reusing the preceding user prompt", async () => {
    const selectedChatIds: string[] = [];
    const submitEditedMessageCalls: unknown[] = [];
    const messages = [
      createUserChatMessage({
        id: "message-user",
        content: [createMessageTextContent({ text: "Original prompt" })],
      }),
      createAssistantChatMessage({
        id: "message-assistant",
        content: [createMessageTextContent({ text: "Assistant reply" })],
      }),
    ];

    const redone = await redoProjectChatComposerMessage({
      assistantMessageId: "message-assistant",
      resolvedChatId: "chat-1",
      waitingForResponse: false,
      requiresNewThreadContinuation: false,
      engineConfigId: "engine-1",
      isExternalEngine: false,
      externalEngineAvailable: true,
      hasLLMConfig: true,
      messages,
      thinking: true,
      surfaceId: "surface-1",
      executionSettings: {
        permissionMode: "yolo",
        searchEnabled: true,
      },
      onSelectChatId: (chatId) => {
        selectedChatIds.push(chatId);
      },
      dependencies: {
        submitEditedMessage: async (args) => {
          submitEditedMessageCalls.push(args);
          return "chat-3";
        },
      },
    });

    expect(redone).toBe(true);
    expect(selectedChatIds).toEqual(["chat-3"]);
    expect(submitEditedMessageCalls).toEqual([
      {
        parentChatId: "chat-1",
        messages,
        messageId: "message-user",
        message: "Original prompt",
        attachments: [],
        thinking: true,
        engineConfigId: "engine-1",
        isExternalEngine: false,
        agentProfileId: null,
        sectionId: null,
        pendingSurfaceId: "surface-1",
        executionSettings: {
          permissionMode: "yolo",
          searchEnabled: true,
        },
      },
    ]);
  });

  it("transcribes project chat audio through the configured provider profile", async () => {
    const audioBlob = new Blob(["audio"]);
    const transcribeCalls: Array<[string, Blob]> = [];

    const result = await transcribeProjectChatComposerAudio({
      transcriptionProfileId: "profile-1",
      audioBlob,
      dependencies: {
        transcribeChatAudioWithProfile: async (profileId, blob) => {
          transcribeCalls.push([profileId, blob]);
          return "transcribed text";
        },
      },
    });

    expect(result).toBe("transcribed text");
    expect(transcribeCalls).toEqual([["profile-1", audioBlob]]);
  });
});
