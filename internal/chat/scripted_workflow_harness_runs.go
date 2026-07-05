package chat

import (
	"context"
	"errors"
)

func (harness *ScriptedWorkflowHarness) registerRun(runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	delete(harness.terminalRuns, runID)
	harness.approvals[runID] = make(chan ApprovalResponse, 1)
	harness.steers[runID] = make(chan SteerRequest, 4)
}

func (harness *ScriptedWorkflowHarness) unregisterRun(runID string, completion TurnCompletion) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	delete(harness.approvals, runID)
	delete(harness.steers, runID)
	if completion.Outcome != "" {
		harness.terminalRuns[runID] = completion
	}
}

func terminalCompletionForScriptedRun(completion TurnCompletion, err error) TurnCompletion {
	if err == nil {
		return completion
	}
	if errors.Is(err, context.Canceled) {
		return TurnCompletion{Outcome: TurnOutcomeCancelled, ErrorMessage: err.Error()}
	}
	return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: err.Error()}
}
