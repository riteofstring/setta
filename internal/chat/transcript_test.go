package chat

import (
	"strings"
	"testing"
)

func TestServiceTranscriptInterleavesPromotedQueuedTurns(t *testing.T) {
	harness := NewFakeHarnessByPrompt(map[string][]FakeHarnessEvent{
		"A1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
			{Type: FakeEventWaitForSteer},
			{Type: FakeEventAssistantDelta, Text: "A1 reply"},
		},
		"Q1": {{Type: FakeEventAssistantDelta, Text: "Q1 reply"}},
		"Q2": {{Type: FakeEventAssistantDelta, Text: "Q2 reply"}},
		"Q3": {{Type: FakeEventAssistantDelta, Text: "Q3 reply"}},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	first, err := service.SendUserMessage("workspace_api", conversation.ID, "A1")
	if err != nil {
		t.Fatalf("send first: %v", err)
	}
	q1, err := service.QueueUserMessage("workspace_api", conversation.ID, "Q1")
	if err != nil {
		t.Fatalf("queue q1: %v", err)
	}
	q2, err := service.QueueUserMessage("workspace_api", conversation.ID, "Q2")
	if err != nil {
		t.Fatalf("queue q2: %v", err)
	}
	q3, err := service.QueueUserMessage("workspace_api", conversation.ID, "Q3")
	if err != nil {
		t.Fatalf("queue q3: %v", err)
	}

	steerWhenReady(t, service, "workspace_api", conversation.ID, "finish A1")
	waitForRunStatus(t, service, "workspace_api", conversation.ID, first.Run.ID, RunStatusCompleted)
	waitForRunStatus(t, service, "workspace_api", conversation.ID, q1.Run.ID, RunStatusCompleted)
	waitForRunStatus(t, service, "workspace_api", conversation.ID, q2.Run.ID, RunStatusCompleted)
	waitForRunStatus(t, service, "workspace_api", conversation.ID, q3.Run.ID, RunStatusCompleted)

	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 40)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if got, want := transcriptMessageTexts(page.Transcript), []string{"A1", "finish A1", "A1 reply", "Q1", "Q1 reply", "Q2", "Q2 reply", "Q3", "Q3 reply"}; !equalStrings(got, want) {
		t.Fatalf("transcript texts = %+v, want %+v", got, want)
	}
	if got, want := messageTexts(page.Messages), []string{"A1", "A1 reply", "Q1", "Q2", "Q3", "finish A1", "Q1 reply", "Q2 reply", "Q3 reply"}; !equalStrings(got, want) {
		t.Fatalf("durable message texts = %+v, want creation-order messages %+v", got, want)
	}
}

func TestServiceTranscriptOrdersImmediateReplayBeforePreservedQueue(t *testing.T) {
	harness := NewFakeHarnessByPrompt(map[string][]FakeHarnessEvent{
		"A1": {
			{Type: FakeEventThreadLinked, ThreadID: "thread_active", SessionID: "session_fake", TurnID: "turn_active"},
			{Type: FakeEventAssistantDelta, Text: "A1 partial"},
			{Type: FakeEventWaitForCancel},
		},
		"S1": {{Type: FakeEventAssistantDelta, Text: "S1 reply"}},
		"Q1": {{Type: FakeEventAssistantDelta, Text: "Q1 reply"}},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserMessage("workspace_api", conversation.ID, "A1")
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_active")
	queued, err := service.QueueUserMessage("workspace_api", conversation.ID, "Q1")
	if err != nil {
		t.Fatalf("queue q1: %v", err)
	}
	replay, err := service.SendSteeringImmediately("workspace_api", conversation.ID, "S1")
	if err != nil {
		t.Fatalf("send steering immediately: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, active.Run.ID, RunStatusCancelled)
	waitForRunStatus(t, service, "workspace_api", conversation.ID, replay.ActiveRun.ID, RunStatusCompleted)
	waitForRunStatus(t, service, "workspace_api", conversation.ID, queued.Run.ID, RunStatusCompleted)

	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 40)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if got, want := transcriptMessageTexts(page.Transcript), []string{"A1", "A1 partial", "S1", "S1 reply", "Q1", "Q1 reply"}; !equalStrings(got, want) {
		t.Fatalf("transcript texts = %+v, want execution-order transcript %+v", got, want)
	}
	if got, want := messageTexts(page.Messages), []string{"A1", "A1 partial", "Q1", "S1", "S1 reply", "Q1 reply"}; !equalStrings(got, want) {
		t.Fatalf("durable message texts = %+v, want creation-order messages %+v", got, want)
	}
}

func TestServiceTranscriptIncludesQueuedTurnWithoutAssistant(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "A1"); err != nil {
		t.Fatalf("send active: %v", err)
	}
	queued, err := service.QueueUserMessage("workspace_api", conversation.ID, "Q1")
	if err != nil {
		t.Fatalf("queue q1: %v", err)
	}

	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 40)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	turn := transcriptTurnByRunID(page.Transcript, queued.Run.ID)
	if turn == nil {
		t.Fatalf("transcript = %+v, want queued turn %s", page.Transcript, queued.Run.ID)
	}
	if turn.AssistantMessage != nil || turn.Run.Status != RunStatusQueued || turn.TriggerMessage.Parts[0].Text != "Q1" {
		t.Fatalf("queued turn = %+v, want trigger without assistant", turn)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel cleanup: %v", err)
	}
}

func TestServiceTranscriptKeepsSteeringMessagesInActiveTurn(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
		{Type: FakeEventAssistantDelta, Text: "done"},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	started, err := service.SendUserMessage("workspace_api", conversation.ID, "A1")
	if err != nil {
		t.Fatalf("send active: %v", err)
	}

	steered := steerWhenReady(t, service, "workspace_api", conversation.ID, "S1")
	waitForRunStatus(t, service, "workspace_api", conversation.ID, started.Run.ID, RunStatusCompleted)
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 40)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	turn := transcriptTurnByRunID(page.Transcript, started.Run.ID)
	if turn == nil {
		t.Fatalf("transcript = %+v, want active turn", page.Transcript)
	}
	if len(turn.SteeringMessages) != 1 || turn.SteeringMessages[0].ID != steered.UserMessage.ID {
		t.Fatalf("steering messages = %+v, want %s", turn.SteeringMessages, steered.UserMessage.ID)
	}
}

