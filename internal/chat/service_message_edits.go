package chat

import (
	"errors"
	"fmt"
	"strings"
)

func (service *Service) UpdateUserMessage(workspaceID string, conversationID string, messageID string, text string) (ChatMessage, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return ChatMessage{}, errors.New("message text is required")
	}
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return ChatMessage{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	if err := service.rejectMessageEditWithLiveRunLocked(workspaceID, conversationID); err != nil {
		return ChatMessage{}, err
	}
	message, err := service.store.LoadMessageByID(workspaceID, conversationID, messageID)
	if err != nil {
		service.recordCorruptStateDiagnosticLocked(err, workspaceID, conversationID, "")
		return ChatMessage{}, err
	}
	if err := validateEditableUserMessage(message); err != nil {
		return ChatMessage{}, err
	}

	now := timestamp(service.now())
	message.Parts[0].Text = text
	message.Parts[0].Format = TextFormatPlain
	message.UpdatedAt = now
	if err := service.store.SaveMessage(workspaceID, message); err != nil {
		return ChatMessage{}, err
	}

	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, err
	}
	conversation.UpdatedAt = now
	if err := service.store.SaveConversation(conversation); err != nil {
		return ChatMessage{}, err
	}
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, message.RunID, message)); err != nil {
		return ChatMessage{}, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, message.RunID); err != nil {
		return ChatMessage{}, err
	}
	return message, nil
}

func (service *Service) rejectMessageEditWithLiveRunLocked(workspaceID string, conversationID string) error {
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return err
	}
	for _, run := range runs {
		if run.Status == RunStatusQueued {
			return fmt.Errorf("cannot edit conversation %s while run %s is queued", conversationID, run.ID)
		}
	}
	if run, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs); err != nil {
		return err
	} else if ok {
		return fmt.Errorf("cannot edit conversation %s while run %s is active", conversationID, run.ID)
	}
	return nil
}

func validateEditableUserMessage(message ChatMessage) error {
	if message.Role != RoleUser {
		return fmt.Errorf("only user messages can be edited: %s", message.ID)
	}
	if len(message.Parts) != 1 {
		return fmt.Errorf("message %s has %d parts; expected one editable text part", message.ID, len(message.Parts))
	}
	if message.Parts[0].Type != MessagePartText {
		return fmt.Errorf("message %s part %s is not editable text", message.ID, message.Parts[0].ID)
	}
	return nil
}
