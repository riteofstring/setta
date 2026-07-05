package chat

import (
	"context"
	"testing"
)

func TestScriptedWorkflowHarnessLivenessKeepsCompletedTurnAfterUnregister(t *testing.T) {
	harness := NewScriptedWorkflowHarness()
	request := testTurnRequest(t)
	request.Input = TextChatInput("scripted terminal liveness")
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), request, sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	if completion.Outcome != TurnOutcomeCompleted {
		t.Fatalf("completion = %+v, want completed", completion)
	}

	liveness, err := harness.ReconcileRunLiveness(context.Background(), HarnessRunLivenessRequest{
		RunID:    request.Run.ID,
		ThreadID: sink.threadID,
		TurnID:   sink.turnID,
	})
	if err != nil {
		t.Fatalf("reconcile liveness: %v", err)
	}
	if liveness.ThreadStatus != HarnessThreadRuntimeIdle ||
		!liveness.TurnFound ||
		liveness.TurnID != sink.turnID ||
		liveness.TurnStatus != HarnessTurnRuntimeCompleted {
		t.Fatalf("liveness = %+v, want idle completed turn", liveness)
	}
}
