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
	return reasoningEffortPointersEqual(left.ReasoningEffort, right.ReasoningEffort)
}

func reasoningEffortPointersEqual(left *ReasoningEffort, right *ReasoningEffort) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}
