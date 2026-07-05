package chat

import (
	"strings"
	"testing"
	"time"
)

func TestServiceEditsQueuedMessageAndUsesEditedTextOnPromotion(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("A1"))
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")
	queued, err := service.QueueUserInput("workspace_api", conversation.ID, TextChatInput("Q1"))
	if err != nil {
		t.Fatalf("queue q1: %v", err)
	}

	edited, err := service.EditQueuedInput("workspace_api", conversation.ID, queued.UserMessage.ID, TextChatInput("Q1 edited"))
	if err != nil {
		t.Fatalf("edit queued: %v", err)
	}
	if promptFromMessage(edited.UserMessage) != "Q1 edited" || edited.Run.PromptSummary != "Q1 edited" {
		t.Fatalf("edited result = %q/%q, want Q1 edited", promptFromMessage(edited.UserMessage), edited.Run.PromptSummary)
	}

	steerWhenReady(t, service, "workspace_api", conversation.ID, "finish A1")
	waitForRunStatus(t, service, "workspace_api", conversation.ID, active.Run.ID, RunStatusCompleted)
	promoted := waitForRunStatus(t, service, "workspace_api", conversation.ID, queued.Run.ID, RunStatusRunning)
	if promoted.PromptSummary != "Q1 edited" {
		t.Fatalf("promoted prompt summary = %q, want edited text", promoted.PromptSummary)
	}
	requests := harness.TurnRequests()
	if len(requests) != 2 {
		t.Fatalf("harness requests = %+v, want active and promoted queued turns", requests)
	}
	promotedRequest := requests[1].Run
	if promotedRequest.ID != promoted.ID ||
		promotedRequest.Status != RunStatusRunning ||
		promotedRequest.AssistantMessageID != promoted.AssistantMessageID ||
		promotedRequest.StartedAt != promoted.StartedAt {
		t.Fatalf("promoted harness run = %+v, want committed promoted run %+v", promotedRequest, promoted)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if got := promptForMessageID(page.Messages, queued.UserMessage.ID); got != "Q1 edited" {
		t.Fatalf("promoted queued message text = %q, want edited text", got)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel promoted run cleanup: %v", err)
	}
}

func TestServiceDoesNotPromoteQueuedImageWhenCurrentModelRejectsImages(t *testing.T) {
	settings, err := fakeCodexEffectiveSettings("scripted-fast", ReasoningEffortMedium)
	if err != nil {
		t.Fatalf("fake settings: %v", err)
	}
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake", CodexEffectiveSettings: settings},
		{Type: FakeEventWaitForSteer},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("A1"))
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")
	attachment, err := service.CreateImageAttachmentFromBytes("workspace_api", conversation.ID, "fixture.png", testPNG(t, 1, 1))
	if err != nil {
		t.Fatalf("create attachment: %v", err)
	}
	queued, err := service.QueueUserInput("workspace_api", conversation.ID, ChatInput{Parts: []ChatInputPart{
		{Type: MessagePartImage, Image: &ChatImageInput{AttachmentID: attachment.ID}},
	}})
	if err != nil {
		t.Fatalf("queue image input: %v", err)
	}
	conversation, err = service.store.LoadConversation("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load conversation: %v", err)
	}
	if conversation.CodexEffectiveSettings == nil {
		t.Fatalf("conversation effective settings missing after linked active run")
	}
	conversation.CodexEffectiveSettings.SupportsImages = false
	conversation.CodexEffectiveSettings.ModelDisplayName = "Text Only"
	if err := service.store.SaveConversation(conversation); err != nil {
		t.Fatalf("save text-only effective settings: %v", err)
	}

	steerWhenReady(t, service, "workspace_api", conversation.ID, "finish A1")
	waitForRunStatus(t, service, "workspace_api", conversation.ID, active.Run.ID, RunStatusCompleted)
	run, err := service.store.LoadRun("workspace_api", queued.Run.ID)
	if err != nil {
		t.Fatalf("load queued run: %v", err)
	}
	if run.Status != RunStatusQueued {
		t.Fatalf("queued image run status = %s, want queued", run.Status)
	}
}

