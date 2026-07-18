package chat

import (
	"context"
	"encoding/json"
	"fmt"

	"setta/internal/codexapp"
	"setta/internal/workspace"
)

type codexCommandThreadSettings struct {
	Model                          string
	ModelDisplayName               string
	ReasoningEffort                ReasoningEffort
	ReasoningEffortDisplayName     string
	SupportsImages                 bool
	ApprovalPolicy                 string
	ActivePermissionProfileID      string
	ActivePermissionProfileExtends string
}

func (harness *CodexHarness) effectiveCodexCommandSettings(ctx context.Context, session *codexapp.Session, workspaceSummary workspace.WorkspaceSummary, conversation Conversation) (codexCommandThreadSettings, error) {
	settings, err := codexCommandSettingsFromConfig(ctx, session, workspaceSummary)
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	if err := overlayCodexConversationSettings(&settings, conversation.CodexSettings); err != nil {
		return codexCommandThreadSettings{}, err
	}
	return settings, nil
}

func (harness *CodexHarness) ResolveCodexEffectiveSettings(ctx context.Context, workspaceSummary workspace.WorkspaceSummary, conversation Conversation) (*ChatCodexEffectiveSettings, error) {
	session, err := harness.manager.NewSession(ctx)
	if err != nil {
		return nil, commandError(ChatCommandErrorCodexRPC, "start codex app-server: "+err.Error(), err)
	}
	defer session.Close()

	settings, err := harness.effectiveCodexCommandSettings(ctx, session, workspaceSummary, conversation)
	if err != nil {
		return nil, err
	}
	settings, err = harness.codexCommandSettingsWithDisplayLabels(ctx, session, settings)
	if err != nil {
		return nil, err
	}
	return chatCodexEffectiveSettingsFromCommandSettings(settings), nil
}

func codexCommandSettingsFromConfig(ctx context.Context, session *codexapp.Session, workspaceSummary workspace.WorkspaceSummary) (codexCommandThreadSettings, error) {
	raw, err := session.Call(ctx, codexapp.CodexMethodConfigRead, map[string]any{"cwd": workspaceSummary.RootPath})
	if err != nil {
		return codexCommandThreadSettings{}, commandError(ChatCommandErrorCodexRPC, "config/read: "+err.Error(), err)
	}
	settings, err := codexCommandSettingsFromConfigResponse(raw)
	if err != nil {
		return codexCommandThreadSettings{}, commandError(ChatCommandErrorCodexProviderDrift, "config/read response: "+err.Error(), err)
	}
	return settings, nil
}

func codexCommandSettingsFromConfigResponse(raw json.RawMessage) (codexCommandThreadSettings, error) {
	response, err := objectValue(raw, "codex config response")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	config, err := requireObject(response, "config", "codex config response")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	model, err := optionalString(config, "model", "codex config response config")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	effort, err := optionalReasoningEffort(config, "model_reasoning_effort", "codex config response config")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	approvalPolicy, err := optionalApprovalPolicy(config, "approval_policy", "codex config response config")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	return codexCommandThreadSettings{Model: model, ReasoningEffort: effort, ApprovalPolicy: approvalPolicy}, nil
}

func overlayCodexConversationSettings(settings *codexCommandThreadSettings, pending *ChatCodexSettings) error {
	if pending == nil {
		return nil
	}
	if pending.Model != "" {
		settings.Model = pending.Model
	}
	if pending.ReasoningEffort != nil {
		settings.ReasoningEffort = *pending.ReasoningEffort
	}
	if pending.Permission != nil {
		if err := validateSettaCodexApprovalPolicy(pending.Permission.ApprovalPolicy, "conversation settings approvalPolicy"); err != nil {
			return err
		}
		settings.ApprovalPolicy = pending.Permission.ApprovalPolicy
		settings.ActivePermissionProfileID = pending.Permission.Permissions
		settings.ActivePermissionProfileExtends = ""
	}
	return nil
}

