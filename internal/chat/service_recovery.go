package chat

func (service *Service) recoverInterruptedRuns() error {
	workspaceIDs, err := service.store.WorkspaceIDs()
	if err != nil {
		return err
	}
	now := timestamp(service.now())
	for _, workspaceID := range workspaceIDs {
		runs, corrupt, err := service.store.ScanRunsAllowingCorrupt(workspaceID)
		if err != nil {
			return err
		}
		if len(corrupt) > 0 {
			for _, finding := range corrupt {
				service.recordCorruptStateFinding(finding)
			}
			continue
		}
		for _, run := range runs {
			if run.Status != RunStatusRunning {
				continue
			}
			if run.ConversationID == UIShowcaseConversationID {
				continue
			}
			if err := service.recoverInterruptedRun(workspaceID, run, now); err != nil {
				if IsCorruptStateError(err) {
					service.recordCorruptStateDiagnostic(err, workspaceID, run.ConversationID, run.ID)
					continue
				}
				return err
			}
		}
	}
	return nil
}

func (service *Service) recoverInterruptedRun(workspaceID string, run Run, now string) error {
	message, ok, err := service.store.FindMessageByID(workspaceID, run.ConversationID, run.AssistantMessageID)
	if err != nil {
		return err
	}
	if !ok {
		return corruptStateErrorf(service.store.projectionRunPath(workspaceID, run.ID), "run %s assistant message %s was not found", run.ID, run.AssistantMessageID)
	}
	if err := validateRunAssistantMessageRecord(run, message); err != nil {
		return corruptStateError(service.store.projectionRunPath(workspaceID, run.ID), err)
	}
	message.Status = MessageStatusError
	message.UpdatedAt = now
	run.Status = RunStatusFailed
	run.CompletedAt = now
	run.Error = "run interrupted by backend restart"
	run.PendingApproval = nil
	if _, err := service.store.FailTurn(TerminalTurnRecords{AssistantMessage: message, Run: run}); err != nil {
		return err
	}
	if _, err := service.markPendingSteeringMessagesLocked(workspaceID, run.ConversationID, run.ID, MessageStatusError); err != nil {
		return err
	}
	if err := service.advanceReadRelevantMarkerLocked(workspaceID, run.ConversationID, run.CompletedAt); err != nil {
		return err
	}
	return service.traceLocked(workspaceID, run.ID, "error_received", run.Error)
}
