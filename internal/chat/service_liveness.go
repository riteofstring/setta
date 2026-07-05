package chat

import (
	"context"
	"time"

	"setta/internal/workspace"
)

const (
	runStatusHeadlineWorking            = "Working"
	runStatusHeadlineWaitingForProvider = "Waiting for Codex"
	runStatusHeadlineCheckingProvider   = "Checking Codex"
	runStatusHeadlineReconnecting       = "Reconnecting"
	runStatusHeadlineStalled            = "Waiting for Codex activity"
	runStatusHeadlineConnectionLost     = "Connection lost"
	runStatusHeadlineFinished           = "Finished"
	runStatusHeadlineAwaitingApproval   = "Awaiting approval"
)

func (service *Service) activateTurnLocked(workspaceID string, conversationID string, active activeTurn, run Run) {
	key := activeKey(workspaceID, conversationID)
	active.runID = run.ID
	active.workspaceID = workspaceID
	service.active[key] = active
	service.stopRunLivenessTimerLocked(key)
	service.liveness[key] = service.projectRunLivenessLocked(workspaceID, conversationID, run, active, RunLiveness{
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		RunID:          run.ID,
		Harness:        run.Harness,
		Status:         RunLivenessReconciling,
		Reason:         RunLivenessReasonProviderRefPending,
		Cancellable:    true,
	})
}

