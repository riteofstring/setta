package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func TestChatEndpointsCreateSendListAndPageMessages(t *testing.T) {
	handler := newChatHandler(t, nil)
	workspaceRoot := t.TempDir()
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: workspaceRoot}, http.StatusOK)

	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
		Title:       "",
	}, http.StatusOK)
	result := postJSON[chat.SendMessageResult](t, handler, "/chat/messages/send", SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "hello codex",
	}, http.StatusOK)
	if result.UserMessage.Role != chat.RoleUser {
		t.Fatalf("user message role = %q, want user", result.UserMessage.Role)
	}

	page := waitForAssistantStatus(t, handler, opened.Workspace.ID, conversation.ID, chat.MessageStatusComplete)
	if len(page.Messages) != 2 {
		t.Fatalf("message count = %d, want 2", len(page.Messages))
	}
	if page.Messages[1].Parts[0].Format != chat.TextFormatMarkdown {
		t.Fatalf("assistant format = %q, want markdown", page.Messages[1].Parts[0].Format)
	}

	list := postJSON[ListConversationsResponse](t, handler, "/chat/conversations/list", ListConversationsRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if len(list.Conversations) != 1 || list.Conversations[0].MessageCount != 2 {
		t.Fatalf("conversation list = %+v, want one conversation with two messages", list.Conversations)
	}
}

func TestChatEndpointMapsMalformedDurableStateToCorruptState(t *testing.T) {
	handler, appDataDir := newChatHandlerWithAppDataDir(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)
	conversationPath := filepath.Join(appDataDir, "workspaces", opened.Workspace.ID, "conversations", conversation.ID, "conversation.json")
	if err := os.WriteFile(conversationPath, []byte("{"), 0o644); err != nil {
		t.Fatalf("write malformed conversation state: %v", err)
	}

	errResponse := postJSON[ErrorResponse](t, handler, "/chat/messages/page", GetMessagePageRequest{
		ConversationID: conversation.ID,
		WorkspaceID:    opened.Workspace.ID,
	}, http.StatusInternalServerError)
	if errResponse.Error.Code != "corrupt_chat_state" {
		t.Fatalf("error code = %q, want corrupt_chat_state", errResponse.Error.Code)
	}
}

func TestChatEndpointsListValidConversationsWithMalformedRunState(t *testing.T) {
	handler, appDataDir := newChatHandlerWithAppDataDir(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	corruptConversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)
	validConversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID, Title: "Valid"}, http.StatusOK)
	runPath := filepath.Join(appDataDir, "workspaces", opened.Workspace.ID, "runs", "run_bad.json")
	if err := os.MkdirAll(filepath.Dir(runPath), 0o755); err != nil {
		t.Fatalf("create runs dir: %v", err)
	}
	raw := fmt.Sprintf(`{"schemaVersion":1,"id":"run_bad","workspaceId":%q,"conversationId":%q,"triggerMessageId":"message_user","assistantMessageId":"","harness":"codex","status":"running","startedAt":"2026-05-29T20:00:00Z","completedAt":"","promptSummary":"prompt","error":""}`, opened.Workspace.ID, corruptConversation.ID)
	if err := os.WriteFile(runPath, []byte(raw), 0o644); err != nil {
		t.Fatalf("write malformed run: %v", err)
	}
	unownedRunPath := filepath.Join(appDataDir, "workspaces", opened.Workspace.ID, "runs", "run_unowned.json")
	if err := os.WriteFile(unownedRunPath, []byte("{"), 0o644); err != nil {
		t.Fatalf("write unowned malformed run: %v", err)
	}

	list := postJSON[ListConversationsResponse](t, handler, "/chat/conversations/list", ListConversationsRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if len(list.Conversations) != 2 {
		t.Fatalf("conversations = %+v, want valid and corrupt-owner conversations", list.Conversations)
	}
	if !containsConversationListItem(list.Conversations, validConversation.ID) {
		t.Fatalf("conversations = %+v, want valid conversation", list.Conversations)
	}
	if !list.Corruption.HasCorruption || list.Corruption.Total != 2 {
		t.Fatalf("corruption = %+v, want two corrupt run findings", list.Corruption)
	}
	if len(list.Diagnostics) != 2 {
		t.Fatalf("diagnostics = %+v, want two corrupt run diagnostics", list.Diagnostics)
	}
	diagnostics := postJSON[ListDiagnosticsResponse](t, handler, "/chat/diagnostics/list", ListDiagnosticsRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if len(diagnostics.Diagnostics) == 0 || diagnostics.Diagnostics[0].Severity != chat.DiagnosticSeverityCritical {
		t.Fatalf("diagnostics = %+v, want critical corrupt-state diagnostic", diagnostics.Diagnostics)
	}

	sendErr := postJSON[ErrorResponse](t, handler, "/chat/messages/send", SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: corruptConversation.ID,
		Prompt:         "hello",
	}, http.StatusInternalServerError)
	if sendErr.Error.Code != "corrupt_chat_state" || !strings.Contains(sendErr.Error.Message, "assistantMessageId is required unless queued") {
		t.Fatalf("send error = %+v, want corrupt state for owning conversation", sendErr.Error)
	}
	messages, err := filepath.Glob(filepath.Join(appDataDir, "workspaces", opened.Workspace.ID, "conversations", corruptConversation.ID, "messages", "*.json"))
	if err != nil {
		t.Fatalf("glob messages: %v", err)
	}
	if len(messages) != 0 {
		t.Fatalf("send persisted messages despite corrupt run state: %v", messages)
	}

}

