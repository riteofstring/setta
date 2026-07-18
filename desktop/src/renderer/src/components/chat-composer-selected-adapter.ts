import type {
  ChatCodexDefaultsView,
  ChatCommandExecuteResult,
  ChatModelOption,
  ChatPermissionPresetID,
  Conversation,
  MessagePage,
  ReasoningEffort,
} from "@generated/backend";

import type { ComposerActions, ComposerViewModel } from "./chat-composer-contract";
import type { ChatView } from "./chat-panel";
import { commandDescriptorContextKey } from "../stores/chat-store-command-cache";

type DraftCommandResultInput = Omit<ChatCommandExecuteResult["result"], "composerDraft" | "goal">;

export function selectedChatComposerViewModel(
  chat: ChatView,
  commandListActive = chat.activeRun?.status === "running",
): ComposerViewModel {
  const selectedConversation = chat.selectedConversation;
  return {
    activeRunId: chat.activeRun?.id ?? "",
    commandListError: chat.commandListError,
    commandListStatus: chat.commandListStatus,
    goal: chat.goal,
    operation: chat.operation,
    pendingSteeringMessageIds: chat.pendingSteeringMessageIds,
    session: selectedChatComposerSession(selectedConversation, commandListActive, chat),
    status: chat.status,
  };
}

export function selectedChatComposerActions(chat: ChatView): ComposerActions {
  if (chat.selectedConversation === null) {
    return {
      attachments: {
        createImageAttachmentFromBytes: chat.createImageAttachmentFromBytes,
        createImageAttachmentsFromPicker: chat.createImageAttachmentsFromPicker,
      },
      modelSettings: {
        openCodexModelPicker: async () => draftModelPickerResult(chat),
        setCodexModel: (modelId) =>
          materializeDraftConversation(chat, () => chat.setCodexModel(modelId)),
        setCodexReasoningEffort: (effort) =>
          materializeDraftConversation(chat, () => chat.setCodexReasoningEffort(effort)),
      },
      permissionSettings: {
        openCodexPermissionPicker: async () => draftPermissionPickerResult(chat),
        setCodexPermissionPreset: (preset, confirmed) =>
          materializeDraftConversation(chat, () =>
            chat.setCodexPermissionPreset(preset, confirmed),
          ),
      },
    };
  }
  return {
    attachments: {
      createImageAttachmentFromBytes: chat.createImageAttachmentFromBytes,
      createImageAttachmentsFromPicker: chat.createImageAttachmentsFromPicker,
    },
    commands: {
      executeCommand: chat.executeCommand,
      listCommands: chat.listCommands,
    },
    modelSettings: {
      openCodexModelPicker: chat.openCodexModelPicker,
      setCodexModel: chat.setCodexModel,
      setCodexReasoningEffort: chat.setCodexReasoningEffort,
    },
    permissionSettings: {
      openCodexPermissionPicker: chat.openCodexPermissionPicker,
      setCodexPermissionPreset: chat.setCodexPermissionPreset,
    },
    promptHistory: {
      listComposerPromptHistory: chat.listComposerPromptHistory,
    },
    queueMessage: chat.queueMessage,
    retryActiveRunLiveness: chat.retryActiveRunLiveness,
    sendMessage: chat.sendMessage,
    sendSteeringImmediately: chat.sendSteeringImmediately,
    steerMessage: chat.steerMessage,
    stopActiveRun: chat.stopActiveRun,
  };
}

async function materializeDraftConversation<T>(chat: ChatView, action: () => Promise<T>) {
  await chat.createConversation();
  return action();
}

function selectedChatComposerSession(
  selectedConversation: ChatView["selectedConversation"],
  commandListActive: boolean,
  chat: ChatView,
): ComposerViewModel["session"] {
  if (selectedConversation === null) {
    return draftChatComposerSession(chat);
  }
  const effectiveSettings = selectedConversation.codexEffectiveSettings;
  return {
    commandListContextKey: commandDescriptorContextKey({
      active: commandListActive,
      selectedConversation,
      workspaceId: selectedConversation.workspaceId,
    }),
    id: selectedConversation.id,
    modelLabel: conversationModelLabel(effectiveSettings),
    permissionLabel: effectiveSettings?.permission?.displayLabel ?? "Workspace Access",
    reasoningLabel: conversationReasoningLabel(effectiveSettings),
    supportsImages: effectiveSettings?.supportsImages ?? true,
    workspaceId: selectedConversation.workspaceId,
  };
}

function draftChatComposerSession(chat?: ChatView): ComposerViewModel["session"] {
  if (!chat?.workspaceId) {
    return null;
  }
  const defaults = chat.chatDefaultsView ?? null;
  const labels = draftChatComposerSessionLabels(defaults);
  return {
    commandListContextKey: "",
    id: `new-chat:${chat.workspaceId}`,
    ...labels,
    workspaceId: chat.workspaceId,
  };
}

function draftChatComposerSessionLabels(defaults: ChatCodexDefaultsView | null) {
  const effectiveSettings = defaults?.effectiveSettings ?? null;
  if (effectiveSettings) {
    return {
      modelLabel: effectiveSettings.modelDisplayName,
      permissionLabel: effectiveSettings.permission?.displayLabel ?? "Workspace Access",
      reasoningLabel: effectiveSettings.reasoningEffortDisplayName,
      supportsImages: effectiveSettings.supportsImages,
    };
  }
  return {
    modelLabel: draftDefaultsModelLabel(defaults),
    permissionLabel: draftDefaultsPermissionLabel(defaults),
    reasoningLabel: draftDefaultsReasoningLabel(defaults),
    supportsImages: draftDefaultsSupportsImages(defaults),
  };
}

