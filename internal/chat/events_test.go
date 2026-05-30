package chat

import (
	"encoding/json"
	"testing"
	"time"
)

func TestEventHubBroadcastsReplaysAndReportsResync(t *testing.T) {
	hub := NewEventHub(
		WithEventBufferSize(2),
		WithEventClock(func() time.Time {
			return mustTime(t, "2026-05-29T20:00:00Z")
		}),
	)
	active, err := hub.Subscribe(0)
	if err != nil {
		t.Fatalf("subscribe active: %v", err)
	}
	defer active.Unsubscribe()

	first, err := hub.Publish(NewMessageCreatedEvent("workspace_api", "conversation_api", "run_api", eventTestMessage("message_1", 1)))
	if err != nil {
		t.Fatalf("publish first event: %v", err)
	}
	if event := receiveEvent(t, active); event.Sequence != first.Sequence {
		t.Fatalf("active event sequence = %d, want %d", event.Sequence, first.Sequence)
	}
	if _, err := hub.Publish(NewMessageCreatedEvent("workspace_api", "conversation_api", "run_api", eventTestMessage("message_2", 2))); err != nil {
		t.Fatalf("publish second event: %v", err)
	}
	third, err := hub.Publish(NewMessageCreatedEvent("workspace_api", "conversation_api", "run_api", eventTestMessage("message_3", 3)))
	if err != nil {
		t.Fatalf("publish third event: %v", err)
	}

	replay, err := hub.Subscribe(2)
	if err != nil {
		t.Fatalf("subscribe replay: %v", err)
	}
	defer replay.Unsubscribe()
	if event := receiveEvent(t, replay); event.Sequence != third.Sequence {
		t.Fatalf("replayed event sequence = %d, want %d", event.Sequence, third.Sequence)
	}

	stale, err := hub.Subscribe(0)
	if err != nil {
		t.Fatalf("subscribe stale: %v", err)
	}
	defer stale.Unsubscribe()
	resync := receiveEvent(t, stale)
	if resync.Type != EventTypeResyncRequired {
		t.Fatalf("stale replay event type = %q, want %q", resync.Type, EventTypeResyncRequired)
	}
	var payload ResyncRequiredPayload
	if err := json.Unmarshal(resync.Payload, &payload); err != nil {
		t.Fatalf("decode resync payload: %v", err)
	}
	if payload.RequestedSequence != 0 || payload.EarliestSequence != 2 {
		t.Fatalf("resync payload = %+v, want requested 0 earliest 2", payload)
	}

	restarted, err := hub.Subscribe(99)
	if err != nil {
		t.Fatalf("subscribe after backend restart sequence: %v", err)
	}
	defer restarted.Unsubscribe()
	if event := receiveEvent(t, restarted); event.Type != EventTypeResyncRequired {
		t.Fatalf("restart replay event type = %q, want %q", event.Type, EventTypeResyncRequired)
	}
}

func TestServicePublishesTurnLifecycleEvents(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventAssistantDelta, Text: "hello"},
	}))
	subscription, err := service.SubscribeEvents(0)
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "stream")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		return event.Type == EventTypeMessageUpdated
	})
	requireEventType(t, events, EventTypeConversationUpdated)
	requireEventType(t, events, EventTypeMessageCreated)
	requireEventType(t, events, EventTypeAssistantTextDelta)
	requireEventType(t, events, EventTypeRunUpdated)
	updated := requireEventType(t, events, EventTypeMessageUpdated)
	var payload MessageUpdatedPayload
	if err := json.Unmarshal(updated.Payload, &payload); err != nil {
		t.Fatalf("decode message update payload: %v", err)
	}
	if payload.Message.Status != MessageStatusComplete {
		t.Fatalf("updated message status = %q, want complete", payload.Message.Status)
	}
}

