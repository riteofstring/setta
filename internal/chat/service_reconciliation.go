package chat

import (
	"context"
	"fmt"
)

const providerTurnInactiveRunError = "run interrupted because provider turn is no longer active"

type activeRunReconciliationTarget struct {
	active                        activeTurn
	conversation                  string
	livenessCheckGeneration       uint64
	preservedVisibleRunLiveness   bool
	providerEventGeneration       uint64
	reconciledAt                  string
	reason                        RunLivenessReason
	run                           Run
	visibleRunLivenessAtReconcile RunLiveness
	workspace                     string
}

func (service *Service) ReconcileActiveRuns(ctx context.Context, workspaceID string, conversationID string, reason RunLivenessReason) (RunLivenessReconciliationResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := service.validateRunLivenessReconcileRequest(workspaceID, conversationID, reason); err != nil {
		return RunLivenessReconciliationResult{}, err
	}
	reconciler, ok := service.harness.(HarnessRunLivenessReconciler)
	if !ok {
		return RunLivenessReconciliationResult{}, nil
	}
	targets, snapshots, err := service.activeRunReconciliationTargets(workspaceID, conversationID, reason)
	if err != nil {
		return RunLivenessReconciliationResult{}, err
	}
	result := RunLivenessReconciliationResult{Runs: snapshots}
	for _, target := range targets {
		liveness, err := service.reconcileActiveRunTarget(ctx, reconciler, target)
		if liveness.RunID != "" {
			result.Runs = upsertRunLivenessResult(result.Runs, liveness)
		}
		if err != nil {
			return result, err
		}
	}
	return result, nil
}

func (service *Service) reconcileActiveRunTarget(ctx context.Context, reconciler HarnessRunLivenessReconciler, target activeRunReconciliationTarget) (RunLiveness, error) {
	if target.active.threadID == "" || target.active.turnID == "" {
		return RunLiveness{}, nil
	}
	provider, err := reconciler.ReconcileRunLiveness(ctx, HarnessRunLivenessRequest{
		ConversationID: target.conversation,
		RunID:          target.run.ID,
		ThreadID:       target.active.threadID,
		TurnID:         target.active.turnID,
		WorkspaceID:    target.workspace,
	})
	if err != nil {
		return service.applyRunLivenessReconciliationError(target, err)
	}
	return service.applyRunLivenessReconciliationResult(target, provider)
}

func upsertRunLivenessResult(values []RunLiveness, next RunLiveness) []RunLiveness {
	for index := range values {
		if values[index].WorkspaceID == next.WorkspaceID &&
			values[index].ConversationID == next.ConversationID &&
			values[index].RunID == next.RunID {
			values[index] = next
			return values
		}
	}
	return append(values, next)
}

func (service *Service) validateRunLivenessReconcileRequest(workspaceID string, conversationID string, reason RunLivenessReason) error {
	if !validRunLivenessReconcileReason(reason) {
		return fmt.Errorf("unsupported run liveness reconcile reason: %s", reason)
	}
	if conversationID != "" && workspaceID == "" {
		return fmt.Errorf("workspace id is required when conversation id is provided")
	}
	if conversationID != "" {
		_, err := service.validateConversationRequest(workspaceID, conversationID)
		return err
	}
	if workspaceID != "" {
		_, err := service.resolveWorkspaceForRequest(workspaceID)
		return err
	}
	return nil
}

func validRunLivenessReconcileReason(reason RunLivenessReason) bool {
	switch reason {
	case RunLivenessReasonWakeRecheck,
		RunLivenessReasonSnapshotLoad,
		RunLivenessReasonStreamResync,
		RunLivenessReasonUserRetry,
		RunLivenessReasonProviderRestarted:
		return true
	default:
		return false
	}
}