func (service *Service) deleteActiveTurnLocked(key string) {
	service.stopRunLivenessTimerLocked(key)
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

func (service *Service) markRunLivenessAttachedLocked(workspaceID string, conversationID string, runID string, threadID string, turnID string, observedAt string) (RunLiveness, bool, error) {
	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.runID != runID {
		return RunLiveness{}, false, nil
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return RunLiveness{}, false, err
	}
	if run.Status != RunStatusRunning {
		return RunLiveness{}, false, nil
	}
	before := service.liveness[key]
	active.providerEventGeneration += 1
	active.lastProviderEventAt = service.now()
	active.lastVisibleActivityAt = active.lastProviderEventAt
	service.active[key] = active
	liveness, ok := service.liveness[key]
	if !ok || liveness.RunID != runID {
		liveness = RunLiveness{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			RunID:          runID,
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
	liveness.LastVisibleActivityAt = observedAt
	liveness.Error = ""
	liveness = service.projectRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
	service.liveness[key] = liveness
	service.resetRunLivenessTimerLocked(key, active, runID)
	return liveness, !runLivenessVisibleEqual(before, liveness), nil
}

func (service *Service) markActiveRunLivenessReconcilingLocked(workspaceID string, conversationID string, run Run, active activeTurn, reason RunLivenessReason, reconciledAt string) RunLiveness {
	liveness := service.activeRunLivenessValueLocked(workspaceID, conversationID, run, active)
	liveness.Status = RunLivenessReconciling
	liveness.Reason = reconcilingRunLivenessReason(liveness, reason)
	liveness.Retryable = true
	liveness.Cancellable = true
	liveness.LastReconciledAt = reconciledAt
	liveness.Error = ""
	liveness = service.projectRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
	service.liveness[activeKey(workspaceID, conversationID)] = liveness
	return liveness
}

func reconcilingRunLivenessReason(current RunLiveness, next RunLivenessReason) RunLivenessReason {
	if current.Status == RunLivenessReconciling && next == RunLivenessReasonSnapshotLoad {
		switch current.Reason {
		case RunLivenessReasonProviderRestarted, RunLivenessReasonStreamResync, RunLivenessReasonProviderInactive:
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
	liveness = service.projectRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
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
	if liveness.LastProviderEventAt == "" && !active.lastProviderEventAt.IsZero() {
		liveness.LastProviderEventAt = timestamp(active.lastProviderEventAt)
	}
	if liveness.LastVisibleActivityAt == "" && !active.lastVisibleActivityAt.IsZero() {
		liveness.LastVisibleActivityAt = timestamp(active.lastVisibleActivityAt)
	}
	return service.projectRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
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
	if run.Status != RunStatusRunning {
		return RunLiveness{}, false, nil
	}
	now := service.now()
	observedAt := timestamp(now)
	before := service.liveness[key]
	active.providerEventGeneration += 1
	active.lastProviderEventAt = now
	active.lastVisibleActivityAt = now
	service.active[key] = active
	liveness, ok := service.liveness[key]
	if !ok || liveness.RunID != runID {
		liveness = RunLiveness{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			RunID:          runID,
			Harness:        run.Harness,
		}
	}
	liveness.Status = RunLivenessAttached
	liveness.Reason = RunLivenessReasonProviderTurnLinked
	liveness.Retryable = false
	liveness.Cancellable = true
	liveness.ProviderThreadID = active.threadID
	liveness.ProviderTurnID = active.turnID
	liveness.LastProviderEventAt = observedAt
	liveness.LastVisibleActivityAt = observedAt
	liveness.Error = ""
	liveness = service.projectRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
	service.liveness[key] = liveness
	service.resetRunLivenessTimerLocked(key, active, runID)
	return liveness, !runLivenessVisibleEqual(before, liveness), nil
}

func (service *Service) publishFreshProviderEventLivenessLocked(workspaceID string, conversationID string, runID string) error {
	liveness, updated, err := service.markFreshProviderEventLocked(workspaceID, conversationID, runID)
	if err != nil || !updated {
		return err
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
	return service.projectRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
}

func (service *Service) activeRunLivenessLocked(workspaceID string, conversationID string, run Run) *RunLiveness {
	key := activeKey(workspaceID, conversationID)
	liveness, ok := service.liveness[key]
	if ok && liveness.RunID == run.ID {
		active := service.active[key]
		liveness.Cancellable = service.activeRunCancellableLocked(key, run.ID)
		projected := service.projectRunLivenessLocked(workspaceID, conversationID, run, active, liveness)
		return &projected
	}
	liveness = service.projectRunLivenessLocked(workspaceID, conversationID, run, activeTurn{}, RunLiveness{
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		RunID:          run.ID,
		Harness:        run.Harness,
		Status:         RunLivenessLost,
		Reason:         RunLivenessReasonAttachmentMissing,
		Retryable:      false,
		Cancellable:    false,
	})
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

func (service *Service) updateActiveReasoningHeadlineLocked(item RunItem) {
	if item.Type != RunItemTypeReasoning {
		return
	}
	headline := activePublicReasoningHeadline(item)
	if headline == "" {
		return
	}
	key := activeKey(item.WorkspaceID, item.ConversationID)
	active, ok := service.active[key]
	if !ok || active.runID != item.RunID || active.publicReasoningHeadline == headline {
		return
	}
	active.publicReasoningHeadline = headline
	service.active[key] = active
}

func (service *Service) projectRunLivenessLocked(workspaceID string, conversationID string, run Run, active activeTurn, liveness RunLiveness) RunLiveness {
	liveness.WorkspaceID = workspaceID
	liveness.ConversationID = conversationID
	liveness.RunID = run.ID
	liveness.Harness = run.Harness
	if liveness.ProviderThreadID == "" {
		liveness.ProviderThreadID = active.threadID
	}
	if liveness.ProviderTurnID == "" {
		liveness.ProviderTurnID = active.turnID
	}
	liveness.Steerable = false
	liveness.SteeringDisabled = ""
	switch {
	case run.Status != RunStatusRunning || liveness.Status == RunLivenessTerminal:
		liveness.Phase = RunLivenessPhaseTerminal
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusFinished, Headline: runStatusHeadlineFinished, HeadlineSource: RunActiveHeadlineTerminal, Detail: run.Error}
		liveness.SteeringDisabled = "The run has finished."
		liveness.Retryable = false
		liveness.Cancellable = false
	case liveness.Status == RunLivenessAttached:
		liveness = service.projectAttachedRunLivenessLocked(run, active, liveness)
	case liveness.Status == RunLivenessReconciling:
		liveness = projectReconcilingRunLiveness(liveness)
	case liveness.Status == RunLivenessLost:
		liveness.Phase = RunLivenessPhaseLost
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusConnectionLost, Headline: runStatusHeadlineConnectionLost, HeadlineSource: RunActiveHeadlineLiveness, Detail: liveness.Error}
		liveness.SteeringDisabled = "The provider turn is unavailable."
	case liveness.Status == RunLivenessTerminal:
		liveness.Phase = RunLivenessPhaseTerminal
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusFinished, Headline: runStatusHeadlineFinished, HeadlineSource: RunActiveHeadlineTerminal, Detail: liveness.Error}
		liveness.SteeringDisabled = "The run has finished."
	default:
		liveness.Phase = RunLivenessPhaseLost
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusConnectionLost, Headline: runStatusHeadlineConnectionLost, HeadlineSource: RunActiveHeadlineLiveness, Detail: liveness.Error}
		liveness.SteeringDisabled = "The provider turn is unavailable."
	}
	return liveness
}

func (service *Service) projectAttachedRunLivenessLocked(run Run, active activeTurn, liveness RunLiveness) RunLiveness {
	if run.PendingApproval != nil {
		headline := runStatusHeadlineAwaitingApproval
		if run.PendingApproval.Title != "" {
			headline = run.PendingApproval.Title
		}
		liveness.Phase = RunLivenessPhaseBlocked
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusBlocked, Headline: headline, HeadlineSource: RunActiveHeadlineApproval, Detail: run.PendingApproval.Body}
		liveness.SteeringDisabled = "The run is waiting for approval."
		return liveness
	}
	liveness.Phase = RunLivenessPhaseAttached
	liveness.Steerable = active.threadID != "" && active.turnID != ""
	if liveness.Steerable {
		liveness.SteeringDisabled = ""
	} else {
		liveness.SteeringDisabled = "Codex has not linked a provider turn yet."
	}
	if active.publicReasoningHeadline != "" {
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusThinking, Headline: active.publicReasoningHeadline, HeadlineSource: RunActiveHeadlinePublicReasoning}
		return liveness
	}
	liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusWorking, Headline: runStatusHeadlineWorking, HeadlineSource: RunActiveHeadlineFallback}
	return liveness
}

