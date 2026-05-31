package chat

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const (
	UIShowcaseConversationID    = "conversation_ui_showcase"
	uiShowcaseCompletedRunID    = "run_ui_showcase_all_activity"
	uiShowcaseFailedRunID       = "run_ui_showcase_failed"
	uiShowcaseCancelledRunID    = "run_ui_showcase_cancelled"
	uiShowcaseConversationTitle = "UI Showcase Chat"
)

type UIShowcaseSeedResult struct {
	Conversation Conversation
	RunIDs       []string
}

func SeedUIShowcaseConversation(store *Store, workspaceID string, seededAt time.Time) (UIShowcaseSeedResult, error) {
	if store == nil {
		return UIShowcaseSeedResult{}, fmt.Errorf("chat store is required")
	}
	if workspaceID == "" {
		return UIShowcaseSeedResult{}, fmt.Errorf("workspace id is required")
	}
	seededAt = uiShowcaseSeedTime(seededAt)
	if err := removeUIShowcaseArtifacts(store, workspaceID); err != nil {
		return UIShowcaseSeedResult{}, err
	}
	conversation := uiShowcaseConversation(workspaceID, seededAt)
	if err := seedUIShowcaseRecords(store, workspaceID, conversation, seededAt); err != nil {
		return UIShowcaseSeedResult{}, err
	}
	return UIShowcaseSeedResult{
		Conversation: conversation,
		RunIDs:       []string{uiShowcaseCompletedRunID, uiShowcaseFailedRunID, uiShowcaseCancelledRunID},
	}, nil
}

func uiShowcaseSeedTime(seededAt time.Time) time.Time {
	if seededAt.IsZero() {
		return time.Now().UTC()
	}
	return seededAt.UTC()
}

func seedUIShowcaseRecords(store *Store, workspaceID string, conversation Conversation, seededAt time.Time) error {
	if err := store.SaveConversation(conversation); err != nil {
		return err
	}
	if err := store.SaveGoal(workspaceID, UIShowcaseConversationID, uiShowcaseGoal(seededAt)); err != nil {
		return err
	}
	if err := seedUIShowcaseMessages(store, workspaceID, seededAt); err != nil {
		return err
	}
	if err := seedUIShowcaseRuns(store, workspaceID, seededAt); err != nil {
		return err
	}
	return seedUIShowcaseRunItems(store, workspaceID, seededAt)
}

func seedUIShowcaseMessages(store *Store, workspaceID string, seededAt time.Time) error {
	for _, message := range uiShowcaseMessages(seededAt) {
		if err := store.SaveMessage(workspaceID, message); err != nil {
			return err
		}
	}
	return nil
}

func seedUIShowcaseRuns(store *Store, workspaceID string, seededAt time.Time) error {
	for _, run := range uiShowcaseRuns(workspaceID, seededAt) {
		if err := store.SaveRun(run); err != nil {
			return err
		}
	}
	return nil
}

func removeUIShowcaseArtifacts(store *Store, workspaceID string) error {
	if err := os.RemoveAll(store.conversationDir(workspaceID, UIShowcaseConversationID)); err != nil {
		return &PersistenceError{Operation: "remove UI showcase conversation", Path: store.conversationDir(workspaceID, UIShowcaseConversationID), Err: err}
	}
	for _, runID := range []string{uiShowcaseCompletedRunID, uiShowcaseFailedRunID, uiShowcaseCancelledRunID} {
		if err := os.Remove(store.runPath(workspaceID, runID)); err != nil && !os.IsNotExist(err) {
			return &PersistenceError{Operation: "remove UI showcase run", Path: store.runPath(workspaceID, runID), Err: err}
		}
		runDir := filepath.Join(store.runsDir(workspaceID), runID)
		if err := os.RemoveAll(runDir); err != nil {
			return &PersistenceError{Operation: "remove UI showcase run artifacts", Path: runDir, Err: err}
		}
	}
	return nil
}

func uiShowcaseConversation(workspaceID string, seededAt time.Time) Conversation {
	timestampValue := timestamp(seededAt)
	reasoning := ReasoningEffortXHigh
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            UIShowcaseConversationID,
		WorkspaceID:   workspaceID,
		Title:         uiShowcaseConversationTitle,
		CreatedAt:     timestamp(seededAt.Add(-10 * time.Minute)),
		UpdatedAt:     timestampValue,
		CodexSettings: &ChatCodexSettings{
			Model:           "gpt-5-codex",
			ReasoningEffort: &reasoning,
		},
		HarnessRefs: []HarnessThreadRef{{
			Harness:       HarnessCodex,
			ThreadID:      "thread_ui_showcase",
			SessionID:     "session_ui_showcase",
			LastTurnID:    "turn_ui_showcase",
			Status:        HarnessRefLinked,
			CreatedAt:     timestamp(seededAt.Add(-9 * time.Minute)),
			LastResumedAt: timestampValue,
		}},
	}
}

