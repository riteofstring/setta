package chat

func (service *Service) markTerminalPendingSteeringLocked(workspaceID string, conversationID string, runID string, status MessageStatus, reconcile bool) ([]ChatMessage, error) {
	if !reconcile {
		return nil, nil
	}
	return service.markPendingSteeringMessagesLocked(workspaceID, conversationID, runID, status)
}

func (service *Service) publishTerminalTurnLocked(workspaceID string, conversationID string, assistant ChatMessage, run Run, pendingSteering []ChatMessage) error {
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, assistant)); err != nil {
		return err
	}
	if err := service.publishMessageUpdatesLocked(workspaceID, conversationID, run.ID, pendingSteering); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID)
}
