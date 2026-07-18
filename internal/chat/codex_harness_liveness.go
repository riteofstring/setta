package chat

import (
	"context"
	"fmt"

	"setta/internal/codexapp"
)

func (harness *CodexHarness) ReconcileRunLiveness(ctx context.Context, request HarnessRunLivenessRequest) (HarnessRunLivenessResult, error) {
	if request.ThreadID == "" {
		return HarnessRunLivenessResult{}, commandError(ChatCommandErrorCodexThread, "codex thread is required for run liveness reconciliation", nil)
	}
	if request.TurnID == "" {
		return HarnessRunLivenessResult{}, commandError(ChatCommandErrorCodexThread, "codex turn is required for run liveness reconciliation", nil)
	}
	includeTurns := true
	raw, err := harness.manager.Call(ctx, codexapp.CodexMethodThreadRead, codexapp.ThreadReadParams{
		IncludeTurns: &includeTurns,
		ThreadID:     request.ThreadID,
	})
	if err != nil {
		return HarnessRunLivenessResult{}, commandError(ChatCommandErrorCodexRPC, "thread/read: "+err.Error(), err)
	}
	response, err := codexapp.DecodeThreadReadResponse(raw)
	if err != nil {
		return HarnessRunLivenessResult{}, commandError(ChatCommandErrorCodexProviderDrift, "thread/read response: "+err.Error(), err)
	}
	if response.Thread.ID != request.ThreadID {
		err := fmt.Errorf("thread/read returned thread %s, want %s", response.Thread.ID, request.ThreadID)
		return HarnessRunLivenessResult{}, commandError(ChatCommandErrorCodexProviderDrift, err.Error(), err)
	}
	threadStatus, err := codexHarnessThreadRuntimeStatus(response.Thread)
	if err != nil {
		return HarnessRunLivenessResult{}, commandError(ChatCommandErrorCodexProviderDrift, err.Error(), err)
	}
	result := HarnessRunLivenessResult{
		ThreadID:     response.Thread.ID,
		ThreadStatus: threadStatus,
		TurnID:       request.TurnID,
	}
	for _, turn := range response.Thread.Turns {
		if turn.ID != request.TurnID {
			continue
		}
		status, err := codexHarnessTurnRuntimeStatus(turn.Status)
		if err != nil {
			return HarnessRunLivenessResult{}, commandError(ChatCommandErrorCodexProviderDrift, err.Error(), err)
		}
		result.TurnFound = true
		result.TurnStatus = status
		if turn.Error != nil {
			result.TurnError = turn.Error.Message
		}
		return result, nil
	}
	return result, nil
}

func codexHarnessThreadRuntimeStatus(thread codexapp.Thread) (HarnessThreadRuntimeStatus, error) {
	status, err := codexThreadStatusType(thread.Status, "thread/read thread status")
	if err != nil {
		return "", err
	}
	switch status {
	case string(HarnessThreadRuntimeActive):
		return HarnessThreadRuntimeActive, nil
	case string(HarnessThreadRuntimeIdle):
		return HarnessThreadRuntimeIdle, nil
	case string(HarnessThreadRuntimeNotLoaded):
		return HarnessThreadRuntimeNotLoaded, nil
	case string(HarnessThreadRuntimeSystemError):
		return HarnessThreadRuntimeSystemError, nil
	default:
		return "", fmt.Errorf("unsupported thread/read thread status: %s", status)
	}
}

func codexHarnessTurnRuntimeStatus(status codexapp.TurnStatus) (HarnessTurnRuntimeStatus, error) {
	switch status {
	case codexapp.TurnStatusCompleted:
		return HarnessTurnRuntimeCompleted, nil
	case codexapp.TurnStatusFailed:
		return HarnessTurnRuntimeFailed, nil
	case codexapp.TurnStatusInterrupted:
		return HarnessTurnRuntimeInterrupted, nil
	case codexapp.TurnStatusInProgress:
		return HarnessTurnRuntimeInProgress, nil
	default:
		return "", fmt.Errorf("unsupported thread/read turn status: %s", status)
	}
}
