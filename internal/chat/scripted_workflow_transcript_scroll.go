package chat

import (
	"context"
	"fmt"
	"time"
)

func (harness *ScriptedWorkflowHarness) transcriptScrollStickinessTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	const chunkCount = 900
	const chunkInterval = 10 * time.Millisecond
	item := RunItem{
		ProviderItemID: "provider_scroll_stickiness_" + request.Run.ID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		Title:          "Scroll stickiness command",
		Summary:        "Streaming output while assistant text grows.",
		Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
			Command: "scripted transcript scroll stickiness",
		}),
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	ticker := time.NewTicker(chunkInterval)
	defer ticker.Stop()
	for index := 0; index < chunkCount; index++ {
		if err := waitForTranscriptScrollChunk(ctx, ticker, index); err != nil {
			return TurnCompletion{}, err
		}
		if err := emitTranscriptScrollChunk(sink, request.Run.ID, item.ProviderItemID, index); err != nil {
			return TurnCompletion{}, err
		}
	}
	item.Status = RunItemStatusCompleted
	item.Details = NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
		Command: "scripted transcript scroll stickiness",
		Result:  "scroll stickiness command completed",
	})
	if err := sink.RunItemUpsert(item); err != nil {
		return TurnCompletion{}, err
	}
	if err := sink.AssistantTextDelta("scroll-stickiness-final-"+request.Run.ID, "Scroll stickiness final line."); err != nil {
		return TurnCompletion{}, err
	}
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}

func (harness *ScriptedWorkflowHarness) transcriptOlderPageTurn(_ context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	const blockCount = 48
	for index := 0; index < blockCount; index++ {
		if err := sink.AssistantTextDelta(
			fmt.Sprintf("older-page-text-%03d-%s", index, request.Run.ID),
			fmt.Sprintf("Older page block %03d keeps pagination anchor restoration deterministic.\n", index),
		); err != nil {
			return TurnCompletion{}, err
		}
	}
	return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
}

func waitForTranscriptScrollChunk(ctx context.Context, ticker *time.Ticker, index int) error {
	if index == 0 {
		return nil
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-ticker.C:
		return nil
	}
}

func emitTranscriptScrollChunk(sink TurnSink, runID string, outputProviderItemID string, index int) error {
	providerItemID := "scroll-stickiness-text-a-" + runID
	if index >= 650 {
		providerItemID = "scroll-stickiness-text-b-" + runID
	}
	if err := sink.AssistantTextDelta(
		providerItemID,
		fmt.Sprintf("Scroll stickiness chunk %03d keeps growing the live assistant row for deterministic scroll following.\n", index),
	); err != nil {
		return err
	}
	if index%9 != 0 {
		return nil
	}
	return sink.RunItemOutputDelta(
		outputProviderItemID,
		"stdout",
		fmt.Sprintf("scroll output delta %03d\n", index),
	)
}