func TestServiceRejectsQueuedEditAfterPromotion(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("A1"))
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")
	queued, err := service.QueueUserInput("workspace_api", conversation.ID, TextChatInput("Q1"))
	if err != nil {
		t.Fatalf("queue q1: %v", err)
	}
	steerWhenReady(t, service, "workspace_api", conversation.ID, "finish A1")
	waitForRunStatus(t, service, "workspace_api", conversation.ID, active.Run.ID, RunStatusCompleted)
	waitForRunStatus(t, service, "workspace_api", conversation.ID, queued.Run.ID, RunStatusRunning)

	_, err = service.EditQueuedInput("workspace_api", conversation.ID, queued.UserMessage.ID, TextChatInput("too late"))
	if operationErr, ok := IsChatOperationError(err); !ok || operationErr.Code != ChatOperationErrorQueuedMessageConflict {
		t.Fatalf("edit error = %v, want queued message conflict", err)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel promoted run cleanup: %v", err)
	}
}

func TestServiceRemovesFirstQueuedMessageAndPromotesNextWhenIdle(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	first := serviceTestQueuedTurn("run_q1", "message_q1", conversation, 1, "Q1")
	second := serviceTestQueuedTurn("run_q2", "message_q2", conversation, 2, "Q2")
	if _, err := service.store.CreateQueuedTurn(first); err != nil {
		t.Fatalf("create first queued turn: %v", err)
	}
	if _, err := service.store.CreateQueuedTurn(second); err != nil {
		t.Fatalf("create second queued turn: %v", err)
	}

	removed, err := service.RemoveQueuedMessage("workspace_api", conversation.ID, first.UserMessage.ID)
	if err != nil {
		t.Fatalf("remove queued: %v", err)
	}
	if removed.RemovedMessageID != first.UserMessage.ID || removed.RemovedRunID != first.Run.ID {
		t.Fatalf("removed result = %+v, want first queued ids", removed)
	}
	promoted := waitForRunStatus(t, service, "workspace_api", conversation.ID, second.Run.ID, RunStatusRunning)
	if promoted.TriggerMessageID != second.UserMessage.ID {
		t.Fatalf("promoted run trigger = %q, want second queued message", promoted.TriggerMessageID)
	}
	if _, ok, err := service.store.FindMessageByID("workspace_api", conversation.ID, first.UserMessage.ID); err != nil || ok {
		t.Fatalf("removed message lookup = ok %v err %v, want not found", ok, err)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel promoted run cleanup: %v", err)
	}
}

func TestServiceSendSteeringImmediatelyReplaysPendingSteering(t *testing.T) {
	harness := NewFakeHarnessByPrompt(map[string][]FakeHarnessEvent{
		"A1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_active", SessionID: "session_fake", TurnID: "turn_active"},
			{Type: FakeEventWaitForCancel},
		},
		"S1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_replay", SessionID: "session_fake", TurnID: "turn_replay"},
			{Type: FakeEventWaitForCancel},
		},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("A1"))
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_active")
	steered, err := service.SteerActiveRunInput("workspace_api", conversation.ID, TextChatInput("S1"))
	if err != nil {
		t.Fatalf("steer active: %v", err)
	}

	result, err := service.SendSteeringInputImmediately("workspace_api", conversation.ID, nil)
	if err != nil {
		t.Fatalf("send steering immediately: %v", err)
	}
	if result.CancelledRun.ID != active.Run.ID || result.CancelledRun.Status != RunStatusCancelled {
		t.Fatalf("cancelled run = %+v, want active run cancelled", result.CancelledRun)
	}
	if len(result.ReplayedSteeringMessageIDs) != 1 || result.ReplayedSteeringMessageIDs[0] != steered.UserMessage.ID {
		t.Fatalf("replayed ids = %+v, want %s", result.ReplayedSteeringMessageIDs, steered.UserMessage.ID)
	}
	if result.ActiveRun.Status != RunStatusRunning || result.ActiveRun.TriggerMessageID == steered.UserMessage.ID {
		t.Fatalf("active replay run = %+v, want new running run", result.ActiveRun)
	}
	if _, ok, err := service.store.FindMessageByID("workspace_api", conversation.ID, steered.UserMessage.ID); err != nil || ok {
		t.Fatalf("steering message lookup = ok %v err %v, want removed", ok, err)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if got := promptForRunID(page.Messages, result.ActiveRun.ID); got != "S1" {
		t.Fatalf("replay prompt = %q, want S1", got)
	}
	cancelled := harness.CancelledRequests()
	if len(cancelled) != 1 || cancelled[0].RunID != active.Run.ID {
		t.Fatalf("cancel requests = %+v, want active run cancel", cancelled)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel replay cleanup: %v", err)
	}
}

