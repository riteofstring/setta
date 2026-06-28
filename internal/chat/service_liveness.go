package chat

func (service *Service) activateTurnLocked(workspaceID string, conversationID string, active activeTurn, run Run) {
	key := activeKey(workspaceID, conversationID)
	active.runID = run.ID
	active.workspaceID = workspaceID
	service.active[key] = active
	service.liveness[key] = RunLiveness{
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		RunID:          run.ID,
		Harness:        run.Harness,
		Status:         RunLivenessReconciling,
		Reason:         RunLivenessReasonProviderRefPending,
		Cancellable:    true,
	}
}

func (service *Service) deleteActiveTurnLocked(key string) {
	delete(service.active, key)
	delete(service.liveness, key)
}

func (service *Service) publishActiveRunLivenessLocked(workspaceID string, conversationID string, runID string) error {
	liveness, ok := service.liveness[activeKey(workspaceID, conversationID)]
	if !ok || liveness.RunID != runID {
		return nil
	}
	_, err := service.events.Publish(NewRunLivenessUpdatedEvent(liveness))
	return err
}

func (service *Service) publishActiveRunLivenessAndConversationLocked(workspaceID string, conversationID string, runID string) error {
	if err := service.publishActiveRunLivenessLocked(workspaceID, conversationID, runID); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
}

func (service *Service) markRunLivenessAttachedLocked(workspaceID string, conversationID string, runID string, threadID string, turnID string, observedAt string) (RunLiveness, bool) {
	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.runID != runID {
		return RunLiveness{}, false
	}
	liveness, ok := service.liveness[key]
	if !ok || liveness.RunID != runID {
		liveness = RunLiveness{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			RunID:          runID,
			Harness:        HarnessCodex,
		}
	}
	liveness.Status = RunLivenessAttached
	liveness.Reason = RunLivenessReasonProviderTurnLinked
	liveness.Retryable = false
	liveness.Cancellable = true
	liveness.ProviderThreadID = threadID
	liveness.ProviderTurnID = turnID
	liveness.LastProviderEventAt = observedAt
	liveness.Error = ""
	service.liveness[key] = liveness
	return liveness, true
}

func (service *Service) terminalRunLivenessLocked(workspaceID string, conversationID string, run Run, active activeTurn) RunLiveness {
	liveness, ok := service.liveness[activeKey(workspaceID, conversationID)]
	if !ok || liveness.RunID != run.ID {
		liveness = RunLiveness{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			RunID:          run.ID,
			Harness:        run.Harness,
		}
	}
	liveness.Status = RunLivenessTerminal
	liveness.Reason = RunLivenessReasonRunTerminal
	liveness.Retryable = false
	liveness.Cancellable = false
	if liveness.ProviderThreadID == "" {
		liveness.ProviderThreadID = active.threadID
	}
	if liveness.ProviderTurnID == "" {
		liveness.ProviderTurnID = active.turnID
	}
	liveness.Error = run.Error
	return liveness
}

func (service *Service) activeRunLivenessLocked(workspaceID string, conversationID string, run Run) *RunLiveness {
	key := activeKey(workspaceID, conversationID)
	liveness, ok := service.liveness[key]
	if ok && liveness.RunID == run.ID {
		liveness.Cancellable = service.activeRunCancellableLocked(key, run.ID)
		return &liveness
	}
	liveness = RunLiveness{
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		RunID:          run.ID,
		Harness:        run.Harness,
		Status:         RunLivenessLost,
		Reason:         RunLivenessReasonAttachmentMissing,
		Retryable:      false,
		Cancellable:    false,
	}
	return &liveness
}

func (service *Service) activeRunCancellableLocked(key string, runID string) bool {
	active, ok := service.active[key]
	return ok && active.runID == runID
}
