package chat

import (
	"encoding/json"
	"testing"
	"time"
)

const eventHubTestStreamID = "event_stream_test"

func TestEventHubBroadcastsAndReplays(t *testing.T) {
	hub := newEventHubTestHub(t)
	active := subscribeEventHub(t, hub, EventCursor{})
	defer active.Unsubscribe()

	first := publishEventHubMessage(t, hub, "message_1", 1)
	second := publishEventHubMessage(t, hub, "message_2", 2)
	third := publishEventHubMessage(t, hub, "message_3", 3)
	assertEventSequences(t, active, []Event{first, second, third})

	replay := subscribeEventHub(t, hub, EventCursor{StreamID: eventHubTestStreamID, Sequence: 2})
	defer replay.Unsubscribe()
	if event := receiveEvent(t, replay); event.Sequence != third.Sequence {
		t.Fatalf("replayed event sequence = %d, want %d", event.Sequence, third.Sequence)
	}
}

func TestEventHubResyncIsSubscriptionLocal(t *testing.T) {
	hub := newEventHubTestHub(t)
	active := subscribeEventHub(t, hub, EventCursor{})
	defer active.Unsubscribe()
	first := publishEventHubMessage(t, hub, "message_1", 1)
	second := publishEventHubMessage(t, hub, "message_2", 2)
	third := publishEventHubMessage(t, hub, "message_3", 3)
	assertEventSequences(t, active, []Event{first, second, third})

	stale := subscribeEventHub(t, hub, EventCursor{StreamID: eventHubTestStreamID, Sequence: 0})
	defer stale.Unsubscribe()
	payload := requireResyncPayload(t, receiveEvent(t, stale))
	assertResyncPayload(t, payload, ResyncRequiredPayload{
		CurrentSequence:   third.Sequence,
		CurrentStreamID:   eventHubTestStreamID,
		EarliestSequence:  2,
		RequestedSequence: 0,
		RequestedStreamID: eventHubTestStreamID,
	})
	assertNoImmediateEvent(t, active)
}

func TestEventHubResyncsAfterStreamMismatch(t *testing.T) {
	hub := newEventHubTestHub(t)
	restarted := subscribeEventHub(t, hub, EventCursor{StreamID: "event_stream_previous", Sequence: 99})
	defer restarted.Unsubscribe()
	payload := requireResyncPayload(t, receiveEvent(t, restarted))
	assertResyncPayload(t, payload, ResyncRequiredPayload{
		CurrentSequence:   0,
		CurrentStreamID:   eventHubTestStreamID,
		EarliestSequence:  0,
		RequestedSequence: 99,
		RequestedStreamID: "event_stream_previous",
	})
}

func TestEventHubClosedSubscriptionReportsSourceClosed(t *testing.T) {
	hub := newEventHubTestHub(t)
	hub.Close()

	subscription := subscribeEventHub(t, hub, EventCursor{})
	defer subscription.Unsubscribe()
	if !subscription.SourceClosed() {
		t.Fatal("closed hub subscription did not report source closure")
	}
	select {
	case _, ok := <-subscription.Events:
		if ok {
			t.Fatal("closed hub subscription yielded an event")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("closed hub subscription did not close its event channel")
	}
}

func TestServicePublishesTurnLifecycleEvents(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventAssistantDelta, Text: "hello"},
	}))
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("stream"))
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
		subscription, err := service.SubscribeEvents(EventCursor{})
		if err != nil {
			t.Fatalf("subscribe events: %v", err)
		}
		defer subscription.Unsubscribe()
		conversation, err := service.CreateConversation("workspace_api", "")
		if err != nil {
			t.Fatalf("create conversation: %v", err)
		}
		if _, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("approval")); err != nil {
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
			return payload.Run.PendingApproval != nil
		})
		requireEventType(t, events, EventTypeRunUpdated)
		submitted, err := service.SubmitApproval("workspace_api", conversation.ID, run.PendingApproval.ID, true, "", nil, false)
		if err != nil {
			t.Fatalf("submit approval: %v", err)
		}
		waitForRunStatus(t, service, "workspace_api", conversation.ID, submitted.ID, RunStatusCompleted)
		receiveEventsUntil(t, subscription, func(event Event) bool {
			return event.Type == EventTypeConversationUpdated && event.RunID == submitted.ID
		})
	})

	t.Run("cancellation", func(t *testing.T) {
		service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}}))
		subscription, err := service.SubscribeEvents(EventCursor{})
		if err != nil {
			t.Fatalf("subscribe events: %v", err)
		}
		defer subscription.Unsubscribe()
		conversation, err := service.CreateConversation("workspace_api", "")
		if err != nil {
			t.Fatalf("create conversation: %v", err)
		}
		if _, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("cancel")); err != nil {
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
		subscription, err := service.SubscribeEvents(EventCursor{})
		if err != nil {
			t.Fatalf("subscribe events: %v", err)
		}
		defer subscription.Unsubscribe()
		conversation, err := service.CreateConversation("workspace_api", "")
		if err != nil {
			t.Fatalf("create conversation: %v", err)
		}
		result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("fail"))
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

