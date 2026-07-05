package chat

import (
	"context"
	"fmt"
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

func scriptedEasyRunPhase2SteeringTurn(harness *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Easy run waiting for steering. "); err != nil {
		return TurnCompletion{}, err
	}
	steer, err := harness.waitForSteer(ctx, request.Run.ID)
	if err != nil {
		return TurnCompletion{}, err
	}
	text := chatInputText(steer.Input)
	if text != "steer easy run phase2" {
		return TurnCompletion{
			ErrorMessage: fmt.Sprintf("unexpected easy-run steering text: %s", text),
			Outcome:      TurnOutcomeFailed,
		}, nil
	}
	if err := sink.UserMessageCommitted(text); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, "Easy run phase 2 steered.")
}
