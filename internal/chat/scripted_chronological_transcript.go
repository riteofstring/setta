package chat

import (
	"context"
	"fmt"
)

// Phase 0 fixture for docs/plans/chronological_chat_transcript_plan.md.
//
// scriptedChronologicalTranscriptTurn emits a deterministic provider stream whose
// chronology is only observable at the provider boundary. It interleaves assistant
// text with commands and reasoning exactly as the plan's concrete workflows describe:
//
//	assistant_text   step one  (before any command)
//	command A        running -> stdout chunks -> completed   (output streaming)
//	command B        running -> completed                    (adjacent command rows)
//	assistant_text   step two  (after the commands)
//	reasoning R1     meaningful title, running, no summary    (active thinking, no tool)
//	assistant_text   step three (after reasoning, still no tool between)
//	reasoning R1     same provider item gains a public summary (thinking -> summary)
//	reasoning R2     hidden text only, no public title/summary (private/generic only)
//	assistant_text   step four (final answer)
//
// The current backend flattens this into one assistant message part plus one outer
// Activity accordion, which is the confusing behavior the chronological transcript work
// replaces. These constants are shared by the Go characterization tests and referenced
// by the deterministic Electron workflow so all three layers describe the same stream.
const (
	chronologicalAssistantTextOne     = "Chronological step one: inspecting the shell scripts. "
	chronologicalAssistantTextTwo     = "Chronological step two: the scripts are pinned-toolchain wrappers. "
	chronologicalAssistantTextThree   = "Chronological step three: the parser lives in internal/chat. "
	chronologicalAssistantTextFour    = "Chronological step four: final chronological answer."
	chronologicalCommandATitle        = "Chronological command A"
	chronologicalCommandBTitle        = "Chronological command B"
	chronologicalReasoningTitle       = "Chronological reasoning headline"
	chronologicalReasoningSummary     = "Chronological public reasoning summary body."
	chronologicalPrivateReasoning     = "private chronological reasoning"
	chronologicalCommandAOutputChunks = 4
)

func scriptedChronologicalTranscriptTurn(_ *ScriptedWorkflowHarness, _ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	runID := request.Run.ID
	// 1. Assistant text before any command.
	if err := sink.AssistantTextDelta("chrono-text-1-"+runID, chronologicalAssistantTextOne); err != nil {
		return TurnCompletion{}, err
	}
	// 2-3. Command A with streamed output, then adjacent command B.
	if err := emitChronologicalCommandA(request, sink); err != nil {
		return TurnCompletion{}, err
	}
	if err := emitChronologicalCommandB(request, sink); err != nil {
		return TurnCompletion{}, err
	}
	// 4. Assistant text after the commands.
	if err := sink.AssistantTextDelta("chrono-text-2-"+runID, chronologicalAssistantTextTwo); err != nil {
		return TurnCompletion{}, err
	}
	// 5-8. Active reasoning, more assistant text, the same item gaining a public summary,
	// then private/generic reasoning that must stay silent.
	if err := emitChronologicalReasoning(runID, sink); err != nil {
		return TurnCompletion{}, err
	}
	// 9. Final assistant text.
	if err := sink.AssistantTextDelta("chrono-text-4-"+runID, chronologicalAssistantTextFour); err != nil {
		return TurnCompletion{}, err
	}
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}

func emitChronologicalCommandA(request TurnRequest, sink TurnSink) error {
	command := RunItem{
		ProviderItemID: "chrono-command-a-" + request.Run.ID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		Title:          chronologicalCommandATitle,
		Command:        "printf chronological-a",
		Cwd:            request.Workspace.RootPath,
		Summary:        "First adjacent chronological command.",
	}
	if err := sink.RunItemUpsert(command); err != nil {
		return err
	}
	for index := 1; index <= chronologicalCommandAOutputChunks; index++ {
		if err := sink.RunItemOutputDelta(command.ProviderItemID, "stdout", fmt.Sprintf("chronological output chunk %03d\n", index)); err != nil {
			return err
		}
	}
	command.Status = RunItemStatusCompleted
	command.ExitCode = 0
	command.DurationMs = 24
	command.Result = "chronological command A complete"
	return sink.RunItemUpsert(command)
}

func emitChronologicalCommandB(request TurnRequest, sink TurnSink) error {
	command := RunItem{
		ProviderItemID: "chrono-command-b-" + request.Run.ID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		Title:          chronologicalCommandBTitle,
		Command:        "printf chronological-b",
		Cwd:            request.Workspace.RootPath,
		Summary:        "Second adjacent chronological command.",
	}
	if err := sink.RunItemUpsert(command); err != nil {
		return err
	}
	command.Status = RunItemStatusCompleted
	command.ExitCode = 0
	command.DurationMs = 12
	command.Result = "chronological command B complete"
	return sink.RunItemUpsert(command)
}

func emitChronologicalReasoning(runID string, sink TurnSink) error {
	reasoning := RunItem{
		ProviderItemID: "chrono-reasoning-" + runID,
		Type:           RunItemTypeReasoning,
		Status:         RunItemStatusRunning,
		Title:          chronologicalReasoningTitle,
	}
	// Meaningful active reasoning with no public summary yet (the future mode: thinking).
	if err := sink.RunItemUpsert(reasoning); err != nil {
		return err
	}
	// Assistant text after the reasoning headline, still with no tool call between them.
	if err := sink.AssistantTextDelta("chrono-text-3-"+runID, chronologicalAssistantTextThree); err != nil {
		return err
	}
	// The same provider item later gains a public summary (the future mode: summary).
	reasoning.Status = RunItemStatusCompleted
	reasoning.Summary = chronologicalReasoningSummary
	if err := sink.RunItemUpsert(reasoning); err != nil {
		return err
	}
	// Private/generic reasoning: hidden text only, no public title or summary. It must never
	// become a transcript block and its hidden text must never surface.
	return sink.RunItemUpsert(RunItem{
		ProviderItemID: "chrono-private-reasoning-" + runID,
		Type:           RunItemTypeReasoning,
		Status:         RunItemStatusCompleted,
		HiddenText:     chronologicalPrivateReasoning,
	})
}
