package chat

import (
	"context"
	"fmt"
)

// Phase 0 fixture for docs/plans/background_terminal_lifecycle_plan.md.
//
// scriptedBackgroundTerminalTurn emits a deterministic provider stream for the
// background terminal lifecycle: the assistant starts two unified-exec style
// background terminals, streams a final response, and the turn completes while
// BOTH terminals are still running:
//
//	assistant_text   step one (before the terminals)
//	command alpha    running -> stdout chunks            (left running, never completes)
//	command beta     running                             (left running, never completes)
//	assistant_text   step two (final response, still running)
//	turn completed   <- both terminals are still running here
//
// The current backend has no background terminal lifecycle, so run finalization
// coerces these still-running commands to "complete" (the bug frozen by
// TestServiceFinalizesBackgroundTerminalWithRun). Once the source field lands
// (Phase 1) and finalization is updated (Phase 4), background terminals must
// survive turn completion instead of being finalized with the run.
//
// The commands carry no provider-supplied friendly title, mirroring how Codex
// sends unified exec items: the activity label is derived from the command by the
// Go projection. These constants are shared by the Go characterization tests and
// referenced by the deterministic Electron workflow so both layers describe the
// same stream.
const (
	backgroundTerminalAssistantTextOne  = "Background terminal step one: starting the dev servers. "
	backgroundTerminalAssistantTextTwo  = "Background terminal step two: both servers are running in the background."
	backgroundTerminalAlphaCommand      = "npm run dev"
	backgroundTerminalBetaCommand       = "vite --host 0.0.0.0"
	backgroundTerminalAlphaOutputChunks = 2
)

func scriptedBackgroundTerminalTurn(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	runID := request.Run.ID
	// 1. Assistant text before starting the terminals.
	if err := sink.AssistantTextDelta("bg-text-1-"+runID, backgroundTerminalAssistantTextOne); err != nil {
		return TurnCompletion{}, err
	}
	// 2-3. Two background terminal startups, both left running with no completed upsert.
	if err := emitBackgroundTerminalStartup(request, sink, "bg-alpha-"+runID, backgroundTerminalAlphaCommand, backgroundTerminalAlphaOutputChunks); err != nil {
		return TurnCompletion{}, err
	}
	if err := emitBackgroundTerminalStartup(request, sink, "bg-beta-"+runID, backgroundTerminalBetaCommand, 0); err != nil {
		return TurnCompletion{}, err
	}
	// 4. Final assistant response while the terminals keep running.
	if err := sink.AssistantTextDelta("bg-text-2-"+runID, backgroundTerminalAssistantTextTwo); err != nil {
		return TurnCompletion{}, err
	}
	// The turn completes while both background terminals are still running.
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}

// emitBackgroundTerminalStartup emits one unified-exec style command that the
// assistant leaves running past the turn. It only ever upserts the running
// state: there is no completed upsert, because the process keeps running. Phase
// 1 will additionally mark this item with RunItemCommandSource so the backend
// can recognize it as a background terminal rather than a normal command.
func emitBackgroundTerminalStartup(request TurnRequest, sink TurnSink, providerItemID string, command string, outputChunks int) error {
	item := RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		Command:        command,
		Cwd:            request.Workspace.RootPath,
		Summary:        "Background terminal left running after the turn completed.",
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return err
	}
	for index := 1; index <= outputChunks; index++ {
		if err := sink.RunItemOutputDelta(providerItemID, "stdout", fmt.Sprintf("%s output chunk %03d\n", command, index)); err != nil {
			return err
		}
	}
	return nil
}
