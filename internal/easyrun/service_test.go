package easyrun

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/workspace"
)

func TestServiceReadSnapshotReturnsEmptySnapshotWithCurrentCursor(t *testing.T) {
	service := newTestService(t)

	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}

	if snapshot.LatestRun != nil {
		t.Fatalf("latest run = %+v, want nil", snapshot.LatestRun)
	}
	if len(snapshot.Highlights) != 0 || len(snapshot.Artifacts) != 0 {
		t.Fatalf("snapshot rails = %d highlights, %d artifacts; want empty", len(snapshot.Highlights), len(snapshot.Artifacts))
	}
	if snapshot.EventStreamCursor.StreamID != EasyRunEventStreamID || snapshot.EventStreamCursor.Sequence != 0 {
		t.Fatalf("snapshot cursor = %+v, want %s:0", snapshot.EventStreamCursor, EasyRunEventStreamID)
	}
}

func TestEventSubscriptionReplaysAfterCursorAndRequestsResyncWhenRetainedEventsAreGone(t *testing.T) {
	events, err := NewEventHub(EasyRunEventStreamID, WithEventBufferSize(1), WithEventClock(func() time.Time {
		return time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
	}))
	if err != nil {
		t.Fatalf("create event hub: %v", err)
	}
	first, err := events.Publish(NewRunUpdatedEvent(testRun("run_first")))
	if err != nil {
		t.Fatalf("publish first event: %v", err)
	}
	second, err := events.Publish(NewRunUpdatedEvent(testRun("run_second")))
	if err != nil {
		t.Fatalf("publish second event: %v", err)
	}

	subscription, err := events.Subscribe(EasyRunEventCursor{
		Sequence: first.Sequence,
		StreamID: first.StreamID,
	})
	if err != nil {
		t.Fatalf("subscribe after first: %v", err)
	}
	defer subscription.Unsubscribe()
	replayed := <-subscription.Events
	if replayed.EventID != second.EventID {
		t.Fatalf("replayed event = %+v, want %s", replayed, second.EventID)
	}

	stale, err := events.Subscribe(EasyRunEventCursor{
		Sequence: 0,
		StreamID: EasyRunEventStreamID,
	})
	if err != nil {
		t.Fatalf("subscribe stale: %v", err)
	}
	defer stale.Unsubscribe()
	resync := <-stale.Events
	if resync.Type != EasyRunEventTypeResyncRequired || resync.ResyncRequired == nil {
		t.Fatalf("stale event = %+v, want resync required", resync)
	}
	if resync.ResyncRequired.CurrentSequence != second.Sequence || resync.ResyncRequired.EarliestSequence != second.Sequence {
		t.Fatalf("resync payload = %+v, want current and earliest at second sequence", resync.ResyncRequired)
	}
}

func TestServiceStartCreatesHiddenEasyRunAndProjectsTerminalChatRun(t *testing.T) {
	service, chatService := newTestServiceWithChat(t, chat.NewFakeHarness(nil))
	subscription, err := service.SubscribeEvents(EasyRunEventCursor{})
	if err != nil {
		t.Fatalf("subscribe easy-run events: %v", err)
	}
	defer subscription.Unsubscribe()

	run, err := service.Start("workspace_api", "build the easy button")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	assertStartedEasyRun(t, run, "build the easy button")

	workingEvent := requireEasyRunEvent(t, subscription)
	assertWorkingRunEvent(t, workingEvent)

	completed := waitForEasyRunStatus(t, service, "workspace_api", run.ID, EasyRunStatusCompleted)
	assertCompletedEasyRun(t, completed)

	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	assertEasyRunSnapshotWithEmptyRails(t, snapshot, completed.ID)

	page, err := chatService.LoadMessagePage("workspace_api", completed.ConversationID, 0, 20)
	if err != nil {
		t.Fatalf("load hidden message page: %v", err)
	}
	assertHiddenEasyRunConversation(t, page.Conversation, run.ID)
	publicList, err := chatService.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list public conversations: %v", err)
	}
	assertNoPublicConversations(t, publicList.Conversations)
}

