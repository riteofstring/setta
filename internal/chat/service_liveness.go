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
	active.providerEventGeneration += 1
	service.active[key] = active
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

func (service *Service) markActiveRunLivenessReconcilingLocked(workspaceID string, conversationID string, run Run, active activeTurn, reason RunLivenessReason, reconciledAt string) RunLiveness {
	liveness := service.activeRunLivenessValueLocked(workspaceID, conversationID, run, active)
	liveness.Status = RunLivenessReconciling
	liveness.Reason = reconcilingRunLivenessReason(liveness, reason)
	liveness.Retryable = true
	liveness.Cancellable = true
	liveness.LastReconciledAt = reconciledAt
	liveness.Error = ""
	service.liveness[activeKey(workspaceID, conversationID)] = liveness
	return liveness
}

func reconcilingRunLivenessReason(current RunLiveness, next RunLivenessReason) RunLivenessReason {
	if current.Status == RunLivenessReconciling && next == RunLivenessReasonSnapshotLoad {
		switch current.Reason {
		case RunLivenessReasonProviderRestarted, RunLivenessReasonStreamResync:
			return current.Reason
		}
	}
	return next
}

func (service *Service) markActiveRunLivenessLostLocked(workspaceID string, conversationID string, run Run, active activeTurn, reason RunLivenessReason, reconciledAt string, message string) RunLiveness {
	liveness := service.activeRunLivenessValueLocked(workspaceID, conversationID, run, active)
	liveness.Status = RunLivenessLost
	liveness.Reason = reason
	liveness.Retryable = true
	liveness.Cancellable = service.activeRunCancellableLocked(activeKey(workspaceID, conversationID), run.ID)
	liveness.LastReconciledAt = reconciledAt
	liveness.Error = message
	service.liveness[activeKey(workspaceID, conversationID)] = liveness
	return liveness
}

func (service *Service) activeRunLivenessValueLocked(workspaceID string, conversationID string, run Run, active activeTurn) RunLiveness {
	key := activeKey(workspaceID, conversationID)
	liveness, ok := service.liveness[key]
	if !ok || liveness.RunID != run.ID {
		liveness = RunLiveness{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			RunID:          run.ID,
			Harness:        run.Harness,
		}
	}
	if liveness.ProviderThreadID == "" {
		liveness.ProviderThreadID = active.threadID
	}
	if liveness.ProviderTurnID == "" {
		liveness.ProviderTurnID = active.turnID
	}
	return liveness
}

func (service *Service) markFreshProviderEventLocked(workspaceID string, conversationID string, runID string) (RunLiveness, bool) {
	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.runID != runID || active.threadID == "" || active.turnID == "" {
		return RunLiveness{}, false
	}
	liveness, ok := service.liveness[key]
	if !ok || liveness.RunID != runID {
		return service.markRunLivenessAttachedLocked(workspaceID, conversationID, runID, active.threadID, active.turnID, timestamp(service.now()))
	}
	if liveness.Status == RunLivenessAttached {
		active.providerEventGeneration += 1
		service.active[key] = active
		return RunLiveness{}, false
	}
	return service.markRunLivenessAttachedLocked(workspaceID, conversationID, runID, active.threadID, active.turnID, timestamp(service.now()))
}

func (service *Service) publishFreshProviderEventLivenessLocked(workspaceID string, conversationID string, runID string) error {
	liveness, updated := service.markFreshProviderEventLocked(workspaceID, conversationID, runID)
	if !updated {
		return nil
	}
	if _, err := service.events.Publish(NewRunLivenessUpdatedEvent(liveness)); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
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

func (service *Service) activeRunLivenessForConversationList(workspaceID string, runs []Run) map[string]RunLiveness {
	service.mu.Lock()
	defer service.mu.Unlock()

	snapshots := map[string]RunLiveness{}
	for _, run := range runs {
		if run.WorkspaceID != workspaceID || run.Status != RunStatusRunning {
			continue
		}
		if _, exists := snapshots[run.ConversationID]; exists {
			continue
		}
		liveness := service.activeRunLivenessLocked(workspaceID, run.ConversationID, run)
		if liveness != nil {
			snapshots[run.ConversationID] = *liveness
		}
	}
	return snapshots
}

func (service *Service) activeRunCancellableLocked(key string, runID string) bool {
	active, ok := service.active[key]
	return ok && active.runID == runID
}
