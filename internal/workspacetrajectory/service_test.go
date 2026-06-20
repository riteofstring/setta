package workspacetrajectory

import (
	"testing"
	"time"

	"setta/internal/chat"
)

func TestServicePublishesRevisionedDeltasAndDeterministicSnapshotRequiredGap(t *testing.T) {
	now := fixedClock("2026-06-18T11:00:00Z")
	service, err := NewService(Config{Now: now})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	firstEvent, ok, err := service.PublishChatEvent(chatEvent(t, chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{
		Item: testRunItem("item_service_first", chat.RunItemTypeReasoning, chat.RunItemStatusRunning, "2026-06-18T11:00:01Z", nil),
	}))
	if err != nil {
		t.Fatalf("publish first event: %v", err)
	}
	assertFirstRuntimeEvent(t, firstEvent, ok)
	publishGapEvents(t, service)

	gapSubscription, err := service.SubscribeRuntimeChanges(RuntimeEventCursor{StreamID: defaultRuntimeStreamID, Sequence: 1})
	if err != nil {
		t.Fatalf("subscribe gap cursor: %v", err)
	}
	defer gapSubscription.Unsubscribe()
	assertGapEvent(t, receiveRuntimeEvent(t, gapSubscription))

	replaySubscription, err := service.SubscribeRuntimeChanges(RuntimeEventCursor{StreamID: defaultRuntimeStreamID, Sequence: defaultRuntimeBufferSize + 2})
	if err != nil {
		t.Fatalf("subscribe replay cursor: %v", err)
	}
	defer replaySubscription.Unsubscribe()
	assertReplayEvent(t, receiveRuntimeEvent(t, replaySubscription))
}

func publishGapEvents(t *testing.T, service *Service) {
	t.Helper()
	for index := 0; index < defaultRuntimeBufferSize+2; index++ {
		itemID := "item_service_gap_" + time.Unix(int64(index), 0).UTC().Format("150405")
		_, ok, err := service.PublishChatEvent(chatEvent(t, chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{
			Item: testRunItem(itemID, chat.RunItemTypeCommandExecution, chat.RunItemStatusRunning, "2026-06-18T11:00:02Z", func(item *chat.RunItem) {
				item.Command = "./scripts/go.sh test ./internal/workspacetrajectory"
			}),
		}))
		if err != nil {
			t.Fatalf("publish gap event %d: %v", index, err)
		}
		if !ok {
			t.Fatalf("gap event %d was not published", index)
		}
	}
}

func assertFirstRuntimeEvent(t *testing.T, event WorkspaceTrajectoryRuntimeEvent, ok bool) {
	t.Helper()
	if !ok || event.Revision != 1 || event.Delta == nil || event.Delta.FromRevision != 0 || event.Delta.ToRevision != 1 {
		t.Fatalf("first runtime event = %+v", event)
	}
}

func assertGapEvent(t *testing.T, event WorkspaceTrajectoryRuntimeEvent) {
	t.Helper()
	if !event.SnapshotRequired || event.Delta != nil || event.Revision != defaultRuntimeBufferSize+3 {
		t.Fatalf("gap event = %+v", event)
	}
}

func assertReplayEvent(t *testing.T, event WorkspaceTrajectoryRuntimeEvent) {
	t.Helper()
	if event.SnapshotRequired ||
		event.Delta == nil ||
		event.Delta.FromRevision != defaultRuntimeBufferSize+2 ||
		event.Delta.ToRevision != defaultRuntimeBufferSize+3 {
		t.Fatalf("replay event = %+v", event)
	}
}

func receiveRuntimeEvent(t *testing.T, subscription *RuntimeEventSubscription) WorkspaceTrajectoryRuntimeEvent {
	t.Helper()
	select {
	case event, ok := <-subscription.Events:
		if !ok {
			t.Fatal("runtime subscription closed")
		}
		return event
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for runtime event")
	}
	return WorkspaceTrajectoryRuntimeEvent{}
}

func fixedClock(value string) func() time.Time {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		panic(err)
	}
	return func() time.Time {
		return parsed
	}
}
