package chat

import (
	"os"
	"strings"
	"testing"
)

func TestStoreCreateRunningAndCompleteTurnTransitions(t *testing.T) {
	store := mustStore(t, t.TempDir())
	records := transitionRunningRecords("complete")
	if _, err := store.CreateRunningTurn(records); err != nil {
		t.Fatalf("create running turn: %v", err)
	}
	records.Run.Status = RunStatusCompleted
	records.Run.CompletedAt = "2026-05-29T20:01:00Z"
	records.AssistantMessage.Status = MessageStatusComplete
	records.AssistantMessage.UpdatedAt = "2026-05-29T20:01:00Z"

	if _, err := store.CompleteTurn(TerminalTurnRecords{AssistantMessage: records.AssistantMessage, Run: records.Run}); err != nil {
		t.Fatalf("complete turn: %v", err)
	}
	run, err := store.LoadRun("workspace_api", records.Run.ID)
	if err != nil {
		t.Fatalf("load completed run: %v", err)
	}
	if run.Status != RunStatusCompleted {
		t.Fatalf("run status = %s, want completed", run.Status)
	}
	message, err := store.LoadMessageByID("workspace_api", records.Conversation.ID, records.AssistantMessage.ID)
	if err != nil {
		t.Fatalf("load completed assistant: %v", err)
	}
	if message.Status != MessageStatusComplete {
		t.Fatalf("assistant status = %s, want complete", message.Status)
	}
}

func TestStoreCreateQueuedAndPromoteQueuedTurnTransitions(t *testing.T) {
	store := mustStore(t, t.TempDir())
	queued := transitionQueuedRecords("queued")
	if _, err := store.CreateQueuedTurn(queued); err != nil {
		t.Fatalf("create queued turn: %v", err)
	}
	promoted := QueuedPromotionRecords{
		AssistantMessage: transitionAssistantMessage("message_assistant_queued", "run_queued", 2, MessageStatusStreaming),
		Conversation:     queued.Conversation,
		Run:              queued.Run,
		UserMessage:      queued.UserMessage,
	}
	promoted.Conversation.UpdatedAt = "2026-05-29T20:01:00Z"
	promoted.Run.Status = RunStatusRunning
	promoted.Run.AssistantMessageID = promoted.AssistantMessage.ID
	promoted.Run.StartedAt = "2026-05-29T20:01:00Z"
	promoted.UserMessage.Status = MessageStatusComplete
	promoted.UserMessage.UpdatedAt = "2026-05-29T20:01:00Z"

	if _, err := store.PromoteQueuedTurn(promoted); err != nil {
		t.Fatalf("promote queued turn: %v", err)
	}
	run, err := store.LoadRun("workspace_api", promoted.Run.ID)
	if err != nil {
		t.Fatalf("load promoted run: %v", err)
	}
	if run.Status != RunStatusRunning || run.AssistantMessageID != promoted.AssistantMessage.ID {
		t.Fatalf("promoted run = %+v, want running with assistant", run)
	}
}

func TestStoreEditAndDeleteQueuedTurnTransitions(t *testing.T) {
	store := mustStore(t, t.TempDir())
	edited := transitionQueuedRecords("qedit")
	if _, err := store.CreateQueuedTurn(edited); err != nil {
		t.Fatalf("create queued edit turn: %v", err)
	}
	edited.Conversation.UpdatedAt = "2026-05-29T20:01:00Z"
	conversation, message, run, err := store.EditQueuedTurn(edited.Conversation, edited.UserMessage, edited.Run, "updated prompt")
	if err != nil {
		t.Fatalf("edit queued turn: %v", err)
	}
	if promptFromMessage(message) != "updated prompt" || run.PromptSummary != "updated prompt" {
		t.Fatalf("edited message/run = %q/%q, want updated prompt", promptFromMessage(message), run.PromptSummary)
	}
	if conversation.UpdatedAt != "2026-05-29T20:01:00Z" {
		t.Fatalf("conversation updatedAt = %q, want edit timestamp", conversation.UpdatedAt)
	}

	deleted := transitionQueuedRecords("qdelete")
	deleted.UserMessage.Ordinal = 2
	if _, err := store.CreateQueuedTurn(deleted); err != nil {
		t.Fatalf("create queued delete turn: %v", err)
	}
	if err := store.SaveTraceEvent("workspace_api", TraceEvent{
		SchemaVersion: SchemaVersion,
		ID:            "trace_delete",
		RunID:         deleted.Run.ID,
		Type:          "message_queued",
		CreatedAt:     "2026-05-29T20:00:00Z",
		Message:       "Message queued",
	}); err != nil {
		t.Fatalf("save queued trace: %v", err)
	}
	_, removedRunID, err := store.DeleteQueuedTurn("workspace_api", deleted.Conversation.ID, deleted.UserMessage.ID, "2026-05-29T20:02:00Z")
	if err != nil {
		t.Fatalf("delete queued turn: %v", err)
	}
	if removedRunID != deleted.Run.ID {
		t.Fatalf("removed run id = %q, want %q", removedRunID, deleted.Run.ID)
	}
	if _, ok, err := store.FindMessageByID("workspace_api", deleted.Conversation.ID, deleted.UserMessage.ID); err != nil || ok {
		t.Fatalf("deleted message lookup = ok %v err %v, want not found", ok, err)
	}
	if _, err := store.LoadRun("workspace_api", deleted.Run.ID); err == nil {
		t.Fatal("deleted run loaded successfully, want missing run")
	}
	if existsPath(store.tracePath("workspace_api", deleted.Run.ID, "trace_delete")) {
		t.Fatal("queued run trace still exists after delete")
	}
}

