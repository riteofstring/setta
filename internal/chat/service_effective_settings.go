package chat

import (
	"context"

	"setta/internal/workspace"
)

func (service *Service) conversationWithResolvedEffectiveSettings(ctx context.Context, workspaceSummary workspace.WorkspaceSummary, conversation Conversation) (Conversation, error) {
	if conversationUsesStoredEffectiveSettings(conversation) {
		return conversation, nil
	}
	settings, err := service.harness.ResolveCodexEffectiveSettings(ctx, workspaceSummary, conversation)
	if err != nil {
		return Conversation{}, err
	}
	conversation.CodexEffectiveSettings = settings
	return conversation, nil
}

func conversationUsesStoredEffectiveSettings(conversation Conversation) bool {
	if conversation.CodexEffectiveSettings == nil {
		return false
	}
	ref := latestHarnessRef(conversation, HarnessCodex)
	return ref.ThreadID != "" && ref.Status == HarnessRefLinked
}

func chatCodexEffectiveSettingsEqual(left *ChatCodexEffectiveSettings, right *ChatCodexEffectiveSettings) bool {
	if left == nil || right == nil {
		return left == right
	}
	if left.Model != right.Model {
		return false
	}
	if left.ModelDisplayName != right.ModelDisplayName {
		return false
	}
	if left.ReasoningEffortDisplayName != right.ReasoningEffortDisplayName {
		return false
	}
	if left.SupportsImages != right.SupportsImages {
		return false
	}
	if !reasoningEffortPointersEqual(left.ReasoningEffort, right.ReasoningEffort) {
		return false
	}
	return chatCodexEffectivePermissionSettingsEqual(left.Permission, right.Permission)
}

func reasoningEffortPointersEqual(left *ReasoningEffort, right *ReasoningEffort) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func chatCodexEffectivePermissionSettingsEqual(left *ChatCodexEffectivePermissionSettings, right *ChatCodexEffectivePermissionSettings) bool {
	if left == nil || right == nil {
		return left == right
	}
	if left.ApprovalPolicy != right.ApprovalPolicy {
		return false
	}
	if left.ActivePermissionProfileID != right.ActivePermissionProfileID {
		return false
	}
	if left.ActivePermissionProfileExtends != right.ActivePermissionProfileExtends {
		return false
	}
	if left.DisplayLabel != right.DisplayLabel {
		return false
	}
	if left.BuiltIn != right.BuiltIn {
		return false
	}
	if left.Preset == nil || right.Preset == nil {
		return left.Preset == right.Preset
	}
	return *left.Preset == *right.Preset
}