func uiShowcaseGoal(seededAt time.Time) ChatGoalState {
	budget := 20000
	return ChatGoalState{
		ThreadID:        "thread_ui_showcase",
		Objective:       "Style every chat interface element in one reloadable fixture.",
		Status:          "active",
		TokenBudget:     &budget,
		TokensUsed:      7342,
		TimeUsedSeconds: 186,
		CreatedAt:       int(seededAt.Add(-8 * time.Minute).Unix()),
		UpdatedAt:       int(seededAt.Unix()),
	}
}

func uiShowcaseMessages(seededAt time.Time) []ChatMessage {
	return []ChatMessage{
		uiShowcaseMessage("message_ui_showcase_system", "", RoleSystem, MessageDeliveryNormal, 1, MessageStatusComplete, "System note: this fixture intentionally includes stable examples of every chat surface.", TextFormatMarkdown, seededAt.Add(-7*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_developer", "", RoleDeveloper, MessageDeliveryNormal, 2, MessageStatusComplete, "Developer note: keep cards dense, aligned, and readable across narrow panes.", TextFormatMarkdown, seededAt.Add(-6*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_user", uiShowcaseCompletedRunID, RoleUser, MessageDeliveryNormal, 3, MessageStatusComplete, "Create a durable UI showcase with reasoning, tool calls, outputs, approvals, notices, and diffs.", TextFormatPlain, seededAt.Add(-5*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_steering", uiShowcaseCompletedRunID, RoleUser, MessageDeliverySteering, 4, MessageStatusComplete, "Also include steering state and long output previews.", TextFormatPlain, seededAt.Add(-4*time.Minute-30*time.Second)),
		uiShowcaseMessage("message_ui_showcase_assistant", uiShowcaseCompletedRunID, RoleAssistant, MessageDeliveryNormal, 5, MessageStatusComplete, "UI showcase started.\n\nThe activity stack below covers reasoning, plans, command execution, file changes, MCP tools, dynamic tools, web search, images, terminal sessions, diffs, notices, approval reviews, hooks, and structured input.\n\nUI showcase complete.", TextFormatMarkdown, seededAt.Add(-4*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_command", "", RoleCommand, MessageDeliveryNormal, 6, MessageStatusComplete, "Model set: gpt-5-codex\nReasoning set: Extra High", TextFormatPlain, seededAt.Add(-3*time.Minute-30*time.Second)),
		uiShowcaseMessage("message_ui_showcase_tool", "", RoleTool, MessageDeliveryNormal, 7, MessageStatusComplete, "{\"tool\":\"style_probe\",\"ok\":true,\"rows\":17}", TextFormatPlain, seededAt.Add(-3*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_waiting", "", RoleAssistant, MessageDeliveryNormal, 8, MessageStatusStreaming, "", TextFormatMarkdown, seededAt.Add(-2*time.Minute-45*time.Second)),
		uiShowcaseMessage("message_ui_showcase_queued", "", RoleUser, MessageDeliveryQueued, 9, MessageStatusPending, "Queued follow-up preview that is not attached to a live queue.", TextFormatPlain, seededAt.Add(-2*time.Minute-30*time.Second)),
		uiShowcaseMessage("message_ui_showcase_standalone_steering", "", RoleUser, MessageDeliverySteering, 10, MessageStatusComplete, "Standalone steering message preview.", TextFormatPlain, seededAt.Add(-2*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_failed_user", uiShowcaseFailedRunID, RoleUser, MessageDeliveryNormal, 11, MessageStatusComplete, "Show failed assistant state.", TextFormatPlain, seededAt.Add(-90*time.Second)),
		uiShowcaseMessage("message_ui_showcase_failed_assistant", uiShowcaseFailedRunID, RoleAssistant, MessageDeliveryNormal, 12, MessageStatusError, "The scripted fixture failed this turn on purpose so error styling is visible.", TextFormatMarkdown, seededAt.Add(-80*time.Second)),
		uiShowcaseMessage("message_ui_showcase_cancelled_user", uiShowcaseCancelledRunID, RoleUser, MessageDeliveryNormal, 13, MessageStatusComplete, "Show cancelled assistant state.", TextFormatPlain, seededAt.Add(-70*time.Second)),
		uiShowcaseMessage("message_ui_showcase_cancelled_assistant", uiShowcaseCancelledRunID, RoleAssistant, MessageDeliveryNormal, 14, MessageStatusCancelled, "The scripted fixture cancelled this turn on purpose so cancelled styling is visible.", TextFormatMarkdown, seededAt.Add(-60*time.Second)),
	}
}

func uiShowcaseMessage(id string, runID string, role MessageRole, delivery MessageDelivery, ordinal int, status MessageStatus, text string, format TextFormat, createdAt time.Time) ChatMessage {
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		ConversationID: UIShowcaseConversationID,
		RunID:          runID,
		Role:           role,
		Delivery:       delivery,
		Ordinal:        ordinal,
		CreatedAt:      timestamp(createdAt),
		UpdatedAt:      timestamp(createdAt),
		Status:         status,
		Parts: []MessagePart{{
			ID:     id + "_part",
			Type:   MessagePartText,
			Text:   text,
			Format: format,
		}},
	}
}

func uiShowcaseRuns(workspaceID string, seededAt time.Time) []Run {
	return []Run{
		uiShowcaseRun(workspaceID, uiShowcaseCompletedRunID, "message_ui_showcase_user", "message_ui_showcase_assistant", RunStatusCompleted, "Create a durable UI showcase", "", seededAt.Add(-5*time.Minute), seededAt.Add(-4*time.Minute)),
		uiShowcaseRun(workspaceID, uiShowcaseFailedRunID, "message_ui_showcase_failed_user", "message_ui_showcase_failed_assistant", RunStatusFailed, "Show failed assistant state", "scripted fixture failure", seededAt.Add(-90*time.Second), seededAt.Add(-80*time.Second)),
		uiShowcaseRun(workspaceID, uiShowcaseCancelledRunID, "message_ui_showcase_cancelled_user", "message_ui_showcase_cancelled_assistant", RunStatusCancelled, "Show cancelled assistant state", "scripted fixture cancellation", seededAt.Add(-70*time.Second), seededAt.Add(-60*time.Second)),
	}
}

func uiShowcaseRun(workspaceID string, runID string, triggerMessageID string, assistantMessageID string, status RunStatus, promptSummary string, runError string, startedAt time.Time, completedAt time.Time) Run {
	return Run{
		SchemaVersion:      SchemaVersion,
		ID:                 runID,
		WorkspaceID:        workspaceID,
		ConversationID:     UIShowcaseConversationID,
		TriggerMessageID:   triggerMessageID,
		AssistantMessageID: assistantMessageID,
		Harness:            HarnessCodex,
		Status:             status,
		StartedAt:          timestamp(startedAt),
		CompletedAt:        timestamp(completedAt),
		PromptSummary:      promptSummary,
		Error:              runError,
	}
}

func seedUIShowcaseRunItems(store *Store, workspaceID string, seededAt time.Time) error {
	for index, item := range scriptedUIShowcaseRunItems(uiShowcaseCompletedRunID) {
		item.SchemaVersion = SchemaVersion
		item.ID = fmt.Sprintf("run_item_ui_showcase_%02d", index+1)
		item.WorkspaceID = workspaceID
		item.ConversationID = UIShowcaseConversationID
		item.RunID = uiShowcaseCompletedRunID
		item.CreatedAt = timestamp(seededAt.Add(-4*time.Minute + time.Duration(index)*time.Second))
		if item.Status != RunItemStatusPending {
			item.StartedAt = item.CreatedAt
		}
		if item.Status == RunItemStatusCompleted || item.Status == RunItemStatusFailed || item.Status == RunItemStatusCancelled {
			item.CompletedAt = timestamp(seededAt.Add(-4*time.Minute + time.Duration(index)*time.Second + 500*time.Millisecond))
		}
		if err := store.SaveRunItem(item); err != nil {
			return err
		}
		if output := scriptedUIShowcaseOutput(item.Type); output != "" {
			if err := store.SaveRunItemOutput(workspaceID, uiShowcaseCompletedRunID, RunItemOutput{
				SchemaVersion: SchemaVersion,
				ID:            fmt.Sprintf("run_item_output_ui_showcase_%02d", index+1),
				RunItemID:     item.ID,
				Stream:        scriptedUIShowcaseOutputStream(item),
				Ordinal:       1,
				Text:          output,
				CreatedAt:     item.CreatedAt,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}
