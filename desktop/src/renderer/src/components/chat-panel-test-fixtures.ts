import type {
  ChatCodexDefaultsView,
  ChatCodexEffectivePermissionSettings,
  ChatPermissionPresetID,
} from "@generated/backend";

export function defaultEffectivePermissionSettings(
  displayLabel = "Workspace Access",
  preset: ChatPermissionPresetID = "default",
): ChatCodexEffectivePermissionSettings {
  return {
    activePermissionProfileExtends: "",
    activePermissionProfileId: preset === "read-only" ? "read-only" : ":workspace",
    approvalPolicy: "on-request",
    builtIn: true,
    displayLabel,
    preset,
  };
}

export function chatDefaultsView(): ChatCodexDefaultsView {
  return {
    currentPermission: defaultEffectivePermissionSettings("Read Only", "read-only"),
    effectiveSettings: {
      model: "scripted-careful",
      modelDisplayName: "Scripted Careful",
      permission: defaultEffectivePermissionSettings("Read Only", "read-only"),
      reasoningEffort: "high",
      reasoningEffortDisplayName: "High",
      supportsImages: true,
    },
    models: [],
    permissionPresets: [],
    reasoningEfforts: [],
    selectedModel: "scripted-careful",
    selectedPermissionPreset: "read-only",
    selectedReasoningEffort: "high",
    settings: {
      model: "scripted-careful",
      permission: {
        approvalPolicy: "on-request",
        permissions: "read-only",
        preset: "read-only",
      },
      reasoningEffort: "high",
    },
  };
}
