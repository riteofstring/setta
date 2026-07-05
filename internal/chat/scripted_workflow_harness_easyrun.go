package chat

import (
	"context"
	"time"
)

func scriptedEasyRunPhase2CompleteTurn(_ *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Easy run started. "); err != nil {
		return TurnCompletion{}, err
	}
	select {
	case <-ctx.Done():
		return TurnCompletion{}, ctx.Err()
	case <-time.After(150 * time.Millisecond):
	}
	return scriptedReply(sink, request.Run.ID, "Easy run phase 2 complete.")
}
