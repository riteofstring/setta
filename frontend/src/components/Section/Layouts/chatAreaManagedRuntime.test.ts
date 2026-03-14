import { ChatRoleEnum, createMessageTextContent } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  editManagedSectionChatMessage,
  stopManagedSectionChatWithAction,
  submitManagedSectionChatMessage,
  transcribeManagedSectionChatAudio,
} from "./chatAreaManagedRuntime";

describe("chatAreaManagedRuntime", () => {
  it("submits a managed section chat message and settles first-message thread startup", async () => {
    const sendActions: unknown[] = [];
    const lifecycleEvents: Array<
      ["start"] | ["settle", string | null, boolean]
    > = [];
    const submitCalls: unknown[] = [];

    const submitted = await submitManagedSectionChatMessage({
      message: "Summarize this section",
      attachments: [],
      chatId: null,
      canUseManagedChat: true,
      hasEngineConfig: true,
      hasLLMConfig: true,
      isExternalEngine: false,
      externalEngineAvailable: true,
      thinking: true,
      effectiveEngineConfigId: "engine-1",
      agentProfileId: "agent-1",
      sectionId: "section-1",
      surfaceId: "surface-1",
      executionSettings: {
        permissionMode: "acceptEdits",
        searchEnabled: true,
      },
      onStartNewChat: () => {
        lifecycleEvents.push(["start"]);
      },
      onSettleNewChat: (newChatId, succeeded) => {
        lifecycleEvents.push(["settle", newChatId, succeeded]);
      },
      dependencies: {
        createMessageId: () => "message-1",
        getTimestampMs: () => 100,
        emitSendAction: (payload) => {
          sendActions.push(payload);
        },
        submitMessage: async (...args) => {
          submitCalls.push(args);
          return "chat-1";
        },
      },
    });

    expect(submitted).toBe(true);
    expect(sendActions).toEqual([
      {
        sectionId: "section-1",
        messageId: "message-1",
        text: "Summarize this section",
        attachments: [],
        role: ChatRoleEnum.user,
        managed: true,
        timestampMs: 100,
      },
    ]);
    expect(submitCalls).toEqual([
      [
        null,
        "Summarize this section",
        [],
        true,
        "engine-1",
        false,
        {
          messageId: "message-1",
          agentProfileId: "agent-1",
          sectionId: "section-1",
          pendingSurfaceId: "surface-1",
          executionSettings: {
            permissionMode: "acceptEdits",
            searchEnabled: true,
          },
        },
      ],
    ]);
    expect(lifecycleEvents).toEqual([["start"], ["settle", "chat-1", true]]);
  });

  it("stops a managed section chat by emitting the stop action and delegating the runtime stop", async () => {
    const stopActions: unknown[] = [];
    const stopCalls: unknown[] = [];

    await stopManagedSectionChatWithAction({
      chatId: "chat-1",
      isExternalEngine: true,
      projectConfigId: "project-1",
      sectionId: "section-1",
      surfaceId: "surface-1",
      dependencies: {
        getTimestampMs: () => 222,
        emitStopAction: (payload) => {
          stopActions.push(payload);
        },
        stopManagedSectionChatResponse: async (...args) => {
          stopCalls.push(args);
          return true;
        },
      },
    });

    expect(stopActions).toEqual([
      {
        sectionId: "section-1",
        managed: true,
        timestampMs: 222,
      },
    ]);
    expect(stopCalls).toEqual([
      ["chat-1", true, "project-1", "section-1", "surface-1"],
    ]);
  });

  it("edits a managed section chat message through submitEditedMessage", async () => {
    const submitEditedMessageCalls: unknown[] = [];

    const edited = await editManagedSectionChatMessage({
      resolvedChatId: "chat-1",
      messageId: "message-1",
      text: "Updated prompt",
      attachments: [],
      canUseManagedChat: true,
      isExternalEngine: false,
      externalEngineAvailable: true,
      messages: [
        {
          id: "message-1",
          role: ChatRoleEnum.user,
          content: [createMessageTextContent({ text: "Original prompt" })],
          attachments: [],
        },
      ],
      thinking: false,
      effectiveEngineConfigId: "engine-1",
      agentProfileId: "agent-1",
      sectionId: "section-1",
      surfaceId: "surface-1",
      executionSettings: {
        permissionMode: "acceptEdits",
        searchEnabled: false,
      },
      dependencies: {
        submitEditedMessage: async (args) => {
          submitEditedMessageCalls.push(args);
          return "chat-2";
        },
      },
    });

    expect(edited).toBe(true);
    expect(submitEditedMessageCalls).toEqual([
      {
        parentChatId: "chat-1",
        messages: [
          {
            id: "message-1",
            role: ChatRoleEnum.user,
            content: [createMessageTextContent({ text: "Original prompt" })],
            attachments: [],
          },
        ],
        messageId: "message-1",
        message: "Updated prompt",
        attachments: [],
        thinking: false,
        engineConfigId: "engine-1",
        isExternalEngine: false,
        agentProfileId: "agent-1",
        sectionId: "section-1",
        pendingSurfaceId: "surface-1",
        executionSettings: {
          permissionMode: "acceptEdits",
          searchEnabled: false,
        },
      },
    ]);
  });

  it("blocks managed section chat edit submissions when no resolved chat exists", async () => {
    const submitEditedMessage = vi.fn();

    const edited = await editManagedSectionChatMessage({
      resolvedChatId: null,
      messageId: "message-1",
      text: "Updated prompt",
      attachments: [],
      canUseManagedChat: true,
      isExternalEngine: false,
      externalEngineAvailable: true,
      messages: [],
      thinking: false,
      effectiveEngineConfigId: "engine-1",
      agentProfileId: null,
      sectionId: "section-1",
      executionSettings: {
        permissionMode: "acceptEdits",
        searchEnabled: false,
      },
      dependencies: {
        submitEditedMessage,
      },
    });

    expect(edited).toBe(false);
    expect(submitEditedMessage).not.toHaveBeenCalled();
  });

  it("transcribes managed section chat audio through the configured profile", async () => {
    const audioBlob = new Blob(["audio"]);
    const transcribeCalls: Array<[string, Blob]> = [];

    const result = await transcribeManagedSectionChatAudio({
      isExternalEngine: false,
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

  it("rejects provider dictation when managed section chat is external", async () => {
    await expect(
      transcribeManagedSectionChatAudio({
        isExternalEngine: true,
        transcriptionProfileId: "profile-1",
        audioBlob: new Blob(["audio"]),
      }),
    ).rejects.toThrow("Provider dictation is not configured.");
  });
});
