package chat

import (
	"context"
	"errors"
)

func (harness *ScriptedWorkflowHarness) ActiveRunCount() int {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	return len(harness.steers)
}

func (harness *ScriptedWorkflowHarness) ReconcileRunLiveness(_ context.Context, request HarnessRunLivenessRequest) (HarnessRunLivenessResult, error) {
	harness.mu.Lock()
	status, found := harness.turnStatuses[request.RunID]
	errMessage := harness.turnErrors[request.RunID]
	harness.mu.Unlock()

	if !found {
		return HarnessRunLivenessResult{
			ThreadID:     request.ThreadID,
			ThreadStatus: HarnessThreadRuntimeIdle,
		}, nil
	}
	result := HarnessRunLivenessResult{
		ThreadID:     request.ThreadID,
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnID:       request.TurnID,
		TurnFound:    true,
		TurnStatus:   status,
		TurnError:    errMessage,
	}
	if status != HarnessTurnRuntimeInProgress {
		result.ThreadStatus = HarnessThreadRuntimeIdle
	}
	return result, nil
}

func (harness *ScriptedWorkflowHarness) finishRun(runID string, completion TurnCompletion, err error) {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	harness.turnStatuses[runID] = scriptedHarnessTurnStatus(completion, err)
	harness.turnErrors[runID] = scriptedHarnessTurnError(completion, err)
}

func scriptedHarnessTurnStatus(completion TurnCompletion, err error) HarnessTurnRuntimeStatus {
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return HarnessTurnRuntimeInterrupted
		}
		return HarnessTurnRuntimeFailed
	}
	switch completion.Outcome {
	case TurnOutcomeCompleted:
		return HarnessTurnRuntimeCompleted
	case TurnOutcomeCancelled:
		return HarnessTurnRuntimeInterrupted
	case TurnOutcomeFailed:
		return HarnessTurnRuntimeFailed
	default:
		return HarnessTurnRuntimeFailed
	}
}

func scriptedHarnessTurnError(completion TurnCompletion, err error) string {
	if err != nil {
		return err.Error()
	}
	if completion.Outcome == TurnOutcomeFailed {
		return completion.ErrorMessage
	}
	return ""
}
