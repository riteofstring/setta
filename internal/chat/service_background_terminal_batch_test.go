package chat

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func TestServiceBackgroundTerminalProviderOutputBatchesProcessUpdatesAndOrdinals(t *testing.T) {
	service, subscription, process := newBackgroundTerminalBatchTestService(t)
	sink := service.backgroundTerminalSink()

	const chunks = 5
	for index := 0; index < chunks; index++ {
		if err := sink.BackgroundTerminalOutputDelta(process.WorkspaceID, process.ConversationID, process.ProviderItemID, process.ProcessID, "stdout", batchOutputText(index)); err != nil {
			t.Fatalf("enqueue output %d: %v", index, err)
		}
	}

	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeBackgroundTerminalUpdated {
			return false
		}
		updated := decodeBackgroundTerminalUpdated(t, event)
		return updated.ID == process.ID && len(updated.RecentOutput) == chunks
	})
	if updates := eventsOfType(events, EventTypeBackgroundTerminalUpdated); len(updates) != 1 {
		t.Fatalf("updated events = %d, want one batched process update: %v", len(updates), eventTypes(events))
	}
	if deltas := eventsOfType(events, EventTypeBackgroundTerminalOutputDelta); len(deltas) != chunks {
		t.Fatalf("output delta events = %d, want %d: %v", len(deltas), chunks, eventTypes(events))
	}
	assertBackgroundTerminalOutputOrdinals(t, service, process, chunks)
}

func TestServiceBackgroundTerminalCompletionFlushesQueuedOutputBeforeExit(t *testing.T) {
	service, subscription, process := newBackgroundTerminalBatchTestService(t)
	sink := service.backgroundTerminalSink()
	eventsResult := collectBackgroundTerminalBatchEventsUntil(subscription, func(event Event) bool {
		return isBackgroundTerminalBatchExitUpdate(event, process.ID)
	})

	chunks := backgroundTerminalOutputBatchLimit*4 + 7
	for index := 0; index < chunks; index++ {
		if err := sink.BackgroundTerminalOutputDelta(process.WorkspaceID, process.ConversationID, process.ProviderItemID, process.ProcessID, "stdout", batchOutputText(index)); err != nil {
			t.Fatalf("enqueue output %d: %v", index, err)
		}
	}
	if err := sink.BackgroundTerminalCompleted(process.WorkspaceID, process.ConversationID, process.ProviderItemID, process.ProcessID, 0, ""); err != nil {
		t.Fatalf("complete terminal: %v", err)
	}

	events := waitForBackgroundTerminalBatchEvents(t, eventsResult)
	assertBackgroundTerminalOutputOrdinals(t, service, process, chunks)
	if deltas := eventsOfType(events, EventTypeBackgroundTerminalOutputDelta); len(deltas) != chunks {
		t.Fatalf("output delta events = %d, want %d before exit: %v", len(deltas), chunks, eventTypes(events))
	}
	if updates := eventsOfType(events, EventTypeBackgroundTerminalUpdated); len(updates) >= chunks {
		t.Fatalf("updated events = %d, want batched updates below raw chunk count", len(updates))
	}
	if !lastOutputPrecedesExitUpdate(t, events, process.ID) {
		t.Fatalf("events = %v, want output deltas before terminal exit update", eventTypes(events))
	}
}

func newBackgroundTerminalBatchTestService(t *testing.T) (*Service, *EventSubscription, BackgroundTerminalProcess) {
	t.Helper()
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))
	seedRecoveryConversation(t, service.store)
	process := testBackgroundTerminalProcess("bgproc_batch")
	process.RecentOutput = []string{}
	if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
		t.Fatalf("save background terminal: %v", err)
	}
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	t.Cleanup(subscription.Unsubscribe)
	return service, subscription, process
}

type backgroundTerminalBatchEventResult struct {
	events []Event
	err    error
}

func collectBackgroundTerminalBatchEventsUntil(subscription *EventSubscription, done func(Event) bool) <-chan backgroundTerminalBatchEventResult {
	result := make(chan backgroundTerminalBatchEventResult, 1)
	go func() {
		deadline := time.After(2 * time.Second)
		events := []Event{}
		for {
			select {
			case event, ok := <-subscription.Events:
				if !ok {
					result <- backgroundTerminalBatchEventResult{err: fmt.Errorf("event subscription closed")}
					return
				}
				events = append(events, event)
				if done(event) {
					result <- backgroundTerminalBatchEventResult{events: events}
					return
				}
			case <-deadline:
				result <- backgroundTerminalBatchEventResult{err: fmt.Errorf("timed out waiting for chat event; got %v", eventTypes(events))}
				return
			}
		}
	}()
	return result
}

func waitForBackgroundTerminalBatchEvents(t *testing.T, result <-chan backgroundTerminalBatchEventResult) []Event {
	t.Helper()
	received := <-result
	if received.err != nil {
		t.Fatal(received.err)
	}
	return received.events
}

func isBackgroundTerminalBatchExitUpdate(event Event, processID string) bool {
	if event.Type != EventTypeBackgroundTerminalUpdated {
		return false
	}
	var payload BackgroundTerminalUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return false
	}
	return payload.Process.ID == processID && payload.Process.Status == BackgroundTerminalExited
}

func assertBackgroundTerminalOutputOrdinals(t *testing.T, service *Service, process BackgroundTerminalProcess, want int) {
	t.Helper()
	page, err := service.LoadBackgroundTerminalOutputPage(process.WorkspaceID, process.ConversationID, process.ID, 0, 0)
	if err != nil {
		t.Fatalf("load output page: %v", err)
	}
	if len(page.Output) != want {
		t.Fatalf("output count = %d, want %d", len(page.Output), want)
	}
	for index, output := range page.Output {
		wantOrdinal := index + 1
		if output.Ordinal != wantOrdinal || output.Text != batchOutputText(index) {
			t.Fatalf("output[%d] = ordinal %d text %q, want ordinal %d text %q", index, output.Ordinal, output.Text, wantOrdinal, batchOutputText(index))
		}
	}
}

func lastOutputPrecedesExitUpdate(t *testing.T, events []Event, processID string) bool {
	t.Helper()
	lastOutput := -1
	exitUpdate := -1
	for index, event := range events {
		switch event.Type {
		case EventTypeBackgroundTerminalOutputDelta:
			output := decodeBackgroundTerminalOutputDelta(t, event)
			if output.ProcessID == processID {
				lastOutput = index
			}
		case EventTypeBackgroundTerminalUpdated:
			process := decodeBackgroundTerminalUpdated(t, event)
			if process.ID == processID && process.Status == BackgroundTerminalExited {
				exitUpdate = index
			}
		}
	}
	return lastOutput >= 0 && exitUpdate > lastOutput
}

func batchOutputText(index int) string {
	return fmt.Sprintf("batch output %03d\n", index)
}
