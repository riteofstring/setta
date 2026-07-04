package chat

import "fmt"

func (service *Service) LoadComposerPromptHistory(workspaceID string, conversationID string, beforeOrdinal int, limit int) (ComposerPromptHistoryPage, error) {
	if limit == 0 {
		limit = defaultPageLimit
	}
	if beforeOrdinal < 0 {
		return ComposerPromptHistoryPage{}, fmt.Errorf("composer prompt history beforeOrdinal must be non-negative: %d", beforeOrdinal)
	}
	if limit <= 0 {
		return ComposerPromptHistoryPage{}, fmt.Errorf("composer prompt history limit must be positive: %d", limit)
	}
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return ComposerPromptHistoryPage{}, err
	}
	service.mu.Lock()
	page, err := service.loadComposerPromptHistoryLocked(workspaceID, conversationID, beforeOrdinal, limit)
	service.mu.Unlock()
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, conversationID, "")
		return ComposerPromptHistoryPage{}, err
	}
	return page, nil
}

func (service *Service) loadComposerPromptHistoryLocked(workspaceID string, conversationID string, beforeOrdinal int, limit int) (ComposerPromptHistoryPage, error) {
	if _, err := service.store.LoadConversation(workspaceID, conversationID); err != nil {
		return ComposerPromptHistoryPage{}, err
	}
	files, err := service.store.messageFiles(workspaceID, conversationID)
	if err != nil {
		return ComposerPromptHistoryPage{}, err
	}
	entries := make([]ComposerPromptHistoryEntry, 0, limit)
	hasMoreOlder := false
	for index := len(files) - 1; index >= 0; index-- {
		file := files[index]
		if beforeOrdinal != 0 && file.ordinal >= beforeOrdinal {
			continue
		}
		message, err := readComposerPromptHistoryMessage(file, conversationID)
		if err != nil {
			return ComposerPromptHistoryPage{}, err
		}
		if message.Role != RoleUser {
			continue
		}
		if len(entries) == limit {
			hasMoreOlder = true
			break
		}
		entry, err := service.composerPromptHistoryEntryLocked(workspaceID, conversationID, message)
		if err != nil {
			return ComposerPromptHistoryPage{}, err
		}
		entries = append(entries, entry)
	}
	olderBeforeOrdinal := 0
	if len(entries) > 0 {
		olderBeforeOrdinal = entries[len(entries)-1].Ordinal
	}
	return ComposerPromptHistoryPage{
		ConversationID:     conversationID,
		Entries:            entries,
		HasMoreOlder:       hasMoreOlder,
		OlderBeforeOrdinal: olderBeforeOrdinal,
	}, nil
}

func readComposerPromptHistoryMessage(file messageFile, conversationID string) (ChatMessage, error) {
	var message ChatMessage
	if err := readJSONFile(file.path, &message); err != nil {
		return ChatMessage{}, err
	}
	if err := validateMessage(message); err != nil {
		return ChatMessage{}, corruptStateError(file.path, err)
	}
	if message.ConversationID != conversationID {
		return ChatMessage{}, corruptStateErrorf(file.path, "message %s belongs to conversation %s, not %s", message.ID, message.ConversationID, conversationID)
	}
	return message, nil
}

func (service *Service) composerPromptHistoryEntryLocked(workspaceID string, conversationID string, message ChatMessage) (ComposerPromptHistoryEntry, error) {
	input, err := inputFromMessage(message)
	if err != nil {
		return ComposerPromptHistoryEntry{}, fmt.Errorf("composer prompt history message %s input: %w", message.ID, err)
	}
	if err := validateChatInput(input); err != nil {
		return ComposerPromptHistoryEntry{}, fmt.Errorf("composer prompt history message %s input: %w", message.ID, err)
	}
	attachments, err := service.composerPromptHistoryAttachmentsLocked(workspaceID, conversationID, input)
	if err != nil {
		return ComposerPromptHistoryEntry{}, fmt.Errorf("composer prompt history message %s: %w", message.ID, err)
	}
	return ComposerPromptHistoryEntry{
		MessageID:      message.ID,
		ConversationID: message.ConversationID,
		Ordinal:        message.Ordinal,
		CreatedAt:      message.CreatedAt,
		Input:          input,
		Attachments:    attachments,
	}, nil
}

func (service *Service) composerPromptHistoryAttachmentsLocked(workspaceID string, conversationID string, input ChatInput) ([]ImageAttachment, error) {
	attachments := []ImageAttachment{}
	seen := map[string]bool{}
	for _, part := range input.Parts {
		if part.Type != MessagePartImage || part.Image == nil {
			continue
		}
		attachmentID := part.Image.AttachmentID
		if seen[attachmentID] {
			continue
		}
		attachment, err := service.store.LoadImageAttachment(workspaceID, conversationID, attachmentID)
		if err != nil {
			return nil, fmt.Errorf("image attachment %s: %w", attachmentID, err)
		}
		seen[attachmentID] = true
		attachments = append(attachments, attachment)
	}
	return attachments, nil
}