func TestServiceStopCancelsBackingRunAndProjectsStoppedStatus(t *testing.T) {
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"wait for stop": {
			{Type: chat.FakeEventAssistantDelta, Text: "waiting"},
			{Type: chat.FakeEventWaitForCancel},
		},
	})
	service, _ := newTestServiceWithChat(t, harness)

	run, err := service.Start("workspace_api", "wait for stop")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	working := waitForEasyRunStatus(t, service, "workspace_api", run.ID, EasyRunStatusWorking)

	stopped, err := service.Stop("workspace_api", working.ID)
	if err != nil {
		t.Fatalf("stop easy-run: %v", err)
	}
	if stopped.Status != EasyRunStatusStopped {
		stopped = waitForEasyRunStatus(t, service, "workspace_api", run.ID, EasyRunStatusStopped)
	}
	if stopped.Summary == nil ||
		!strings.Contains(*stopped.Summary, "Stopped after") ||
		!strings.Contains(*stopped.Summary, "no artifacts") ||
		stopped.Error != nil ||
		stopped.ActiveAgentCount != 0 {
		t.Fatalf("stopped run = %+v, want stopped summary without error", stopped)
	}
}

func TestServiceRejectsSecondStartInSameWorkspaceWhileWorking(t *testing.T) {
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"wait in first workspace": {
			{Type: chat.FakeEventWaitForCancel},
		},
		"wait in other workspace": {
			{Type: chat.FakeEventWaitForCancel},
		},
	})
	service, _ := newTestServiceWithChatResolver(t, harness, testWorkspaceResolver{
		"workspace_api": {
			DisplayName:  "api",
			ID:           "workspace_api",
			LastOpenedAt: "2026-07-08T12:00:00Z",
			RootPath:     t.TempDir(),
		},
		"workspace_other": {
			DisplayName:  "other",
			ID:           "workspace_other",
			LastOpenedAt: "2026-07-08T12:00:00Z",
			RootPath:     t.TempDir(),
		},
	})

	first, err := service.Start("workspace_api", "wait in first workspace")
	if err != nil {
		t.Fatalf("start first easy-run: %v", err)
	}
	working := waitForEasyRunStatus(t, service, "workspace_api", first.ID, EasyRunStatusWorking)

	_, err = service.Start("workspace_api", "second start should fail")
	if err == nil || !strings.Contains(err.Error(), "already working") {
		t.Fatalf("second same-workspace start error = %v, want active-run rejection", err)
	}
	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read snapshot after rejected start: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.ID != working.ID || snapshot.LatestRun.Status != EasyRunStatusWorking {
		t.Fatalf("snapshot after rejected start = %+v, want original working run", snapshot.LatestRun)
	}

	other, err := service.Start("workspace_other", "wait in other workspace")
	if err != nil {
		t.Fatalf("start other-workspace easy-run: %v", err)
	}
	_ = waitForEasyRunStatus(t, service, "workspace_other", other.ID, EasyRunStatusWorking)

	if _, err := service.Stop("workspace_api", first.ID); err != nil {
		t.Fatalf("stop first easy-run: %v", err)
	}
	if _, err := service.Stop("workspace_other", other.ID); err != nil {
		t.Fatalf("stop other-workspace easy-run: %v", err)
	}
}

