package chat

import "context"

func (harness *ScriptedWorkflowHarness) ReconcileRunLiveness(_ context.Context, request HarnessRunLivenessRequest) (HarnessRunLivenessResult, error) {
	harness.mu.Lock()
	_, active := harness.steers[request.RunID]
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
		result.TurnID = ""
		result.TurnStatus = ""
	}
	return result, nil
}