func newEventHubTestHub(t *testing.T) *EventHub {
	t.Helper()

	hub, err := NewEventHub(
		eventHubTestStreamID,
		WithEventBufferSize(2),
		WithEventClock(func() time.Time {
			return mustTime(t, "2026-05-29T20:00:00Z")
		}),
	)
	if err != nil {
		t.Fatalf("new event hub: %v", err)
	}
	return hub
}

func subscribeEventHub(t *testing.T, hub *EventHub, cursor EventCursor) *EventSubscription {
	t.Helper()

	subscription, err := hub.Subscribe(cursor)
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	return subscription
}

func publishEventHubMessage(t *testing.T, hub *EventHub, messageID string, ordinal int) Event {
	t.Helper()

	event, err := hub.Publish(NewMessageCreatedEvent("workspace_api", "conversation_api", "run_api", eventTestMessage(messageID, ordinal)))
	if err != nil {
		t.Fatalf("publish event: %v", err)
	}
	return event
}

func assertEventSequences(t *testing.T, subscription *EventSubscription, want []Event) {
	t.Helper()

	for _, expected := range want {
		if event := receiveEvent(t, subscription); event.Sequence != expected.Sequence {
			t.Fatalf("event sequence = %d, want %d", event.Sequence, expected.Sequence)
		}
	}
}

func requireResyncPayload(t *testing.T, event Event) ResyncRequiredPayload {
	t.Helper()

	if event.Type != EventTypeResyncRequired {
		t.Fatalf("event type = %q, want %q", event.Type, EventTypeResyncRequired)
	}
	var payload ResyncRequiredPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode resync payload: %v", err)
	}
	return payload
}

func assertResyncPayload(t *testing.T, payload ResyncRequiredPayload, want ResyncRequiredPayload) {
	t.Helper()

	got := ResyncRequiredPayload{
		CurrentSequence:   payload.CurrentSequence,
		CurrentStreamID:   payload.CurrentStreamID,
		EarliestSequence:  payload.EarliestSequence,
		RequestedSequence: payload.RequestedSequence,
		RequestedStreamID: payload.RequestedStreamID,
	}
	if got != want {
		t.Fatalf("resync payload = %+v, want %+v", got, want)
	}
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

func assertNoImmediateEvent(t *testing.T, subscription *EventSubscription) {
	t.Helper()

	select {
	case event, ok := <-subscription.Events:
		if !ok {
			t.Fatal("event subscription closed")
		}
		t.Fatalf("received unexpected event %+v", event)
	default:
	}
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
			ID:   id + "_part",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "hello",
				Format: TextFormatPlain,
			},
		}},
		Delivery:      MessageDeliveryNormal,
		Role:          RoleUser,
		RunID:         "",
		SchemaVersion: SchemaVersion,
		Status:        MessageStatusComplete,
		UpdatedAt:     "2026-05-29T20:00:00Z",
	}
}