func TestServiceStartupRecoveryMarksWorkingRunsFailed(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_easy",
		Run:           testRun("easy_run_interrupted"),
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save working run: %v", err)
	}
	completed := testRun("easy_run_completed")
	endedAt := "2026-07-08T12:01:00Z"
	completed.ActiveAgentCount = 0
	completed.EndedAt = &endedAt
	completed.Status = EasyRunStatusCompleted
	completed.Summary = stringPointer("Done in 1m0s - no artifacts")
	if err := store.saveNewRun(storedRunRecord{
		BackingRunID:  "run_completed",
		Run:           completed,
		SchemaVersion: SchemaVersion,
	}); err != nil {
		t.Fatalf("save completed run: %v", err)
	}

	restarted, err := NewService(
		store,
		WithClock(func() time.Time {
			return time.Date(2026, 7, 8, 12, 2, 0, 0, time.UTC)
		}),
	)
	if err != nil {
		t.Fatalf("create restarted service: %v", err)
	}
	t.Cleanup(restarted.CloseEvents)

	snapshot, err := restarted.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read recovered snapshot: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.ID != "easy_run_interrupted" {
		t.Fatalf("snapshot latest = %+v, want recovered interrupted run", snapshot.LatestRun)
	}
	assertRestartRecoveredEasyRun(t, *snapshot.LatestRun)

	persisted, err := store.loadRun("workspace_api", "easy_run_interrupted")
	if err != nil {
		t.Fatalf("load persisted recovered run: %v", err)
	}
	assertRestartRecoveredEasyRun(t, persisted.Run)

	subscription, err := restarted.SubscribeEvents(EasyRunEventCursor{})
	if err != nil {
		t.Fatalf("subscribe recovery events: %v", err)
	}
	defer subscription.Unsubscribe()
	event := requireEasyRunEvent(t, subscription)
	if event.Type != EasyRunEventTypeRunUpdated ||
		event.RunUpdated == nil ||
		event.RunUpdated.Run.ID != "easy_run_interrupted" ||
		event.RunUpdated.Run.Status != EasyRunStatusFailed {
		t.Fatalf("recovery event = %+v, want failed run update", event)
	}

	unchanged, err := store.loadRun("workspace_api", "easy_run_completed")
	if err != nil {
		t.Fatalf("load completed run: %v", err)
	}
	if unchanged.Run.Status != EasyRunStatusCompleted || unchanged.Run.Summary == nil || *unchanged.Run.Summary != "Done in 1m0s - no artifacts" {
		t.Fatalf("completed run changed during recovery: %+v", unchanged.Run)
	}
}

func newTestService(t *testing.T) *Service {
	t.Helper()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	service, err := NewService(store)
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	t.Cleanup(service.CloseEvents)
	return service
}

func newTestServiceWithChat(t *testing.T, harness chat.Harness) (*Service, *chat.Service) {
	t.Helper()
	return newTestServiceWithChatResolver(t, harness, testWorkspaceResolver{"workspace_api": {
		DisplayName:  "api",
		ID:           "workspace_api",
		LastOpenedAt: "2026-07-08T12:00:00Z",
		RootPath:     t.TempDir(),
	}})
}

func newTestServiceWithChatResolver(t *testing.T, harness chat.Harness, resolver testWorkspaceResolver) (*Service, *chat.Service) {
	t.Helper()
	appDataDir := t.TempDir()
	chatStore, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create chat store: %v", err)
	}
	chatService, err := chat.NewService(
		chatStore,
		resolver,
		harness,
		chat.WithClock(func() time.Time {
			return time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
		}),
		chat.WithIDGenerator(testIDGenerator()),
	)
	if err != nil {
		t.Fatalf("create chat service: %v", err)
	}
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create easy-run store: %v", err)
	}
	service, err := NewService(
		store,
		WithChatService(chatService),
		WithClock(func() time.Time {
			return time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
		}),
		WithIDGenerator(testIDGenerator()),
	)
	if err != nil {
		t.Fatalf("create easy-run service: %v", err)
	}
	t.Cleanup(chatService.CloseEvents)
	t.Cleanup(service.CloseEvents)
	return service, chatService
}

func testIDGenerator() func(string) (string, error) {
	counter := 0
	return func(prefix string) (string, error) {
		counter++
		return fmt.Sprintf("%s_%04d", prefix, counter), nil
	}
}

type testWorkspaceResolver map[string]workspace.WorkspaceSummary

func (resolver testWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	summary, ok := resolver[id]
	if !ok {
		return workspace.WorkspaceSummary{}, os.ErrNotExist
	}
	return summary, nil
}

func waitForEasyRunStatus(t *testing.T, service *Service, workspaceID string, easyRunID string, status EasyRunStatus) EasyRun {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := service.ReadSnapshot(workspaceID)
		if err != nil {
			t.Fatalf("read easy-run snapshot: %v", err)
		}
		if snapshot.LatestRun != nil && snapshot.LatestRun.ID == easyRunID && snapshot.LatestRun.Status == status {
			return *snapshot.LatestRun
		}
		time.Sleep(10 * time.Millisecond)
	}
	snapshot, err := service.ReadSnapshot(workspaceID)
	if err != nil {
		t.Fatalf("read final easy-run snapshot: %v", err)
	}
	t.Fatalf("latest easy-run = %+v, want %s", snapshot.LatestRun, status)
	return EasyRun{}
}