func TestStoreReplayPendingSteeringAsTurnTransition(t *testing.T) {
	store := mustStore(t, t.TempDir())
	active := transitionRunningRecords("replay")
	if _, err := store.CreateRunningTurn(active); err != nil {
		t.Fatalf("create active turn: %v", err)
	}
	firstSteering := transitionUserMessage("message_steer_one_replay", active.Run.ID, 3, MessageDeliverySteering, MessageStatusPending)
	firstSteering.Parts[0].Text = "first"
	secondSteering := transitionUserMessage("message_steer_two_replay", active.Run.ID, 4, MessageDeliverySteering, MessageStatusPending)
	secondSteering.Parts[0].Text = "second"
	if err := store.SaveMessage("workspace_api", firstSteering); err != nil {
		t.Fatalf("save first steering: %v", err)
	}
	if err := store.SaveMessage("workspace_api", secondSteering); err != nil {
		t.Fatalf("save second steering: %v", err)
	}
	user := transitionUserMessage("message_user_replayed_replay", "run_replayed_replay", 5, MessageDeliveryNormal, MessageStatusComplete)
	user.Parts[0].Text = "first\nsecond"
	assistant := transitionAssistantMessage("message_assistant_replayed_replay", "run_replayed_replay", 6, MessageStatusStreaming)
	run := Run{
		SchemaVersion:      SchemaVersion,
		ID:                 "run_replayed_replay",
		WorkspaceID:        "workspace_api",
		ConversationID:     active.Conversation.ID,
		TriggerMessageID:   user.ID,
		AssistantMessageID: assistant.ID,
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          "2026-05-29T20:01:00Z",
		PromptSummary:      "first second",
	}
	conversation := active.Conversation
	conversation.UpdatedAt = "2026-05-29T20:01:00Z"

	if _, err := store.ReplayPendingSteeringAsTurn(PendingSteeringReplayRecords{
		ActiveRun:               active.Run,
		AssistantMessage:        assistant,
		Conversation:            conversation,
		PendingSteeringMessages: []ChatMessage{firstSteering, secondSteering},
		Run:                     run,
		UserMessage:             user,
	}); err != nil {
		t.Fatalf("replay pending steering: %v", err)
	}
	if _, ok, err := store.FindMessageByID("workspace_api", active.Conversation.ID, firstSteering.ID); err != nil || ok {
		t.Fatalf("first steering lookup = ok %v err %v, want removed", ok, err)
	}
	replayedRun, err := store.LoadRun("workspace_api", run.ID)
	if err != nil {
		t.Fatalf("load replayed run: %v", err)
	}
	if replayedRun.Status != RunStatusRunning || replayedRun.TriggerMessageID != user.ID {
		t.Fatalf("replayed run = %+v, want running trigger %s", replayedRun, user.ID)
	}
}

func TestStoreFailAndCancelTurnTransitions(t *testing.T) {
	store := mustStore(t, t.TempDir())
	failed := transitionRunningRecords("failed")
	if _, err := store.CreateRunningTurn(failed); err != nil {
		t.Fatalf("create failed turn: %v", err)
	}
	failed.Run.Status = RunStatusFailed
	failed.Run.CompletedAt = "2026-05-29T20:01:00Z"
	failed.Run.Error = "failed"
	failed.AssistantMessage.Status = MessageStatusError
	failed.AssistantMessage.UpdatedAt = "2026-05-29T20:01:00Z"
	if _, err := store.FailTurn(TerminalTurnRecords{AssistantMessage: failed.AssistantMessage, Run: failed.Run}); err != nil {
		t.Fatalf("fail turn: %v", err)
	}

	cancelled := transitionRunningRecords("cancelled")
	cancelled.UserMessage.Ordinal = 3
	cancelled.AssistantMessage.Ordinal = 4
	if _, err := store.CreateRunningTurn(cancelled); err != nil {
		t.Fatalf("create cancelled turn: %v", err)
	}
	cancelled.Run.Status = RunStatusCancelled
	cancelled.Run.CompletedAt = "2026-05-29T20:01:00Z"
	cancelled.Run.Error = "turn cancelled"
	cancelled.AssistantMessage.Status = MessageStatusCancelled
	cancelled.AssistantMessage.UpdatedAt = "2026-05-29T20:01:00Z"
	if _, err := store.CancelTurn(TerminalTurnRecords{AssistantMessage: cancelled.AssistantMessage, Run: cancelled.Run}); err != nil {
		t.Fatalf("cancel turn: %v", err)
	}
}

