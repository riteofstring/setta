package easyrun

import (
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
)

func TestServiceSteerForwardsTextToBackingHiddenRun(t *testing.T) {
	steeringText := "keep every detail\nand preserve spacing inside"
	harness := chat.NewFakeHarnessByPrompt(map[string][]chat.FakeHarnessEvent{
		"wait for steering": {
			{
				Type:      chat.FakeEventThreadLinked,
				ThreadID:  "thread_easy",
				SessionID: "session_easy",
				TurnID:    "turn_easy",
			},
			{Type: chat.FakeEventWaitForSteer},
			{Type: chat.FakeEventUserMessage, Text: steeringText},
			{Type: chat.FakeEventWaitForCancel},
		},
	})
	service, chatService := newTestServiceWithChat(t, harness)

	started, err := service.Start("workspace_api", "wait for steering")
	if err != nil {
		t.Fatalf("start easy-run: %v", err)
	}
	working := waitForEasyRunStatus(t, service, "workspace_api", started.ID, EasyRunStatusWorking)
	waitForEasyRunHarnessRef(t, chatService, "workspace_api", working.ConversationID, "turn_easy")

	steered, err := service.Steer("workspace_api", "  "+steeringText+"  ")
	if err != nil {
		t.Fatalf("steer easy-run: %v", err)
	}
	if steered.ID != working.ID || steered.Status != EasyRunStatusWorking {
		t.Fatalf("steered run = %+v, want current working run %s", steered, working.ID)
	}
	requests := harness.SteeringRequests()
	if len(requests) != 1 || chatInputTextForTest(requests[0].Input) != steeringText || requests[0].RunID == "" {
		t.Fatalf("steering requests = %+v, want shared-normalized text for backing run", requests)
	}
	message := waitForPersistedSteeringMessage(t, chatService, steered, requests[0].RunID, steeringText)
	assertPersistedSteeringTranscript(t, chatService, steered, message, steeringText)

	snapshot, err := service.ReadSnapshot("workspace_api")
	if err != nil {
		t.Fatalf("read steered snapshot: %v", err)
	}
	if snapshot.LatestRun == nil || snapshot.LatestRun.ID != steered.ID {
		t.Fatalf("steered snapshot run = %+v, want %s", snapshot.LatestRun, steered.ID)
	}
	assertRevisionZeroCurrentFocus(t, *snapshot.LatestRun, "wait for steering")
	if len(snapshot.Highlights) != 0 {
		t.Fatalf("steering highlights = %+v, want NOW to remain narrator-only", snapshot.Highlights)
	}

	stopped, err := service.Stop("workspace_api", steered.ID)
	if err != nil {
		t.Fatalf("stop steered easy-run: %v", err)
	}
	if stopped.Status != EasyRunStatusStopped {
		stopped = waitForEasyRunStatus(t, service, "workspace_api", steered.ID, EasyRunStatusStopped)
	}

	page, err := chatService.LoadMessagePage("workspace_api", stopped.ConversationID, 0, 20)
	if err != nil {
		t.Fatalf("load hidden message page: %v", err)
	}
	assertHiddenEasyRunConversation(t, page.Conversation, started.ID)
}