func applyCodexThreadStartSettings(params map[string]any, settings codexCommandThreadSettings) error {
	if settings.ApprovalPolicy != "" {
		if err := validateSettaCodexApprovalPolicy(settings.ApprovalPolicy, "thread/start request approvalPolicy"); err != nil {
			return err
		}
		params["approvalPolicy"] = settings.ApprovalPolicy
	}
	if settings.ActivePermissionProfileID != "" {
		params["permissions"] = settings.ActivePermissionProfileID
	}
	return nil
}

func validateCodexThreadStartPermissionSettings(context string, conversation Conversation, applied codexCommandThreadSettings) error {
	requested, ok, err := codexConversationExplicitPermissionSettings(conversation)
	if err != nil {
		return err
	}
	return validateCodexThreadPermissionSettings(context, requested, ok, applied)
}

func validateCodexThreadResumePermissionSettings(context string, conversation Conversation, applied codexCommandThreadSettings) error {
	requested, ok, err := codexConversationPermissionSettings(conversation)
	if err != nil {
		return err
	}
	return validateCodexThreadPermissionSettings(context, requested, ok, applied)
}

func validateCodexThreadPermissionSettings(context string, requested ChatCodexPermissionSettings, ok bool, applied codexCommandThreadSettings) error {
	if !ok {
		return nil
	}
	appliedApprovalPolicy, appliedProfileID, appliedProfileExtends := effectiveCodexPermissionFields(
		applied.ApprovalPolicy,
		applied.ActivePermissionProfileID,
		applied.ActivePermissionProfileExtends,
	)
	if appliedApprovalPolicy != requested.ApprovalPolicy ||
		appliedProfileID != requested.Permissions ||
		appliedProfileExtends != "" {
		return fmt.Errorf(
			"%s permission preset %s was not applied; got approvalPolicy=%q activePermissionProfileId=%q activePermissionProfileExtends=%q",
			context,
			requested.Preset,
			appliedApprovalPolicy,
			appliedProfileID,
			appliedProfileExtends,
		)
	}
	return nil
}

func codexConversationPermissionSettings(conversation Conversation) (ChatCodexPermissionSettings, bool, error) {
	if permission, ok, err := codexConversationExplicitPermissionSettings(conversation); ok || err != nil {
		return permission, ok, err
	}
	if conversation.CodexEffectiveSettings == nil || conversation.CodexEffectiveSettings.Permission == nil {
		return ChatCodexPermissionSettings{}, false, nil
	}
	permission := conversation.CodexEffectiveSettings.Permission
	if err := validateSettaCodexApprovalPolicy(permission.ApprovalPolicy, "conversation effective settings approvalPolicy"); err != nil {
		return ChatCodexPermissionSettings{}, false, err
	}
	if !permission.BuiltIn || permission.Preset == nil || permission.ActivePermissionProfileExtends != "" {
		return ChatCodexPermissionSettings{}, false, nil
	}
	return ChatCodexPermissionSettings{
		Preset:         *permission.Preset,
		ApprovalPolicy: permission.ApprovalPolicy,
		Permissions:    permission.ActivePermissionProfileID,
	}, true, nil
}

func codexConversationExplicitPermissionSettings(conversation Conversation) (ChatCodexPermissionSettings, bool, error) {
	if conversation.CodexSettings == nil || conversation.CodexSettings.Permission == nil {
		return ChatCodexPermissionSettings{}, false, nil
	}
	permission := *conversation.CodexSettings.Permission
	if err := validateSettaCodexApprovalPolicy(permission.ApprovalPolicy, "conversation settings approvalPolicy"); err != nil {
		return ChatCodexPermissionSettings{}, false, err
	}
	return permission, true, nil
}

func chatCodexSettingsFromCommandSettings(settings codexCommandThreadSettings) *ChatCodexSettings {
	var permission *ChatCodexPermissionSettings
	if preset, ok := chatPermissionPresetByEffectiveFields(settings.ApprovalPolicy, settings.ActivePermissionProfileID, settings.ActivePermissionProfileExtends); ok {
		if value, ok := chatPermissionSettingsForPreset(preset.ID); ok {
			permission = &value
		}
	}
	return &ChatCodexSettings{
		Model:           settings.Model,
		ReasoningEffort: reasoningEffortResult(settings.ReasoningEffort),
		Permission:      permission,
	}
}

