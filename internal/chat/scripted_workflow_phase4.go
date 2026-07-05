package chat

import (
	"context"
	"encoding/json"
	"fmt"
)

func (harness *ScriptedWorkflowHarness) phase4ConsolidatorTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	decision, attempt := harness.nextPhase4ConsolidatorDecision(request)
	output, err := json.Marshal(struct {
		Attempt  int    `json:"attempt"`
		Decision string `json:"decision"`
		Summary  string `json:"summary"`
	}{
		Attempt:  attempt,
		Decision: decision,
		Summary:  "phase 4 consolidator " + decision,
	})
	if err != nil {
		return TurnCompletion{}, err
	}
	actionable := "no"
	if decision == "continue" {
		actionable = "yes"
	}
	signals := []scriptedWorkflowSignal{
		{Name: "decision", Value: decision},
		{Name: "actionable", Value: actionable},
	}
	if err := harness.reportScriptedWorkflowResult(ctx, request, TurnOutcomeCompleted, "", signals, output); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, fmt.Sprintf("Phase 4 consolidator %s. Actionable: %s. Output: %s", decision, actionable, string(output)))
}