func TestServiceTranscriptPaginationExpandsSplitTurn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "only turn")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 1)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if len(page.Messages) != 1 || page.Messages[0].Role != RoleAssistant {
		t.Fatalf("raw messages = %+v, want assistant page", page.Messages)
	}
	if got, want := transcriptMessageTexts(page.Transcript), []string{"only turn", "Echo: only turn"}; !equalStrings(got, want) {
		t.Fatalf("transcript texts = %+v, want complete turn %+v", got, want)
	}
	if page.HasMoreOlder {
		t.Fatal("page hasMoreOlder = true, want false because transcript includes complete oldest turn")
	}
}

func TestServiceTranscriptRejectsCorruptRunMessageLinks(t *testing.T) {
	store := mustStore(t, t.TempDir())
	conversation := transitionConversation("corrupt_projection")
	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	assistant := transitionAssistantMessage("message_assistant_corrupt_projection", "run_corrupt_projection", 1, MessageStatusComplete)
	assistant.ConversationID = conversation.ID
	if err := store.SaveMessage("workspace_api", assistant); err != nil {
		t.Fatalf("save assistant: %v", err)
	}
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 "run_corrupt_projection",
		WorkspaceID:        "workspace_api",
		ConversationID:     conversation.ID,
		TriggerMessageID:   "message_missing",
		AssistantMessageID: assistant.ID,
		Harness:            HarnessCodex,
		Status:             RunStatusCompleted,
		StartedAt:          "2026-05-29T20:00:00Z",
		CompletedAt:        "2026-05-29T20:01:00Z",
		PromptSummary:      "prompt",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}
	service := newTestService(t, store.appDataDir, testResolver(t), NewFakeHarness(nil))

	_, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 40)
	if err == nil {
		t.Fatal("load page succeeded, want corrupt transcript link error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "trigger message message_missing was not found") {
		t.Fatalf("error = %T %v, want corrupt missing trigger", err, err)
	}
}

func transcriptMessageTexts(transcript []TranscriptTurn) []string {
	texts := []string{}
	for _, turn := range transcript {
		texts = append(texts, promptFromMessage(turn.TriggerMessage))
		for _, message := range turn.SteeringMessages {
			texts = append(texts, promptFromMessage(message))
		}
		if turn.AssistantMessage != nil {
			texts = append(texts, promptFromMessage(*turn.AssistantMessage))
		}
	}
	return texts
}

func messageTexts(messages []ChatMessage) []string {
	texts := make([]string, 0, len(messages))
	for _, message := range messages {
		texts = append(texts, promptFromMessage(message))
	}
	return texts
}

func transcriptTurnByRunID(transcript []TranscriptTurn, runID string) *TranscriptTurn {
	for index := range transcript {
		if transcript[index].Run.ID == runID {
			return &transcript[index]
		}
	}
	return nil
}

func equalStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
