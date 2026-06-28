package chat

import "testing"

func TestServiceRecoveryAdvancesReadMarkerForInterruptedRun(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	fixture := saveInterruptedRunningTurnFixture(t, store)

	restarted := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	item := listConversationItem(t, restarted, fixture.workspaceID, fixture.conversationID)
	if item.LatestReadRelevantMarker <= item.ReadMarker {
		t.Fatalf("markers = read %d latest %d, want recovered conversation unread", item.ReadMarker, item.LatestReadRelevantMarker)
	}

	run, err := restarted.store.LoadRun(fixture.workspaceID, fixture.runID)
	if err != nil {
		t.Fatalf("load recovered run: %v", err)
	}
	if run.Status != RunStatusFailed || run.Error != "run interrupted by backend restart" {
		t.Fatalf("recovered run = %+v, want failed restart error", run)
	}
	page, err := restarted.LoadMessagePage(fixture.workspaceID, fixture.conversationID, 0, 20)
	if err != nil {
		t.Fatalf("load recovered page: %v", err)
	}
	if len(page.Messages) != 2 {
		t.Fatalf("message count = %d, want 2", len(page.Messages))
	}
	if page.Messages[1].ID != fixture.assistantMessageID || page.Messages[1].Status != MessageStatusError {
		t.Fatalf("assistant message = %+v, want recovered error assistant message", page.Messages[1])
	}
}

func TestServiceRecoveryDoesNotAdvanceReadMarkerAgainAfterRead(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	fixture := saveInterruptedRunningTurnFixture(t, store)

	restarted := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	unread := listConversationItem(t, restarted, fixture.workspaceID, fixture.conversationID)
	read, err := restarted.MarkConversationRead(fixture.workspaceID, fixture.conversationID)
	if err != nil {
		t.Fatalf("mark recovered conversation read: %v", err)
	}
	if read.ReadMarker != unread.LatestReadRelevantMarker {
		t.Fatalf("read marker = %d, want latest marker %d", read.ReadMarker, unread.LatestReadRelevantMarker)
	}

	restartedAgain := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	persisted := listConversationItem(t, restartedAgain, fixture.workspaceID, fixture.conversationID)
	if persisted.ReadMarker != read.ReadMarker || persisted.LatestReadRelevantMarker != read.LatestReadRelevantMarker {
		t.Fatalf("markers after second restart = read %d latest %d, want read %d latest %d", persisted.ReadMarker, persisted.LatestReadRelevantMarker, read.ReadMarker, read.LatestReadRelevantMarker)
	}
}

func TestServicePersistsReadMarkersAcrossRestart(t *testing.T) {
	appDataDir := t.TempDir()
	resolver := testResolver(t)
	service := newTestService(t, appDataDir, resolver, NewFakeHarness(nil))

	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("read markers"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	unread := listConversationItem(t, service, "workspace_api", conversation.ID)
	if unread.LatestReadRelevantMarker <= unread.ReadMarker {
		t.Fatalf("markers = read %d latest %d, want unread", unread.ReadMarker, unread.LatestReadRelevantMarker)
	}

	read, err := service.MarkConversationRead("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("mark conversation read: %v", err)
	}
	if read.ReadMarker != unread.LatestReadRelevantMarker {
		t.Fatalf("read marker = %d, want latest marker %d", read.ReadMarker, unread.LatestReadRelevantMarker)
	}
	if read.LatestReadRelevantMarker != unread.LatestReadRelevantMarker {
		t.Fatalf("latest marker = %d, want unchanged %d", read.LatestReadRelevantMarker, unread.LatestReadRelevantMarker)
	}

	again, err := service.MarkConversationRead("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("mark conversation read again: %v", err)
	}
	if again.ReadMarker != read.ReadMarker || again.LatestReadRelevantMarker != read.LatestReadRelevantMarker {
		t.Fatalf("idempotent markers = read %d latest %d, want read %d latest %d", again.ReadMarker, again.LatestReadRelevantMarker, read.ReadMarker, read.LatestReadRelevantMarker)
	}

	restarted := newTestService(t, appDataDir, resolver, NewFakeHarness(nil))
	persisted := listConversationItem(t, restarted, "workspace_api", conversation.ID)
	if persisted.ReadMarker != read.ReadMarker || persisted.LatestReadRelevantMarker != read.LatestReadRelevantMarker {
		t.Fatalf("persisted markers = read %d latest %d, want read %d latest %d", persisted.ReadMarker, persisted.LatestReadRelevantMarker, read.ReadMarker, read.LatestReadRelevantMarker)
	}

	second, err := restarted.SendUserInput("workspace_api", conversation.ID, TextChatInput("read markers again"))
	if err != nil {
		t.Fatalf("send second message: %v", err)
	}
	waitForRunStatus(t, restarted, "workspace_api", conversation.ID, second.Run.ID, RunStatusCompleted)

	advanced := listConversationItem(t, restarted, "workspace_api", conversation.ID)
	if advanced.ReadMarker != persisted.ReadMarker {
		t.Fatalf("read marker = %d, want unchanged %d after new output", advanced.ReadMarker, persisted.ReadMarker)
	}
	if advanced.LatestReadRelevantMarker <= persisted.LatestReadRelevantMarker {
		t.Fatalf("latest marker = %d, want greater than %d", advanced.LatestReadRelevantMarker, persisted.LatestReadRelevantMarker)
	}
}

type interruptedRunningTurnFixture struct {
	assistantMessageID string
	conversationID     string
	runID              string
	workspaceID        string
}

func saveInterruptedRunningTurnFixture(t *testing.T, store *Store) interruptedRunningTurnFixture {
	t.Helper()

	fixture := interruptedRunningTurnFixture{
		assistantMessageID: "message_assistant",
		conversationID:     "conversation_api",
		runID:              "run_api",
		workspaceID:        "workspace_api",
	}
	conversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            fixture.conversationID,
		WorkspaceID:   fixture.workspaceID,
		Title:         "API",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	if err := store.SaveMessage(fixture.workspaceID, ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_user",
		ConversationID: fixture.conversationID,
		RunID:          fixture.runID,
		Role:           RoleUser,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        1,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			ID:   "part_user",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "prompt",
				Format: TextFormatPlain,
			},
		}},
	}); err != nil {
		t.Fatalf("save user message: %v", err)
	}
	if err := store.SaveMessage(fixture.workspaceID, ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             fixture.assistantMessageID,
		ConversationID: fixture.conversationID,
		RunID:          fixture.runID,
		Role:           RoleAssistant,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        2,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusStreaming,
		Parts: []MessagePart{{
			ID:   "part_assistant",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "partial",
				Format: TextFormatMarkdown,
			},
		}},
	}); err != nil {
		t.Fatalf("save assistant message: %v", err)
	}
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 fixture.runID,
		WorkspaceID:        fixture.workspaceID,
		ConversationID:     fixture.conversationID,
		TriggerMessageID:   "message_user",
		AssistantMessageID: fixture.assistantMessageID,
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          "2026-05-29T20:00:00Z",
		PromptSummary:      "prompt",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}
	return fixture
}

func listConversationItem(t *testing.T, service *Service, workspaceID string, conversationID string) ConversationListItem {
	t.Helper()

	list, err := service.ListConversations(workspaceID)
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	for _, item := range list.Conversations {
		if item.Conversation.ID == conversationID {
			return item
		}
	}
	t.Fatalf("conversation %s not found in %+v", conversationID, list.Conversations)
	return ConversationListItem{}
}