func projectReconcilingRunLiveness(liveness RunLiveness) RunLiveness {
	liveness.Steerable = false
	switch liveness.Reason {
	case RunLivenessReasonProviderRefPending:
		liveness.Phase = RunLivenessPhaseWaitingForProvider
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusWaitingForProvider, Headline: runStatusHeadlineWaitingForProvider, HeadlineSource: RunActiveHeadlineLiveness}
		liveness.SteeringDisabled = "Codex has not linked a provider turn yet."
		liveness.Retryable = false
	case RunLivenessReasonProviderInactive:
		liveness.Phase = RunLivenessPhaseStalled
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusStalled, Headline: runStatusHeadlineStalled, HeadlineSource: RunActiveHeadlineLiveness}
		liveness.SteeringDisabled = "Codex has not emitted activity recently."
		liveness.Retryable = true
	case RunLivenessReasonProviderTurnLinked:
		liveness.Phase = RunLivenessPhaseAttached
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusWorking, Headline: runStatusHeadlineWorking, HeadlineSource: RunActiveHeadlineFallback}
		liveness.SteeringDisabled = "Codex is checking the active provider turn."
	case RunLivenessReasonSnapshotLoad, RunLivenessReasonWakeRecheck:
		liveness.Phase = RunLivenessPhaseReconnecting
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusReconnecting, Headline: runStatusHeadlineCheckingProvider, HeadlineSource: RunActiveHeadlineLiveness}
		liveness.SteeringDisabled = "Setta is checking the provider turn."
	case RunLivenessReasonStreamResync, RunLivenessReasonProviderRestarted, RunLivenessReasonUserRetry:
		liveness.Phase = RunLivenessPhaseReconnecting
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusReconnecting, Headline: runStatusHeadlineReconnecting, HeadlineSource: RunActiveHeadlineLiveness, Detail: liveness.Error}
		liveness.SteeringDisabled = "Setta is reconnecting to Codex."
	case RunLivenessReasonRunTerminal:
		liveness.Phase = RunLivenessPhaseTerminal
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusFinished, Headline: runStatusHeadlineFinished, HeadlineSource: RunActiveHeadlineTerminal, Detail: liveness.Error}
		liveness.SteeringDisabled = "The run has finished."
	case RunLivenessReasonAttachmentMissing, RunLivenessReasonProviderUnavailable, RunLivenessReasonTurnNotFound:
		liveness.Phase = RunLivenessPhaseLost
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusConnectionLost, Headline: runStatusHeadlineConnectionLost, HeadlineSource: RunActiveHeadlineLiveness, Detail: liveness.Error}
		liveness.SteeringDisabled = "The provider turn is unavailable."
	default:
		liveness.Phase = RunLivenessPhaseReconnecting
		liveness.ActiveStatus = RunActiveStatus{Kind: RunActiveStatusReconnecting, Headline: runStatusHeadlineCheckingProvider, HeadlineSource: RunActiveHeadlineLiveness, Detail: liveness.Error}
		liveness.SteeringDisabled = "Setta is checking the provider turn."
	}
	return liveness
}

