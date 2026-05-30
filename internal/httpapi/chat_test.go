package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	})
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

func waitForAssistantStatus(t *testing.T, handler http.Handler, workspaceID string, conversationID string, status string) chat.MessagePage {
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
		if active.HasActiveRun && active.Run.HasPendingApproval {
			return active
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for active approval")
	return GetActiveRunResponse{}
}
