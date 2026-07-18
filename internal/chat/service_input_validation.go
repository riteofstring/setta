package chat

import (
	"context"
	"strings"

	"setta/internal/workspace"
)

func prepareMessageEndpointInput(input ChatInput) (ChatInput, error) {
	input = normalizeChatInput(input)
	if err := validateChatInput(input); err != nil {
		return ChatInput{}, err
	}
	promptText := strings.TrimSpace(chatInputText(input))
	if promptText == "" {
		return input, nil
	}
	if err := rejectSlashPromptForMessageEndpoint(promptText); err != nil {
		return ChatInput{}, err
	}
	return input, nil
}

func (service *Service) ensureInputSupportedForConversation(ctx context.Context, workspaceSummary workspace.WorkspaceSummary, workspaceID string, conversationID string, input ChatInput) error {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return err
	}
	return service.ensureImageInputSupported(ctx, workspaceSummary, conversation, input)
}
