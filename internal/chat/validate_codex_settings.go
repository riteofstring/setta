package chat

import "fmt"

func validateChatCodexSettings(conversationID string, settings ChatCodexSettings) error {
	if settings.ReasoningEffort != nil && !validValue(*settings.ReasoningEffort, reasoningEffortValues) {
		return fmt.Errorf("conversation %s codexSettings has unsupported reasoning effort %s", conversationID, *settings.ReasoningEffort)
	}
	if settings.Permission != nil {
		if err := validateChatCodexPermissionSettings(conversationID, *settings.Permission); err != nil {
			return err
		}
	}
	return nil
}

func validateChatCodexPermissionSettings(conversationID string, settings ChatCodexPermissionSettings) error {
	preset, ok := chatPermissionPresetByID(settings.Preset)
	if !ok {
		return fmt.Errorf("conversation %s codexSettings permission has unsupported preset %s", conversationID, settings.Preset)
	}
	if settings.ApprovalPolicy == "" {
		return fmt.Errorf("conversation %s codexSettings permission approvalPolicy is required", conversationID)
	}
	if err := validateSettaCodexApprovalPolicy(settings.ApprovalPolicy, "conversation "+conversationID+" codexSettings permission approvalPolicy"); err != nil {
		return err
	}
	if settings.Permissions == "" {
		return fmt.Errorf("conversation %s codexSettings permission permissions is required", conversationID)
	}
	if settings.ApprovalPolicy != preset.ApprovalPolicy || settings.Permissions != preset.ActivePermissionProfileID {
		return fmt.Errorf("conversation %s codexSettings permission preset %s does not match backend preset contract", conversationID, settings.Preset)
	}
	return nil
}

func validateChatCodexEffectiveSettings(conversationID string, settings ChatCodexEffectiveSettings) error {
	if settings.Model == "" {
		return fmt.Errorf("conversation %s codexEffectiveSettings model is required", conversationID)
	}
	if settings.ModelDisplayName == "" {
		return fmt.Errorf("conversation %s codexEffectiveSettings modelDisplayName is required", conversationID)
	}
	if settings.ReasoningEffort != nil && !validValue(*settings.ReasoningEffort, reasoningEffortValues) {
		return fmt.Errorf("conversation %s codexEffectiveSettings has unsupported reasoning effort %s", conversationID, *settings.ReasoningEffort)
	}
	if settings.ReasoningEffortDisplayName == "" {
		return fmt.Errorf("conversation %s codexEffectiveSettings reasoningEffortDisplayName is required", conversationID)
	}
	if settings.Permission != nil {
		if err := validateChatCodexEffectivePermissionSettings(conversationID, *settings.Permission); err != nil {
			return err
		}
	}
	return nil
}

func validateChatCodexEffectivePermissionSettings(conversationID string, settings ChatCodexEffectivePermissionSettings) error {
	if settings.DisplayLabel == "" {
		return fmt.Errorf("conversation %s codexEffectiveSettings permission displayLabel is required", conversationID)
	}
	if settings.ApprovalPolicy == "" {
		return fmt.Errorf("conversation %s codexEffectiveSettings permission approvalPolicy is required", conversationID)
	}
	if err := validateSettaCodexApprovalPolicy(settings.ApprovalPolicy, "conversation "+conversationID+" codexEffectiveSettings permission approvalPolicy"); err != nil {
		return err
	}
	if settings.Preset != nil {
		preset, ok := chatPermissionPresetByID(*settings.Preset)
		if !ok {
			return fmt.Errorf("conversation %s codexEffectiveSettings permission has unsupported preset %s", conversationID, *settings.Preset)
		}
		if settings.ActivePermissionProfileID != preset.ActivePermissionProfileID {
			return fmt.Errorf("conversation %s codexEffectiveSettings permission preset %s does not match activePermissionProfileId", conversationID, *settings.Preset)
		}
		if settings.ApprovalPolicy != preset.ApprovalPolicy {
			return fmt.Errorf("conversation %s codexEffectiveSettings permission preset %s does not match approvalPolicy", conversationID, *settings.Preset)
		}
	}
	if settings.BuiltIn && settings.Preset == nil {
		return fmt.Errorf("conversation %s codexEffectiveSettings permission builtIn requires preset", conversationID)
	}
	return nil
}
