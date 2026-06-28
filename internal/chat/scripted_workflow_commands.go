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
		settings, err := scriptedCodexEffectiveSettings(harness.model, harness.reasoning)
		if err != nil {
			return HarnessCommandResult{}, err
		}
		result.CodexEffectiveSettings = settings
	case ModelCommandSet:
		harness.model = command.Model.ModelID
		result.SelectedModel = command.Model.ModelID
		result.SelectedReasoningEffort = reasoningEffortResult(harness.reasoning)
		settings, err := scriptedCodexEffectiveSettings(harness.model, harness.reasoning)
		if err != nil {
			return HarnessCommandResult{}, err
		}
		result.CodexEffectiveSettings = settings
		if !result.HasThreadRef {
			result.CodexSettings = &ChatCodexSettings{
				Model:           harness.model,
				ReasoningEffort: reasoningEffortResult(harness.reasoning),
			}
		}
	case ModelCommandSetEffort:
		if command.Model.ReasoningEffort == nil {
			return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "reasoning effort is required", nil)
		}
		harness.reasoning = *command.Model.ReasoningEffort
		result.SelectedModel = harness.model
		result.SelectedReasoningEffort = reasoningEffortResult(*command.Model.ReasoningEffort)
		settings, err := scriptedCodexEffectiveSettings(harness.model, harness.reasoning)
		if err != nil {
			return HarnessCommandResult{}, err
		}
		result.CodexEffectiveSettings = settings
		if !result.HasThreadRef {
			result.CodexSettings = &ChatCodexSettings{
				Model:           harness.model,
				ReasoningEffort: reasoningEffortResult(harness.reasoning),
			}
		}
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported model command action: %s", command.Model.Action), nil)
	}
	return result, nil
}