func TestChatEndpointsCancelActiveRun(t *testing.T) {
	handler := newChatHandler(t, []chat.FakeHarnessEvent{{Type: chat.FakeEventWaitForCancel}})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)
	result := postJSON[chat.SendMessageResult](t, handler, "/chat/messages/send", SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "cancel me",
	}, http.StatusOK)

	run := postJSON[chat.Run](t, handler, "/chat/runs/cancel", CancelRunRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if run.ID != result.Run.ID || run.Status != chat.RunStatusCancelled {
		t.Fatalf("cancelled run = %+v, want %s cancelled", run, result.Run.ID)
	}
	page := postJSON[chat.MessagePage](t, handler, "/chat/messages/page", GetMessagePageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Limit:          20,
	}, http.StatusOK)
	if page.Messages[1].Status != chat.MessageStatusCancelled {
		t.Fatalf("assistant status = %q, want cancelled", page.Messages[1].Status)
	}
}

func TestChatEndpointsQueueSteerAndRunActivity(t *testing.T) {
	handler := newChatHandler(t, []chat.FakeHarnessEvent{
		{Type: chat.FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: chat.FakeEventRunItem, ProviderItemID: "command_fake", RunItem: chat.RunItem{
			ProviderItemID: "command_fake",
			Type:           chat.RunItemTypeCommandExecution,
			Status:         chat.RunItemStatusRunning,
			Command:        "go test ./...",
		}},
		{Type: chat.FakeEventRunItemOutput, ProviderItemID: "command_fake", Stream: "stdout", Text: "ok\n"},
		{Type: chat.FakeEventWaitForSteer},
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)
	started := postJSON[chat.SendMessageResult](t, handler, "/chat/messages/send", SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "run activity",
	}, http.StatusOK)
	waitForHarnessTurn(t, handler, opened.Workspace.ID, conversation.ID, "turn_fake")

	queued := postJSON[chat.QueueMessageResult](t, handler, "/chat/messages/queue", QueueChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "queued follow-up",
	}, http.StatusOK)
	if queued.UserMessage.Delivery != chat.MessageDeliveryQueued || queued.Run.Status != chat.RunStatusQueued {
		t.Fatalf("queued result = %+v, want queued message and run", queued)
	}
	runs := postJSON[ListRunsResponse](t, handler, "/chat/runs/list", ListRunsRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	assertRunStatus(t, runs.Runs, started.Run.ID, chat.RunStatusRunning)
	assertRunStatus(t, runs.Runs, queued.Run.ID, chat.RunStatusQueued)

	steered := postJSON[chat.SteerMessageResult](t, handler, "/chat/messages/steer", SteerChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "steer now",
	}, http.StatusOK)
	if steered.UserMessage.Delivery != chat.MessageDeliverySteering {
		t.Fatalf("steering message delivery = %q, want steering", steered.UserMessage.Delivery)
	}
	waitForRunMessageStatusHTTP(t, handler, opened.Workspace.ID, conversation.ID, started.Run.ID, chat.MessageStatusComplete)

	activity := postJSON[chat.RunActivityPage](t, handler, "/chat/runs/activity", GetRunActivityRequest{
		WorkspaceID: opened.Workspace.ID,
		RunID:       started.Run.ID,
		Limit:       20,
	}, http.StatusOK)
	if len(activity.Items) == 0 || activity.Items[0].Command != "go test ./..." {
		t.Fatalf("activity items = %+v, want command activity", activity.Items)
	}
	if len(activity.Output) != 1 || activity.Output[0].Text != "ok\n" {
		t.Fatalf("activity output = %+v, want output chunk", activity.Output)
	}
	output := postJSON[chat.RunItemOutputPage](t, handler, "/chat/runs/item-output", GetRunItemOutputRequest{
		WorkspaceID:  opened.Workspace.ID,
		RunID:        started.Run.ID,
		RunItemID:    activity.Items[0].ID,
		AfterOrdinal: 0,
		Limit:        20,
	}, http.StatusOK)
	if output.RunItemID != activity.Items[0].ID || len(output.Output) != 1 || output.Output[0].Text != "ok\n" {
		t.Fatalf("item output page = %+v, want command output only", output)
	}
}

