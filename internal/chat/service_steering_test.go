package chat

import (
	"strings"
	"testing"
)

func TestServiceSteerActiveRunByIDRejectsDifferentActiveRunBeforeProviderSteer(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("exact steer run"))
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")

	_, err = service.SteerActiveRunInputByID("workspace_api", conversation.ID, "run_other", TextChatInput("wrong"))
	if err == nil || !strings.Contains(err.Error(), "does not match requested run run_other") {
		t.Fatalf("steer wrong run error = %v, want exact-run mismatch", err)
	}
	if requests := harness.SteeringRequests(); len(requests) != 0 {
		t.Fatalf("provider steering requests = %+v, want none for wrong run id", requests)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load message page: %v", err)
	}
	for _, message := range page.Messages {
		if message.Delivery == MessageDeliverySteering {
			t.Fatalf("unexpected steering message persisted for wrong run: %+v", message)
		}
	}

	steered, err := service.SteerActiveRunInputByID("workspace_api", conversation.ID, result.Run.ID, TextChatInput("right"))
	if err != nil {
		t.Fatalf("steer exact run: %v", err)
	}
	if steered.Run.ID != result.Run.ID || steered.UserMessage.Delivery != MessageDeliverySteering {
		t.Fatalf("steered result = %+v, want steering for %s", steered, result.Run.ID)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
}
