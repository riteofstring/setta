package orchestrator

import (
	"fmt"

	"setta/internal/chat"
)

type workflowAgentRunSettingSources struct {
	Model           WorkflowAgentSettingsSource
	ReasoningEffort WorkflowAgentSettingsSource
	Permission      WorkflowAgentSettingsSource
}

func workflowAgentCodexSettingsForRun(workflowDefaults WorkflowAgentSettings, nodeSettings WorkflowAgentSettings) (chat.ChatCodexSettings, workflowAgentRunSettingSources) {
	settings := chat.ChatCodexSettings{}
	sources := workflowAgentRunSettingSources{
		Model:           WorkflowAgentSettingsSourceDefault,
		ReasoningEffort: WorkflowAgentSettingsSourceDefault,
		Permission:      WorkflowAgentSettingsSourceDefault,
	}
	applyWorkflowAgentSettings(&settings, &sources, workflowDefaults, WorkflowAgentSettingsSourceWorkflow)
	applyWorkflowAgentSettings(&settings, &sources, nodeSettings, WorkflowAgentSettingsSourceNode)
	return settings, sources
}

func applyWorkflowAgentSettings(settings *chat.ChatCodexSettings, sources *workflowAgentRunSettingSources, next WorkflowAgentSettings, source WorkflowAgentSettingsSource) {
	if next.Model != "" {
		settings.Model = next.Model
		sources.Model = source
	}
	if next.ReasoningEffort != nil {
		effort := *next.ReasoningEffort
		settings.ReasoningEffort = &effort
		sources.ReasoningEffort = source
	}
	if next.Permission != nil {
		permission := *next.Permission
		settings.Permission = &permission
		sources.Permission = source
	}
}

func workflowAgentEffectiveRunSettings(settings chat.ChatCodexSettings, effective *chat.ChatCodexEffectiveSettings, sources workflowAgentRunSettingSources) (*WorkflowAgentEffectiveRunSettings, error) {
	if effective == nil {
		return nil, fmt.Errorf("workflow agent effective settings are required")
	}
	if effective.Model == "" {
		return nil, fmt.Errorf("workflow agent effective model is required")
	}
	if effective.Permission == nil {
		return nil, fmt.Errorf("workflow agent effective permission settings are required")
	}
	permission := effective.Permission
	permissions := permission.ActivePermissionProfileID
	if settings.Permission != nil {
		permissions = settings.Permission.Permissions
	}
	return &WorkflowAgentEffectiveRunSettings{
		Model:                      effective.Model,
		ModelDisplayName:           effective.ModelDisplayName,
		ModelSource:                sources.Model,
		ReasoningEffort:            cloneReasoningEffortPointer(effective.ReasoningEffort),
		ReasoningEffortDisplayName: effective.ReasoningEffortDisplayName,
		ReasoningEffortSource:      sources.ReasoningEffort,
		PermissionPreset:           clonePermissionPresetPointer(permission.Preset),
		PermissionProfileID:        permission.ActivePermissionProfileID,
		PermissionDisplayLabel:     permission.DisplayLabel,
		ApprovalPolicy:             permission.ApprovalPolicy,
		Permissions:                permissions,
		PermissionSource:           sources.Permission,
	}, nil
}

func validateWorkflowAgentSettings(settings WorkflowAgentSettings) error {
	if settings.ReasoningEffort != nil && !validWorkflowAgentReasoningEffort(*settings.ReasoningEffort) {
		return fmt.Errorf("reasoningEffort has unsupported value %s", *settings.ReasoningEffort)
	}
	if settings.Permission != nil {
		if !validWorkflowAgentPermissionPreset(settings.Permission.Preset) {
			return fmt.Errorf("permission preset has unsupported value %s", settings.Permission.Preset)
		}
		if settings.Permission.ApprovalPolicy == "" {
			return fmt.Errorf("permission approvalPolicy is required")
		}
		if settings.Permission.Permissions == "" {
			return fmt.Errorf("permission permissions is required")
		}
	}
	return nil
}

func validWorkflowAgentReasoningEffort(effort chat.ReasoningEffort) bool {
	switch effort {
	case chat.ReasoningEffortNone,
		chat.ReasoningEffortMinimal,
		chat.ReasoningEffortLow,
		chat.ReasoningEffortMedium,
		chat.ReasoningEffortHigh,
		chat.ReasoningEffortXHigh,
		chat.ReasoningEffortMax,
		chat.ReasoningEffortUltra:
		return true
	default:
		return false
	}
}

func validWorkflowAgentPermissionPreset(preset chat.ChatPermissionPresetID) bool {
	switch preset {
	case chat.ChatPermissionPresetReadOnly,
		chat.ChatPermissionPresetDefault,
		chat.ChatPermissionPresetFullAccess:
		return true
	default:
		return false
	}
}

func cloneReasoningEffortPointer(effort *chat.ReasoningEffort) *chat.ReasoningEffort {
	if effort == nil {
		return nil
	}
	value := *effort
	return &value
}

func clonePermissionPresetPointer(preset *chat.ChatPermissionPresetID) *chat.ChatPermissionPresetID {
	if preset == nil {
		return nil
	}
	value := *preset
	return &value
}