func TestChatEndpointsEditAndRemoveQueuedMessages(t *testing.T) {
	handler := newChatHandler(t, []chat.FakeHarnessEvent{{Type: chat.FakeEventWaitForCancel}})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)
	postJSON[chat.SendMessageResult](t, handler, "/chat/messages/send", SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "active",
	}, http.StatusOK)

	queued := postJSON[chat.QueueMessageResult](t, handler, "/chat/messages/queue", QueueChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "queued follow-up",
	}, http.StatusOK)
	edited := postJSON[chat.QueueEditResult](t, handler, "/chat/messages/queue/edit", EditQueuedChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		MessageID:      queued.UserMessage.ID,
		Prompt:         "edited follow-up",
	}, http.StatusOK)
	if edited.UserMessage.Parts[0].Text != "edited follow-up" || edited.Run.ID != queued.Run.ID {
		t.Fatalf("edited result = %+v, want edited queued message on original run", edited)
	}

	removed := postJSON[chat.QueueMessageResult](t, handler, "/chat/messages/queue", QueueChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "remove follow-up",
	}, http.StatusOK)
	removedResult := postJSON[chat.QueueRemoveResult](t, handler, "/chat/messages/queue/remove", RemoveQueuedChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		MessageID:      removed.UserMessage.ID,
	}, http.StatusOK)
	if removedResult.RemovedMessageID != removed.UserMessage.ID || removedResult.RemovedRunID != removed.Run.ID {
		t.Fatalf("remove result = %+v, want removed queued message and run ids", removedResult)
	}
	conflict := postJSON[ErrorResponse](t, handler, "/chat/messages/queue/edit", EditQueuedChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		MessageID:      removed.UserMessage.ID,
		Prompt:         "edit removed",
	}, http.StatusConflict)
	if conflict.Error.Code != "queued_message_conflict" {
		t.Fatalf("conflict code = %q, want queued_message_conflict", conflict.Error.Code)
	}

	page := postJSON[chat.MessagePage](t, handler, "/chat/messages/page", GetMessagePageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Limit:          20,
	}, http.StatusOK)
	if got := promptForHTTPMessage(page.Messages, queued.UserMessage.ID); got != "edited follow-up" {
		t.Fatalf("edited prompt in page = %q, want edited follow-up", got)
	}
	if got := promptForHTTPMessage(page.Messages, removed.UserMessage.ID); got != "" {
		t.Fatalf("removed prompt in page = %q, want removed message absent", got)
	}
	postJSON[chat.Run](t, handler, "/chat/runs/cancel", CancelRunRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
}