func (service *Service) activeRunReconciliationTargets(workspaceID string, conversationID string, reason RunLivenessReason) ([]activeRunReconciliationTarget, []RunLiveness, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	if conversationID != "" {
		target, liveness, ok, err := service.activeRunReconciliationTargetLocked(workspaceID, conversationID, reason)
		if err != nil || !ok {
			return nil, livenessSlice(liveness), err
		}
		return []activeRunReconciliationTarget{target}, livenessSlice(liveness), nil
	}
	targets := []activeRunReconciliationTarget{}
	liveness := []RunLiveness{}
	for key := range service.active {
		targetWorkspaceID, targetConversationID, ok := splitActiveKey(key)
		if !ok || (workspaceID != "" && targetWorkspaceID != workspaceID) {
			continue
		}
		target, projected, ok, err := service.activeRunReconciliationTargetLocked(targetWorkspaceID, targetConversationID, reason)
		if err != nil {
			return nil, nil, err
		}
		if !ok {
			if projected.RunID != "" {
				liveness = append(liveness, projected)
			}
			continue
		}
		targets = append(targets, target)
		liveness = append(liveness, projected)
	}
	return targets, liveness, nil
}

func livenessSlice(liveness RunLiveness) []RunLiveness {
	if liveness.RunID == "" {
		return []RunLiveness{}
	}
	return []RunLiveness{liveness}
}

func (service *Service) activeRunReconciliationTargetLocked(workspaceID string, conversationID string, reason RunLivenessReason) (activeRunReconciliationTarget, RunLiveness, bool, error) {
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return activeRunReconciliationTarget{}, RunLiveness{}, false, err
	}
	run, hasActiveRun, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil || !hasActiveRun {
		return activeRunReconciliationTarget{}, RunLiveness{}, false, err
	}
	key := activeKey(workspaceID, conversationID)
	active, attached := service.active[key]
	if !attached || active.runID != run.ID {
		return activeRunReconciliationTarget{}, *service.activeRunLivenessLocked(workspaceID, conversationID, run), false, nil
	}
	if liveness, reconcile, preserve := service.preservedSnapshotRunLivenessLocked(workspaceID, conversationID, run, active, reason); preserve {
		if !reconcile {
			return activeRunReconciliationTarget{}, liveness, false, nil
		}
		active = service.beginActiveRunLivenessCheckLocked(key, active)
		reconciledAt := timestamp(service.now())
		return activeRunReconciliationTarget{
			active:                        active,
			conversation:                  conversationID,
			livenessCheckGeneration:       active.livenessCheckGeneration,
			preservedVisibleRunLiveness:   true,
			providerEventGeneration:       active.providerEventGeneration,
			reconciledAt:                  reconciledAt,
			reason:                        reason,
			run:                           run,
			visibleRunLivenessAtReconcile: liveness,
			workspace:                     workspaceID,
		}, liveness, true, nil
	}
	active = service.beginActiveRunLivenessCheckLocked(key, active)
	reconciledAt := timestamp(service.now())
	liveness := service.markActiveRunLivenessReconcilingLocked(workspaceID, conversationID, run, active, reason, reconciledAt)
	if _, err := service.events.Publish(NewRunLivenessUpdatedEvent(liveness)); err != nil {
		return activeRunReconciliationTarget{}, RunLiveness{}, false, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return activeRunReconciliationTarget{}, RunLiveness{}, false, err
	}
	return activeRunReconciliationTarget{
		active:                  active,
		conversation:            conversationID,
		livenessCheckGeneration: active.livenessCheckGeneration,
		providerEventGeneration: active.providerEventGeneration,
		reconciledAt:            reconciledAt,
		reason:                  reason,
		run:                     run,
		workspace:               workspaceID,
	}, liveness, true, nil
}

func (service *Service) beginActiveRunLivenessCheckLocked(key string, active activeTurn) activeTurn {
	active.livenessCheckGeneration += 1
	service.active[key] = active
	return active
}

func (service *Service) preservedSnapshotRunLivenessLocked(workspaceID string, conversationID string, run Run, active activeTurn, reason RunLivenessReason) (RunLiveness, bool, bool) {
	if reason != RunLivenessReasonSnapshotLoad {
		return RunLiveness{}, false, false
	}
	key := activeKey(workspaceID, conversationID)
	liveness, ok := service.liveness[key]
	if !ok || liveness.RunID != run.ID {
		return RunLiveness{}, false, false
	}
	liveness.Cancellable = service.activeRunCancellableLocked(key, run.ID)
	switch liveness.Status {
	case RunLivenessAttached:
		if active.threadID == "" || active.turnID == "" {
			return RunLiveness{}, false, false
		}
		return liveness, true, true
	case RunLivenessReconciling:
		switch liveness.Reason {
		case RunLivenessReasonProviderRestarted, RunLivenessReasonStreamResync:
			return liveness, true, true
		default:
			return RunLiveness{}, false, false
		}
	case RunLivenessLost:
		return liveness, false, true
	case RunLivenessTerminal:
		return liveness, false, true
	default:
		return RunLiveness{}, false, false
	}
}

