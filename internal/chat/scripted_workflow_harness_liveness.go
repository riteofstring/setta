package chat

import "context"

func (harness *ScriptedWorkflowHarness) ReconcileRunLiveness(_ context.Context, request HarnessRunLivenessRequest) (HarnessRunLivenessResult, error) {
	harness.mu.Lock()
	_, active := harness.steers[request.RunID]
	terminal, terminalFound := harness.terminalRuns[request.RunID]
	harness.mu.Unlock()

	result := HarnessRunLivenessResult{
		ThreadID:     request.ThreadID,
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnID:       request.TurnID,
		TurnFound:    active,
		TurnStatus:   HarnessTurnRuntimeInProgress,
	}
	if !active {
		result.ThreadStatus = HarnessThreadRuntimeIdle
		if terminalFound {
			result.TurnFound = true
			result.TurnStatus = scriptedTerminalTurnRuntimeStatus(terminal.Outcome)
			result.TurnError = terminal.ErrorMessage
		} else {
			result.TurnID = ""
			result.TurnStatus = ""
		}
	}
	return result, nil
}

func scriptedTerminalTurnRuntimeStatus(outcome TurnOutcome) HarnessTurnRuntimeStatus {
	switch outcome {
	case TurnOutcomeCompleted:
		return HarnessTurnRuntimeCompleted
	case TurnOutcomeCancelled:
		return HarnessTurnRuntimeInterrupted
	case TurnOutcomeFailed:
		return HarnessTurnRuntimeFailed
	default:
		return ""
	}
}
