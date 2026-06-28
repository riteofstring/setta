package chat

import (
	"context"
	"errors"
	"fmt"
	"time"
)

func (service *Service) CancelActiveRun(workspaceID string, conversationID string) (Run, error) {
	active, run, err := service.activeRunForCancellation(workspaceID, conversationID)
	if err != nil {
		return Run{}, err
	}
	if active.cancelDrain && run.Status != RunStatusRunning {
		return run, nil
	}
	if err := service.cancelHarnessRun(workspaceID, conversationID, active, run); err != nil {
		return Run{}, err
	}
	service.cancelActiveRunContext(workspaceID, conversationID, active)
	return service.markTurnCancelled(workspaceID, conversationID, active.runID)
}

func (service *Service) activeRunForCancellation(workspaceID string, conversationID string) (activeTurn, Run, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return activeTurn{}, Run{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.workspaceID != workspaceID {
		err := service.detachedActiveRunErrorLocked(workspaceID, conversationID)
		return activeTurn{}, Run{}, err
	}
	run, err := service.store.LoadRun(workspaceID, active.runID)
	if err != nil {
		return activeTurn{}, Run{}, err
	}
	return active, run, nil
}

func (service *Service) detachedActiveRunErrorLocked(workspaceID string, conversationID string) error {
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return err
	}
	run, exists, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("conversation has no active run: %s", conversationID)
	}
	return fmt.Errorf("active run %s is not attached to this backend process", run.ID)
}

func (service *Service) cancelHarnessRun(workspaceID string, conversationID string, active activeTurn, run Run) error {
	var err error
	if active.goalContinuation != nil {
		err = active.goalContinuation.Cancel(context.Background())
	} else {
		err = service.harness.CancelTurn(context.Background(), CancelRequest{
			RunID:          run.ID,
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
		})
	}
	if err != nil && !errors.Is(err, ErrTurnNotStarted) {
		return err
	}
	return nil
}

func (service *Service) cancelActiveRunContext(workspaceID string, conversationID string, active activeTurn) {
	delay := goalContinuationCancelDrainTimeout(active.goalContinuation)
	if delay <= 0 {
		active.cancel()
		return
	}
	service.markActiveCancellationDrain(workspaceID, conversationID, active.runID)
	time.AfterFunc(delay, active.cancel)
}

func (service *Service) markActiveCancellationDrain(workspaceID string, conversationID string, runID string) {
	service.mu.Lock()
	defer service.mu.Unlock()

	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.runID != runID {
		return
	}
	active.cancelDrain = true
	service.active[key] = active
}

func goalContinuationCancelDrainTimeout(continuation HarnessGoalContinuation) time.Duration {
	if continuation == nil {
		return 0
	}
	drainer, ok := continuation.(HarnessGoalContinuationCancelDrainer)
	if !ok {
		return 0
	}
	return drainer.CancelDrainTimeout()
}

func (service *Service) markTurnCancelled(workspaceID string, conversationID string, runID string) (Run, error) {
	return service.markTurnCancelledWithOptionsLocked(workspaceID, conversationID, runID, "turn cancelled", "cancellation_requested", "Turn cancellation requested", true, true)
}

func (service *Service) markTurnCancelledWithReason(workspaceID string, conversationID string, runID string, runError string, traceType string, traceMessage string) (Run, error) {
	return service.markTurnCancelledWithOptions(workspaceID, conversationID, runID, runError, traceType, traceMessage, true)
}

func (service *Service) markTurnCancelledWithOptions(workspaceID string, conversationID string, runID string, runError string, traceType string, traceMessage string, reconcilePendingSteering bool) (Run, error) {
	return service.markTurnCancelledWithOptionsLocked(workspaceID, conversationID, runID, runError, traceType, traceMessage, reconcilePendingSteering, false)
}

func (service *Service) markTurnCancelledWithOptionsLocked(workspaceID string, conversationID string, runID string, runError string, traceType string, traceMessage string, reconcilePendingSteering bool, preserveCancellationDrain bool) (Run, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.runID != runID {
		run, err := service.store.LoadRun(workspaceID, runID)
		return run, err
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return Run{}, err
	}
	if run.Status != RunStatusRunning {
		if active.cancelDrain {
			return run, nil
		}
		delete(service.active, key)
		return run, nil
	}
	return service.cancelRunningTurnLocked(workspaceID, conversationID, key, active, run, runError, traceType, traceMessage, reconcilePendingSteering, preserveCancellationDrain)
}

func (service *Service) cancelRunningTurnLocked(workspaceID string, conversationID string, key string, active activeTurn, run Run, runError string, traceType string, traceMessage string, reconcilePendingSteering bool, preserveCancellationDrain bool) (Run, error) {
	now := timestamp(service.now())
	message := active.assistantMessage
	message.Status = MessageStatusCancelled
	message.UpdatedAt = now
	run.Status = RunStatusCancelled
	run.CompletedAt = now
	run.Error = runError
	run.PendingApproval = nil
	// Finalize transcript blocks before the terminal store record (see completeTurn).
	if err := service.finalizeTranscriptBlocksLocked(workspaceID, active.transcript, TranscriptBlockStatusCancelled, runError); err != nil {
		return Run{}, err
	}
	records, err := service.store.CancelTurn(TerminalTurnRecords{AssistantMessage: message, Run: run})
	if err != nil {
		return Run{}, err
	}
	message = records.AssistantMessage
	run = records.Run
	pendingSteering, err := service.markTerminalPendingSteeringLocked(workspaceID, conversationID, run.ID, MessageStatusCancelled, reconcilePendingSteering)
	if err != nil {
		return Run{}, err
	}
	if err := service.traceLocked(workspaceID, run.ID, traceType, traceMessage); err != nil {
		return Run{}, err
	}
	if preserveCancellationDrain && active.cancelDrain {
		active.assistantMessage = message
		service.active[key] = active
	} else {
		delete(service.active, key)
	}
	if err := service.publishTerminalTurnLocked(workspaceID, conversationID, message, run, pendingSteering); err != nil {
		return Run{}, err
	}
	return run, nil
}