func TestServiceSendSteeringImmediatelyRejectsMergedImageCapBeforeCancel(t *testing.T) {
	harness := NewFakeHarnessByPrompt(map[string][]FakeHarnessEvent{
		"A1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_active", SessionID: "session_fake", TurnID: "turn_active"},
			{Type: FakeEventWaitForCancel},
		},
	})
	harness.model = "scripted-fast"
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("A1"))
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_active")
	for index := 0; index < maxImageAttachmentsPerMessage+1; index++ {
		attachment, err := service.CreateImageAttachmentFromBytes("workspace_api", conversation.ID, "fixture.png", testPNG(t, 1, 1))
		if err != nil {
			t.Fatalf("create attachment %d: %v", index, err)
		}
		message, err := service.newUserMessage("workspace_api", conversation.ID, active.Run.ID, ChatInput{Parts: []ChatInputPart{{
			Type:  MessagePartImage,
			Image: &ChatImageInput{AttachmentID: attachment.ID},
		}}}, MessageDeliverySteering, MessageStatusPending, timestamp(service.now()))
		if err != nil {
			t.Fatalf("create steering image %d: %v", index, err)
		}
		if err := service.store.SaveMessage("workspace_api", message); err != nil {
			t.Fatalf("save steering image %d: %v", index, err)
		}
	}

	_, err = service.SendSteeringInputImmediately("workspace_api", conversation.ID, nil)
	if err == nil || !strings.Contains(err.Error(), "maximum is 10") {
		t.Fatalf("send immediate error = %v, want merged image cap error", err)
	}
	if cancelled := harness.CancelledRequests(); len(cancelled) != 0 {
		t.Fatalf("cancel requests = %+v, want none before replay validation", cancelled)
	}
	run, err := service.store.LoadRun("workspace_api", active.Run.ID)
	if err != nil {
		t.Fatalf("load active run: %v", err)
	}
	if run.Status != RunStatusRunning {
		t.Fatalf("active run status = %s, want running", run.Status)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run cleanup: %v", err)
	}
}

func TestServiceSendSteeringImmediatelyPreservesQueuedWorkBehindReplay(t *testing.T) {
	harness := NewFakeHarnessByPrompt(map[string][]FakeHarnessEvent{
		"A1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_active", SessionID: "session_fake", TurnID: "turn_active"},
			{Type: FakeEventWaitForCancel},
		},
		"S1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_replay", SessionID: "session_fake", TurnID: "turn_replay"},
			{Type: FakeEventWaitForSteer},
		},
		"Q1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_queued", SessionID: "session_fake", TurnID: "turn_queued"},
			{Type: FakeEventWaitForCancel},
		},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("A1")); err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_active")
	queued, err := service.QueueUserInput("workspace_api", conversation.ID, TextChatInput("Q1"))
	if err != nil {
		t.Fatalf("queue q1: %v", err)
	}

	input := TextChatInput("S1")
	result, err := service.SendSteeringInputImmediately("workspace_api", conversation.ID, &input)
	if err != nil {
		t.Fatalf("send steering immediately: %v", err)
	}
	queuedRun, err := service.store.LoadRun("workspace_api", queued.Run.ID)
	if err != nil {
		t.Fatalf("load queued run: %v", err)
	}
	if queuedRun.Status != RunStatusQueued {
		t.Fatalf("queued run status = %s, want queued behind replay", queuedRun.Status)
	}
	steerWhenReady(t, service, "workspace_api", conversation.ID, "finish replay")
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.ActiveRun.ID, RunStatusCompleted)
	waitForRunStatus(t, service, "workspace_api", conversation.ID, queued.Run.ID, RunStatusRunning)
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel queued run cleanup: %v", err)
	}
}

