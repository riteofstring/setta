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
		if assistant := findAssistantMessageByID(messages, messageIDValue); assistant != nil {
			return assistant
		}
	}
	return findLatestAssistantPlaceholder(messages)
}

func findAssistantMessageByID(messages []map[string]any, targetID string) map[string]any {
	for _, entry := range messages {
		if assistantMessageMatchesID(entry, targetID) {
			return cloneAnyMap(entry)
		}
	}
	return nil
}

func assistantMessageMatchesID(entry map[string]any, targetID string) bool {
	entryID, entryErr := messageID(entry)
	if entryErr != nil || entryID != targetID {
		return false
	}
	role, roleErr := messageRole(entry)
	return roleErr == nil && role == "assistant"
}

func findLatestAssistantPlaceholder(messages []map[string]any) map[string]any {
	for index := len(messages) - 1; index >= 0; index-- {
		candidate := messages[index]
		if assistantMessageIsPlaceholder(candidate) {
			return cloneAnyMap(candidate)
		}
	}
	return nil
}

func assistantMessageIsPlaceholder(candidate map[string]any) bool {
	role, roleErr := messageRole(candidate)
	if roleErr != nil || role != "assistant" {
		return false
	}
	candidateID, idErr := messageID(candidate)
	return idErr == nil && isResponsePlaceholderID(candidateID)
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
