package managedchat

func shouldIgnoreResponsePlaceholderMessage(message map[string]any) bool {
	role, err := messageRole(message)
	if err != nil || role != "assistant" {
		return false
	}
	id, err := messageID(message)
	if err != nil || !isResponsePlaceholderID(id) {
		return false
	}
	return messageContentEmpty(message) &&
		messageToolCallsEmpty(message) &&
		messageAttachmentsEmpty(message)
}

func resolveFinalizedAssistantMessageUpdate(messages []map[string]any, message map[string]any) (map[string]any, string) {
	existingAssistant := findAssistantMessageForFinalizedUpdate(messages, message)
	targetID, err := messageID(message)
	if err != nil {
		targetID = ""
	}
	if existingAssistant != nil {
		if existingID, existingErr := messageID(existingAssistant); existingErr == nil {
			targetID = existingID
		}
	}
	return mergeFinalizedAssistantMessage(message, existingAssistant), targetID
}

func findAssistantMessageForFinalizedUpdate(messages []map[string]any, message map[string]any) map[string]any {
	messageIDValue, err := messageID(message)
	if err == nil {
		for _, entry := range messages {
			entryID, entryErr := messageID(entry)
			if entryErr != nil || entryID != messageIDValue {
				continue
			}
			role, roleErr := messageRole(entry)
			if roleErr == nil && role == "assistant" {
				return cloneAnyMap(entry)
			}
		}
	}
	for index := len(messages) - 1; index >= 0; index-- {
		candidate := messages[index]
		role, roleErr := messageRole(candidate)
		if roleErr != nil || role != "assistant" {
			continue
		}
		candidateID, idErr := messageID(candidate)
		if idErr != nil || !isResponsePlaceholderID(candidateID) {
			continue
		}
		return cloneAnyMap(candidate)
	}
	return nil
}

func mergeFinalizedAssistantMessage(message map[string]any, existingAssistant map[string]any) map[string]any {
	merged := cloneAnyMap(message)
	if existingAssistant == nil {
		return merged
	}
	if messageContentEmpty(merged) && !messageContentEmpty(existingAssistant) {
		merged["content"] = cloneContentList(existingAssistant["content"])
	}
	if messageToolCallsEmpty(merged) && !messageToolCallsEmpty(existingAssistant) {
		merged["tool_calls"] = cloneContentList(existingAssistant["tool_calls"])
	}
	if messageAttachmentsEmpty(merged) && !messageAttachmentsEmpty(existingAssistant) {
		merged["attachments"] = cloneContentList(existingAssistant["attachments"])
	}
	return merged
}

func messageAttachmentsEmpty(message map[string]any) bool {
	rawAttachments, ok := message["attachments"]
	if !ok || rawAttachments == nil {
		return true
	}
	attachments, ok := rawAttachments.([]any)
	return !ok || len(attachments) == 0
}

func upsertChatMessageByID(messages []map[string]any, message map[string]any, targetID string) []map[string]any {
	resolvedTargetID := targetID
	if resolvedTargetID == "" {
		var err error
		resolvedTargetID, err = messageID(message)
		if err != nil {
			return cloneMessageSlice(messages)
		}
	}
	updated := cloneMessageSlice(messages)
	for index, entry := range updated {
		entryID, err := messageID(entry)
		if err != nil {
			continue
		}
		if entryID != resolvedTargetID {
			continue
		}
		updated[index] = cloneAnyMap(message)
		return updated
	}
	return append(updated, cloneAnyMap(message))
}
