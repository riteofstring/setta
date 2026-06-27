package chat

import (
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestCodexHistoryAdapterProjectsThreadSummary(t *testing.T) {
	response := decodeCodexHistoryThreadReadFixture(t, `{
		"thread": `+codexHistoryAdapterThreadFixture("thread_history", "History title", "Preview text", `[
			{
				"id": "turn_last",
				"items": [],
				"itemsView": "full",
				"status": "completed",
				"startedAt": 1710000010,
				"completedAt": 1710000020
			}
		]`)+`
	}`)

	adapter := CodexHistoryAdapter{}
	conversation, err := adapter.ProjectThread(response.Thread, CodexHistoryThreadProjectionOptions{
		WorkspaceID: "workspace_history",
		Internal:    true,
	})
	if err != nil {
		t.Fatalf("project thread: %v", err)
	}

	if conversation.ID != "thread_history" || conversation.WorkspaceID != "workspace_history" {
		t.Fatalf("conversation identity = %+v, want Codex thread id and workspace", conversation)
	}
	if conversation.Title != "History title" || !conversation.Internal {
		t.Fatalf("conversation title/internal = %q/%v, want history title/internal", conversation.Title, conversation.Internal)
	}
	if conversation.CreatedAt != "2024-03-09T16:00:00Z" || conversation.UpdatedAt != "2024-03-09T16:01:00Z" {
		t.Fatalf("conversation timestamps = %q/%q, want Codex timestamps", conversation.CreatedAt, conversation.UpdatedAt)
	}
	if len(conversation.HarnessRefs) != 1 {
		t.Fatalf("harness refs = %+v, want one Codex ref", conversation.HarnessRefs)
	}
	ref := conversation.HarnessRefs[0]
	if ref.Harness != HarnessCodex || ref.ThreadID != "thread_history" || ref.SessionID != "session_thread_history" || ref.LastTurnID != "turn_last" {
		t.Fatalf("harness ref = %+v, want Codex thread/session/turn ids", ref)
	}
}

func TestCodexHistoryAdapterBuildsCursorBasedHistoryRequests(t *testing.T) {
	adapter := CodexHistoryAdapter{}
	cursor := "cursor_older"
	params := adapter.ThreadTurnsListParams("thread_history", &cursor, 40)
	if params.ThreadID != "thread_history" || params.Cursor == nil || *params.Cursor != "cursor_older" {
		t.Fatalf("turns params identity/cursor = %+v, want thread and cursor", params)
	}
	if params.Limit == nil || *params.Limit != 40 {
		t.Fatalf("turns params limit = %v, want 40", params.Limit)
	}
	if params.ItemsView == nil || *params.ItemsView != codexapp.TurnItemsViewFull {
		t.Fatalf("turns params itemsView = %v, want full", params.ItemsView)
	}
	if params.SortDirection == nil || *params.SortDirection != codexapp.SortDirectionDesc {
		t.Fatalf("turns params sortDirection = %v, want desc for newest-page loading", params.SortDirection)
	}

	readParams := adapter.ThreadReadIncludeTurnsParams("thread_history")
	if readParams.ThreadID != "thread_history" || readParams.IncludeTurns == nil || !*readParams.IncludeTurns {
		t.Fatalf("thread/read params = %+v, want focused includeTurns read", readParams)
	}
	if got := codexHistoryActivityOverlayRowKey("thread", "turn", "command", "request"); got != "thread:turn:command:request" {
		t.Fatalf("activity overlay row key = %q, want stable turn-scoped key", got)
	}
}

func TestCodexHistoryAdapterProjectsTurnsPage(t *testing.T) {
	thread := decodeCodexHistoryThreadReadFixture(t, `{
		"thread": `+codexHistoryAdapterThreadFixture("thread_history", "History title", "Preview text", `[]`)+`
	}`).Thread
	response := decodeCodexHistoryTurnsFixture(t, `{
		"data": [
			{
				"id": "turn_alpha",
				"items": [
					{"id":"item_user_alpha","type":"userMessage","content":[{"type":"text","text":"Build the adapter"}]},
					{"id":"item_user_steer","type":"userMessage","content":[{"type":"text","text":"Include fixtures"}]},
					{"id":"item_plan_alpha","type":"plan","text":"1. inspect\n2. implement"},
					{"id":"item_reason_alpha","type":"reasoning","summary":["Read the plan","Mapped history"]},
					{"id":"item_cmd_alpha","type":"commandExecution","command":"go test ./internal/chat","commandActions":[],"cwd":"/tmp/setta","status":"completed","exitCode":0,"durationMs":42,"aggregatedOutput":"ok\n"},
					{"id":"item_file_alpha","type":"fileChange","status":"completed","changes":[{"kind":{"type":"modify"},"path":"internal/chat/codex_history_adapter.go","diff":"@@ patch"}]},
					{"id":"item_mcp_alpha","type":"mcpToolCall","server":"repo","tool":"inspect","arguments":{"path":"internal/chat"},"status":"completed","result":{"content":[{"type":"text","text":"mcp ok"}]}},
					{"id":"item_dynamic_alpha","type":"dynamicToolCall","namespace":"workspace","tool":"summarize","arguments":{"target":"history"},"status":"completed","contentItems":[{"type":"inputText","text":"dynamic ok"}]},
					{"id":"item_compaction_alpha","type":"contextCompaction"},
					{"id":"item_agent_alpha","type":"agentMessage","text":"Adapter ready"}
				],
				"itemsView": "full",
				"status": "completed",
				"startedAt": 1710000010,
				"completedAt": 1710000020,
				"durationMs": 10000
			}
		],
		"nextCursor": "cursor_older",
		"backwardsCursor": "cursor_newer"
	}`)

	adapter := CodexHistoryAdapter{}
	projected, err := adapter.ProjectTurnsPage(thread, response, CodexHistoryThreadProjectionOptions{WorkspaceID: "workspace_history"})
	if err != nil {
		t.Fatalf("project turns page: %v", err)
	}

	page := projected.Page
	assertCodexHistoryProjectedCursors(t, projected)
	trigger, steering, assistant := assertCodexHistoryProjectedMessages(t, page)
	assertCodexHistoryProjectedTranscript(t, page, trigger, steering, assistant)
	assertCodexHistoryProjectedRunItems(t, page)
}

func TestCodexHistoryAdapterProjectsDescendingTurnsPageChronologically(t *testing.T) {
	thread := decodeCodexHistoryThreadReadFixture(t, `{
		"thread": `+codexHistoryAdapterThreadFixture("thread_history", "History title", "Preview text", `[]`)+`
	}`).Thread
	response := decodeCodexHistoryTurnsFixture(t, `{
		"data": [
			{
				"id": "turn_newer",
				"items": [
					{"id":"item_user_newer","type":"userMessage","content":[{"type":"text","text":"Newer request"}]},
					{"id":"item_agent_newer","type":"agentMessage","text":"Newer response"}
				],
				"itemsView": "full",
				"status": "completed",
				"startedAt": 1710000030,
				"completedAt": 1710000040
			},
			{
				"id": "turn_older",
				"items": [
					{"id":"item_user_older","type":"userMessage","content":[{"type":"text","text":"Older request"}]},
					{"id":"item_agent_older","type":"agentMessage","text":"Older response"}
				],
				"itemsView": "full",
				"status": "completed",
				"startedAt": 1710000010,
				"completedAt": 1710000020
			}
		],
		"nextCursor": "cursor_older"
	}`)

	projected, err := (CodexHistoryAdapter{}).ProjectTurnsPage(thread, response, CodexHistoryThreadProjectionOptions{WorkspaceID: "workspace_history"})
	if err != nil {
		t.Fatalf("project turns page: %v", err)
	}

	page := projected.Page
	if len(page.Transcript) != 2 {
		t.Fatalf("transcript = %+v, want two turns", page.Transcript)
	}
	if page.Transcript[0].Run.ID != "turn_older" || page.Transcript[1].Run.ID != "turn_newer" {
		t.Fatalf("transcript turn order = %s/%s, want older before newer", page.Transcript[0].Run.ID, page.Transcript[1].Run.ID)
	}
	if len(page.Messages) != 4 {
		t.Fatalf("messages = %+v, want older user/assistant then newer user/assistant", page.Messages)
	}
	assertCodexHistoryMessageOrder(t, page.Messages, []codexHistoryExpectedMessage{
		{id: "thread_history:turn_older:item_user_older", ordinal: 1, text: "Older request"},
		{id: "thread_history:turn_older:item_agent_older", ordinal: 2, text: "Older response"},
		{id: "thread_history:turn_newer:item_user_newer", ordinal: 3, text: "Newer request"},
		{id: "thread_history:turn_newer:item_agent_newer", ordinal: 4, text: "Newer response"},
	})
}

type codexHistoryExpectedMessage struct {
	id      string
	ordinal int
	text    string
}

func assertCodexHistoryMessageOrder(t *testing.T, messages []ChatMessage, expected []codexHistoryExpectedMessage) {
	t.Helper()
	if len(messages) != len(expected) {
		t.Fatalf("messages = %+v, want %d messages", messages, len(expected))
	}
	for index, want := range expected {
		message := messages[index]
		if message.ID != want.id || message.Ordinal != want.ordinal || promptFromMessage(message) != want.text {
			t.Fatalf("message[%d] = %+v, want id=%s ordinal=%d text=%q", index, message, want.id, want.ordinal, want.text)
		}
	}
}

func assertCodexHistoryProjectedCursors(t *testing.T, projected CodexHistoryMessagePage) {
	t.Helper()
	if projected.NextCursor == nil || *projected.NextCursor != "cursor_older" || projected.BackwardsCursor == nil || *projected.BackwardsCursor != "cursor_newer" {
		t.Fatalf("projected cursors = %v/%v, want Codex cursors", projected.NextCursor, projected.BackwardsCursor)
	}
	if !projected.Page.HasMoreOlder || projected.Page.OlderBeforeOrdinal != 1 {
		t.Fatalf("page older state = %v/%d, want Codex cursor-backed older state", projected.Page.HasMoreOlder, projected.Page.OlderBeforeOrdinal)
	}
}

func assertCodexHistoryProjectedMessages(t *testing.T, page MessagePage) (ChatMessage, ChatMessage, ChatMessage) {
	t.Helper()
	if len(page.Messages) != 3 {
		t.Fatalf("messages = %+v, want trigger, steering, and assistant", page.Messages)
	}
	trigger := page.Messages[0]
	if trigger.ID != "thread_history:turn_alpha:item_user_alpha" || trigger.Role != RoleUser || trigger.Delivery != MessageDeliveryNormal || promptFromMessage(trigger) != "Build the adapter" {
		t.Fatalf("trigger message = %+v, want projected Codex user item", trigger)
	}
	steering := page.Messages[1]
	if steering.ID != "thread_history:turn_alpha:item_user_steer" || steering.Delivery != MessageDeliverySteering || promptFromMessage(steering) != "Include fixtures" {
		t.Fatalf("steering message = %+v, want projected additional Codex user item", steering)
	}
	assistant := page.Messages[2]
	if assistant.ID != "thread_history:turn_alpha:item_agent_alpha" || assistant.Role != RoleAssistant || assistant.Status != MessageStatusComplete || promptFromMessage(assistant) != "Adapter ready" {
		t.Fatalf("assistant message = %+v, want projected Codex agent item", assistant)
	}
	return trigger, steering, assistant
}

func assertCodexHistoryProjectedTranscript(t *testing.T, page MessagePage, trigger ChatMessage, steering ChatMessage, assistant ChatMessage) {
	t.Helper()
	if len(page.Transcript) != 1 {
		t.Fatalf("transcript = %+v, want one turn", page.Transcript)
	}
	turn := page.Transcript[0]
	if turn.Run.ID != "turn_alpha" || turn.Run.Status != RunStatusCompleted || turn.Run.TriggerMessageID != trigger.ID || turn.Run.AssistantMessageID != assistant.ID {
		t.Fatalf("transcript run = %+v, want Codex turn-backed run", turn.Run)
	}
	if turn.AssistantMessage == nil || turn.AssistantMessage.ID != assistant.ID || len(turn.SteeringMessages) != 1 || turn.SteeringMessages[0].ID != steering.ID {
		t.Fatalf("transcript turn = %+v, want assistant and steering projections", turn)
	}
}

func assertCodexHistoryProjectedRunItems(t *testing.T, page MessagePage) {
	t.Helper()
	command := requireProjectedRunItem(t, page.RunItems, RunItemTypeCommandExecution)
	if command.ID != "thread_history:turn_alpha:item_cmd_alpha" || command.ProviderItemID != "item_cmd_alpha" || command.Command != "go test ./internal/chat" || command.Cwd != "/tmp/setta" || command.Status != RunItemStatusCompleted {
		t.Fatalf("command item = %+v, want projected command execution summary", command)
	}
	fileChange := requireProjectedRunItem(t, page.RunItems, RunItemTypeFileChange)
	if len(fileChange.FilePaths) != 1 || fileChange.FilePaths[0] != "internal/chat/codex_history_adapter.go" || fileChange.PatchStatus != "completed" {
		t.Fatalf("file change item = %+v, want changed path and status", fileChange)
	}
	assertCodexHistoryProjectedToolRunItems(t, page)
	assertCodexHistoryProjectedCommandOutput(t, page, command)
}

func assertCodexHistoryProjectedToolRunItems(t *testing.T, page MessagePage) {
	t.Helper()
	reasoning := requireProjectedRunItem(t, page.RunItems, RunItemTypeReasoning)
	if reasoning.Summary != "Read the plan\nMapped history" {
		t.Fatalf("reasoning summary = %q, want joined summary", reasoning.Summary)
	}
	mcp := requireProjectedRunItem(t, page.RunItems, RunItemTypeMCPToolCall)
	if mcp.ServerName != "repo" || mcp.ToolName != "inspect" || !strings.Contains(mcp.Result, "mcp ok") {
		t.Fatalf("mcp item = %+v, want tool summary and result", mcp)
	}
	dynamic := requireProjectedRunItem(t, page.RunItems, RunItemTypeDynamicToolCall)
	if dynamic.Namespace != "workspace" || dynamic.ToolName != "summarize" || dynamic.Summary != "workspace.summarize" || !strings.Contains(dynamic.Result, "dynamic ok") {
		t.Fatalf("dynamic item = %+v, want namespaced dynamic tool summary", dynamic)
	}
	requireProjectedRunItem(t, page.RunItems, RunItemTypeContextCompaction)
}

func assertCodexHistoryProjectedCommandOutput(t *testing.T, page MessagePage, command RunItem) {
	t.Helper()
	if len(page.RunItemOutputs) != 1 {
		t.Fatalf("outputs = %+v, want aggregated command output", page.RunItemOutputs)
	}
	output := page.RunItemOutputs[0]
	if output.ID != "thread_history:turn_alpha:item_cmd_alpha:output:0" || output.RunItemID != command.ID || output.Stream != codexCommandExecutionOutputStream || output.Text != "ok\n" {
		t.Fatalf("command output = %+v, want stable output row", output)
	}
}

func TestCodexHistoryAdapterProjectsThreadReadFocusedTurns(t *testing.T) {
	response := decodeCodexHistoryThreadReadFixture(t, `{
		"thread": `+codexHistoryAdapterThreadFixture("thread_read", "Read title", "Preview text", `[
			{
				"id": "turn_read",
				"items": [
					{"id":"item_user_read","type":"userMessage","content":[{"type":"text","text":"Read this"}]},
					{"id":"item_agent_read","type":"agentMessage","text":"Read complete"}
				],
				"itemsView": "full",
				"status": "completed",
				"startedAt": 1710000030,
				"completedAt": 1710000040
			}
		]`)+`
	}`)

	adapter := CodexHistoryAdapter{}
	projected, err := adapter.ProjectThreadRead(response, CodexHistoryThreadProjectionOptions{WorkspaceID: "workspace_history"})
	if err != nil {
		t.Fatalf("project thread/read: %v", err)
	}
	if projected.NextCursor != nil || projected.BackwardsCursor != nil || projected.Page.HasMoreOlder {
		t.Fatalf("thread/read projection cursors = %v/%v older=%v, want focused non-paged read", projected.NextCursor, projected.BackwardsCursor, projected.Page.HasMoreOlder)
	}
	if len(projected.Page.Transcript) != 1 || projected.Page.Transcript[0].Run.ID != "turn_read" {
		t.Fatalf("thread/read transcript = %+v, want projected included turn", projected.Page.Transcript)
	}
	if projected.Page.Conversation.HarnessRefs[0].LastTurnID != "turn_read" {
		t.Fatalf("thread/read last turn = %q, want included turn id", projected.Page.Conversation.HarnessRefs[0].LastTurnID)
	}
}

func TestCodexHistoryAdapterRejectsUnsupportedHistoryItemVariant(t *testing.T) {
	thread := decodeCodexHistoryThreadReadFixture(t, `{
		"thread": `+codexHistoryAdapterThreadFixture("thread_history", "History title", "Preview text", `[]`)+`
	}`).Thread
	response := decodeCodexHistoryTurnsFixture(t, `{
		"data": [
			{
				"id": "turn_unsupported",
				"items": [
					{"id":"item_user","type":"userMessage","content":[{"type":"text","text":"Run hooks"}]},
					{"id":"item_hook","type":"hookPrompt","fragments":[]}
				],
				"itemsView": "full",
				"status": "completed"
			}
		]
	}`)

	_, err := (CodexHistoryAdapter{}).ProjectTurnsPage(thread, response, CodexHistoryThreadProjectionOptions{WorkspaceID: "workspace_history"})
	if err == nil {
		t.Fatal("project turns succeeded, want unsupported item error")
	}
	if !strings.Contains(err.Error(), "unsupported codex history item type: hookPrompt") {
		t.Fatalf("error = %q, want unsupported hookPrompt", err)
	}
}

func TestCodexHistoryAdapterRejectsMissingRequiredHistoryItemFields(t *testing.T) {
	thread := decodeCodexHistoryThreadReadFixture(t, `{
		"thread": `+codexHistoryAdapterThreadFixture("thread_history", "History title", "Preview text", `[]`)+`
	}`).Thread
	response := decodeCodexHistoryTurnsFixture(t, `{
		"data": [
			{
				"id": "turn_missing",
				"items": [
					{"id":"item_user","type":"userMessage","content":[{"type":"text","text":"Answer"}]},
					{"id":"item_agent","type":"agentMessage"}
				],
				"itemsView": "full",
				"status": "completed"
			}
		]
	}`)

	_, err := (CodexHistoryAdapter{}).ProjectTurnsPage(thread, response, CodexHistoryThreadProjectionOptions{WorkspaceID: "workspace_history"})
	if err == nil {
		t.Fatal("project turns succeeded, want required field error")
	}
	if !strings.Contains(err.Error(), "codex history agentMessage item.text is required") {
		t.Fatalf("error = %q, want missing agentMessage text", err)
	}
}

func TestCodexHistoryAdapterRejectsNonFullTranscriptItems(t *testing.T) {
	thread := decodeCodexHistoryThreadReadFixture(t, `{
		"thread": `+codexHistoryAdapterThreadFixture("thread_history", "History title", "Preview text", `[]`)+`
	}`).Thread
	response := decodeCodexHistoryTurnsFixture(t, `{
		"data": [
			{
				"id": "turn_summary",
				"items": [],
				"itemsView": "summary",
				"status": "completed"
			}
		]
	}`)

	_, err := (CodexHistoryAdapter{}).ProjectTurnsPage(thread, response, CodexHistoryThreadProjectionOptions{WorkspaceID: "workspace_history"})
	if err == nil {
		t.Fatal("project turns succeeded, want full items requirement")
	}
	if !strings.Contains(err.Error(), "full items are required") {
		t.Fatalf("error = %q, want full items requirement", err)
	}
}

func decodeCodexHistoryThreadReadFixture(t *testing.T, fixture string) codexapp.ThreadReadResponse {
	t.Helper()
	response, err := codexapp.DecodeThreadReadResponse(json.RawMessage(fixture))
	if err != nil {
		t.Fatalf("decode thread/read fixture: %v", err)
	}
	return response
}

func decodeCodexHistoryTurnsFixture(t *testing.T, fixture string) codexapp.ThreadTurnsListResponse {
	t.Helper()
	response, err := codexapp.DecodeThreadTurnsListResponse(json.RawMessage(fixture))
	if err != nil {
		t.Fatalf("decode thread/turns/list fixture: %v", err)
	}
	return response
}

func codexHistoryAdapterThreadFixture(id string, name string, preview string, turns string) string {
	return strings.NewReplacer(
		"$id", id,
		"$name", name,
		"$preview", preview,
		"$turns", turns,
	).Replace(`{
		"cliVersion": "0.0.0-test",
		"createdAt": 1710000000,
		"cwd": "/tmp/setta-history",
		"ephemeral": false,
		"id": "$id",
		"modelProvider": "openai",
		"name": "$name",
		"preview": "$preview",
		"sessionId": "session_$id",
		"source": {"kind":"appServer"},
		"status": {"type":"idle"},
		"turns": $turns,
		"updatedAt": 1710000060
	}`)
}

func requireProjectedRunItem(t *testing.T, items []RunItem, itemType RunItemType) RunItem {
	t.Helper()
	for _, item := range items {
		if item.Type == itemType {
			return item
		}
	}
	t.Fatalf("run items = %+v, want %s", items, itemType)
	return RunItem{}
}