func TestServicePublishesApprovalCancellationAndFailureEvents(t *testing.T) {
	t.Run("approval", func(t *testing.T) {
		service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
			{Type: FakeEventApproval, Approval: ApprovalRequest{Kind: ApprovalKindCommand, Title: "Run command"}, WaitForApproval: true},
		}))
		subscription, err := service.SubscribeEvents(0)
		if err != nil {
			t.Fatalf("subscribe events: %v", err)
		}
		defer subscription.Unsubscribe()
		conversation, err := service.CreateConversation("workspace_api", "")
		if err != nil {
			t.Fatalf("create conversation: %v", err)
		}
		if _, err := service.SendUserMessage("workspace_api", conversation.ID, "approval"); err != nil {
			t.Fatalf("send message: %v", err)
		}
		run := waitForPendingApproval(t, service, "workspace_api", conversation.ID)
		events := receiveEventsUntil(t, subscription, func(event Event) bool {
			if event.Type != EventTypeRunUpdated {
				return false
			}
			var payload RunUpdatedPayload
			if err := json.Unmarshal(event.Payload, &payload); err != nil {
				t.Fatalf("decode run update payload: %v", err)
			}
			return payload.Run.HasPendingApproval
		})
		requireEventType(t, events, EventTypeRunUpdated)
		submitted, err := service.SubmitApproval("workspace_api", conversation.ID, run.PendingApproval.ID, true, "", nil, false)
		if err != nil {
			t.Fatalf("submit approval: %v", err)
		}
		waitForRunStatus(t, service, "workspace_api", conversation.ID, submitted.ID, RunStatusCompleted)
	})

	t.Run("cancellation", func(t *testing.T) {
		service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}}))
		subscription, err := service.SubscribeEvents(0)
		if err != nil {
			t.Fatalf("subscribe events: %v", err)
		}
		defer subscription.Unsubscribe()
		conversation, err := service.CreateConversation("workspace_api", "")
		if err != nil {
			t.Fatalf("create conversation: %v", err)
		}
		if _, err := service.SendUserMessage("workspace_api", conversation.ID, "cancel"); err != nil {
			t.Fatalf("send message: %v", err)
		}
		if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
			t.Fatalf("cancel active run: %v", err)
		}
		events := receiveEventsUntil(t, subscription, func(event Event) bool {
			return event.Type == EventTypeMessageUpdated
		})
		updated := requireEventType(t, events, EventTypeMessageUpdated)
		var payload MessageUpdatedPayload
		if err := json.Unmarshal(updated.Payload, &payload); err != nil {
			t.Fatalf("decode cancellation message payload: %v", err)
		}
		if payload.Message.Status != MessageStatusCancelled {
			t.Fatalf("cancelled message status = %q, want cancelled", payload.Message.Status)
		}
	})

	t.Run("failure", func(t *testing.T) {
		service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventError, Error: "codex failed"}}))
		subscription, err := service.SubscribeEvents(0)
		if err != nil {
			t.Fatalf("subscribe events: %v", err)
		}
		defer subscription.Unsubscribe()
		conversation, err := service.CreateConversation("workspace_api", "")
		if err != nil {
			t.Fatalf("create conversation: %v", err)
		}
		result, err := service.SendUserMessage("workspace_api", conversation.ID, "fail")
		if err != nil {
			t.Fatalf("send message: %v", err)
		}
		waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusFailed)
		events := receiveEventsUntil(t, subscription, func(event Event) bool {
			return event.Type == EventTypeMessageUpdated
		})
		updated := requireEventType(t, events, EventTypeMessageUpdated)
		var payload MessageUpdatedPayload
		if err := json.Unmarshal(updated.Payload, &payload); err != nil {
			t.Fatalf("decode failed message payload: %v", err)
		}
		if payload.Message.Status != MessageStatusError {
			t.Fatalf("failed message status = %q, want error", payload.Message.Status)
		}
	})
}

func receiveEvent(t *testing.T, subscription *EventSubscription) Event {
	t.Helper()

	select {
	case event, ok := <-subscription.Events:
		if !ok {
			t.Fatal("event subscription closed")
		}
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for chat event")
	}
	return Event{}
}

func receiveEventsUntil(t *testing.T, subscription *EventSubscription, done func(Event) bool) []Event {
	t.Helper()

	deadline := time.After(2 * time.Second)
	events := []Event{}
	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				t.Fatal("event subscription closed")
			}
			events = append(events, event)
			if done(event) {
				return events
			}
		case <-deadline:
			t.Fatalf("timed out waiting for chat event; got %v", eventTypes(events))
		}
	}
}

func requireEventType(t *testing.T, events []Event, eventType string) Event {
	t.Helper()

	for _, event := range events {
		if event.Type == eventType {
			return event
		}
	}
	t.Fatalf("events = %v, want %s", eventTypes(events), eventType)
	return Event{}
}

func eventTypes(events []Event) []string {
	types := make([]string, 0, len(events))
	for _, event := range events {
		types = append(types, event.Type)
	}
	return types
}

func eventTestMessage(id string, ordinal int) ChatMessage {
	return ChatMessage{
		ConversationID: "conversation_api",
		CreatedAt:      "2026-05-29T20:00:00Z",
		ID:             id,
		Ordinal:        ordinal,
		Parts: []MessagePart{{
			Format: TextFormatPlain,
			ID:     id + "_part",
			Text:   "hello",
			Type:   MessagePartText,
		}},
		Role:          RoleUser,
		RunID:         "",
		SchemaVersion: SchemaVersion,
		Status:        MessageStatusComplete,
		UpdatedAt:     "2026-05-29T20:00:00Z",
	}
}
