package chat

import (
	"context"
	"encoding/json"
	"fmt"

	"setta/internal/codexapp"
)

func (harness *CodexHarness) executeCodexPermissionCommand(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, command ChatCommand) (HarnessCommandResult, error) {
	if command.Permission == nil {
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, "permission command payload is required", nil)
	}
	switch command.Permission.Action {
	case PermissionCommandShowPicker:
		settings, err := harness.codexCommandSettingsWithDisplayLabels(ctx, session, currentSettings)
		if err != nil {
			return HarnessCommandResult{}, err
		}
		presets, err := codexPermissionPresetsForSession(ctx, session)
		if err != nil {
			return HarnessCommandResult{}, err
		}
		return executeCodexPermissionPickerCommand(settings, presets), nil
	case PermissionCommandSet:
		return harness.executeCodexPermissionSetCommand(ctx, session, threadID, currentSettings, command.Permission.Preset)
	default:
		return HarnessCommandResult{}, commandError(ChatCommandErrorMalformedCommand, fmt.Sprintf("unsupported permission command action: %s", command.Permission.Action), nil)
	}
}

func executeCodexPermissionPickerCommand(currentSettings codexCommandThreadSettings, presets []ChatPermissionPreset) HarnessCommandResult {
	permission := chatCodexEffectivePermissionSettings(currentSettings.ApprovalPolicy, currentSettings.ActivePermissionProfileID, currentSettings.ActivePermissionProfileExtends)
	return HarnessCommandResult{
		Action:                   ChatCommandResultPermissionPicker,
		CodexEffectiveSettings:   chatCodexEffectiveSettingsFromCommandSettings(currentSettings),
		CurrentPermission:        permission,
		PermissionPresets:        nonNilPermissionPresets(presets),
		SelectedPermissionPreset: selectedPermissionPresetResult(permission),
	}
}

func (harness *CodexHarness) executeCodexPermissionSetCommand(ctx context.Context, session *codexapp.Session, threadID string, currentSettings codexCommandThreadSettings, presetID ChatPermissionPresetID) (HarnessCommandResult, error) {
	if threadID == "" {
		return HarnessCommandResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is required to set permissions", nil)
	}
	preset, err := enabledChatPermissionPresetForSession(ctx, session, presetID)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	settings := currentSettings
	settings.ApprovalPolicy = preset.ApprovalPolicy
	settings.ActivePermissionProfileID = preset.ActivePermissionProfileID
	settings.ActivePermissionProfileExtends = ""
	settings, err = harness.codexCommandSettingsWithDisplayLabels(ctx, session, settings)
	if err != nil {
		return HarnessCommandResult{}, err
	}
	if currentSettings.ApprovalPolicy == settings.ApprovalPolicy &&
		currentSettings.ActivePermissionProfileID == settings.ActivePermissionProfileID &&
		currentSettings.ActivePermissionProfileExtends == "" {
		return codexSettingsCommandResult(settings), nil
	}
	approvalPolicy := codexApprovalPolicyRaw(settings.ApprovalPolicy)
	permissions := settings.ActivePermissionProfileID
	if err := harness.callThreadSettingsUpdate(ctx, session, codexapp.ThreadSettingsUpdateParams{
		ApprovalPolicy: &approvalPolicy,
		Permissions:    &permissions,
		ThreadID:       threadID,
	}); err != nil {
		return HarnessCommandResult{}, err
	}
	return codexSettingsCommandResult(settings), nil
}

func selectedPermissionPresetResult(permission *ChatCodexEffectivePermissionSettings) *ChatPermissionPresetID {
	if permission == nil || permission.Preset == nil {
		return nil
	}
	id := *permission.Preset
	return &id
}

func codexApprovalPolicyRaw(policy string) codexapp.AskForApproval {
	data, err := json.Marshal(policy)
	if err != nil {
		panic(err)
	}
	return codexapp.AskForApproval(data)
}

func codexApprovalPolicyString(raw codexapp.AskForApproval) string {
	if !rawJSONPresent(json.RawMessage(raw)) {
		return ""
	}
	var policy string
	if err := json.Unmarshal(raw, &policy); err == nil {
		return policy
	}
	return string(raw)
}

func activePermissionProfileID(profile *codexapp.ActivePermissionProfile) string {
	if profile == nil {
		return ""
	}
	return profile.ID
}

func activePermissionProfileExtends(profile *codexapp.ActivePermissionProfile) string {
	if profile == nil || profile.Extends == nil {
		return ""
	}
	return *profile.Extends
}

func optionalApprovalPolicy(value map[string]any, name string, label string) (string, error) {
	raw, err := rawJSONField(value, name, label)
	if err != nil {
		return "", err
	}
	policy := codexApprovalPolicyString(codexapp.AskForApproval(raw))
	if err := validateSettaCodexApprovalPolicy(policy, label+"."+name); err != nil {
		return "", err
	}
	return policy, nil
}
