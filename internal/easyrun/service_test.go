package easyrun

import (
	"testing"
	"time"
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
