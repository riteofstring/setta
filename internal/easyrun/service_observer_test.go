package easyrun

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/chat"
)

func TestChatObserverResubscribesAfterDropAndResyncsTerminalWithoutDuplicateDigest(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	narrator := &recordingNarratorRunner{}
	chatEvents := newObserverTestChatService(narrator)
	service, err := NewService(
		store,
		WithChatService(chatEvents),
		WithWorkspaceResolver(testWorkspaceResolver{"workspace_api": {
			DisplayName:  "api",
			ID:           "workspace_api",
			LastOpenedAt: "2026-07-08T12:00:00Z",
			RootPath:     t.TempDir(),
		}}),
		WithClock(func() time.Time {
			return time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
		}),
		WithIDGenerator(testIDGenerator()),
		withEventStreamID(EasyRunEventStreamID),
	)
	if err != nil {
		t.Fatalf("create easy-run service: %v", err)
	}
	t.Cleanup(service.CloseEvents)

	firstSubscription := chatEvents.waitForSubscription(t)
	run := testRun("easy_run_observer_resync")
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_observer_resync",
		Run:           run,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}

	for index := 1; index <= minNewDigestEntries; index++ {
		firstSubscription.publish(observerAssistantDeltaEvent(run, "run_observer_resync", index, fmt.Sprintf("phase evidence %02d", index)))
	}
	waitForSnapshotHighlights(t, service, run.ID, EasyRunStatusWorking, []string{
		"Observer recovered the working phase",
		"Preparing the visible result",
	})

	firstSubscription.close()
	secondSubscription := chatEvents.waitForSubscription(t)
	if secondSubscription.cursor.StreamID != observerChatStreamID || secondSubscription.cursor.Sequence != minNewDigestEntries {
		t.Fatalf("resubscribe cursor = %+v, want %s:%d", secondSubscription.cursor, observerChatStreamID, minNewDigestEntries)
	}
	secondSubscription.publish(observerAssistantDeltaEvent(run, "run_observer_resync", minNewDigestEntries, "phase evidence duplicate"))
	chatEvents.setRuns(run.WorkspaceID, run.ConversationID, []chat.Run{{
		CompletedAt:    "2026-07-08T12:01:00Z",
		ConversationID: run.ConversationID,
		ID:             "run_observer_resync",
		Status:         chat.RunStatusCompleted,
		WorkspaceID:    run.WorkspaceID,
	}})
	secondSubscription.publish(observerResyncRequiredEvent(minNewDigestEntries + 1))

	completed := waitForEasyRunStatus(t, service, run.WorkspaceID, run.ID, EasyRunStatusCompleted)
	if completed.NarratorStatus != EasyRunNarratorStatusOK || completed.Summary == nil || !strings.Contains(*completed.Summary, "Observer resync completed the hidden run.") {
		t.Fatalf("completed resynced run = %+v, want narrated terminal projection", completed)
	}
	assertSnapshotHighlights(t, service, []string{
		"Observer recovered the working phase",
		"Preparing the visible result",
	})
	requests := narrator.Requests()
	if len(requests) != 2 {
		t.Fatalf("narrator requests = %d, want working and terminal only", len(requests))
	}
	firstInput := decodeNarratorTaskInputForTest(t, requests[0])
	if firstInput.Terminal || len(firstInput.DigestEntries) != minNewDigestEntries {
		t.Fatalf("first narrator input = %+v, want working digest threshold", firstInput)
	}
	secondInput := decodeNarratorTaskInputForTest(t, requests[1])
	if !secondInput.Terminal || len(secondInput.DigestEntries) != 0 {
		t.Fatalf("terminal narrator input = %+v, want duplicate replay ignored", secondInput)
	}
}

type recordingNarratorRunner struct {
	mu       sync.Mutex
	requests []chat.HarnessTaskRequest
}

func (runner *recordingNarratorRunner) RunTask(_ context.Context, request chat.HarnessTaskRequest) (chat.HarnessTaskResult, error) {
	runner.mu.Lock()
	runner.requests = append(runner.requests, request)
	runner.mu.Unlock()

	input := narratorTaskInput{}
	if request.StructuredTask != nil {
		_ = json.Unmarshal(request.StructuredTask.Input, &input)
	}
	if input.Terminal {
		return narratorHarnessResult(map[string]any{
			"currentFocus": input.PreviousCurrentFocus,
			"highlights":   []string{},
			"summary":      "Observer resync completed the hidden run.",
		})
	}
	return narratorHarnessResult(map[string]any{
		"currentFocus": input.PreviousCurrentFocus,
		"highlights":   []string{"Observer recovered the working phase", "Preparing the visible result"},
		"summary":      "",
	})
}

