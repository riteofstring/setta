package chat

import "time"

func (service *Service) activateTurnLocked(workspaceID string, conversationID string, active activeTurn, run Run) {
	key := activeKey(workspaceID, conversationID)
	active.runID = run.ID
	active.workspaceID = workspaceID
	service.active[key] = active
	liveness := RunLiveness{
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		RunID:          run.ID,
		Harness:        run.Harness,
		Status:         RunLivenessReconciling,
		Reason:         RunLivenessReasonProviderRefPending,
		Cancellable:    true,
	}
	service.liveness[key] = service.completeRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
	service.scheduleRunLivenessProviderInactiveTimerLocked(key, active)
}

func (service *Service) deleteActiveTurnLocked(key string) {
	service.stopRunLivenessProviderInactiveTimerLocked(key)
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

func (service *Service) markRunLivenessAttachedLocked(workspaceID string, conversationID string, run Run, active activeTurn, threadID string, turnID string, observedAt string) (RunLiveness, bool) {
	key := activeKey(workspaceID, conversationID)
	if active.runID != run.ID {
		return RunLiveness{}, false
	}
	active.providerEventGeneration += 1
	service.active[key] = active
	service.scheduleRunLivenessProviderInactiveTimerLocked(key, active)
	previous, ok := service.liveness[key]
	liveness := previous
	if !ok || liveness.RunID != run.ID {
		ok = false
		liveness = RunLiveness{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			RunID:          run.ID,
			Harness:        run.Harness,
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
	liveness = service.completeRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
	service.liveness[key] = liveness
	return liveness, !ok || runLivenessVisibleFieldsChanged(previous, liveness)
}

func (service *Service) markActiveRunLivenessReconcilingLocked(workspaceID string, conversationID string, run Run, active activeTurn, reason RunLivenessReason, reconciledAt string) RunLiveness {
	liveness := service.activeRunLivenessValueLocked(workspaceID, conversationID, run, active)
	liveness.Status = RunLivenessReconciling
	liveness.Reason = reconcilingRunLivenessReason(liveness, reason)
	liveness.Retryable = true
	liveness.Cancellable = true
	liveness.LastReconciledAt = reconciledAt
	liveness.Error = ""
	liveness = service.completeRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
	service.liveness[activeKey(workspaceID, conversationID)] = liveness
	return liveness
}

func reconcilingRunLivenessReason(current RunLiveness, next RunLivenessReason) RunLivenessReason {
	if current.Status == RunLivenessReconciling && next == RunLivenessReasonSnapshotLoad {
		switch current.Reason {
		case RunLivenessReasonProviderInactive, RunLivenessReasonProviderRestarted, RunLivenessReasonStreamResync:
			return current.Reason
		}
	}
	return next
}

func (service *Service) markActiveRunLivenessLostLocked(workspaceID string, conversationID string, run Run, active activeTurn, reason RunLivenessReason, reconciledAt string, message string) RunLiveness {
	key := activeKey(workspaceID, conversationID)
	service.stopRunLivenessProviderInactiveTimerLocked(key)
	liveness := service.activeRunLivenessValueLocked(workspaceID, conversationID, run, active)
	liveness.Status = RunLivenessLost
	liveness.Reason = reason
	liveness.Retryable = true
	liveness.Cancellable = service.activeRunCancellableLocked(activeKey(workspaceID, conversationID), run.ID)
	liveness.LastReconciledAt = reconciledAt
	liveness.Error = message
	liveness = service.completeRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
	service.liveness[key] = liveness
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

func (service *Service) markFreshProviderEventLocked(workspaceID string, conversationID string, runID string) (RunLiveness, bool, error) {
	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.runID != runID || active.threadID == "" || active.turnID == "" {
		return RunLiveness{}, false, nil
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return RunLiveness{}, false, err
	}
	liveness, updated := service.markRunLivenessAttachedLocked(workspaceID, conversationID, run, active, active.threadID, active.turnID, timestamp(service.now()))
	return liveness, updated, nil
}

func (service *Service) publishFreshProviderEventLivenessLocked(workspaceID string, conversationID string, runID string) error {
	liveness, updated, err := service.markFreshProviderEventLocked(workspaceID, conversationID, runID)
	if err != nil {
		return err
	}
	if !updated {
		return nil
	}
	if _, err := service.events.Publish(NewRunLivenessUpdatedEvent(liveness)); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
}

func (service *Service) terminalRunLivenessLocked(workspaceID string, conversationID string, run Run, active activeTurn) RunLiveness {
	service.stopRunLivenessProviderInactiveTimerLocked(activeKey(workspaceID, conversationID))
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
	return service.completeRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
}

func (service *Service) scheduleRunLivenessProviderInactiveTimerLocked(key string, active activeTurn) {
	if service.runLivenessProviderInactiveAfter <= 0 {
		return
	}
	service.stopRunLivenessProviderInactiveTimerLocked(key)
	runID := active.runID
	generation := active.providerEventGeneration
	service.runLivenessProviderInactiveTimers[key] = time.AfterFunc(service.runLivenessProviderInactiveAfter, func() {
		service.markRunLivenessProviderInactiveFromTimer(key, runID, generation)
	})
}

func (service *Service) stopRunLivenessProviderInactiveTimerLocked(key string) {
	timer, ok := service.runLivenessProviderInactiveTimers[key]
	if !ok {
		return
	}
	timer.Stop()
	delete(service.runLivenessProviderInactiveTimers, key)
}

func (service *Service) markRunLivenessProviderInactiveFromTimer(key string, runID string, generation uint64) {
	service.mu.Lock()
	defer service.mu.Unlock()

	liveness, updated, err := service.markRunLivenessProviderInactiveLocked(key, runID, generation)
	if err != nil || !updated {
		return
	}
	if _, err := service.events.Publish(NewRunLivenessUpdatedEvent(liveness)); err != nil {
		return
	}
	_ = service.publishConversationUpdatedLocked(liveness.WorkspaceID, liveness.ConversationID, liveness.RunID)
}

func (service *Service) markRunLivenessProviderInactiveLocked(key string, runID string, generation uint64) (RunLiveness, bool, error) {
	active, ok := service.active[key]
	if !ok || active.runID != runID || active.providerEventGeneration != generation {
		return RunLiveness{}, false, nil
	}
	workspaceID, conversationID, ok := splitActiveKey(key)
	if !ok {
		return RunLiveness{}, false, nil
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil || run.Status != RunStatusRunning {
		return RunLiveness{}, false, err
	}
	previous := service.activeRunLivenessValueLocked(workspaceID, conversationID, run, active)
	if !runLivenessAllowsProviderInactiveTransition(previous) {
		return RunLiveness{}, false, nil
	}
	liveness := previous
	if active.threadID != "" && active.turnID != "" {
		liveness.Status = RunLivenessAttached
	} else {
		liveness.Status = RunLivenessReconciling
	}
	liveness.Reason = RunLivenessReasonProviderInactive
	liveness.Retryable = true
	liveness.Cancellable = service.activeRunCancellableLocked(key, run.ID)
	liveness.LastReconciledAt = timestamp(service.now())
	liveness.Error = "provider produced no events before inactivity timeout"
	liveness = service.completeRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
	service.liveness[key] = liveness
	return liveness, runLivenessVisibleFieldsChanged(previous, liveness), nil
}

func runLivenessAllowsProviderInactiveTransition(liveness RunLiveness) bool {
	switch liveness.Status {
	case RunLivenessAttached:
		return true
	case RunLivenessReconciling:
		return liveness.Reason == RunLivenessReasonProviderRefPending || liveness.Reason == RunLivenessReasonProviderInactive
	default:
		return false
	}
}

func (service *Service) activeRunLivenessLocked(workspaceID string, conversationID string, run Run) *RunLiveness {
	key := activeKey(workspaceID, conversationID)
	liveness, ok := service.liveness[key]
	if ok && liveness.RunID == run.ID {
		active := service.active[key]
		liveness.Cancellable = service.activeRunCancellableLocked(key, run.ID)
		liveness = service.completeRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
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
	liveness = service.completeRunLivenessLocked(workspaceID, conversationID, run, activeTurn{}, liveness)
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

func runLivenessVisibleFieldsChanged(previous RunLiveness, next RunLiveness) bool {
	previous.LastProviderEventAt = next.LastProviderEventAt
	previous.LastVisibleActivityAt = next.LastVisibleActivityAt
	return previous != next
}

func (service *Service) completeRunLivenessLocked(workspaceID string, conversationID string, run Run, active activeTurn, liveness RunLiveness) RunLiveness {
	if liveness.WorkspaceID == "" {
		liveness.WorkspaceID = workspaceID
	}
	if liveness.ConversationID == "" {
		liveness.ConversationID = conversationID
	}
	if liveness.RunID == "" {
		liveness.RunID = run.ID
	}
	if liveness.Harness == "" {
		liveness.Harness = run.Harness
	}
	if liveness.ProviderThreadID == "" {
		liveness.ProviderThreadID = active.threadID
	}
	if liveness.ProviderTurnID == "" {
		liveness.ProviderTurnID = active.turnID
	}
	if visibleActivityAt := activeTurnLastVisibleActivityAt(active); visibleActivityAt != "" {
		liveness.LastVisibleActivityAt = visibleActivityAt
	}
	if liveness.LastVisibleActivityAt == "" {
		liveness.LastVisibleActivityAt = liveness.LastProviderEventAt
	}
	liveness.Phase = runLivenessPhase(run, liveness)
	liveness.ActiveStatus = activeRunStatus(active, run, liveness)
	liveness.Steerable, liveness.SteeringDisabledReason = activeRunSteerability(active, run, liveness)
	return liveness
}

func runLivenessPhase(run Run, liveness RunLiveness) RunLivenessPhase {
	switch liveness.Status {
	case RunLivenessAttached:
		if run.PendingApproval != nil {
			return RunLivenessPhaseBlocked
		}
		if liveness.Reason == RunLivenessReasonProviderInactive {
			return RunLivenessPhaseStalled
		}
		return RunLivenessPhaseAttached
	case RunLivenessReconciling:
		switch liveness.Reason {
		case RunLivenessReasonProviderRefPending:
			if liveness.ProviderThreadID == "" || liveness.ProviderTurnID == "" {
				return RunLivenessPhaseStarting
			}
			return RunLivenessPhaseWaitingForProvider
		case RunLivenessReasonProviderInactive:
			return RunLivenessPhaseStalled
		default:
			return RunLivenessPhaseReconnecting
		}
	case RunLivenessLost:
		return RunLivenessPhaseLost
	case RunLivenessTerminal:
		return RunLivenessPhaseTerminal
	default:
		return RunLivenessPhaseStarting
	}
}

func activeRunStatus(active activeTurn, run Run, liveness RunLiveness) RunActiveStatus {
	switch liveness.Phase {
	case RunLivenessPhaseStarting:
		return RunActiveStatus{Kind: RunActiveStatusStarting, Headline: "Starting", HeadlineSource: RunActiveHeadlineLiveness}
	case RunLivenessPhaseWaitingForProvider:
		return RunActiveStatus{Kind: RunActiveStatusWaitingForProvider, Headline: "Waiting for provider", HeadlineSource: RunActiveHeadlineLiveness}
	case RunLivenessPhaseReconnecting:
		return RunActiveStatus{Kind: RunActiveStatusReconnecting, Headline: "Reconnecting", HeadlineSource: RunActiveHeadlineLiveness, Detail: liveness.Error}
	case RunLivenessPhaseLost:
		return RunActiveStatus{Kind: RunActiveStatusConnectionLost, Headline: "Connection lost", HeadlineSource: RunActiveHeadlineLiveness, Detail: liveness.Error}
	case RunLivenessPhaseStalled:
		return RunActiveStatus{Kind: RunActiveStatusStalled, Headline: "Provider stalled", HeadlineSource: RunActiveHeadlineLiveness, Detail: liveness.Error}
	case RunLivenessPhaseBlocked:
		return blockedRunActiveStatus(run)
	case RunLivenessPhaseTerminal:
		return RunActiveStatus{Kind: RunActiveStatusFinished, Headline: "Finished", HeadlineSource: RunActiveHeadlineTerminal, Detail: liveness.Error}
	case RunLivenessPhaseAttached:
		if headline := activeTurnPublicReasoningHeadline(active); headline != "" {
			return RunActiveStatus{Kind: RunActiveStatusThinking, Headline: headline, HeadlineSource: RunActiveHeadlinePublicReasoning}
		}
		if headline := activeTurnCommandHeadline(active); headline != "" {
			return RunActiveStatus{Kind: RunActiveStatusWorking, Headline: headline, HeadlineSource: RunActiveHeadlineCommand}
		}
		return RunActiveStatus{Kind: RunActiveStatusWorking, Headline: "Working", HeadlineSource: RunActiveHeadlineFallback}
	default:
		return RunActiveStatus{Kind: RunActiveStatusWorking, Headline: "Working", HeadlineSource: RunActiveHeadlineFallback}
	}
}

func blockedRunActiveStatus(run Run) RunActiveStatus {
	if run.PendingApproval == nil {
		return RunActiveStatus{Kind: RunActiveStatusBlocked, Headline: "Waiting", HeadlineSource: RunActiveHeadlineLiveness}
	}
	headline := run.PendingApproval.Title
	if headline == "" {
		headline = "Approval required"
	}
	return RunActiveStatus{
		Kind:           RunActiveStatusBlocked,
		Headline:       headline,
		HeadlineSource: RunActiveHeadlineApproval,
		Detail:         run.PendingApproval.Body,
	}
}

func activeRunSteerability(active activeTurn, run Run, liveness RunLiveness) (bool, string) {
	if run.Status != RunStatusRunning {
		return false, string(RunLivenessReasonRunTerminal)
	}
	if active.cancelDrain {
		return false, "cancellation_in_progress"
	}
	if liveness.Status != RunLivenessAttached {
		return false, string(liveness.Reason)
	}
	if run.PendingApproval != nil {
		return false, "waiting_for_approval"
	}
	if active.threadID == "" || active.turnID == "" {
		return false, "provider_turn_unlinked"
	}
	if !runLivenessAllowsSteering(liveness) {
		return false, string(liveness.Reason)
	}
	return true, ""
}

func runLivenessAllowsSteering(liveness RunLiveness) bool {
	return liveness.Phase == RunLivenessPhaseAttached || liveness.Reason == RunLivenessReasonProviderTurnLinked
}

func activeTurnLastVisibleActivityAt(active activeTurn) string {
	if active.transcript == nil {
		return ""
	}
	for index := len(active.transcript.order) - 1; index >= 0; index-- {
		block := active.transcript.blocks[active.transcript.order[index]]
		if block != nil && block.UpdatedAt != "" {
			return block.UpdatedAt
		}
	}
	return ""
}

func activeTurnPublicReasoningHeadline(active activeTurn) string {
	if active.transcript == nil {
		return ""
	}
	for index := len(active.transcript.order) - 1; index >= 0; index-- {
		block := active.transcript.blocks[active.transcript.order[index]]
		if block != nil && block.Kind == TranscriptBlockKindReasoning && block.Reasoning != nil && block.Reasoning.Headline != "" {
			return block.Reasoning.Headline
		}
	}
	return ""
}

func activeTurnCommandHeadline(active activeTurn) string {
	if active.transcript == nil {
		return ""
	}
	for index := len(active.transcript.order) - 1; index >= 0; index-- {
		block := active.transcript.blocks[active.transcript.order[index]]
		if block == nil || block.Kind != TranscriptBlockKindActivityItem || block.Activity == nil {
			continue
		}
		if block.Activity.Status != RunItemStatusPending && block.Activity.Status != RunItemStatusRunning {
			continue
		}
		if block.Activity.Title != "" {
			return block.Activity.Title
		}
	}
	return ""
}
