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

// recoverBackgroundTerminals marks every persisted running or terminating
// background terminal as lost on backend startup. Codex command/exec sessions
// are connection-scoped, so a restart drops the provider process handle and the
// backend can no longer honestly claim the process is controllable. Exited and
// already-lost terminals are left untouched.
func (service *Service) recoverBackgroundTerminals() error {
	workspaceIDs, err := service.store.WorkspaceIDs()
	if err != nil {
		return err
	}
	now := timestamp(service.now())
	for _, workspaceID := range workspaceIDs {
		conversationIDs, err := service.store.conversationIDs(workspaceID)
		if err != nil {
			return err
		}
		for _, conversationID := range conversationIDs {
			if conversationID == UIShowcaseConversationID {
				continue
			}
			if err := service.recoverConversationBackgroundTerminals(workspaceID, conversationID, now); err != nil {
				if IsCorruptStateError(err) {
					service.recordCorruptStateDiagnostic(err, workspaceID, conversationID, "")
					continue
				}
				return err
			}
		}
	}
	return nil
}

func (service *Service) recoverConversationBackgroundTerminals(workspaceID string, conversationID string, now string) error {
	processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
	if err != nil {
		return err
	}
	changed := false
	for index, process := range processes {
		if !backgroundTerminalStatusIsActive(process.Status) {
			continue
		}
		process.Status = BackgroundTerminalLost
		process.Error = backgroundTerminalLostOnRestartReason
		process.UpdatedAt = now
		process.CompletedAt = now
		if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
			return err
		}
		processes[index] = process
		changed = true
	}
	if changed {
		if _, err := service.events.Publish(NewBackgroundTerminalsReplacedEvent(workspaceID, conversationID, processes)); err != nil {
			return err
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
		return corruptStateErrorf(service.store.runPath(workspaceID, run.ID), "run %s assistant message %s was not found", run.ID, run.AssistantMessageID)
	}
	if err := validateRunAssistantMessageRecord(run, message); err != nil {
		return corruptStateError(service.store.runPath(workspaceID, run.ID), err)
	}
	message.Status = MessageStatusError
	message.UpdatedAt = now
	run.Status = RunStatusFailed
	run.CompletedAt = now
	run.Error = "run interrupted by backend restart"
	run.PendingApproval = nil
	if err := service.promoteInterruptedBackgroundTerminalStartups(workspaceID, run, now); err != nil {
		return err
	}
	if _, err := service.store.FailTurn(TerminalTurnRecords{AssistantMessage: message, Run: run}); err != nil {
		return err
	}
	pendingSteering, err := service.markPendingSteeringMessagesLocked(workspaceID, run.ConversationID, run.ID, MessageStatusError)
	if err != nil {
		return err
	}
	if err := service.syncPersistedUserMessageBlocksLocked(workspaceID, run.ID, pendingSteering); err != nil {
		return err
	}
	if err := service.finalizeInterruptedTranscriptBlocks(workspaceID, run, now); err != nil {
		return err
	}
	if err := service.advanceReadRelevantMarkerLocked(workspaceID, run.ConversationID, run.CompletedAt); err != nil {
		return err
	}
	return service.traceLocked(workspaceID, run.ID, "error_received", run.Error)
}