func (service *Service) applyRunLivenessReconciliationError(target activeRunReconciliationTarget, err error) (RunLiveness, error) {
	if commandErr, ok := IsChatCommandError(err); ok && commandErr.Code == ChatCommandErrorCodexProviderDrift {
		_ = service.recordProviderDiagnostic(target.workspace, target.conversation, target.run.ID, "codex_liveness_reconciliation_provider_drift", err.Error(), map[string]string{
			"threadId": target.active.threadID,
			"turnId":   target.active.turnID,
		}, true, DiagnosticSeverityCritical)
		return RunLiveness{}, err
	}
	return service.markRunLivenessLostAfterReconcile(target, RunLivenessReasonProviderUnavailable, err.Error())
}

func (service *Service) applyRunLivenessReconciliationResult(target activeRunReconciliationTarget, provider HarnessRunLivenessResult) (RunLiveness, error) {
	if provider.ThreadID != "" && provider.ThreadID != target.active.threadID {
		return RunLiveness{}, fmt.Errorf("provider liveness thread %s does not match active thread %s", provider.ThreadID, target.active.threadID)
	}
	if provider.TurnFound {
		return service.applyProviderTurnReconciliationResult(target, provider)
	}
	return service.applyMissingProviderTurnReconciliationResult(target, provider.ThreadStatus)
}

func (service *Service) applyProviderTurnReconciliationResult(target activeRunReconciliationTarget, provider HarnessRunLivenessResult) (RunLiveness, error) {
	switch provider.TurnStatus {
	case HarnessTurnRuntimeCompleted:
		return service.terminalizeProviderReconciledRun(target, TurnOutcomeCompleted, "")
	case HarnessTurnRuntimeFailed:
		message := provider.TurnError
		if message == "" {
			message = "provider turn failed"
		}
		return service.terminalizeProviderReconciledRun(target, TurnOutcomeFailed, message)
	case HarnessTurnRuntimeInterrupted:
		return service.terminalizeProviderReconciledRun(target, TurnOutcomeCancelled, "turn cancelled by provider")
	case HarnessTurnRuntimeInProgress:
		return service.applyInProgressProviderTurnReconciliationResult(target, provider.ThreadStatus)
	default:
		return RunLiveness{}, fmt.Errorf("unsupported provider liveness turn status: %s", provider.TurnStatus)
	}
}

func (service *Service) applyInProgressProviderTurnReconciliationResult(target activeRunReconciliationTarget, threadStatus HarnessThreadRuntimeStatus) (RunLiveness, error) {
	switch threadStatus {
	case HarnessThreadRuntimeActive:
		return service.keepRunLivenessReconcilingAfterProviderActive(target)
	case HarnessThreadRuntimeIdle, HarnessThreadRuntimeNotLoaded:
		return service.interruptRunAfterMissingProviderTurn(target)
	case HarnessThreadRuntimeSystemError:
		return service.markRunLivenessLostAfterReconcile(target, RunLivenessReasonProviderUnavailable, "provider thread is in systemError state")
	default:
		return RunLiveness{}, fmt.Errorf("unsupported provider liveness thread status: %s", threadStatus)
	}
}

func (service *Service) applyMissingProviderTurnReconciliationResult(target activeRunReconciliationTarget, threadStatus HarnessThreadRuntimeStatus) (RunLiveness, error) {
	switch threadStatus {
	case HarnessThreadRuntimeActive, HarnessThreadRuntimeIdle, HarnessThreadRuntimeNotLoaded:
		return service.interruptRunAfterMissingProviderTurn(target)
	case HarnessThreadRuntimeSystemError:
		return service.markRunLivenessLostAfterReconcile(target, RunLivenessReasonProviderUnavailable, "provider thread is in systemError state")
	default:
		return RunLiveness{}, fmt.Errorf("unsupported provider liveness thread status without target turn: %s", threadStatus)
	}
}

