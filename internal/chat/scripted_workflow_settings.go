package chat

import (
	"context"

	"setta/internal/workspace"
)

func (harness *ScriptedWorkflowHarness) ResolveCodexEffectiveSettings(_ context.Context, _ workspace.WorkspaceSummary, conversation Conversation) (*ChatCodexEffectiveSettings, error) {
	harness.mu.Lock()
	model := harness.model
	reasoning := harness.reasoning
	permission := harness.permission
	hasPermission := harness.hasPermission
	harness.mu.Unlock()

	if conversation.CodexSettings != nil {
		if conversation.CodexSettings.Model != "" {
			model = conversation.CodexSettings.Model
		}
		if conversation.CodexSettings.ReasoningEffort != nil {
			reasoning = *conversation.CodexSettings.ReasoningEffort
		}
		if conversation.CodexSettings.Permission != nil {
			permission = *conversation.CodexSettings.Permission
			hasPermission = true
		}
	}
	return scriptedCodexEffectiveSettings(model, reasoning, fakeCodexPermissionSettings(permission, hasPermission))
}
