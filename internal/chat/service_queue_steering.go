package chat

import "fmt"

func (service *Service) UncommittedSteeringMessagesForRun(workspaceID string, conversationID string, runID string) ([]ChatMessage, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return nil, err
	}
	if err := validateStorageID("run id", runID); err != nil {
		return nil, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return nil, err
	}
	if run.ConversationID != conversationID {
		return nil, fmt.Errorf("run %s belongs to conversation %s, not %s", runID, run.ConversationID, conversationID)
	}
	return service.uncommittedSteeringMessagesForRunLocked(workspaceID, conversationID, runID)
}

func (service *Service) uncommittedSteeringMessagesForRunLocked(workspaceID string, conversationID string, runID string) ([]ChatMessage, error) {
	messages, err := service.store.LoadMessages(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	uncommitted := []ChatMessage{}
	for _, message := range messages {
		if message.RunID == runID && message.Role == RoleUser && message.Delivery == MessageDeliverySteering && message.Status != MessageStatusComplete {
			uncommitted = append(uncommitted, message)
		}
	}
	return uncommitted, nil
}
