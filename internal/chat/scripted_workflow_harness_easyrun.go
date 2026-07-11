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

func scriptedEasyRunPhase3ArtifactsTurn(harness *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Preparing artifacts. "); err != nil {
		return TurnCompletion{}, err
	}
	artifactCalls := []string{
		`{"kind":"markdown","title":"Phase 3 Report","kicker":"Summary","markdown":"## Result\n\nThe scripted easy run emitted a markdown artifact."}`,
		`{"kind":"table","title":"Artifact Table","columns":[{"key":"name","label":"Name"},{"key":"status","label":"Status"}],"rows":[["Markdown","Ready"],["Table","Ready"]]}`,
	}
	for index, arguments := range artifactCalls {
		if err := harness.callEasyRunArtifactTool(ctx, request, fmt.Sprintf("artifact_call_%d", index+1), []byte(arguments)); err != nil {
			return TurnCompletion{}, err
		}
	}
	return scriptedReply(sink, request.Run.ID, "Easy run phase 3 artifacts emitted.")
}

func scriptedEasyRunPhase4NarratorTurn(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Reviewing the request at a product level. "); err != nil {
		return TurnCompletion{}, err
	}
	source := RunItemCommandSourceAgent
	if err := sink.RunItemUpsert(RunItem{
		Details:        NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{Source: &source}),
		ProviderItemID: "scripted_phase4_command_noise",
		Status:         RunItemStatusCompleted,
		Title:          "Command noise that must stay hidden",
		Type:           RunItemTypeCommandExecution,
	}); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, "Easy run phase 4 narrator evidence emitted.")
}

func scriptedEasyRunWorkingNarratorCadenceTurn(harness *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	for index := 1; index <= 8; index++ {
		if err := sink.AssistantTextDelta(
			fmt.Sprintf("scripted-working-narrator-%s-%02d", request.Run.ID, index),
			fmt.Sprintf("Working narrator phase evidence %02d. ", index),
		); err != nil {
			return TurnCompletion{}, err
		}
	}
	steer, err := harness.waitForSteer(ctx, request.Run.ID)
	if err != nil {
		return TurnCompletion{}, err
	}
	text := chatInputText(steer.Input)
	if text != "finish working narrator cadence" {
		return TurnCompletion{
			ErrorMessage: fmt.Sprintf("unexpected working narrator steering text: %s", text),
			Outcome:      TurnOutcomeFailed,
		}, nil
	}
	if err := sink.UserMessageCommitted(text); err != nil {
		return TurnCompletion{}, err
	}
	return scriptedReply(sink, request.Run.ID, "Easy run working narrator cadence finished.")
}

func scriptedEasyRunPhase5ArtifactCapTurn(harness *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Preparing capped artifacts. "); err != nil {
		return TurnCompletion{}, err
	}
	for index := 1; index <= 20; index++ {
		arguments := fmt.Sprintf(
			`{"kind":"markdown","title":"Cap Artifact %02d","kicker":"Cap","markdown":"Artifact %02d is retained before the cap is reached."}`,
			index,
			index,
		)
		if err := harness.callEasyRunArtifactTool(ctx, request, fmt.Sprintf("artifact_cap_call_%02d", index), []byte(arguments)); err != nil {
			return TurnCompletion{}, err
		}
	}
	return TurnCompletion{}, harness.callEasyRunArtifactTool(
		ctx,
		request,
		"artifact_cap_call_overflow",
		[]byte(`{"kind":"markdown","title":"Overflow Artifact","markdown":"This card must not be persisted."}`),
	)
}

func (harness *ScriptedWorkflowHarness) callEasyRunArtifactTool(ctx context.Context, request TurnRequest, callID string, arguments []byte) error {
	harness.mu.Lock()
	tools := harness.tools
	harness.mu.Unlock()
	if tools == nil {
		return fmt.Errorf("scripted easy-run artifact tool registry is unavailable")
	}
	tool, ok := tools.Lookup(SettaAgentToolNamespace, SettaEmitArtifactAgentToolName)
	if !ok {
		return fmt.Errorf("scripted easy-run artifact tool is unavailable")
	}
	runtimeCtx := ContextWithAgentToolRuntime(ctx, AgentToolRuntimeContext{
		Workspace:    request.Workspace,
		Conversation: request.Conversation,
		Run:          request.Run,
		ThreadID:     "scripted-thread-" + request.Conversation.ID,
		TurnID:       "scripted-turn-" + request.Run.ID,
	})
	_, err := tool.Handler(runtimeCtx, AgentToolCall{
		Arguments: arguments,
		CallID:    callID,
		Namespace: SettaAgentToolNamespace,
		Tool:      SettaEmitArtifactAgentToolName,
	})
	return err
}
