package chat

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreThreadIndexOverlayDoesNotPersistTranscriptText(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	conversation := overlayConversation("thread_overlay")

	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation overlay: %v", err)
	}
	userMessage := overlayMessage("message_user_overlay", conversation.ID, "turn_overlay", RoleUser, 1, "do not duplicate user prompt")
	assistantMessage := overlayMessage("message_assistant_overlay", conversation.ID, "turn_overlay", RoleAssistant, 2, "do not duplicate assistant response")
	if err := store.SaveMessage("workspace_api", userMessage); err != nil {
		t.Fatalf("save user message: %v", err)
	}
	if err := store.SaveMessage("workspace_api", assistantMessage); err != nil {
		t.Fatalf("save assistant message: %v", err)
	}
	if err := store.SaveRun(overlayRun(conversation.ID)); err != nil {
		t.Fatalf("save run: %v", err)
	}

	assertPathMissing(t, filepath.Join(appDataDir, "workspaces", "workspace_api", "conversations", conversation.ID, "messages"))
	assertPathMissing(t, filepath.Join(appDataDir, "workspaces", "workspace_api", "runs", "turn_overlay.json"))
	assertPathMissing(t, filepath.Join(appDataDir, "workspaces", "workspace_api", "conversations", conversation.ID, "goal.json"))

	indexPath := store.threadIndexPath("workspace_api", "thread_overlay")
	assertFileContains(t, indexPath, "thread_overlay")
	assertFileOmits(t, indexPath, "do not duplicate user prompt")
	assertFileOmits(t, indexPath, "do not duplicate assistant response")
	assertFileOmits(t, indexPath, "\"title\"")
	assertFileOmits(t, indexPath, "\"summary\"")
	assertFileOmits(t, indexPath, "\"messages\"")
}

func TestStoreActivityOverlayKeepsAllowedDetailsWithoutTranscriptCopies(t *testing.T) {
	store := mustStore(t, t.TempDir())
	conversation := overlayConversation("thread_activity")
	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation overlay: %v", err)
	}
	if err := store.SaveRun(overlayRun(conversation.ID)); err != nil {
		t.Fatalf("save run: %v", err)
	}
	agent := overlayRunItem(conversation.ID, RunItemTypeAgentMessage, "agent_live")
	agent.Summary = "assistant transcript copy"
	if err := store.SaveRunItem(agent); err != nil {
		t.Fatalf("save agent item: %v", err)
	}
	command := overlayRunItem(conversation.ID, RunItemTypeCommandExecution, "command_live")
	command.Command = "go test ./internal/chat"
	if err := store.SaveRunItem(command); err != nil {
		t.Fatalf("save command item: %v", err)
	}
	if err := store.SaveRunItemOutput("workspace_api", "turn_overlay", RunItemOutput{
		SchemaVersion: SchemaVersion,
		ID:            "output_command",
		RunItemID:     command.ID,
		Stream:        "stdout",
		Ordinal:       1,
		Text:          "command output\n",
		CreatedAt:     "2026-05-29T20:00:03Z",
	}); err != nil {
		t.Fatalf("save command output: %v", err)
	}

	activityPath := store.activityOverlayPath("workspace_api", "thread_activity", "turn_overlay", "command_live")
	assertFileContains(t, activityPath, "go test ./internal/chat")
	assertFileContains(t, activityPath, "command output")
	assertFileOmits(t, activityPath, "assistant transcript copy")
	assertFileOmits(t, activityPath, "\"title\"")
	assertFileOmits(t, activityPath, "\"summary\"")
	assertFileOmits(t, activityPath, "\"text\"")
	assertFileOmits(t, activityPath, "\"transcript\"")

	agentPath := store.activityOverlayPath("workspace_api", "thread_activity", "turn_overlay", "agent_live")
	assertPathMissing(t, agentPath)
}

func TestStoreGoalStateIsProcessLocalAndDoesNotWriteGoalFile(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	conversation := overlayConversation("thread_goal")
	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation overlay: %v", err)
	}
	goal := ChatGoalState{
		ThreadID:  "thread_goal",
		Objective: "Use Codex goal API",
		Status:    "active",
		CreatedAt: 1,
		UpdatedAt: 1,
	}
	if err := store.SaveGoal("workspace_api", conversation.ID, goal); err != nil {
		t.Fatalf("save goal: %v", err)
	}
	loaded, err := store.LoadGoal("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load in-process goal: %v", err)
	}
	if loaded == nil || loaded.Objective != goal.Objective {
		t.Fatalf("loaded goal = %+v, want in-process goal", loaded)
	}
	assertPathMissing(t, filepath.Join(appDataDir, "workspaces", "workspace_api", "conversations", conversation.ID, "goal.json"))

	reopened := mustStore(t, appDataDir)
	reloaded, err := reopened.LoadGoal("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("reload goal: %v", err)
	}
	if reloaded != nil {
		t.Fatalf("reloaded goal = %+v, want nil because Codex owns durable goal state", reloaded)
	}
}

func overlayConversation(threadID string) Conversation {
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            threadID,
		WorkspaceID:   "workspace_api",
		Title:         "New chat",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs: []HarnessThreadRef{{
			Harness:       HarnessCodex,
			ThreadID:      threadID,
			Status:        HarnessRefLinked,
			CreatedAt:     "2026-05-29T20:00:00Z",
			LastResumedAt: "2026-05-29T20:00:00Z",
		}},
	}
}

func overlayMessage(id string, conversationID string, runID string, role MessageRole, ordinal int, text string) ChatMessage {
	format := TextFormatPlain
	if role == RoleAssistant {
		format = TextFormatMarkdown
	}
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		ConversationID: conversationID,
		RunID:          runID,
		Role:           role,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        ordinal,
		CreatedAt:      "2026-05-29T20:00:01Z",
		UpdatedAt:      "2026-05-29T20:00:01Z",
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			ID:     id + "_part",
			Type:   MessagePartText,
			Text:   text,
			Format: format,
		}},
	}
}

func overlayRun(conversationID string) Run {
	return Run{
		SchemaVersion:      SchemaVersion,
		ID:                 "turn_overlay",
		WorkspaceID:        "workspace_api",
		ConversationID:     conversationID,
		TriggerMessageID:   "message_user_overlay",
		AssistantMessageID: "message_assistant_overlay",
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          "2026-05-29T20:00:01Z",
	}
}

func overlayRunItem(conversationID string, itemType RunItemType, providerID string) RunItem {
	return RunItem{
		SchemaVersion:  SchemaVersion,
		ID:             "run_item_" + providerID,
		WorkspaceID:    "workspace_api",
		ConversationID: conversationID,
		RunID:          "turn_overlay",
		ProviderItemID: providerID,
		Type:           itemType,
		Status:         RunItemStatusRunning,
		CreatedAt:      "2026-05-29T20:00:02Z",
		StartedAt:      "2026-05-29T20:00:02Z",
	}
}

func assertPathMissing(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); err == nil {
		t.Fatalf("path exists: %s", path)
	} else if !os.IsNotExist(err) {
		t.Fatalf("stat %s: %v", path, err)
	}
}

func assertFileContains(t *testing.T, path string, text string) {
	t.Helper()
	content := readTestFile(t, path)
	if !strings.Contains(content, text) {
		t.Fatalf("%s does not contain %q; content=%s", path, text, content)
	}
}

func assertFileOmits(t *testing.T, path string, text string) {
	t.Helper()
	content := readTestFile(t, path)
	if strings.Contains(content, text) {
		t.Fatalf("%s contains prohibited text %q; content=%s", path, text, content)
	}
}

func readTestFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}
