package chat

import (
	"context"
	"fmt"
)

func (harness *ScriptedWorkflowHarness) activityProjectionTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return scriptedActivityProjection(harness, ctx, request, sink, 1, true)
}

func scriptedActivityProjectionReloadTurn(_ *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return scriptedActivityProjection(nil, ctx, request, sink, embeddedRunOutputLimit+1, false)
}

func scriptedActivityProjection(harness *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink, outputChunks int, includeTransient bool) (TurnCompletion, error) {
	if err := emitProjectionTransientActivity(harness, ctx, request, sink, includeTransient); err != nil {
		return TurnCompletion{}, err
	}
	if err := emitProjectionCommand(request, sink, outputChunks); err != nil {
		return TurnCompletion{}, err
	}
	if err := emitProjectionReasoningItems(request, sink); err != nil {
		return TurnCompletion{}, err
	}
	return emitProjectionFinalAgentMessage(request, sink)
}

func emitProjectionTransientActivity(harness *ScriptedWorkflowHarness, ctx context.Context, request TurnRequest, sink TurnSink, includeTransient bool) error {
	if !includeTransient {
		return nil
	}
	if err := sink.AssistantTextDelta("scripted-assistant-"+request.Run.ID, "Projection activity starting. "); err != nil {
		return err
	}
	transient := RunItem{
		ProviderItemID: "provider_projection_transient_reasoning_" + request.Run.ID,
		Type:           RunItemTypeReasoning,
		Status:         RunItemStatusRunning,
		Progress:       "**Streaming reasoning placeholder**",
	}
	if err := sink.RunItemUpsert(transient); err != nil {
		return err
	}
	if harness == nil {
		return fmt.Errorf("scripted activity projection requires harness steering")
	}
	steer, err := harness.waitForSteer(ctx, request.Run.ID)
	if err != nil {
		return err
	}
	if err := sink.UserMessageCommitted(chatInputText(steer.Input)); err != nil {
		return err
	}
	transient.Status = RunItemStatusCompleted
	return sink.RunItemUpsert(transient)
}

func emitProjectionCommand(request TurnRequest, sink TurnSink, outputChunks int) error {
	command := RunItem{
		ProviderItemID: "provider_projection_command_" + request.Run.ID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		Title:          "Projection command",
		Summary:        "Projection command summary.",
		Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
			Command: "printf projection-output",
			Cwd:     request.Workspace.RootPath,
		}),
	}
	if err := sink.RunItemUpsert(command); err != nil {
		return err
	}
	for index := 1; index <= outputChunks; index++ {
		if err := sink.RunItemOutputDelta(command.ProviderItemID, "stdout", fmt.Sprintf("projection output chunk %03d\n", index)); err != nil {
			return err
		}
	}
	command.Status = RunItemStatusCompleted
	command.Details = NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
		Command:    "printf projection-output",
		Cwd:        request.Workspace.RootPath,
		ExitCode:   0,
		DurationMs: 24,
		Result:     "projection command complete",
	})
	return sink.RunItemUpsert(command)
}

func emitProjectionReasoningItems(request TurnRequest, sink TurnSink) error {
	if err := sink.RunItemUpsert(RunItem{
		ProviderItemID: "provider_projection_hidden_reasoning_" + request.Run.ID,
		Type:           RunItemTypeReasoning,
		Status:         RunItemStatusCompleted,
		HiddenText:     "private projection reasoning",
	}); err != nil {
		return err
	}
	if err := sink.RunItemUpsert(RunItem{
		ProviderItemID: "provider_projection_public_reasoning_" + request.Run.ID,
		Type:           RunItemTypeReasoning,
		Status:         RunItemStatusCompleted,
		Summary:        "**Projection reasoning**\nPublic reasoning summary visible.",
	}); err != nil {
		return err
	}
	return nil
}

func emitProjectionFinalAgentMessage(request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	providerItemID := "provider_projection_agent_message_" + request.Run.ID
	if err := sink.AssistantTextDelta(providerItemID, "Projection assistant final."); err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.RunItemUpsert(RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeAgentMessage,
		Status:         RunItemStatusCompleted,
		Title:          "Projection duplicate provider agent message",
		Summary:        "Projection assistant final.",
	}); err != nil {
		return TurnCompletion{}, err
	}
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}
