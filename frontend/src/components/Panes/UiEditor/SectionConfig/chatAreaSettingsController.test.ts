import { createEngineConfig, EngineTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatAreaSettingsController } from "./chatAreaSettingsController";

const mocks = vi.hoisted(() => ({
  updateEngineConfig: vi.fn().mockResolvedValue(undefined),
  setProjectChatWindowModeForSection: vi.fn(),
  dispatchOptimisticProjectStateUpdate: vi.fn(),
  setCurrEffectiveSectionImplValue: vi.fn(),
  routeSetChatSectionSettings: vi.fn(),
  routeSetChatSectionChatId: vi.fn(),
}));

vi.mock("state/actions/ai/projectAiResources", () => ({
  updateEngineConfig: mocks.updateEngineConfig,
}));

vi.mock("state/actions/projectChatWindowing", () => ({
  getProjectChatWindowModeForSectionInState: vi.fn(),
  setProjectChatWindowModeForSection: mocks.setProjectChatWindowModeForSection,
}));

vi.mock("state/actions/sectionInfos", () => ({
  dispatchOptimisticProjectStateUpdate:
    mocks.dispatchOptimisticProjectStateUpdate,
  setCurrEffectiveSectionImplValue: mocks.setCurrEffectiveSectionImplValue,
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_set_chat_section_settings: mocks.routeSetChatSectionSettings,
  route_set_chat_section_chat_id: mocks.routeSetChatSectionChatId,
}));

describe("chatAreaSettingsController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateEngineConfig.mockResolvedValue(undefined);
  });

  it("publishes optimistic chat-section setting updates with normalized dictation mode", async () => {
    const controller = createChatAreaSettingsController({
      canManageManagedChatThreads: true,
      currentSettings: {
        managed: true,
        engineConfigId: "engine-1",
        transcriptionProfileId: "transcription-1",
        agentProfileId: "agent-1",
        thinking: true,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "provider",
      },
      isChatModeControlDisabled: false,
      isDisabled: false,
      projectConfigId: "project-1",
      sectionId: "section-1",
      selectedEngineConfig: createEngineConfig({
        id: "engine-1",
        name: "Primary",
        engineType: EngineTypeEnum.setta_llm,
      }),
      selectedEngineId: "engine-1",
    });

    controller.handleDictationModeChange("invalid-mode");

    expect(mocks.dispatchOptimisticProjectStateUpdate).toHaveBeenCalledTimes(1);
    const optimisticUpdate =
      mocks.dispatchOptimisticProjectStateUpdate.mock.calls[0]?.[0];
    const state = {};
    optimisticUpdate.apply(state);
    expect(mocks.setCurrEffectiveSectionImplValue).toHaveBeenCalledWith(
      state,
      "section-1",
      expect.objectContaining({
        dictationMode: "auto",
      }),
    );

    await optimisticUpdate.send("frontend-op-1");
    expect(mocks.routeSetChatSectionSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-1",
        sectionId: "section-1",
        dictationMode: "auto",
        frontendOpId: "frontend-op-1",
      }),
    );
  });

  it("starts a new chat when the selected engine changes", async () => {
    const controller = createChatAreaSettingsController({
      canManageManagedChatThreads: true,
      currentSettings: {
        managed: true,
        engineConfigId: "engine-1",
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      },
      isChatModeControlDisabled: false,
      isDisabled: false,
      projectConfigId: "project-1",
      sectionId: "section-1",
      selectedEngineConfig: createEngineConfig({
        id: "engine-1",
        name: "Primary",
        engineType: EngineTypeEnum.setta_llm,
      }),
      selectedEngineId: "engine-1",
    });

    controller.handleEngineChange("engine-2");

    expect(mocks.dispatchOptimisticProjectStateUpdate).toHaveBeenCalledTimes(2);
    const updateSettingsCall =
      mocks.dispatchOptimisticProjectStateUpdate.mock.calls[0]?.[0];
    const newChatCall =
      mocks.dispatchOptimisticProjectStateUpdate.mock.calls[1]?.[0];

    await updateSettingsCall.send("frontend-op-2");
    expect(mocks.routeSetChatSectionSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        engineConfigId: "engine-2",
        frontendOpId: "frontend-op-2",
      }),
    );

    await newChatCall.send();
    expect(mocks.routeSetChatSectionChatId).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId: "section-1",
      chatId: null,
    });
  });

  it("updates the selected LLM config only for Setta engines", async () => {
    const settaController = createChatAreaSettingsController({
      canManageManagedChatThreads: true,
      currentSettings: {
        managed: true,
        engineConfigId: "engine-1",
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      },
      isChatModeControlDisabled: false,
      isDisabled: false,
      projectConfigId: "project-1",
      sectionId: "section-1",
      selectedEngineConfig: createEngineConfig({
        id: "engine-1",
        name: "Primary",
        engineType: EngineTypeEnum.setta_llm,
        settaLlmConfigId: "llm-1",
      }),
      selectedEngineId: "engine-1",
    });

    await settaController.handleLLMConfigChange("llm-2");

    expect(mocks.updateEngineConfig).toHaveBeenCalledWith({
      config: expect.objectContaining({
        id: "engine-1",
        settaLlmConfigId: "llm-2",
      }),
    });

    mocks.updateEngineConfig.mockClear();

    const externalController = createChatAreaSettingsController({
      canManageManagedChatThreads: true,
      currentSettings: {
        managed: true,
        engineConfigId: "engine-2",
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      },
      isChatModeControlDisabled: false,
      isDisabled: false,
      projectConfigId: "project-1",
      sectionId: "section-1",
      selectedEngineConfig: createEngineConfig({
        id: "engine-2",
        name: "External",
        engineType: EngineTypeEnum.external_agent,
      }),
      selectedEngineId: "engine-2",
    });

    await externalController.handleLLMConfigChange("llm-3");
    expect(mocks.updateEngineConfig).not.toHaveBeenCalled();
  });

  it("only forwards valid chat mode selections when the control is enabled", () => {
    const controller = createChatAreaSettingsController({
      canManageManagedChatThreads: true,
      currentSettings: {
        managed: true,
        engineConfigId: null,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      },
      isChatModeControlDisabled: false,
      isDisabled: false,
      projectConfigId: "project-1",
      sectionId: "section-1",
      selectedEngineConfig: null,
      selectedEngineId: null,
    });

    controller.handleChatModeChange("invalid");
    controller.handleChatModeChange("section_mode");

    expect(mocks.setProjectChatWindowModeForSection).toHaveBeenCalledTimes(1);
    expect(mocks.setProjectChatWindowModeForSection).toHaveBeenCalledWith(
      "section-1",
      "section_mode",
    );
  });
});
