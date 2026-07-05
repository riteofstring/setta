package workspaceui

import (
	"reflect"
	"testing"
	"time"
)

const workspaceUIEventHubTestStreamID = "workspace_ui_stream_test"

func TestServicePublishesWorkspaceUILayoutEvents(t *testing.T) {
	service := newEventTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	}, 4)
	subscription := subscribeWorkspaceUIEvents(t, service, EventCursor{}, "workspace_api")
	defer subscription.Unsubscribe()

	saved, err := service.SaveLayout(testLayout("workspace_api"))
	if err != nil {
		t.Fatalf("save layout: %v", err)
	}
	event := receiveWorkspaceUIEvent(t, subscription)
	assertWorkspaceUILayoutEvent(t, event, WorkspaceUIEvent{
		SchemaVersion: EventSchemaVersion,
		StreamID:      workspaceUIEventHubTestStreamID,
		Sequence:      1,
		EventID:       workspaceUIEventHubTestStreamID + ":1",
		Type:          WorkspaceUIEventTypeLayoutUpdated,
		EmittedAt:     "2026-05-29T20:00:00Z",
		WorkspaceID:   "workspace_api",
		Revision:      1,
		Layout:        &saved,
		Resync:        nil,
	})

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation("Planning Chat"),
	})
	if err != nil {
		t.Fatalf("apply rename operation: %v", err)
	}
	event = receiveWorkspaceUIEvent(t, subscription)
	if event.Sequence != 2 || event.Revision != 2 || event.Layout == nil {
		t.Fatalf("operation event = %+v, want sequence 2 revision 2 with layout", event)
	}
	if event.Layout.Panes[0].Title != "Planning Chat" || !reflect.DeepEqual(*event.Layout, result.Layout) {
		t.Fatalf("operation event layout = %+v, want saved operation layout", event.Layout)
	}
}

func TestServiceDoesNotPublishWorkspaceUIEventForNoopPaneOperation(t *testing.T) {
	service := newEventTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	}, 4)
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	subscription := subscribeWorkspaceUIEvents(
		t,
		service,
		EventCursor{StreamID: workspaceUIEventHubTestStreamID, Sequence: 1},
		"workspace_api",
	)
	defer subscription.Unsubscribe()

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_1",
		Rename: renamePaneOperation("Terminal"),
	})
	if err != nil {
		t.Fatalf("apply noop rename operation: %v", err)
	}
	if result.Changed {
		t.Fatal("changed = true, want false")
	}
	assertNoWorkspaceUIEvent(t, subscription)
}

func TestServiceReplaysWorkspaceUILayoutEvents(t *testing.T) {
	service := newEventTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	}, 4)
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation("Planning Chat"),
	})
	if err != nil {
		t.Fatalf("apply rename operation: %v", err)
	}

	replay := subscribeWorkspaceUIEvents(
		t,
		service,
		EventCursor{StreamID: workspaceUIEventHubTestStreamID, Sequence: 1},
		"workspace_api",
	)
	defer replay.Unsubscribe()
	event := receiveWorkspaceUIEvent(t, replay)
	if event.Sequence != 2 || event.Revision != 2 || event.Layout == nil || event.Layout.Panes[0].Title != "Planning Chat" {
		t.Fatalf("replayed event = %+v, want second saved layout", event)
	}
	if !reflect.DeepEqual(*event.Layout, result.Layout) {
		t.Fatalf("replayed layout = %+v, want %+v", event.Layout, result.Layout)
	}
	assertNoWorkspaceUIEvent(t, replay)
}

func TestServiceFiltersWorkspaceUILayoutEventsByWorkspace(t *testing.T) {
	service := newEventTestService(t, t.TempDir(), testResolver{
		"workspace_api":   "/tmp/api",
		"workspace_other": "/tmp/other",
	}, 4)
	subscription := subscribeWorkspaceUIEvents(t, service, EventCursor{}, "workspace_api")
	defer subscription.Unsubscribe()

	if _, err := service.SaveLayout(testLayout("workspace_other")); err != nil {
		t.Fatalf("save other layout: %v", err)
	}
	assertNoWorkspaceUIEvent(t, subscription)

	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save target layout: %v", err)
	}
	event := receiveWorkspaceUIEvent(t, subscription)
	if event.WorkspaceID != "workspace_api" || event.Sequence != 2 {
		t.Fatalf("filtered event = %+v, want workspace_api sequence 2", event)
	}
}

