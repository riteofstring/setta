package chat

import (
	"context"
	"fmt"

	"setta/internal/workspace"
)

func (service *Service) ensureImageInputSupported(ctx context.Context, workspaceSummary workspace.WorkspaceSummary, conversation Conversation, input ChatInput) error {
	if chatInputImageCount(input) == 0 {
		return nil
	}
	resolved, err := service.conversationWithResolvedEffectiveSettings(ctx, workspaceSummary, conversation)
	if err != nil {
		return err
	}
	settings := resolved.CodexEffectiveSettings
	if settings == nil {
		return fmt.Errorf("active provider model does not support image input")
	}
	if settings.SupportsImages {
		return nil
	}
	reason := settings.ModelDisplayName
	if reason == "" {
		reason = settings.Model
	}
	if reason == "" {
		reason = "active provider model"
	}
	return fmt.Errorf("%s does not support image input", reason)
}
