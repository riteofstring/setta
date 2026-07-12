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

func TestServiceProviderCommittedSteeringFailsOnAmbiguousText(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
		{Type: FakeEventWaitForSteer},
		{Type: FakeEventUserMessage, Text: "same steer"},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("A1"))
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")

	first, err := service.SteerActiveRunInput("workspace_api", conversation.ID, TextChatInput("same steer"))
	if err != nil {
		t.Fatalf("first steer active: %v", err)
	}
	second, err := service.SteerActiveRunInput("workspace_api", conversation.ID, TextChatInput("same steer"))
	if err != nil {
		t.Fatalf("second steer active: %v", err)
	}

	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusFailed)
	if !strings.Contains(run.Error, "matched 2 pending steering messages") {
		t.Fatalf("run error = %q, want ambiguous pending steering failure", run.Error)
	}
	for _, messageID := range []string{first.UserMessage.ID, second.UserMessage.ID} {
		message, err := service.store.LoadMessageByID("workspace_api", conversation.ID, messageID)
		if err != nil {
			t.Fatalf("load steering message %s: %v", messageID, err)
		}
		if message.Status != MessageStatusError {
			t.Fatalf("steering message %s status = %s, want error", messageID, message.Status)
		}
	}
	blocks := loadPersistedBlocks(t, service, "workspace_api", result.Run.ID)
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindUserMessage && block.UserMessage != nil && block.UserMessage.Delivery == MessageDeliverySteering {
			t.Fatalf("ambiguous steering was persisted as transcript block: %+v", block)
		}
	}
}

func TestServiceSteeringPersistsMessageAndCallsHarness(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("A1")); err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")

	result, err := service.SteerActiveRunInput("workspace_api", conversation.ID, TextChatInput("S1"))
	if err != nil {
		t.Fatalf("steer active: %v", err)
	}
	if result.UserMessage.Delivery != MessageDeliverySteering || result.UserMessage.Status != MessageStatusPending {
		t.Fatalf("steering message = %+v, want pending steering", result.UserMessage)
	}
	requests := harness.SteeringRequests()
	if len(requests) != 1 || chatInputText(requests[0].Input) != "S1" || requests[0].TurnID != "turn_fake" {
		t.Fatalf("steering requests = %+v, want S1 for active turn", requests)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	committed, err := service.store.LoadMessageByID("workspace_api", conversation.ID, result.UserMessage.ID)
	if err != nil {
		t.Fatalf("load steering message: %v", err)
	}
	if committed.Status != MessageStatusCancelled {
		t.Fatalf("uncommitted steering status = %s, want cancelled", committed.Status)
	}
	blocks := loadPersistedBlocks(t, service, "workspace_api", result.Run.ID)
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindUserMessage && block.UserMessage != nil && block.UserMessage.MessageID == result.UserMessage.ID {
			t.Fatalf("uncommitted steering was persisted as transcript block: %+v", block)
		}
	}
}
