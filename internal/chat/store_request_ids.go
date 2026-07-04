package chat

func validateStoreWorkspaceID(workspaceID string) error {
	return validateWorkspaceID(workspaceID)
}

func validateStoreConversationIDs(workspaceID string, conversationID string) error {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return err
	}
	return validateConversationID(conversationID)
}

func validateStoreMessageIDs(workspaceID string, conversationID string, messageID string) error {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return err
	}
	return validateMessageID(messageID)
}

func validateStoreRunIDs(workspaceID string, runID string) error {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return err
	}
	return validateRunID(runID)
}

func validateStoreRunItemIDs(workspaceID string, runID string, runItemID string) error {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return err
	}
	return validateRunItemID(runItemID)
}

func validateStoreBackgroundTerminalIDs(workspaceID string, conversationID string, processID string) error {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return err
	}
	return validateStorageID("background terminal id", processID)
}