func (service *Service) keepRunLivenessReconcilingAfterProviderActive(target activeRunReconciliationTarget) (RunLiveness, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	key := activeKey(target.workspace, target.conversation)
	liveness, ok := service.liveness[key]
	if !ok || liveness.RunID != target.run.ID {
		return RunLiveness{}, nil
	}
	if !service.reconciliationTargetStillCurrentLocked(target, liveness) {
		return liveness, nil
	}
	if liveness.Status == RunLivenessAttached {
		return liveness, nil
	}
	return liveness, nil
}

func (service *Service) markRunLivenessLostAfterReconcile(target activeRunReconciliationTarget, reason RunLivenessReason, message string) (RunLiveness, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	key := activeKey(target.workspace, target.conversation)
	if current, ok := service.liveness[key]; ok && current.RunID == target.run.ID {
		if !service.reconciliationTargetStillCurrentLocked(target, current) {
			return current, nil
		}
	}
	run, active, ok, err := service.runningActiveTurnLocked(target.workspace, target.conversation, target.run.ID)
	if err != nil || !ok {
		return RunLiveness{}, err
	}
	liveness := service.markActiveRunLivenessLostLocked(target.workspace, target.conversation, run, active, reason, target.reconciledAt, message)
	if _, err := service.events.Publish(NewRunLivenessUpdatedEvent(liveness)); err != nil {
		return RunLiveness{}, err
	}
	if err := service.publishConversationUpdatedLocked(target.workspace, target.conversation, run.ID); err != nil {
		return RunLiveness{}, err
	}
	return liveness, nil
}

func (service *Service) reconciliationTargetStillCurrentLocked(target activeRunReconciliationTarget, current RunLiveness) bool {
	key := activeKey(target.workspace, target.conversation)
	active, ok := service.active[key]
	if !ok || active.runID != target.run.ID {
		return false
	}
	if active.livenessCheckGeneration != target.livenessCheckGeneration ||
		active.providerEventGeneration != target.providerEventGeneration {
		return false
	}
	if target.preservedVisibleRunLiveness {
		return current == target.visibleRunLivenessAtReconcile
	}
	return current.LastReconciledAt == target.reconciledAt && current.Status != RunLivenessAttached
}

func (service *Service) interruptRunAfterMissingProviderTurn(target activeRunReconciliationTarget) (RunLiveness, error) {
	return service.terminalizeProviderReconciledRun(target, TurnOutcomeFailed, providerTurnInactiveRunError)
}

func (service *Service) terminalizeProviderReconciledRun(target activeRunReconciliationTarget, outcome TurnOutcome, message string) (RunLiveness, error) {
	if liveness, stale := service.staleRunLivenessForReconciliationTarget(target); stale {
		return liveness, nil
	}
	var err error
	switch outcome {
	case TurnOutcomeCompleted:
		err = service.completeTurn(target.workspace, target.conversation, target.run.ID)
	case TurnOutcomeCancelled:
		_, err = service.markTurnCancelledWithReason(target.workspace, target.conversation, target.run.ID, message, "provider_cancelled", "Turn cancelled by provider")
	case TurnOutcomeFailed:
		err = service.failTurn(target.workspace, target.conversation, target.run.ID, message)
	default:
		err = fmt.Errorf("unsupported provider terminal outcome: %s", outcome)
	}
	if err != nil {
		return RunLiveness{}, err
	}
	if target.active.cancel != nil {
		target.active.cancel()
	}
	return RunLiveness{
		WorkspaceID:      target.workspace,
		ConversationID:   target.conversation,
		RunID:            target.run.ID,
		Harness:          target.run.Harness,
		Status:           RunLivenessTerminal,
		Reason:           RunLivenessReasonRunTerminal,
		ProviderThreadID: target.active.threadID,
		ProviderTurnID:   target.active.turnID,
		LastReconciledAt: target.reconciledAt,
		Error:            message,
	}, nil
}

func (service *Service) staleRunLivenessForReconciliationTarget(target activeRunReconciliationTarget) (RunLiveness, bool) {
	service.mu.Lock()
	defer service.mu.Unlock()

	key := activeKey(target.workspace, target.conversation)
	current, ok := service.liveness[key]
	if !ok || current.RunID != target.run.ID {
		return RunLiveness{}, false
	}
	if service.reconciliationTargetStillCurrentLocked(target, current) {
		return RunLiveness{}, false
	}
	return current, true
}
