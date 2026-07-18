import { describe, expect, test, vi } from "vitest";

import type { ChatView } from "./chat-panel";
import {
  selectedChatComposerActions,
  selectedChatComposerViewModel,
} from "./chat-composer-selected-adapter";
import { chatDefaultsView, defaultEffectivePermissionSettings } from "./chat-panel-test-fixtures";

describe("selected chat composer draft session", () => {
  test("uses chat defaults for a no-conversation draft session", () => {
    const model = selectedChatComposerViewModel(draftComposerChat());

    expect(model.session).toMatchObject({
      id: "new-chat:workspace_api",
      modelLabel: "Scripted Careful",
      permissionLabel: "Read Only",
      reasoningLabel: "High",
      workspaceId: "workspace_api",
    });
    expect(model.session?.modelLabel).not.toBe("Model");
    expect(model.session?.reasoningLabel).not.toBe("Reasoning");
  });

  test("uses defaults metadata when a no-conversation draft lacks effective settings", () => {
    const model = selectedChatComposerViewModel(
      draftComposerChat({
        chatDefaultsView: {
          ...chatDefaultsView(),
          currentPermission: defaultEffectivePermissionSettings("Workspace Access", "default"),
          effectiveSettings: null,
          models: [
            {
              defaultReasoningEffort: "xhigh",
              description: "Fake protocol model.",
              displayName: "GPT Test",
              hidden: false,
              id: "gpt-test",
              isDefault: true,
              model: "gpt-test",
              supportedReasoningEfforts: [
                {
                  description: "Extra high reasoning depth.",
                  displayName: "Extra high",
                  effort: "xhigh",
                  isDefault: true,
                },
              ],
              supportsImages: true,
            },
          ],
          reasoningEfforts: [
            {
              description: "Extra high reasoning depth.",
              displayName: "Extra high",
              effort: "xhigh",
              isDefault: true,
            },
          ],
          selectedModel: "",
          selectedPermissionPreset: "default",
          selectedReasoningEffort: null,
        },
      }),
    );

    expect(model.session).toMatchObject({
      modelLabel: "GPT Test",
      permissionLabel: "Workspace Access",
      reasoningLabel: "Extra high",
    });
  });

  test("opens no-conversation draft pickers without materializing", async () => {
    const createConversation = vi.fn().mockResolvedValue(undefined);
    const openCodexModelPicker = vi.fn().mockResolvedValue({});
    const openCodexPermissionPicker = vi.fn().mockResolvedValue({});
    const chat = draftComposerChat({
      createConversation,
      openCodexModelPicker,
      openCodexPermissionPicker,
    });

    const actions = selectedChatComposerActions(chat);

    expect(createConversation).not.toHaveBeenCalled();
    const modelPicker = await actions.modelSettings?.openCodexModelPicker();
    const permissionPicker = await actions.permissionSettings?.openCodexPermissionPicker();

    expect(createConversation).not.toHaveBeenCalled();
    expect(openCodexModelPicker).not.toHaveBeenCalled();
    expect(openCodexPermissionPicker).not.toHaveBeenCalled();
    expect(modelPicker?.result.action).toBe("model_picker");
    expect(permissionPicker?.result.action).toBe("permission_picker");
  });

  test("materializes a no-conversation draft when a settings mutation is used", async () => {
    const createConversation = vi.fn().mockResolvedValue(undefined);
    const setCodexModel = vi.fn().mockResolvedValue({});
    const setCodexReasoningEffort = vi.fn().mockResolvedValue({});
    const setCodexPermissionPreset = vi.fn().mockResolvedValue({});
    const chat = draftComposerChat({
      createConversation,
      setCodexModel,
      setCodexPermissionPreset,
      setCodexReasoningEffort,
    });

    const actions = selectedChatComposerActions(chat);

    await actions.modelSettings?.setCodexModel("scripted-careful");
    await actions.modelSettings?.setCodexReasoningEffort("low");
    await actions.permissionSettings?.setCodexPermissionPreset("default", false);

    expect(createConversation).toHaveBeenCalledTimes(3);
    expect(setCodexModel).toHaveBeenCalledWith("scripted-careful");
    expect(setCodexReasoningEffort).toHaveBeenCalledWith("low");
    expect(setCodexPermissionPreset).toHaveBeenCalledWith("default", false);
  });
});

function draftComposerChat(overrides: Partial<ChatView> = {}): ChatView {
  return {
    activeRun: null,
    chatDefaultsView: chatDefaultsView(),
    commandListError: null,
    commandListStatus: "idle",
    createConversation: async () => {},
    createImageAttachmentFromBytes: async () => {
      throw new Error("unexpected image attachment creation in draft session test");
    },
    createImageAttachmentsFromPicker: async () => ({ attachments: [] }),
    goal: null,
    openCodexModelPicker: async () => ({}),
    openCodexPermissionPicker: async () => ({}),
    operation: null,
    pendingSteeringMessageIds: [],
    selectedConversation: null,
    setCodexModel: async () => {},
    setCodexPermissionPreset: async () => {},
    setCodexReasoningEffort: async () => {},
    status: "ready",
    workspaceId: "workspace_api",
    ...overrides,
  } as unknown as ChatView;
}
