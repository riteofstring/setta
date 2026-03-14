import { createUserChatMessage, EngineTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectChatComposerController } from "./projectChatComposerController";

const mocks = vi.hoisted(() => ({
  resolveProjectChatSlashCommandState: vi.fn(),
  executeProjectChatSlashCommand: vi.fn(),
  handleUnknownProjectChatSlashCommand: vi.fn(),
  submitProjectChatComposerMessage: vi.fn(),
  stopProjectChatComposerResponse: vi.fn(),
  editProjectChatComposerMessage: vi.fn(),
  redoProjectChatComposerMessage: vi.fn(),
  transcribeProjectChatComposerAudio: vi.fn(),
  startProjectChatThread: vi.fn(),
  settleProjectChatThreadStart: vi.fn(),
  resumeLatestProjectChat: vi.fn(),
  selectProjectChatThread: vi.fn(),
}));

vi.mock("./projectChatSlashCommands", () => ({
  resolveProjectChatSlashCommandState:
    mocks.resolveProjectChatSlashCommandState,
  executeProjectChatSlashCommand: mocks.executeProjectChatSlashCommand,
  handleUnknownProjectChatSlashCommand:
    mocks.handleUnknownProjectChatSlashCommand,
}));

vi.mock("./projectChatComposerRuntime", () => ({
  submitProjectChatComposerMessage: mocks.submitProjectChatComposerMessage,
  stopProjectChatComposerResponse: mocks.stopProjectChatComposerResponse,
  editProjectChatComposerMessage: mocks.editProjectChatComposerMessage,
  redoProjectChatComposerMessage: mocks.redoProjectChatComposerMessage,
  transcribeProjectChatComposerAudio: mocks.transcribeProjectChatComposerAudio,
}));

vi.mock("./projectChatThreadController", () => ({
  startProjectChatThread: mocks.startProjectChatThread,
  settleProjectChatThreadStart: mocks.settleProjectChatThreadStart,
  resumeLatestProjectChat: mocks.resumeLatestProjectChat,
  selectProjectChatThread: mocks.selectProjectChatThread,
}));