func TestStoreSubmitAndResolveApprovalTransitions(t *testing.T) {
	store := mustStore(t, t.TempDir())
	submitted := transitionRunningRecords("submit")
	submittedApproval := transitionApproval("approval_submit", submitted.Run.ID)
	submitted.Run.PendingApproval = &submittedApproval
	if _, err := store.CreateRunningTurn(submitted); err != nil {
		t.Fatalf("create submit approval turn: %v", err)
	}
	submitted.Run.PendingApproval = nil
	if _, err := store.SubmitApproval(submitted.Run); err != nil {
		t.Fatalf("submit approval: %v", err)
	}

	resolved := transitionRunningRecords("resolve")
	resolved.UserMessage.Ordinal = 3
	resolved.AssistantMessage.Ordinal = 4
	resolvedApproval := transitionApproval("approval_resolve", resolved.Run.ID)
	resolved.Run.PendingApproval = &resolvedApproval
	if _, err := store.CreateRunningTurn(resolved); err != nil {
		t.Fatalf("create resolve approval turn: %v", err)
	}
	resolved.Run.PendingApproval = nil
	if _, err := store.ResolveApproval(resolved.Run); err != nil {
		t.Fatalf("resolve approval: %v", err)
	}
}

func transitionConversation(suffix string) Conversation {
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_" + suffix,
		WorkspaceID:   "workspace_api",
		Title:         "Transition",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
}

func transitionRunningRecords(suffix string) RunningTurnRecords {
	runID := "run_" + suffix
	user := transitionUserMessage("message_user_"+suffix, runID, 1, MessageDeliveryNormal, MessageStatusComplete)
	assistant := transitionAssistantMessage("message_assistant_"+suffix, runID, 2, MessageStatusStreaming)
	return RunningTurnRecords{
		AssistantMessage: assistant,
		Conversation:     transitionConversation(suffix),
		Run: Run{
			SchemaVersion:      SchemaVersion,
			ID:                 runID,
			WorkspaceID:        "workspace_api",
			ConversationID:     "conversation_" + suffix,
			TriggerMessageID:   user.ID,
			AssistantMessageID: assistant.ID,
			Harness:            HarnessCodex,
			Status:             RunStatusRunning,
			StartedAt:          "2026-05-29T20:00:00Z",
			PromptSummary:      "prompt",
		},
		UserMessage: user,
	}
}

func transitionQueuedRecords(suffix string) QueuedTurnRecords {
	runID := "run_" + suffix
	user := transitionUserMessage("message_user_"+suffix, runID, 1, MessageDeliveryQueued, MessageStatusPending)
	return QueuedTurnRecords{
		Conversation: transitionConversation(suffix),
		Run: Run{
			SchemaVersion:    SchemaVersion,
			ID:               runID,
			WorkspaceID:      "workspace_api",
			ConversationID:   "conversation_" + suffix,
			TriggerMessageID: user.ID,
			Harness:          HarnessCodex,
			Status:           RunStatusQueued,
			PromptSummary:    "prompt",
		},
		UserMessage: user,
	}
}

func transitionUserMessage(id string, runID string, ordinal int, delivery MessageDelivery, status MessageStatus) ChatMessage {
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		ConversationID: conversationIDFromMessageID(id),
		RunID:          runID,
		Role:           RoleUser,
		Delivery:       delivery,
		Ordinal:        ordinal,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         status,
		Parts: []MessagePart{{
			Format: TextFormatPlain,
			ID:     id + "_part",
			Text:   "prompt",
			Type:   MessagePartText,
		}},
	}
}

func transitionAssistantMessage(id string, runID string, ordinal int, status MessageStatus) ChatMessage {
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		ConversationID: conversationIDFromMessageID(id),
		RunID:          runID,
		Role:           RoleAssistant,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        ordinal,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         status,
		Parts: []MessagePart{{
			Format: TextFormatMarkdown,
			ID:     id + "_part",
			Text:   "",
			Type:   MessagePartText,
		}},
	}
}

func conversationIDFromMessageID(id string) string {
	return "conversation_" + id[strings.LastIndex(id, "_")+1:]
}

func transitionApproval(id string, runID string) ApprovalRequest {
	return ApprovalRequest{
		ID:        id,
		RunID:     runID,
		Kind:      ApprovalKindPermission,
		Title:     "Need permission",
		Status:    ApprovalStatusPending,
		CreatedAt: "2026-05-29T20:00:00Z",
		Options:   []string{},
		Questions: []ApprovalQuestion{},
	}
}

func existsPath(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
