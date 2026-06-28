package chat

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func decodeBlockCreated(t *testing.T, event Event) TranscriptBlock {
	t.Helper()
	var payload TranscriptBlockCreatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode block created payload: %v", err)
	}
	return payload.Block
}

func decodeBlockUpdated(t *testing.T, event Event) TranscriptBlock {
	t.Helper()
	var payload TranscriptBlockUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode block updated payload: %v", err)
	}
	return payload.Block
}

func decodeTextDelta(t *testing.T, event Event) TranscriptTextDeltaPayload {
	t.Helper()
	var payload TranscriptTextDeltaPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode text delta payload: %v", err)
	}
	return payload
}

func decodeBlocksReplaced(t *testing.T, event Event) TranscriptBlocksReplacedPayload {
	t.Helper()
	var payload TranscriptBlocksReplacedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode blocks replaced payload: %v", err)
	}
	return payload
}

func eventsOfType(events []Event, eventType string) []Event {
	matches := []Event{}
	for _, event := range events {
		if event.Type == eventType {
			matches = append(matches, event)
		}
	}
	return matches
}

func firstReplacedBlockOfKind(t *testing.T, events []Event, kind TranscriptBlockKind) TranscriptBlock {
	t.Helper()
	for _, event := range eventsOfType(events, EventTypeTranscriptBlocksReplaced) {
		for _, block := range decodeBlocksReplaced(t, event).Blocks {
			if block.Kind == kind {
				return block
			}
		}
	}
	return TranscriptBlock{}
}

// collectTranscriptEventsUntilTerminal drives the run's events from a subscription
// until the run reaches a terminal status, returning every event observed. The
// terminal run_status replaced snapshot is published before the terminal
// run.updated, so it is always captured.
func collectTranscriptEventsUntilTerminal(t *testing.T, subscription *EventSubscription, runID string) []Event {
	t.Helper()
	return receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeRunUpdated || event.RunID != runID {
			return false
		}
		var payload RunUpdatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			t.Fatalf("decode run updated payload: %v", err)
		}
		switch payload.Run.Status {
		case RunStatusCompleted, RunStatusCancelled, RunStatusFailed:
			return true
		}
		return false
	})
}

func textCommandTextHarness() *scriptedTranscriptHarness {
	return &scriptedTranscriptHarness{
		start: func(_ context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("seg1", "Inspecting the scripts."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusCompleted, Title: "list", Command: "ls"}); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("seg2", "They are wrappers."); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
}

// TestTranscriptBlockEventsStreamChronology verifies the block streaming events:
// a working indicator is created at genesis and kept at the tail of live
// snapshots, each assistant segment streams its own block-keyed text delta, the
// run-end snapshot reflects the full chronology with no working indicator, and
// the transcript is not republished per text delta.
func TestTranscriptBlockEventsStreamChronology(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), textCommandTextHarness())
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("trigger"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	events := collectTranscriptEventsUntilTerminal(t, subscription, result.Run.ID)

	assertWorkingIndicatorCreatedAndLiveTail(t, events)
	assertSegmentedTextDeltas(t, events, "Inspecting the scripts.", "They are wrappers.")
	assertTerminalSnapshotChronology(t, events)

	replaced := eventsOfType(events, EventTypeTranscriptBlocksReplaced)
	if len(replaced) != 4 {
		t.Fatalf("transcript replaced snapshots = %d, want 4 (3 public block creations + terminal); the transcript must not republish per delta", len(replaced))
	}
	if persisted := loadPersistedBlocks(t, service, workspaceID, result.Run.ID); len(persisted) != 4 {
		t.Fatalf("persisted blocks = %d, want 4 (no working indicator persisted)", len(persisted))
	}
}

