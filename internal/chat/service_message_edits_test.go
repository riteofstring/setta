package chat

import (
	"encoding/json"
	"testing"
)

func TestServiceUpdateUserMessagePersistsAndPublishesUpdate(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "before edit")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()

	updated, err := service.UpdateUserMessage("workspace_api", conversation.ID, result.UserMessage.ID, "after edit")
	if err != nil {
		t.Fatalf("update user message: %v", err)
	}
	if got := updated.Parts[0].Text; got != "after edit" {
		t.Fatalf("updated message text = %q, want after edit", got)
	}
	stored, err := service.store.LoadMessageByID("workspace_api", conversation.ID, result.UserMessage.ID)
	if err != nil {
		t.Fatalf("load updated message: %v", err)
	}
	if got := stored.Parts[0].Text; got != "after edit" {
		t.Fatalf("stored message text = %q, want after edit", got)
	}
	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeMessageUpdated || event.ConversationID != conversation.ID {
			return false
		}
		var payload MessageUpdatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			t.Fatalf("decode message updated event: %v", err)
		}
		return payload.Message.ID == result.UserMessage.ID
	})
	updatedEvent := events[len(events)-1]
	var payload MessageUpdatedPayload
	if err := json.Unmarshal(updatedEvent.Payload, &payload); err != nil {
		t.Fatalf("decode message updated event: %v", err)
	}
	if got := payload.Message.Parts[0].Text; got != "after edit" {
		t.Fatalf("event message text = %q, want after edit", got)
	}
}