func runLivenessVisibleEqual(left RunLiveness, right RunLiveness) bool {
	left.LastProviderEventAt = ""
	left.LastVisibleActivityAt = ""
	left.LastReconciledAt = ""
	right.LastProviderEventAt = ""
	right.LastVisibleActivityAt = ""
	right.LastReconciledAt = ""
	return left == right
}

func (service *Service) resetRunLivenessTimerLocked(key string, active activeTurn, runID string) {
	service.stopRunLivenessTimerLocked(key)
	if service.freshnessBudget <= 0 || active.threadID == "" || active.turnID == "" || active.lastProviderEventAt.IsZero() {
		return
	}
	timer := time.AfterFunc(service.freshnessBudget, func() {
		service.handleRunLivenessFreshnessTimeout(key, runID)
	})
	service.livenessTimers[key] = timer
}

func (service *Service) stopRunLivenessTimerLocked(key string) {
	timer, ok := service.livenessTimers[key]
	if !ok {
		return
	}
	timer.Stop()
	delete(service.livenessTimers, key)
}

func (service *Service) handleRunLivenessFreshnessTimeout(key string, runID string) {
	target, ok, err := service.staleRunLivenessTarget(key, runID)
	if err != nil {
		service.recordBackgroundFailure(TurnRequest{Run: Run{ID: runID}}, "run_liveness_stale_check_failed", err)
		return
	}
	if !ok {
		return
	}
	reconciler, ok := service.harness.(HarnessRunLivenessReconciler)
	if !ok {
		return
	}
	if _, err := service.reconcileActiveRunTarget(context.Background(), reconciler, target); err != nil {
		service.recordBackgroundFailure(staleRunDiagnosticRequest(target), "run_liveness_stale_reconcile_failed", err)
	}
}

func staleRunDiagnosticRequest(target activeRunReconciliationTarget) TurnRequest {
	return TurnRequest{
		Workspace:    workspace.WorkspaceSummary{ID: target.workspace},
		Conversation: Conversation{ID: target.conversation},
		Run:          target.run,
	}
}

func (service *Service) staleRunLivenessTarget(key string, runID string) (activeRunReconciliationTarget, bool, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	active, ok := service.active[key]
	if !ok || !activeTurnHasProviderActivity(active, runID) {
		return activeRunReconciliationTarget{}, false, nil
	}
	if !service.activeTurnLivenessExpired(active) {
		service.resetRunLivenessTimerLocked(key, active, runID)
		return activeRunReconciliationTarget{}, false, nil
	}
	workspaceID, conversationID, ok := splitActiveKey(key)
	if !ok {
		return activeRunReconciliationTarget{}, false, nil
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return activeRunReconciliationTarget{}, false, err
	}
	if run.Status != RunStatusRunning {
		return activeRunReconciliationTarget{}, false, nil
	}
	active = service.beginActiveRunLivenessCheckLocked(key, active)
	reconciledAt := timestamp(service.now())
	liveness := service.markActiveRunLivenessReconcilingLocked(workspaceID, conversationID, run, active, RunLivenessReasonProviderInactive, reconciledAt)
	if _, err := service.events.Publish(NewRunLivenessUpdatedEvent(liveness)); err != nil {
		return activeRunReconciliationTarget{}, false, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return activeRunReconciliationTarget{}, false, err
	}
	return activeRunReconciliationTarget{
		active:                  active,
		conversation:            conversationID,
		livenessCheckGeneration: active.livenessCheckGeneration,
		providerEventGeneration: active.providerEventGeneration,
		reconciledAt:            reconciledAt,
		reason:                  RunLivenessReasonProviderInactive,
		run:                     run,
		workspace:               workspaceID,
	}, true, nil
}

func activeTurnHasProviderActivity(active activeTurn, runID string) bool {
	if active.runID != runID {
		return false
	}
	if active.threadID == "" || active.turnID == "" {
		return false
	}
	return !active.lastProviderEventAt.IsZero()
}

func (service *Service) activeTurnLivenessExpired(active activeTurn) bool {
	if service.freshnessBudget <= 0 {
		return false
	}
	return service.now().Sub(active.lastProviderEventAt) >= service.freshnessBudget
}