func assertWorkingIndicatorCreatedAndLiveTail(t *testing.T, events []Event) {
	t.Helper()
	workingID := ""
	for _, event := range eventsOfType(events, EventTypeTranscriptBlockCreated) {
		block := decodeBlockCreated(t, event)
		if block.Kind == TranscriptBlockKindRunStatus && block.RunStatus.Mode == RunStatusBlockModeWorking {
			workingID = block.ID
		}
	}
	if workingID == "" {
		t.Fatalf("no working run_status created at genesis: %v", eventTypes(events))
	}
	replaced := eventsOfType(events, EventTypeTranscriptBlocksReplaced)
	if len(replaced) == 0 {
		t.Fatalf("no live transcript snapshot replaced the genesis working indicator")
	}
	for index, event := range replaced {
		blocks := decodeBlocksReplaced(t, event).Blocks
		if index == len(replaced)-1 {
			for _, block := range blocks {
				if block.ID == workingID {
					t.Fatalf("terminal snapshot still carries live working indicator %s", workingID)
				}
			}
			continue
		}
		if len(blocks) == 0 {
			t.Fatalf("live replaced snapshot has no blocks")
		}
		tail := blocks[len(blocks)-1]
		if tail.ID != workingID || tail.Kind != TranscriptBlockKindRunStatus || tail.RunStatus.Mode != RunStatusBlockModeWorking {
			t.Fatalf("live snapshot tail = {%s %s %+v}, want working run_status %s", tail.ID, tail.Kind, tail.RunStatus, workingID)
		}
	}
}

func assertSegmentedTextDeltas(t *testing.T, events []Event, wantFirst string, wantSecond string) {
	t.Helper()
	deltasByBlock := map[string]string{}
	order := []string{}
	for _, event := range eventsOfType(events, EventTypeTranscriptTextDelta) {
		payload := decodeTextDelta(t, event)
		if _, seen := deltasByBlock[payload.BlockID]; !seen {
			order = append(order, payload.BlockID)
		}
		deltasByBlock[payload.BlockID] += payload.Delta
	}
	if len(order) != 2 {
		t.Fatalf("assistant text streamed across %d blocks, want 2 distinct blocks: %v", len(order), deltasByBlock)
	}
	if deltasByBlock[order[0]] != wantFirst {
		t.Fatalf("first segment text = %q, want %q", deltasByBlock[order[0]], wantFirst)
	}
	if deltasByBlock[order[1]] != wantSecond {
		t.Fatalf("second segment text = %q, want %q", deltasByBlock[order[1]], wantSecond)
	}
}

func assertTerminalSnapshotChronology(t *testing.T, events []Event) {
	t.Helper()
	replaced := eventsOfType(events, EventTypeTranscriptBlocksReplaced)
	if len(replaced) == 0 {
		t.Fatalf("no terminal replaced snapshot")
	}
	final := decodeBlocksReplaced(t, replaced[len(replaced)-1])
	assertBlockKindSequence(t, final.Blocks, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindActivityItem,
		TranscriptBlockKindAssistantText,
	})
	for _, block := range final.Blocks {
		if block.Status != TranscriptBlockStatusComplete {
			t.Fatalf("terminal snapshot block %s status = %s, want complete", block.ID, block.Status)
		}
	}
}

// TestTranscriptReasoningModeUpdateEvent verifies a reasoning block that gains a
// public summary updates in place: the same block ID and kind transition from a
// created thinking block to an updated summary block.
func TestTranscriptReasoningModeUpdateEvent(t *testing.T) {
	harness := &scriptedTranscriptHarness{
		start: func(_ context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("intro", "Checking ownership."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "reason", Type: RunItemTypeReasoning, Status: RunItemStatusRunning, Title: "Mapping parser modules"}); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "reason", Type: RunItemTypeReasoning, Status: RunItemStatusCompleted, Title: "Mapping parser modules", Summary: "Traced the request flow and the bounded fix."}); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("trigger"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	events := collectTranscriptEventsUntilTerminal(t, subscription, result.Run.ID)

	createdReasoning := firstReplacedBlockOfKind(t, events, TranscriptBlockKindReasoning)
	if createdReasoning.ID == "" {
		t.Fatalf("no reasoning block created: %v", eventTypes(events))
	}
	if createdReasoning.Reasoning.Mode != ReasoningBlockModeThinking {
		t.Fatalf("created reasoning mode = %s, want thinking", createdReasoning.Reasoning.Mode)
	}

	updatedToSummary := false
	for _, event := range eventsOfType(events, EventTypeTranscriptBlockUpdated) {
		block := decodeBlockUpdated(t, event)
		if block.Kind != TranscriptBlockKindReasoning || block.ID != createdReasoning.ID {
			continue
		}
		if block.Reasoning.Mode == ReasoningBlockModeSummary {
			updatedToSummary = true
			if block.Reasoning.Headline != "Mapping parser modules" {
				t.Fatalf("summary headline = %q, want stable thinking headline", block.Reasoning.Headline)
			}
		}
	}
	if !updatedToSummary {
		t.Fatalf("reasoning block %s never updated to summary mode in place", createdReasoning.ID)
	}
}