describe("projectChatComposerController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveProjectChatSlashCommandState.mockReturnValue({
      slashCommands: [{ command: "/help", action: "help", summary: "Help" }],
      recognizedSlashCommands: [
        { command: "/help", action: "help", summary: "Help" },
      ],
    });
    mocks.executeProjectChatSlashCommand.mockResolvedValue({
      feedback: "handled",
    });
    mocks.handleUnknownProjectChatSlashCommand.mockResolvedValue({
      handled: true,
      keepInput: true,
    });
    mocks.submitProjectChatComposerMessage.mockResolvedValue(true);
    mocks.stopProjectChatComposerResponse.mockResolvedValue(true);
    mocks.editProjectChatComposerMessage.mockResolvedValue(true);
    mocks.redoProjectChatComposerMessage.mockResolvedValue(true);
    mocks.transcribeProjectChatComposerAudio.mockResolvedValue("transcribed");
    mocks.resumeLatestProjectChat.mockResolvedValue(true);
  });

  it("resolves slash command state and delegates slash-command handling", async () => {
    const controller = createProjectChatComposerController({
      chatId: "chat-1",
      surfaceId: "surface-1",
      projectConfigId: "project-1",
      historyCompatibility: {
        runType: "llm_chat",
        engineConfigId: "engine-1",
      },
      appGenerationMode: "json_render",
      engineConfigId: "engine-1",
      engineType: EngineTypeEnum.setta_llm,
      isExternalEngine: false,
      externalEngineAvailable: true,
      hasLLMConfig: true,
      requiresNewThreadContinuation: false,
      newThreadSeedChatId: null,
      waitingForResponse: false,
      thinking: true,
      messages: [],
      executionSettings: {
        permissionMode: "minimal",
        searchEnabled: true,
      },
      executionControlHandlers: {
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
      customProjectChatSlashCommands: [],
      showPermissionExecutionControl: true,
      showSearchExecutionControl: false,
      transcriptionProfileId: "profile-1",
      agentRuns: [],
      agentRunsAuthorityState: "ready",
      setChatId: vi.fn(),
      lastChatIdRef: { current: null },
      getAgentRunsState: () => ({
        agentRuns: [],
        agentRunsAuthorityState: "ready",
      }),
      setAppGenerationMode: vi.fn(),
    });

    expect(mocks.resolveProjectChatSlashCommandState).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-1",
        engineConfigId: "engine-1",
      }),
    );
    expect(controller.slashCommands).toEqual([
      { command: "/help", action: "help", summary: "Help" },
    ]);

    const slashResult = await controller.handleSlashCommand({
      command: "/help",
      action: "help",
      args: [],
    });
    expect(slashResult).toEqual({ feedback: "handled" });
    expect(mocks.executeProjectChatSlashCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        slashCommands: controller.slashCommands,
        appGenerationMode: "json_render",
        searchEnabled: true,
      }),
    );

    const unknownResult =
      await controller.handleUnknownSlashCommand("/deploy latest");
    expect(unknownResult).toEqual({
      handled: true,
      keepInput: true,
    });
    expect(mocks.handleUnknownProjectChatSlashCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "/deploy latest",
        isExternalEngine: false,
      }),
    );
  });

  it("delegates composer runtime callbacks and uses the latest remembered chat id", async () => {
    const setChatId = vi.fn();
    const messages = [
      createUserChatMessage({
        id: "message-1",
        content: [],
        attachments: [],
      }),
    ];
    const controller = createProjectChatComposerController({
      chatId: null,
      surfaceId: "surface-1",
      projectConfigId: "project-1",
      historyCompatibility: {
        runType: "external_agent",
        engineConfigId: "engine-1",
      },
      appGenerationMode: "json_render",
      engineConfigId: "engine-1",
      engineType: EngineTypeEnum.external_agent,
      isExternalEngine: true,
      externalEngineAvailable: true,
      hasLLMConfig: true,
      requiresNewThreadContinuation: false,
      newThreadSeedChatId: "seed-chat",
      waitingForResponse: true,
      thinking: false,
      messages,
      executionSettings: {
        permissionMode: "config_toml_custom",
        searchEnabled: false,
      },
      executionControlHandlers: {
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
      customProjectChatSlashCommands: [],
      showPermissionExecutionControl: true,
      showSearchExecutionControl: false,
      transcriptionProfileId: "profile-1",
      agentRuns: [],
      agentRunsAuthorityState: "ready",
      setChatId,
      onStartNewChat: vi.fn(),
      onDraftThreadStart: vi.fn(),
      onDraftThreadSettled: vi.fn(),
      lastChatIdRef: { current: "chat-previous" },
      getAgentRunsState: () => ({
        agentRuns: [],
        agentRunsAuthorityState: "ready",
      }),
      setAppGenerationMode: vi.fn(),
    });

    await controller.handleSubmit("Summarize project", []);
    expect(mocks.submitProjectChatComposerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Summarize project",
        chatId: null,
        newThreadSeedChatId: "seed-chat",
      }),
    );

    await controller.handleEditMessage("message-1", "Edited", []);
    expect(mocks.editProjectChatComposerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedChatId: "chat-previous",
        messageId: "message-1",
        text: "Edited",
        messages,
      }),
    );

    await controller.handleRedoMessage("assistant-1");
    expect(mocks.redoProjectChatComposerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessageId: "assistant-1",
        resolvedChatId: "chat-previous",
        waitingForResponse: true,
      }),
    );

    await controller.handleStop();
    expect(mocks.stopProjectChatComposerResponse).toHaveBeenCalledWith({
      chatId: null,
      isExternalEngine: true,
      surfaceId: "surface-1",
    });

    const audioBlob = new Blob(["audio"]);
    await controller.handleProviderDictationTranscribe(audioBlob);
    expect(mocks.transcribeProjectChatComposerAudio).toHaveBeenCalledWith({
      transcriptionProfileId: "profile-1",
      audioBlob,
    });

    controller.handleStarterPrompt("Starter prompt");
    expect(mocks.submitProjectChatComposerMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: "Starter prompt",
      }),
    );

    controller.handleBranchSwitch("chat-2");
    expect(mocks.selectProjectChatThread).toHaveBeenCalledWith({
      nextChatId: "chat-2",
      chatId: null,
      setChatId,
    });
  });
});
