package chat

import (
	"context"

	"setta/internal/workspace"
)

func (harness *ScriptedWorkflowHarness) ResolveCodexEffectiveSettings(_ context.Context, _ workspace.WorkspaceSummary, conversation Conversation) (*ChatCodexEffectiveSettings, error) {
	harness.mu.Lock()
	model := harness.model
	reasoning := harness.reasoning
	harness.mu.Unlock()

	if conversation.CodexSettings != nil {
		if conversation.CodexSettings.Model != "" {
			model = conversation.CodexSettings.Model
		}
		if conversation.CodexSettings.ReasoningEffort != nil {
			reasoning = *conversation.CodexSettings.ReasoningEffort
		}
	}
	return scriptedCodexEffectiveSettings(model, reasoning)
}