// TestTranscriptSteeringBlockCreatedEvent verifies a steering message sent into an
// active run publishes a created user_message block for the interleaved steering,
// distinct from the trigger block.
func TestTranscriptSteeringBlockCreatedEvent(t *testing.T) {
	steered := make(chan string, 1)
	commandEmitted := make(chan struct{})
	harness := &scriptedTranscriptHarness{
		start: func(_ context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("pre", "Inspecting the scripts."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusRunning, Title: "list", Command: "ls"}); err != nil {
				return TurnCompletion{}, err
			}
			close(commandEmitted)
			text := <-steered
			if err := sink.AssistantTextDelta("post", "Including "+text+"."); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
		steer: func(request SteerRequest) error {
			steered <- chatInputText(request.Input)
			return nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("trigger"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	<-commandEmitted
	steerWhenReady(t, service, workspaceID, conversationID, "setup.sh")
	events := collectTranscriptEventsUntilTerminal(t, subscription, result.Run.ID)
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	userBlocks := []TranscriptBlock{}
	for _, event := range eventsOfType(events, EventTypeTranscriptBlockCreated) {
		if block := decodeBlockCreated(t, event); block.Kind == TranscriptBlockKindUserMessage {
			userBlocks = append(userBlocks, block)
		}
	}
	if len(userBlocks) != 2 {
		t.Fatalf("user_message created events = %d, want 2 (trigger + steering)", len(userBlocks))
	}
	steering := userBlocks[1]
	if steering.UserMessage.Delivery != MessageDeliverySteering {
		t.Fatalf("second user_message delivery = %s, want steering", steering.UserMessage.Delivery)
	}
	if len(steering.UserMessage.Parts) == 0 || !strings.Contains(steering.UserMessage.Parts[0].Text.Text, "setup.sh") {
		t.Fatalf("steering block text = %+v, want to contain steering prompt", steering.UserMessage.Parts)
	}
}

// TestTranscriptFixtureEventsNeverLeakPrivateReasoning drives the plan's Phase 0
// fixture and verifies the public reasoning summary reaches a block event while no
// streamed event payload ever carries private/hidden reasoning text.
func TestTranscriptFixtureEventsNeverLeakPrivateReasoning(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewScriptedWorkflowHarness())
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("chronological transcript workflow"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	events := collectTranscriptEventsUntilTerminal(t, subscription, result.Run.ID)
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	sawSummary := false
	for _, event := range events {
		if !isTranscriptBlockEvent(event.Type) {
			// Raw run_item events still carry provider HiddenText; the transcript
			// block events that drive rendering must never expose it. Only the
			// transcript surface is in scope here.
			continue
		}
		if strings.Contains(string(event.Payload), chronologicalPrivateReasoning) {
			t.Fatalf("transcript event %s payload leaked private reasoning text", event.Type)
		}
		if event.Type == EventTypeTranscriptBlockCreated || event.Type == EventTypeTranscriptBlockUpdated {
			block := blockFromEvent(t, event)
			if block.Kind == TranscriptBlockKindReasoning && block.Reasoning.Mode == ReasoningBlockModeSummary {
				sawSummary = true
			}
		}
	}
	if !sawSummary {
		t.Fatalf("public reasoning summary never reached a block event: %v", eventTypes(events))
	}
}

func isTranscriptBlockEvent(eventType string) bool {
	switch eventType {
	case EventTypeTranscriptBlockCreated, EventTypeTranscriptBlockUpdated, EventTypeTranscriptTextDelta, EventTypeTranscriptBlocksReplaced:
		return true
	}
	return false
}

func blockFromEvent(t *testing.T, event Event) TranscriptBlock {
	t.Helper()
	if event.Type == EventTypeTranscriptBlockUpdated {
		return decodeBlockUpdated(t, event)
	}
	return decodeBlockCreated(t, event)
}

// TestTranscriptTerminalReplacedOnCancel verifies cancellation publishes a terminal
// snapshot that marks the in-flight blocks cancelled, appends a cancelled
// run_status row, and carries no live working indicator.
func TestTranscriptTerminalReplacedOnCancel(t *testing.T) {
	reached := make(chan struct{})
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("seg", "Working on it."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusRunning, Title: "long", Command: "sleep"}); err != nil {
				return TurnCompletion{}, err
			}
			close(reached)
			<-ctx.Done()
			return TurnCompletion{}, ctx.Err()
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("trigger"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	<-reached
	if _, err := service.CancelActiveRun(workspaceID, conversationID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
	events := collectTranscriptEventsUntilTerminal(t, subscription, result.Run.ID)

	replaced := eventsOfType(events, EventTypeTranscriptBlocksReplaced)
	if len(replaced) == 0 {
		t.Fatalf("no terminal replaced snapshot on cancel: %v", eventTypes(events))
	}
	final := decodeBlocksReplaced(t, replaced[len(replaced)-1])
	last := final.Blocks[len(final.Blocks)-1]
	if last.Kind != TranscriptBlockKindRunStatus || last.RunStatus.Mode != RunStatusBlockModeCancelled {
		t.Fatalf("terminal snapshot tail = {%s %+v}, want cancelled run_status", last.Kind, last.RunStatus)
	}
	for _, block := range final.Blocks {
		if block.Kind == TranscriptBlockKindRunStatus && block.RunStatus.Mode == RunStatusBlockModeWorking {
			t.Fatalf("cancel snapshot still carries a working indicator: %+v", block.RunStatus)
		}
	}
	if final.Blocks[2].Kind != TranscriptBlockKindActivityItem || final.Blocks[2].Status != TranscriptBlockStatusCancelled {
		t.Fatalf("in-flight activity block = %+v, want cancelled", final.Blocks[2])
	}
}

// TestTranscriptOutputChunksDoNotRepublishProjection verifies streamed output
// updates the activity block at most a bounded number of times (first output,
// completion) rather than once per chunk, so output streaming never republishes
// the transcript projection.
func TestTranscriptOutputChunksDoNotRepublishProjection(t *testing.T) {
	const chunks = 5
	harness := &scriptedTranscriptHarness{
		start: func(_ context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("seg", "Running the command."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusRunning, Title: "build", Command: "make"}); err != nil {
				return TurnCompletion{}, err
			}
			for index := 0; index < chunks; index++ {
				if err := sink.RunItemOutputDelta("cmd", "stdout", "line\n"); err != nil {
					return TurnCompletion{}, err
				}
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusCompleted, Title: "build", Command: "make"}); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("trigger"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	events := collectTranscriptEventsUntilTerminal(t, subscription, result.Run.ID)

	commandBlockID := firstReplacedBlockOfKind(t, events, TranscriptBlockKindActivityItem).ID
	if commandBlockID == "" {
		t.Fatalf("no activity block created: %v", eventTypes(events))
	}
	commandUpdates := 0
	for _, event := range eventsOfType(events, EventTypeTranscriptBlockUpdated) {
		if decodeBlockUpdated(t, event).ID == commandBlockID {
			commandUpdates++
		}
	}
	if commandUpdates >= chunks {
		t.Fatalf("activity block updated %d times for %d output chunks; output must not republish per chunk", commandUpdates, chunks)
	}
	if outputs := eventsOfType(events, EventTypeRunItemOutputDelta); len(outputs) != chunks {
		t.Fatalf("run item output deltas = %d, want %d (one per chunk)", len(outputs), chunks)
	}
}