function conversationModelLabel(
  effectiveSettings: NonNullable<ChatView["selectedConversation"]>["codexEffectiveSettings"],
) {
  return effectiveSettings?.modelDisplayName ?? "Model";
}

function conversationReasoningLabel(
  effectiveSettings: NonNullable<ChatView["selectedConversation"]>["codexEffectiveSettings"],
) {
  return effectiveSettings?.reasoningEffortDisplayName ?? "Reasoning";
}

function draftDefaultsModelLabel(defaults: ChatCodexDefaultsView | null) {
  return draftDefaultsModel(defaults)?.displayName ?? "Loading model";
}

function draftDefaultsPermissionLabel(defaults: ChatCodexDefaultsView | null) {
  return defaults?.currentPermission?.displayLabel ?? "Workspace Access";
}

function draftDefaultsReasoningLabel(defaults: ChatCodexDefaultsView | null) {
  const effort = draftDefaultsReasoningEffort(defaults);
  if (!effort) {
    return "Loading reasoning";
  }
  const option =
    defaults?.reasoningEfforts.find((candidate) => candidate.effort === effort) ??
    draftDefaultsModel(defaults)?.supportedReasoningEfforts.find(
      (candidate) => candidate.effort === effort,
    );
  return option?.displayName ?? effort;
}

function draftDefaultsSupportsImages(defaults: ChatCodexDefaultsView | null) {
  return draftDefaultsModel(defaults)?.supportsImages ?? true;
}

function draftModelPickerResult(chat: ChatView): ChatCommandExecuteResult {
  const defaults = chat.chatDefaultsView ?? null;
  const model = draftDefaultsModel(defaults);
  const selectedModel = model?.model ?? defaults?.selectedModel ?? "";
  return draftCommandResult(chat, {
    action: "model_picker",
    currentPermission: null,
    kind: "model",
    message: "Choose a model.",
    models: defaults?.models ?? [],
    permissionPresets: [],
    raw: "model_picker",
    reasoningEfforts: draftReasoningEfforts(defaults, model),
    selectedModel,
    selectedPermissionPreset: null,
    selectedReasoningEffort: draftDefaultsReasoningEffort(defaults),
    title: "Model",
  });
}

function draftPermissionPickerResult(chat: ChatView): ChatCommandExecuteResult {
  const defaults = chat.chatDefaultsView ?? null;
  return draftCommandResult(chat, {
    action: "permission_picker",
    currentPermission: defaults?.currentPermission ?? null,
    kind: "permission",
    message: "Choose a permission mode.",
    models: [],
    permissionPresets: defaults?.permissionPresets ?? [],
    raw: "permission_picker",
    reasoningEfforts: [],
    selectedModel: "",
    selectedPermissionPreset: draftDefaultsPermissionPreset(defaults),
    selectedReasoningEffort: null,
    title: "Permissions",
  });
}

function draftCommandResult(
  chat: ChatView,
  result: DraftCommandResultInput,
): ChatCommandExecuteResult {
  const conversation = draftConversation(chat);
  return {
    activeRun: null,
    activeRunLiveness: null,
    conversation,
    message: null,
    page: draftMessagePage(conversation),
    result: {
      composerDraft: "",
      goal: null,
      ...result,
    },
  };
}

function draftConversation(chat: ChatView): Conversation {
  const defaults = chat.chatDefaultsView ?? null;
  const workspaceId = chat.workspaceId ?? "";
  return {
    archivedAt: "",
    codexEffectiveSettings: defaults?.effectiveSettings ?? null,
    codexSettings: defaults?.settings ?? null,
    createdAt: "",
    harnessRefs: [],
    id: workspaceId === "" ? "new-chat" : `new-chat:${workspaceId}`,
    internal: false,
    schemaVersion: 0,
    title: "",
    updatedAt: "",
    workflow: null,
    workspaceId,
  };
}

function draftMessagePage(conversation: Conversation): MessagePage {
  return {
    blocks: [],
    conversation,
    goal: null,
    hasMoreOlder: false,
    messages: [],
    olderBeforeBlockOrdinal: 0,
    queue: { messages: [], runs: [] },
  };
}

function draftReasoningEfforts(
  defaults: ChatCodexDefaultsView | null,
  model: ChatModelOption | null,
) {
  return defaults?.reasoningEfforts.length
    ? defaults.reasoningEfforts
    : (model?.supportedReasoningEfforts ?? []);
}

function draftDefaultsReasoningEffort(
  defaults: ChatCodexDefaultsView | null,
): ReasoningEffort | null {
  return (
    defaults?.selectedReasoningEffort ??
    draftDefaultsModel(defaults)?.defaultReasoningEffort ??
    null
  );
}

function draftDefaultsPermissionPreset(
  defaults: ChatCodexDefaultsView | null,
): ChatPermissionPresetID | null {
  return defaults?.selectedPermissionPreset ?? defaults?.currentPermission?.preset ?? null;
}

function draftDefaultsModel(defaults: ChatCodexDefaultsView | null): ChatModelOption | null {
  if (!defaults) {
    return null;
  }
  return (
    defaults.models.find((model) => model.model === defaults.selectedModel) ??
    defaults.models.find((model) => model.isDefault) ??
    defaults.models[0] ??
    null
  );
}