func requireEasyRunEvent(t *testing.T, subscription *EventSubscription) EasyRunEvent {
	t.Helper()
	select {
	case event := <-subscription.Events:
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for easy-run event")
		return EasyRunEvent{}
	}
}

func assertStartedEasyRun(t *testing.T, run EasyRun, requestText string) {
	t.Helper()
	if run.ID != "easy_run_0001" || run.RequestText != requestText || run.WorkspaceID != "workspace_api" {
		t.Fatalf("started run = %+v, want deterministic easy-run request", run)
	}
}

func assertWorkingRunEvent(t *testing.T, event EasyRunEvent) {
	t.Helper()
	if event.Type != EasyRunEventTypeRunUpdated || event.RunUpdated == nil {
		t.Fatalf("working event = %+v, want run update", event)
	}
	if event.RunUpdated.Run.Status != EasyRunStatusWorking {
		t.Fatalf("working event run = %+v, want working status", event.RunUpdated.Run)
	}
}

func assertCompletedEasyRun(t *testing.T, run EasyRun) {
	t.Helper()
	if run.Summary == nil || run.EndedAt == nil {
		t.Fatalf("completed run = %+v, want summary and endedAt", run)
	}
	if !strings.Contains(*run.Summary, "Done in") || !strings.Contains(*run.Summary, "no artifacts") || run.ActiveAgentCount != 0 {
		t.Fatalf("completed run = %+v, want mechanical completion summary", run)
	}
}

func assertEasyRunSnapshotWithEmptyRails(t *testing.T, snapshot EasyRunSnapshot, easyRunID string) {
	t.Helper()
	if snapshot.LatestRun == nil || snapshot.LatestRun.ID != easyRunID {
		t.Fatalf("snapshot = %+v, want latest run %s", snapshot, easyRunID)
	}
	if len(snapshot.Highlights) != 0 || len(snapshot.Artifacts) != 0 {
		t.Fatalf("snapshot = %+v, want empty rails", snapshot)
	}
}

func assertHiddenEasyRunConversation(t *testing.T, conversation chat.Conversation, easyRunID string) {
	t.Helper()
	if !conversation.Internal || conversation.Workflow != nil {
		t.Fatalf("hidden conversation = %+v, want internal easy-run owner only", conversation)
	}
	if conversation.EasyRun == nil || conversation.EasyRun.EasyRunID != easyRunID {
		t.Fatalf("hidden conversation = %+v, want easy-run id %s", conversation, easyRunID)
	}
}

func assertNoPublicConversations(t *testing.T, conversations []chat.ConversationListItem) {
	t.Helper()
	if len(conversations) != 0 {
		t.Fatalf("public conversations = %+v, want hidden easy-run omitted", conversations)
	}
}

func assertRestartRecoveredEasyRun(t *testing.T, run EasyRun) {
	t.Helper()
	if run.Status != EasyRunStatusFailed ||
		run.EndedAt == nil ||
		*run.EndedAt != "2026-07-08T12:02:00Z" ||
		run.Error == nil ||
		*run.Error != easyRunInterruptedOnRestartReason ||
		run.Summary == nil ||
		!strings.Contains(*run.Summary, "Failed after 2m0s") ||
		!strings.Contains(*run.Summary, easyRunInterruptedOnRestartReason) ||
		!strings.Contains(*run.Summary, "no artifacts") ||
		run.ActiveAgentCount != 0 {
		t.Fatalf("recovered run = %+v, want failed restart projection", run)
	}
}

func testRun(id string) EasyRun {
	return EasyRun{
		ActiveAgentCount: 1,
		ArtifactCount:    0,
		ConversationID:   "conversation_" + id,
		ID:               id,
		NarratorStatus:   EasyRunNarratorStatusOK,
		RequestText:      "Do the work",
		StartedAt:        "2026-07-08T12:00:00Z",
		Status:           EasyRunStatusWorking,
		WorkspaceID:      "workspace_api",
	}
}
