package chat

import "fmt"

func (harness *ScriptedWorkflowHarness) executeModelCommandLocked(command ChatCommand, result HarnessCommandResult) (HarnessCommandResult, error) {
	if command.Model == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "model command payload is required", nil)
	}
	switch command.Model.Action {
	case ModelCommandShowPicker:
		result.Action = ChatCommandResultModelPicker
		result.Models = fakeModelOptions()
		result.ReasoningEfforts = fakeReasoningEffortOptions()
		result.SelectedModel = harness.model
		result.SelectedReasoningEffort = reasoningEffortResult(harness.reasoning)
		settings, err := scriptedCodexEffectiveSettings(harness.model, harness.reasoning, fakeCodexPermissionSettings(harness.permission, harness.hasPermission))
		if err != nil {
			return HarnessCommandResult{}, err
		}
		result.CodexEffectiveSettings = settings
	case ModelCommandSet:
		harness.model = command.Model.ModelID
		result.SelectedModel = command.Model.ModelID
		result.SelectedReasoningEffort = reasoningEffortResult(harness.reasoning)
		settings, err := scriptedCodexEffectiveSettings(harness.model, harness.reasoning, fakeCodexPermissionSettings(harness.permission, harness.hasPermission))
		if err != nil {
			return HarnessCommandResult{}, err
		}
		result.CodexEffectiveSettings = settings
		if !result.HasThreadRef {
			result.CodexSettings = &ChatCodexSettings{
				Model:           harness.model,
				ReasoningEffort: reasoningEffortResult(harness.reasoning),
				Permission:      fakeCodexPermissionSettings(harness.permission, harness.hasPermission),
			}
		}
	case ModelCommandSetEffort:
		if command.Model.ReasoningEffort == nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "reasoning effort is required", nil)
		}
		harness.reasoning = *command.Model.ReasoningEffort
		result.SelectedModel = harness.model
		result.SelectedReasoningEffort = reasoningEffortResult(*command.Model.ReasoningEffort)
		settings, err := scriptedCodexEffectiveSettings(harness.model, harness.reasoning, fakeCodexPermissionSettings(harness.permission, harness.hasPermission))
		if err != nil {
			return HarnessCommandResult{}, err
		}
		result.CodexEffectiveSettings = settings
		if !result.HasThreadRef {
			result.CodexSettings = &ChatCodexSettings{
				Model:           harness.model,
				ReasoningEffort: reasoningEffortResult(harness.reasoning),
				Permission:      fakeCodexPermissionSettings(harness.permission, harness.hasPermission),
			}
		}
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported model command action: %s", command.Model.Action), nil)
	}
	return result, nil
}

func (harness *ScriptedWorkflowHarness) executePermissionCommandLocked(command ChatCommand, result HarnessCommandResult) (HarnessCommandResult, error) {
	if command.Permission == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "permission command payload is required", nil)
	}
	switch command.Permission.Action {
	case PermissionCommandShowPicker:
		result.Action = ChatCommandResultPermissionPicker
		settings, err := scriptedCodexEffectiveSettings(harness.model, harness.reasoning, fakeCodexPermissionSettings(harness.permission, harness.hasPermission))
		if err != nil {
			return HarnessCommandResult{}, err
		}
		result.CodexEffectiveSettings = settings
		result.CurrentPermission = settings.Permission
		result.PermissionPresets = BuiltinChatPermissionPresets()
		result.SelectedPermissionPreset = selectedPermissionPresetResult(settings.Permission)
	case PermissionCommandSet:
		settings, ok := chatPermissionSettingsForPreset(command.Permission.Preset)
		if !ok {
			return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "unsupported permission preset: "+string(command.Permission.Preset), nil)
		}
		harness.permission = settings
		harness.hasPermission = true
		effective, err := scriptedCodexEffectiveSettings(harness.model, harness.reasoning, &settings)
		if err != nil {
			return HarnessCommandResult{}, err
		}
		result.CodexEffectiveSettings = effective
		result.CurrentPermission = effective.Permission
		result.SelectedPermissionPreset = selectedPermissionPresetResult(effective.Permission)
		if !result.HasThreadRef {
			result.CodexSettings = &ChatCodexSettings{
				Model:           harness.model,
				ReasoningEffort: reasoningEffortResult(harness.reasoning),
				Permission:      &settings,
			}
		}
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported permission command action: %s", command.Permission.Action), nil)
	}
	return result, nil
}