func (runner *recordingNarratorRunner) Requests() []chat.HarnessTaskRequest {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	return append([]chat.HarnessTaskRequest{}, runner.requests...)
}

const observerChatStreamID = "chat_observer_test_stream"

type observerTestChatService struct {
	runner        chat.HarnessTaskRunner
	subscriptions chan *observerTestChatSubscription

	mu   sync.Mutex
	runs map[string][]chat.Run
}

type observerTestChatSubscription struct {
	cursor chat.EventCursor
	events chan chat.Event
}

func newObserverTestChatService(runner chat.HarnessTaskRunner) *observerTestChatService {
	return &observerTestChatService{
		runner:        runner,
		runs:          map[string][]chat.Run{},
		subscriptions: make(chan *observerTestChatSubscription, 4),
	}
}

func (service *observerTestChatService) CancelActiveRunByID(string, string, string) (chat.Run, error) {
	return chat.Run{}, fmt.Errorf("cancel is not implemented in observer test chat service")
}

func (service *observerTestChatService) HarnessTaskRunner() chat.HarnessTaskRunner {
	return service.runner
}

func (service *observerTestChatService) ListRuns(workspaceID string, conversationID string) ([]chat.Run, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	return append([]chat.Run{}, service.runs[workspaceID+"\x00"+conversationID]...), nil
}

func (service *observerTestChatService) ResolveEasyRunCodexSettings(string, chat.ChatCodexSettings) (chat.ChatCodexSettings, *chat.ChatCodexEffectiveSettings, error) {
	return chat.ChatCodexSettings{Model: "fake-narrator"}, nil, nil
}

func (service *observerTestChatService) SendEasyRunTurn(string, chat.EasyRunTurnRequest) (chat.SendMessageResult, error) {
	return chat.SendMessageResult{}, fmt.Errorf("start is not implemented in observer test chat service")
}

func (service *observerTestChatService) SteerActiveRunInputByID(string, string, string, chat.ChatInput) (chat.SteerMessageResult, error) {
	return chat.SteerMessageResult{}, fmt.Errorf("steer is not implemented in observer test chat service")
}

func (service *observerTestChatService) SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error) {
	subscription := &observerTestChatSubscription{
		cursor: cursor,
		events: make(chan chat.Event, 32),
	}
	service.subscriptions <- subscription
	return &chat.EventSubscription{Events: subscription.events}, nil
}

func (service *observerTestChatService) setRuns(workspaceID string, conversationID string, runs []chat.Run) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.runs[workspaceID+"\x00"+conversationID] = append([]chat.Run{}, runs...)
}

func (service *observerTestChatService) waitForSubscription(t *testing.T) *observerTestChatSubscription {
	t.Helper()
	select {
	case subscription := <-service.subscriptions:
		return subscription
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for chat observer subscription")
		return nil
	}
}

func (subscription *observerTestChatSubscription) publish(event chat.Event) {
	subscription.events <- event
}

func (subscription *observerTestChatSubscription) close() {
	close(subscription.events)
}

func observerAssistantDeltaEvent(run EasyRun, backingRunID string, sequence int, text string) chat.Event {
	payload, err := json.Marshal(chat.AssistantTextDeltaPayload{
		Delta:     text,
		MessageID: "message_" + backingRunID,
		PartID:    "part_" + backingRunID,
		UpdatedAt: "2026-07-08T12:00:00Z",
	})
	if err != nil {
		panic(err)
	}
	return chat.Event{
		ConversationID: run.ConversationID,
		EmittedAt:      "2026-07-08T12:00:00Z",
		EventID:        fmt.Sprintf("%s:%d", observerChatStreamID, sequence),
		Payload:        payload,
		RunID:          backingRunID,
		Sequence:       sequence,
		StreamID:       observerChatStreamID,
		Type:           chat.EventTypeAssistantTextDelta,
		WorkspaceID:    run.WorkspaceID,
	}
}

func observerResyncRequiredEvent(sequence int) chat.Event {
	payload, err := json.Marshal(chat.ResyncRequiredPayload{
		CurrentSequence:   sequence,
		CurrentStreamID:   observerChatStreamID,
		EarliestSequence:  sequence,
		Reason:            "event replay is no longer available",
		RequestedSequence: minNewDigestEntries,
		RequestedStreamID: observerChatStreamID,
	})
	if err != nil {
		panic(err)
	}
	return chat.Event{
		EmittedAt: "2026-07-08T12:00:30Z",
		EventID:   fmt.Sprintf("%s:%d", observerChatStreamID, sequence),
		Payload:   payload,
		Sequence:  sequence,
		StreamID:  observerChatStreamID,
		Type:      chat.EventTypeResyncRequired,
	}
}