func chatCodexEffectiveSettingsFromCommandSettings(settings codexCommandThreadSettings) *ChatCodexEffectiveSettings {
	if settings.Model == "" {
		return nil
	}
	return &ChatCodexEffectiveSettings{
		Model:                      settings.Model,
		ModelDisplayName:           settings.ModelDisplayName,
		ReasoningEffort:            reasoningEffortResult(settings.ReasoningEffort),
		ReasoningEffortDisplayName: settings.ReasoningEffortDisplayName,
		SupportsImages:             settings.SupportsImages,
		Permission:                 chatCodexEffectivePermissionSettings(settings.ApprovalPolicy, settings.ActivePermissionProfileID, settings.ActivePermissionProfileExtends),
	}
}

func (harness *CodexHarness) codexCommandThreadWithDisplayLabels(ctx context.Context, session *codexapp.Session, thread codexCommandThread) (codexCommandThread, error) {
	settings, err := harness.codexCommandSettingsWithDisplayLabels(ctx, session, thread.Settings)
	if err != nil {
		return codexCommandThread{}, err
	}
	thread.Settings = settings
	return thread, nil
}

func (harness *CodexHarness) codexCommandSettingsWithDisplayLabels(ctx context.Context, session *codexapp.Session, settings codexCommandThreadSettings) (codexCommandThreadSettings, error) {
	models, err := listCodexModelOptions(ctx, session)
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	settings, err = codexCommandSettingsWithDisplayLabelsFromModels(settings, models)
	if err != nil {
		return codexCommandThreadSettings{}, commandError(ChatCommandErrorCodexProviderDrift, "model/list response: "+err.Error(), err)
	}
	return settings, nil
}

func codexCommandSettingsWithDisplayLabelsFromModels(settings codexCommandThreadSettings, models []ChatModelOption) (codexCommandThreadSettings, error) {
	if settings.Model == "" {
		return settings, nil
	}
	model, ok := modelOptionByModel(models, settings.Model)
	if !ok {
		return codexCommandThreadSettings{}, fmt.Errorf("effective model %s was not present in model/list", settings.Model)
	}
	settings.ModelDisplayName = model.DisplayName
	settings.SupportsImages = model.SupportsImages
	if settings.ReasoningEffort == "" {
		settings.ReasoningEffort = model.DefaultReasoningEffort
	}
	effort, ok := reasoningEffortOptionByEffort(model.SupportedReasoningEfforts, settings.ReasoningEffort)
	if !ok {
		return codexCommandThreadSettings{}, fmt.Errorf("effective reasoning effort %s was not present for model %s in model/list", settings.ReasoningEffort, settings.Model)
	}
	settings.ReasoningEffortDisplayName = effort.DisplayName
	return settings, nil
}

func modelOptionByModel(models []ChatModelOption, selectedModel string) (ChatModelOption, bool) {
	for _, model := range models {
		if model.Model == selectedModel {
			return model, true
		}
	}
	return ChatModelOption{}, false
}

func reasoningEffortOptionByEffort(options []ChatReasoningEffortOption, selectedEffort ReasoningEffort) (ChatReasoningEffortOption, bool) {
	for _, option := range options {
		if option.Effort == selectedEffort {
			return option, true
		}
	}
	return ChatReasoningEffortOption{}, false
}

func optionalReasoningEffort(value map[string]any, name string, label string) (ReasoningEffort, error) {
	raw, err := optionalString(value, name, label)
	if err != nil {
		return "", err
	}
	if raw == "" {
		return "", nil
	}
	effort := ReasoningEffort(raw)
	if !validValue(effort, reasoningEffortValues) {
		return "", fmt.Errorf("%s.%s has unsupported reasoning effort %s", label, name, raw)
	}
	return effort, nil
}