func TestAcceptedEasyRunSteeringRetainsPersistedChatMessage(t *testing.T) {
	run := testRun("easy_run_accepted_steering")
	message := chat.ChatMessage{
		ConversationID: run.ConversationID,
		Delivery:       chat.MessageDeliverySteering,
		ID:             "message_accepted_steering",
		Parts: []chat.MessagePart{{
			ID:   "part_accepted_steering",
			Type: chat.MessagePartText,
			Text: &chat.MessageTextPart{Format: chat.TextFormatPlain, Text: "Keep the exact accepted text."},
		}},
		Role:   chat.RoleUser,
		RunID:  "run_accepted_steering",
		Status: chat.MessageStatusPending,
	}
	result := chat.SteerMessageResult{
		Conversation: chat.Conversation{ID: run.ConversationID, WorkspaceID: run.WorkspaceID},
		Run: chat.Run{
			ConversationID: run.ConversationID,
			ID:             message.RunID,
			WorkspaceID:    run.WorkspaceID,
		},
		UserMessage: message,
	}

	accepted, err := acceptedEasyRunSteeringFromChatResult(run, message.RunID, result)
	if err != nil {
		t.Fatalf("capture accepted steering: %v", err)
	}
	if accepted.run.ID != run.ID || accepted.userMessage.ID != message.ID || accepted.text != "Keep the exact accepted text." {
		t.Fatalf("accepted steering = %+v, want intact run, persisted message, and exact text", accepted)
	}
}

func TestServiceSteerRejectsWithoutActiveRun(t *testing.T) {
	service, _ := newTestServiceWithChat(t, chat.NewFakeHarness(nil))

	_, err := service.Steer("workspace_api", "keep going")
	if err == nil || !strings.Contains(err.Error(), "no active easy-run") {
		t.Fatalf("steer without active run error = %v, want active-run rejection", err)
	}

	_, err = service.Steer("workspace_api", "   ")
	if err == nil || !strings.Contains(err.Error(), "steering text is required") {
		t.Fatalf("empty steering error = %v, want text validation", err)
	}
}

func waitForPersistedSteeringMessage(t *testing.T, chatService *chat.Service, run EasyRun, backingRunID string, text string) chat.ChatMessage {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		page, err := chatService.LoadMessagePage(run.WorkspaceID, run.ConversationID, 0, 20)
		if err != nil {
			t.Fatalf("load hidden steering page: %v", err)
		}
		for _, message := range page.Messages {
			if message.Delivery != chat.MessageDeliverySteering || chatMessageTextForTest(message) != text {
				continue
			}
			if message.Role != chat.RoleUser || message.RunID != backingRunID || message.Status != chat.MessageStatusComplete {
				t.Fatalf("persisted steering message = %+v, want complete user steering for %s", message, backingRunID)
			}
			return message
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for persisted steering text %q", text)
	return chat.ChatMessage{}
}

func assertPersistedSteeringTranscript(t *testing.T, chatService *chat.Service, run EasyRun, message chat.ChatMessage, text string) {
	t.Helper()
	page, err := chatService.LoadMessagePage(run.WorkspaceID, run.ConversationID, 0, 20)
	if err != nil {
		t.Fatalf("load hidden steering transcript: %v", err)
	}
	for _, block := range page.Blocks {
		if block.UserMessage == nil || block.UserMessage.MessageID != message.ID {
			continue
		}
		if block.Kind != chat.TranscriptBlockKindUserMessage ||
			block.UserMessage.Role != chat.RoleUser ||
			block.UserMessage.Delivery != chat.MessageDeliverySteering ||
			block.UserMessage.Status != chat.MessageStatusComplete ||
			messagePartsTextForTest(block.UserMessage.Parts) != text {
			t.Fatalf("persisted steering block = %+v, want exact complete steering message", block)
		}
		return
	}
	t.Fatalf("hidden transcript does not contain steering message %s", message.ID)
}

func chatInputTextForTest(input chat.ChatInput) string {
	parts := make([]string, 0, len(input.Parts))
	for _, part := range input.Parts {
		if part.Type == chat.MessagePartText && part.Text != nil {
			parts = append(parts, part.Text.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func chatMessageTextForTest(message chat.ChatMessage) string {
	return messagePartsTextForTest(message.Parts)
}

func messagePartsTextForTest(parts []chat.MessagePart) string {
	texts := make([]string, 0, len(parts))
	for _, part := range parts {
		if part.Type == chat.MessagePartText && part.Text != nil {
			texts = append(texts, part.Text.Text)
		}
	}
	return strings.Join(texts, "\n")
}