func TestServiceSendSteeringImmediatelyExcludesCommittedPendingSteering(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
		{Type: FakeEventUserMessage, Text: "S1"},
		{Type: FakeEventWaitForCancel},
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
	steered, err := service.SteerActiveRunInput("workspace_api", conversation.ID, TextChatInput("S1"))
	if err != nil {
		t.Fatalf("steer active: %v", err)
	}
	waitForMessageStatus(t, service, "workspace_api", conversation.ID, steered.UserMessage.ID, MessageStatusComplete)

	_, err = service.SendSteeringInputImmediately("workspace_api", conversation.ID, nil)
	if operationErr, ok := IsChatOperationError(err); !ok || operationErr.Code != ChatOperationErrorImmediateSteeringConflict {
		t.Fatalf("immediate error = %v, want immediate steering conflict", err)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active cleanup: %v", err)
	}
}

func serviceTestQueuedTurn(runID string, messageID string, conversation Conversation, ordinal int, prompt string) QueuedTurnRecords {
	now := "2026-05-29T20:00:00Z"
	message := ChatMessage{
		ConversationID: conversation.ID,
		CreatedAt:      now,
		Delivery:       MessageDeliveryQueued,
		ID:             messageID,
		Ordinal:        ordinal,
		Parts: []MessagePart{{
			ID:   messageID + "_part",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   prompt,
				Format: TextFormatPlain,
			},
		}},
		Role:          RoleUser,
		RunID:         runID,
		SchemaVersion: SchemaVersion,
		Status:        MessageStatusPending,
		UpdatedAt:     now,
	}
	run := Run{
		ConversationID:     conversation.ID,
		Harness:            HarnessCodex,
		ID:                 runID,
		PromptSummary:      summarize(prompt, maxPromptSummary),
		SchemaVersion:      SchemaVersion,
		Status:             RunStatusQueued,
		TriggerMessageID:   message.ID,
		WorkspaceID:        conversation.WorkspaceID,
		AssistantMessageID: "",
	}
	return QueuedTurnRecords{Conversation: conversation, Run: run, UserMessage: message}
}

func promptForMessageID(messages []ChatMessage, messageID string) string {
	for _, message := range messages {
		if message.ID == messageID {
			return promptFromMessage(message)
		}
	}
	return ""
}

func promptForRunID(messages []ChatMessage, runID string) string {
	for _, message := range messages {
		if message.RunID == runID && message.Role == RoleUser && message.Delivery == MessageDeliveryNormal {
			return promptFromMessage(message)
		}
	}
	return ""
}

func waitForMessageStatus(t *testing.T, service *Service, workspaceID string, conversationID string, messageID string, status MessageStatus) ChatMessage {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	var last ChatMessage
	for time.Now().Before(deadline) {
		page, err := service.LoadMessagePage(workspaceID, conversationID, 0, 40)
		if err != nil {
			t.Fatalf("load page while waiting for message %s: %v", messageID, err)
		}
		for _, message := range page.Messages {
			if message.ID == messageID {
				last = message
				if message.Status == status {
					return message
				}
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for message %s status %s, last %+v", messageID, status, last)
	return ChatMessage{}
}
