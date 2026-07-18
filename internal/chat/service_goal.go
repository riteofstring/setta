package chat

func (service *Service) updateGoalState(workspaceID string, conversationID string, runID string, goal *ChatGoalState) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.updateGoalStateLocked(workspaceID, conversationID, runID, goal)
}

func (service *Service) updateGoalStateLocked(workspaceID string, conversationID string, runID string, goal *ChatGoalState) error {
	if goal == nil {
		if err := service.store.ClearGoal(workspaceID, conversationID); err != nil {
			return err
		}
	} else if err := service.store.SaveGoal(workspaceID, conversationID, *goal); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewGoalUpdatedEvent(workspaceID, conversationID, runID, goal)); err != nil {
		return err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, runID); err != nil {
		return err
	}
	return service.publishFreshProviderEventLivenessLocked(workspaceID, conversationID, runID)
}