func TestChatEndpointSendsSteeringImmediately(t *testing.T) {
	handler := newChatHandler(t, []chat.FakeHarnessEvent{
		{Type: chat.FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: chat.FakeEventWaitForCancel},
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)
	started := postJSON[chat.SendMessageResult](t, handler, "/chat/messages/send", SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "active",
	}, http.StatusOK)
	waitForHarnessTurn(t, handler, opened.Workspace.ID, conversation.ID, "turn_fake")

	conflict := postJSON[ErrorResponse](t, handler, "/chat/messages/steer/immediate", SendSteeringImmediatelyRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusConflict)
	if conflict.Error.Code != "immediate_steering_conflict" {
		t.Fatalf("conflict code = %q, want immediate_steering_conflict", conflict.Error.Code)
	}

	steered := postJSON[chat.SteerMessageResult](t, handler, "/chat/messages/steer", SteerChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "steer now",
	}, http.StatusOK)
	if steered.UserMessage.Delivery != chat.MessageDeliverySteering || steered.UserMessage.Status != chat.MessageStatusPending {
		t.Fatalf("steered message = %+v, want pending steering message", steered.UserMessage)
	}
	replayed := postJSON[chat.ImmediateSteeringResult](t, handler, "/chat/messages/steer/immediate", SendSteeringImmediatelyRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if replayed.CancelledRun.ID != started.Run.ID || replayed.CancelledRun.Status != chat.RunStatusCancelled {
		t.Fatalf("cancelled run = %+v, want original run cancelled", replayed.CancelledRun)
	}
	if len(replayed.ReplayedSteeringMessageIDs) != 1 || replayed.ReplayedSteeringMessageIDs[0] != steered.UserMessage.ID {
		t.Fatalf("replayed ids = %+v, want %s", replayed.ReplayedSteeringMessageIDs, steered.UserMessage.ID)
	}
	if replayed.ActiveRun.Status != chat.RunStatusRunning || replayed.ActiveRun.ID == started.Run.ID {
		t.Fatalf("active replay run = %+v, want new running run", replayed.ActiveRun)
	}

	page := postJSON[chat.MessagePage](t, handler, "/chat/messages/page", GetMessagePageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Limit:          20,
	}, http.StatusOK)
	if got := promptForHTTPMessage(page.Messages, steered.UserMessage.ID); got != "" {
		t.Fatalf("pending steering message after replay = %q, want removed", got)
	}
	if got := promptForHTTPRun(page.Messages, replayed.ActiveRun.ID); got != "steer now" {
		t.Fatalf("replay run prompt = %q, want steer now", got)
	}
	postJSON[chat.Run](t, handler, "/chat/runs/cancel", CancelRunRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
}

func TestChatCommandEndpointsListAndExecute(t *testing.T) {
	handler := newChatHandler(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)

	list := postJSON[chat.ChatCommandListResult](t, handler, "/chat/commands/list", ListChatCommandsRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if len(list.Commands) != 2 {
		t.Fatalf("commands = %+v, want goal and model", list.Commands)
	}

	result := postJSON[chat.ChatCommandExecuteResult](t, handler, "/chat/commands/execute", ExecuteChatCommandRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Raw:            "/goal finish renderer tests",
	}, http.StatusOK)
	if result.Message == nil || result.Message.Role != chat.RoleCommand {
		t.Fatalf("command result message = %+v, want command role", result.Message)
	}
	if result.Message.Parts[0].Text != "Goal set: finish renderer tests" {
		t.Fatalf("command result text = %q, want goal set result", result.Message.Parts[0].Text)
	}
	if len(result.Page.Conversation.HarnessRefs) != 1 {
		t.Fatalf("harness refs = %+v, want command-created ref", result.Page.Conversation.HarnessRefs)
	}
	if result.Page.Goal == nil || result.Page.Goal.Status != "active" || result.Page.Goal.Objective != "finish renderer tests" {
		t.Fatalf("page goal = %+v, want active command goal", result.Page.Goal)
	}
	if len(result.Page.Transcript) != 1 || result.Page.Transcript[0].TriggerMessage.Delivery != chat.MessageDeliveryGoal {
		t.Fatalf("transcript = %+v, want internal goal trigger", result.Page.Transcript)
	}

	runs := postJSON[ListRunsResponse](t, handler, "/chat/runs/list", ListRunsRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if len(runs.Runs) != 1 {
		t.Fatalf("runs = %+v, want one goal pursuit run", runs.Runs)
	}
	if runs.Runs[0].PromptSummary != "finish renderer tests" {
		t.Fatalf("run prompt summary = %q, want objective", runs.Runs[0].PromptSummary)
	}
	waitForRunMessageStatusHTTP(t, handler, opened.Workspace.ID, conversation.ID, runs.Runs[0].ID, chat.MessageStatusComplete)
}

func TestChatCodexModelSelectionEndpoints(t *testing.T) {
	handler := newChatHandler(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)

	model := postJSON[chat.ChatCommandExecuteResult](t, handler, "/chat/codex/model/set", SetChatCodexModelRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		ModelID:        "gpt-test",
	}, http.StatusOK)
	if model.Message == nil || model.Message.Parts[0].Text != "Model set: gpt-test" {
		t.Fatalf("model result message = %+v, want model set", model.Message)
	}
	if model.Conversation.CodexSettings == nil || model.Conversation.CodexSettings.Model != "gpt-test" {
		t.Fatalf("model settings = %+v, want gpt-test", model.Conversation.CodexSettings)
	}

	effort := postJSON[chat.ChatCommandExecuteResult](t, handler, "/chat/codex/reasoning-effort/set", SetChatCodexReasoningEffortRequest{
		WorkspaceID:     opened.Workspace.ID,
		ConversationID:  conversation.ID,
		ReasoningEffort: chat.ReasoningEffortHigh,
	}, http.StatusOK)
	if effort.Message == nil || effort.Message.Parts[0].Text != "Reasoning set: High" {
		t.Fatalf("effort result message = %+v, want reasoning set", effort.Message)
	}
	if effort.Conversation.CodexSettings == nil || effort.Conversation.CodexSettings.ReasoningEffort == nil || *effort.Conversation.CodexSettings.ReasoningEffort != chat.ReasoningEffortHigh {
		t.Fatalf("effort settings = %+v, want high", effort.Conversation.CodexSettings)
	}
}