func TestServiceResyncsStaleWorkspaceUIEventCursor(t *testing.T) {
	service := newEventTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	}, 1)
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	if _, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation("Planning Chat"),
	}); err != nil {
		t.Fatalf("apply rename operation: %v", err)
	}

	stale := subscribeWorkspaceUIEvents(
		t,
		service,
		EventCursor{StreamID: workspaceUIEventHubTestStreamID, Sequence: 0},
		"workspace_api",
	)
	defer stale.Unsubscribe()
	event := receiveWorkspaceUIEvent(t, stale)
	if event.Type != WorkspaceUIEventTypeResyncRequired || event.Layout != nil || event.Resync == nil {
		t.Fatalf("stale event = %+v, want resync without layout", event)
	}
	if event.Sequence != 3 || event.Revision != 2 || event.EventID != workspaceUIEventHubTestStreamID+":3" {
		t.Fatalf("resync identity = %+v, want sequence 3 revision 2", event)
	}
	assertWorkspaceUIResync(t, *event.Resync, WorkspaceUIResyncRequired{
		CurrentRevision:   2,
		CurrentSequence:   2,
		CurrentStreamID:   workspaceUIEventHubTestStreamID,
		EarliestSequence:  2,
		Reason:            "workspace UI layout replay is no longer available",
		RequestedSequence: 0,
		RequestedStreamID: workspaceUIEventHubTestStreamID,
	})
}

func TestServiceRejectsWorkspaceUIEventSubscriptionWithoutWorkspace(t *testing.T) {
	service := newEventTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	}, 4)

	if _, err := service.SubscribeEvents(EventCursor{}, ""); err == nil {
		t.Fatal("subscribe events succeeded, want workspace id error")
	}
}

func newEventTestService(t *testing.T, appDataDir string, resolver testResolver, bufferSize int) *Service {
	t.Helper()

	service, err := NewService(
		newTestStore(t, appDataDir),
		resolver,
		WithEventHub(newWorkspaceUIEventTestHub(t, bufferSize)),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func newWorkspaceUIEventTestHub(t *testing.T, bufferSize int) *EventHub {
	t.Helper()

	hub, err := NewEventHub(
		workspaceUIEventHubTestStreamID,
		WithEventBufferSize(bufferSize),
		WithEventClock(func() time.Time {
			return mustWorkspaceUIEventTestTime(t, "2026-05-29T20:00:00Z")
		}),
	)
	if err != nil {
		t.Fatalf("new event hub: %v", err)
	}
	return hub
}

func subscribeWorkspaceUIEvents(t *testing.T, service *Service, cursor EventCursor, workspaceID string) *EventSubscription {
	t.Helper()

	subscription, err := service.SubscribeEvents(cursor, workspaceID)
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	return subscription
}

func receiveWorkspaceUIEvent(t *testing.T, subscription *EventSubscription) WorkspaceUIEvent {
	t.Helper()

	select {
	case event, ok := <-subscription.Events:
		if !ok {
			t.Fatal("workspace UI event subscription closed")
		}
		return event
	default:
		t.Fatal("workspace UI event was not available")
		return WorkspaceUIEvent{}
	}
}

func assertNoWorkspaceUIEvent(t *testing.T, subscription *EventSubscription) {
	t.Helper()

	select {
	case event, ok := <-subscription.Events:
		if !ok {
			t.Fatal("workspace UI event subscription closed")
		}
		t.Fatalf("received workspace UI event %+v, want none", event)
	default:
	}
}

func assertWorkspaceUILayoutEvent(t *testing.T, got WorkspaceUIEvent, want WorkspaceUIEvent) {
	t.Helper()

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("workspace UI event = %+v, want %+v", got, want)
	}
}

func assertWorkspaceUIResync(t *testing.T, got WorkspaceUIResyncRequired, want WorkspaceUIResyncRequired) {
	t.Helper()

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("workspace UI resync = %+v, want %+v", got, want)
	}
}

func mustWorkspaceUIEventTestTime(t *testing.T, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("parse time: %v", err)
	}
	return parsed
}
