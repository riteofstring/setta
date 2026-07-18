package chat

import (
	"context"
	"fmt"
)

func scriptedWorkflowTrajectoryPageLimitTurn(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	const transcriptBlockCount = 205
	const outputChunkCount = 501

	if err := emitTrajectoryLimitCommand(request, sink, "a", outputChunkCount); err != nil {
		return TurnCompletion{}, err
	}
	if err := emitTrajectoryLimitCommand(request, sink, "b", outputChunkCount); err != nil {
		return TurnCompletion{}, err
	}
	for index := 0; index < transcriptBlockCount; index++ {
		if err := sink.AssistantTextDelta(
			fmt.Sprintf("trajectory-limit-text-%03d-%s", index, request.Run.ID),
			fmt.Sprintf("Trajectory limit block %03d remains reachable through pagination.\n", index),
		); err != nil {
			return TurnCompletion{}, err
		}
	}
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}

func scriptedWorkflowTrajectoryActivityItemPageTurn(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	for index := 1; index <= 5; index++ {
		item := RunItem{
			ProviderItemID: fmt.Sprintf("provider_trajectory_activity_item_%02d_%s", index, request.Run.ID),
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusCompleted,
			Title:          fmt.Sprintf("Trajectory activity item %d", index),
			Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
				Command:  fmt.Sprintf("printf trajectory-activity-item-%d", index),
				Cwd:      request.Workspace.RootPath,
				ExitCode: 0,
				Result:   fmt.Sprintf("trajectory activity item %d complete", index),
			}),
		}
		if err := sink.RunItemUpsert(item); err != nil {
			return TurnCompletion{}, err
		}
	}
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}

func emitTrajectoryLimitCommand(request TurnRequest, sink TurnSink, suffix string, outputChunkCount int) error {
	command := RunItem{
		ProviderItemID: fmt.Sprintf("provider_trajectory_limit_command_%s_%s", suffix, request.Run.ID),
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		Title:          fmt.Sprintf("Trajectory limit command %s", suffix),
		Summary:        "Emits enough output chunks to require pagination at the trajectory limit.",
		Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
			Command: fmt.Sprintf("printf trajectory-limit-output-%s", suffix),
			Cwd:     request.Workspace.RootPath,
		}),
	}
	if err := sink.RunItemUpsert(command); err != nil {
		return err
	}
	for index := 1; index <= outputChunkCount; index++ {
		if err := sink.RunItemOutputDelta(command.ProviderItemID, "stdout", fmt.Sprintf("trajectory limit output chunk %s %03d\n", suffix, index)); err != nil {
			return err
		}
	}
	command.Status = RunItemStatusCompleted
	command.Details = NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
		Command:  fmt.Sprintf("printf trajectory-limit-output-%s", suffix),
		Cwd:      request.Workspace.RootPath,
		ExitCode: 0,
		Result:   fmt.Sprintf("trajectory limit command %s complete", suffix),
	})
	return sink.RunItemUpsert(command)
}