func TestChatCommandEndpointReturnsTypedUnknownCommandError(t *testing.T) {
	handler := newChatHandler(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)

	errResponse := postJSON[ErrorResponse](t, handler, "/chat/commands/execute", ExecuteChatCommandRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Raw:            "/unknown",
	}, http.StatusBadRequest)
	if errResponse.Error.Code != "unknown_command" {
		t.Fatalf("error code = %q, want unknown_command", errResponse.Error.Code)
	}
}

func TestChatEndpointsSubmitApproval(t *testing.T) {
	handler := newChatHandler(t, []chat.FakeHarnessEvent{
		{
			Type: chat.FakeEventApproval,
			Approval: chat.ApprovalRequest{
				Kind:    chat.ApprovalKindPermission,
				Title:   "Need permission",
				Body:    "Allow it",
				Options: []string{},
			},
			WaitForApproval: true,
		},
		{Type: chat.FakeEventAssistantDelta, Text: "done"},
	})
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)
	postJSON[chat.SendMessageResult](t, handler, "/chat/messages/send", SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "needs permission",
	}, http.StatusOK)

	active := waitForActiveApproval(t, handler, opened.Workspace.ID, conversation.ID)
	postJSON[chat.Run](t, handler, "/chat/approvals/submit", SubmitApprovalRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		ApprovalID:     active.Run.PendingApproval.ID,
		Approved:       true,
	}, http.StatusOK)

	page := waitForAssistantStatus(t, handler, opened.Workspace.ID, conversation.ID, chat.MessageStatusComplete)
	if page.Messages[1].Parts[0].Text != "done" {
		t.Fatalf("assistant text = %q, want done", page.Messages[1].Parts[0].Text)
	}
}

func TestChatEventStreamStreamsServerSentEvents(t *testing.T) {
	handler := newChatHandler(t, []chat.FakeHarnessEvent{{Type: chat.FakeEventAssistantDelta, Text: "done"}})
	server := httptest.NewServer(handler)
	defer server.Close()
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	conversation := postJSON[chat.Conversation](t, handler, "/chat/conversations/create", CreateConversationRequest{WorkspaceID: opened.Workspace.ID}, http.StatusOK)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+"/events", nil)
	if err != nil {
		t.Fatalf("create event stream request: %v", err)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("open event stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("event stream status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if response.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("event stream content type = %q, want text/event-stream", response.Header.Get("Content-Type"))
	}

	postJSON[chat.SendMessageResult](t, handler, "/chat/messages/send", SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "stream events",
	}, http.StatusOK)

	event := readServerSentChatEvent(t, bufio.NewReader(response.Body))
	if event.SchemaVersion != chat.EventSchemaVersion || event.Sequence == 0 || event.EventID == "" {
		t.Fatalf("event envelope = %+v, want schema sequence and id", event)
	}
	if event.StreamID == "" {
		t.Fatalf("event stream id is empty in envelope %+v", event)
	}
	if event.Type == "" || event.Payload == nil {
		t.Fatalf("event = %+v, want typed payload", event)
	}
	waitForAssistantStatus(t, handler, opened.Workspace.ID, conversation.ID, chat.MessageStatusComplete)
	cancel()
}

func newChatHandler(t *testing.T, events []chat.FakeHarnessEvent) http.Handler {
	t.Helper()

	handler, _ := newChatHandlerWithAppDataDir(t, events)
	return handler
}

func newChatHandlerWithAppDataDir(t *testing.T, events []chat.FakeHarnessEvent) (http.Handler, string) {
	t.Helper()

	appDataDir := t.TempDir()
	store, err := appstate.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new app store: %v", err)
	}
	manager, err := workspace.NewManager(
		filepath.Dir(store.Path()),
		workspace.WithClock(func() time.Time {
			return mustTime(t, "2026-05-29T20:00:00Z")
		}),
	)
	if err != nil {
		t.Fatalf("new workspace manager: %v", err)
	}
	workspaceService, err := workspacesession.NewService(store, manager)
	if err != nil {
		t.Fatalf("new workspace service: %v", err)
	}
	chatStore, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new chat store: %v", err)
	}
	chatService, err := chat.NewService(chatStore, workspaceService, chat.NewFakeHarness(events))
	if err != nil {
		t.Fatalf("new chat service: %v", err)
	}
	return NewHandler(HandlerConfig{
		ChatService:      chatService,
		Metadata:         BackendMetadata{Name: BackendName, Version: "test"},
		WorkspaceService: workspaceService,
	}), appDataDir
}

func readServerSentChatEvent(t *testing.T, reader *bufio.Reader) chat.Event {
	t.Helper()

	var data string
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read event stream line: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if data == "" {
				continue
			}
			var event chat.Event
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				t.Fatalf("decode event stream data: %v", err)
			}
			return event
		}
		if strings.HasPrefix(line, "data: ") {
			data = strings.TrimPrefix(line, "data: ")
		}
	}
}

func waitForAssistantStatus(t *testing.T, handler http.Handler, workspaceID string, conversationID string, status chat.MessageStatus) chat.MessagePage {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		page := postJSON[chat.MessagePage](t, handler, "/chat/messages/page", GetMessagePageRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			Limit:          20,
		}, http.StatusOK)
		if len(page.Messages) == 2 && page.Messages[1].Status == status {
			return page
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for assistant status %s", status)
	return chat.MessagePage{}
}

func waitForActiveApproval(t *testing.T, handler http.Handler, workspaceID string, conversationID string) GetActiveRunResponse {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		active := postJSON[GetActiveRunResponse](t, handler, "/chat/runs/active", GetActiveRunRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
		}, http.StatusOK)
		if active.HasActiveRun && active.Run.PendingApproval != nil {
			return active
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for active approval")
	return GetActiveRunResponse{}
}

func waitForHarnessTurn(t *testing.T, handler http.Handler, workspaceID string, conversationID string, turnID string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		page := postJSON[chat.MessagePage](t, handler, "/chat/messages/page", GetMessagePageRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			Limit:          20,
		}, http.StatusOK)
		for _, ref := range page.Conversation.HarnessRefs {
			if ref.LastTurnID == turnID {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for turn %s", turnID)
}

func waitForRunMessageStatusHTTP(t *testing.T, handler http.Handler, workspaceID string, conversationID string, runID string, status chat.MessageStatus) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		page := postJSON[chat.MessagePage](t, handler, "/chat/messages/page", GetMessagePageRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			Limit:          40,
		}, http.StatusOK)
		for _, item := range page.Messages {
			if item.RunID == runID && item.Role == chat.RoleAssistant && item.Status == status {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for run %s status %s", runID, status)
}

func assertRunStatus(t *testing.T, runs []chat.Run, runID string, status chat.RunStatus) {
	t.Helper()

	for _, run := range runs {
		if run.ID == runID {
			if run.Status != status {
				t.Fatalf("run %s status = %s, want %s", runID, run.Status, status)
			}
			return
		}
	}
	t.Fatalf("run %s was not returned in %+v", runID, runs)
}

func promptForHTTPMessage(messages []chat.ChatMessage, messageID string) string {
	for _, message := range messages {
		if message.ID == messageID && len(message.Parts) > 0 {
			return message.Parts[0].Text
		}
	}
	return ""
}

func promptForHTTPRun(messages []chat.ChatMessage, runID string) string {
	for _, message := range messages {
		if message.RunID == runID && message.Role == chat.RoleUser && len(message.Parts) > 0 {
			return message.Parts[0].Text
		}
	}
	return ""
}

func containsConversationListItem(items []chat.ConversationListItem, conversationID string) bool {
	for _, item := range items {
		if item.Conversation.ID == conversationID {
			return true
		}
	}
	return false
}
