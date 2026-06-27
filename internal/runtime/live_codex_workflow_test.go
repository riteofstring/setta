package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/codexruntime"
	"setta/internal/httpapi"
	"setta/internal/workspacesession"
)

func TestBackendAppWorkflowWithLiveCodex(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	config := testConfig(t)
	config.Version = "test"
	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}
	defer shutdownServer(t, server)

	client := &http.Client{Timeout: 30 * time.Second}
	baseURL := "http://" + server.Addr()

	health := getRuntimeJSON[httpapi.BackendHealth](t, client, baseURL, "/health")
	if !health.OK || health.Name != httpapi.BackendName {
		t.Fatalf("health = %+v, want healthy backend", health)
	}
	_ = getRuntimeJSON[workspacesession.WorkspaceSession](t, client, baseURL, "/workspace-session")

	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	conversation := postRuntimeJSON[chat.Conversation](t, client, baseURL, "/chat/conversations/create", httpapi.CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)

	list := postRuntimeJSON[httpapi.ListConversationsResponse](t, client, baseURL, "/chat/conversations/list", httpapi.ListConversationsRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if len(list.Conversations) != 1 || list.Conversations[0].Conversation.ID != conversation.ID {
		t.Fatalf("conversation list = %+v, want newly created conversation", list.Conversations)
	}

	page := postRuntimeJSON[chat.MessagePage](t, client, baseURL, "/chat/messages/page", httpapi.GetMessagePageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Limit:          40,
	}, http.StatusOK)
	if len(page.Messages) != 0 {
		t.Fatalf("new conversation message count = %d, want 0", len(page.Messages))
	}

	active := postRuntimeJSON[httpapi.GetActiveRunResponse](t, client, baseURL, "/chat/runs/active", httpapi.GetActiveRunRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
	}, http.StatusOK)
	if active.HasActiveRun {
		t.Fatalf("new conversation has active run: %+v", active.Run)
	}

	result := postRuntimeJSON[chat.SendMessageResult](t, client, baseURL, "/chat/messages/send", httpapi.SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "hello",
	}, http.StatusOK)
	defer cancelRuntimeActiveRunBestEffort(client, baseURL, opened.Workspace.ID, conversation.ID)

	if result.UserMessage.Role != chat.RoleUser || result.AssistantMessage.Role != chat.RoleAssistant {
		t.Fatalf("send result roles = %q/%q, want user/assistant", result.UserMessage.Role, result.AssistantMessage.Role)
	}
	if result.Run.Status != chat.RunStatusRunning {
		t.Fatalf("initial run status = %q, want running", result.Run.Status)
	}

	queued := postRuntimeJSON[chat.QueueMessageResult](t, client, baseURL, "/chat/messages/queue", httpapi.QueueChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "write one short sentence about queueing work",
	}, http.StatusOK)
	if queued.UserMessage.Role != chat.RoleUser || queued.UserMessage.Delivery != chat.MessageDeliveryQueued {
		t.Fatalf("queued message = %+v, want queued user message", queued.UserMessage)
	}
	if queued.Run.Status != chat.RunStatusQueued && queued.Run.Status != chat.RunStatusRunning {
		t.Fatalf("queued run status = %q, want queued or running", queued.Run.Status)
	}

	page = waitForRuntimeLiveCodexReply(t, client, baseURL, config.AppDataDir, opened.Workspace.ID, conversation.ID, result.Run.ID)
	if len(page.Messages) < 3 {
		t.Fatalf("message count = %d, want at least 3 after queueing", len(page.Messages))
	}
	if text := strings.TrimSpace(runtimeMessageText(page.Messages[1])); text == "" {
		t.Fatal("assistant reply was empty")
	}

	page = waitForRuntimeLiveCodexReply(t, client, baseURL, config.AppDataDir, opened.Workspace.ID, conversation.ID, queued.Run.ID)
	if len(page.Messages) != 4 {
		t.Fatalf("message count after queued turn = %d, want 4", len(page.Messages))
	}
	if text := strings.TrimSpace(runtimeMessageText(page.Messages[3])); text == "" {
		t.Fatal("queued assistant reply was empty")
	}
	assertRuntimeLiveCodexDurableState(t, config.AppDataDir, opened.Workspace.ID, conversation.ID)
	assertRuntimeNoCriticalDiagnostics(t, config.AppDataDir)
}

func TestBackendAppWorkflowWithLiveCodexGoalCommand(t *testing.T) {
	unsetRuntimeEnv(t, "OPENAI_API_KEY")
	requireRuntimeLiveCodexChatGPTAuth(t)

	config := testConfig(t)
	config.Version = "test"
	server, err := Start(context.Background(), config)
	if err != nil {
		t.Fatalf("start backend: %v", err)
	}
	defer shutdownServer(t, server)

	client := &http.Client{Timeout: 30 * time.Second}
	baseURL := "http://" + server.Addr()

	opened := postRuntimeJSON[httpapi.OpenWorkspaceResponse](t, client, baseURL, "/workspaces/open", httpapi.OpenWorkspaceRequest{
		RootPath: t.TempDir(),
	}, http.StatusOK)
	conversation := postRuntimeJSON[chat.Conversation](t, client, baseURL, "/chat/conversations/create", httpapi.CreateConversationRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	defer cancelRuntimeActiveRunBestEffort(client, baseURL, opened.Workspace.ID, conversation.ID)

	objective := "Reply with one short sentence containing the exact phrase setta live goal smoke."
	result := postRuntimeJSON[chat.ChatCommandExecuteResult](t, client, baseURL, "/chat/commands/execute", httpapi.ExecuteChatCommandRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Raw:            "/goal " + objective,
	}, http.StatusOK)
	if result.Message == nil || runtimeMessageText(*result.Message) != "Goal set: "+objective {
		t.Fatalf("goal command message = %+v, want %q", result.Message, "Goal set: "+objective)
	}
	if result.Page.Goal == nil || result.Page.Goal.Status != "active" || result.Page.Goal.Objective != objective {
		t.Fatalf("goal state = %+v, want active objective %q", result.Page.Goal, objective)
	}
	if len(result.Page.Transcript) != 1 || result.Page.Transcript[0].TriggerMessage.Delivery != chat.MessageDeliveryGoal {
		t.Fatalf("goal transcript = %+v, want one goal-delivered turn", result.Page.Transcript)
	}
}

func waitForRuntimeLiveCodexReply(t *testing.T, client *http.Client, baseURL string, appDataDir string, workspaceID string, conversationID string, runID string) chat.MessagePage {
	t.Helper()

	deadline := time.Now().Add(90 * time.Second)
	var lastPage chat.MessagePage
	for time.Now().Before(deadline) {
		page := postRuntimeJSON[chat.MessagePage](t, client, baseURL, "/chat/messages/page", httpapi.GetMessagePageRequest{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			Limit:          40,
		}, http.StatusOK)
		lastPage = page
		for _, message := range page.Messages {
			if message.RunID != runID || message.Role != chat.RoleAssistant {
				continue
			}
			switch message.Status {
			case chat.MessageStatusError:
				t.Fatalf("assistant message failed; %s", runtimeRunStateForFailure(appDataDir, workspaceID, runID))
			case chat.MessageStatusComplete:
				if strings.TrimSpace(runtimeMessageText(message)) == "" {
					t.Fatalf("assistant completed with an empty reply; %s", runtimeRunStateForFailure(appDataDir, workspaceID, runID))
				}
				return page
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live codex reply; %s; last page = %+v", runtimeRunStateForFailure(appDataDir, workspaceID, runID), lastPage)
	return chat.MessagePage{}
}

func getRuntimeJSON[T any](t *testing.T, client *http.Client, baseURL string, path string) T {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, baseURL+path, nil)
	if err != nil {
		t.Fatalf("create GET %s: %v", path, err)
	}
	return doRuntimeJSON[T](t, client, request, http.StatusOK)
}

func postRuntimeJSON[T any](t *testing.T, client *http.Client, baseURL string, path string, payload any, wantStatus int) T {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal %s payload: %v", path, err)
	}
	request, err := http.NewRequest(http.MethodPost, baseURL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("create POST %s: %v", path, err)
	}
	request.Header.Set("Content-Type", "application/json")
	return doRuntimeJSON[T](t, client, request, wantStatus)
}

func doRuntimeJSON[T any](t *testing.T, client *http.Client, request *http.Request, wantStatus int) T {
	t.Helper()

	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("%s %s: %v", request.Method, request.URL.Path, err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read %s response: %v", request.URL.Path, err)
	}
	if response.StatusCode != wantStatus {
		t.Fatalf("%s status = %d, want %d, body: %s", request.URL.Path, response.StatusCode, wantStatus, string(body))
	}
	var decoded T
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatalf("decode %s response: %v; body: %s", request.URL.Path, err, string(body))
	}
	return decoded
}

func cancelRuntimeActiveRunBestEffort(client *http.Client, baseURL string, workspaceID string, conversationID string) {
	body, _ := json.Marshal(httpapi.CancelRunRequest{
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
	})
	request, err := http.NewRequest(http.MethodPost, baseURL+"/chat/runs/cancel", bytes.NewReader(body))
	if err != nil {
		return
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return
	}
	_ = response.Body.Close()
}

func runtimeMessageText(message chat.ChatMessage) string {
	parts := make([]string, 0, len(message.Parts))
	for _, part := range message.Parts {
		parts = append(parts, part.Text)
	}
	return strings.Join(parts, "")
}

func runtimeRunStateForFailure(appDataDir string, workspaceID string, runID string) string {
	path := filepath.Join(appDataDir, "workspaces", workspaceID, "runs", runID+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("read run state %s: %v", path, err)
	}
	var run chat.Run
	if err := json.Unmarshal(data, &run); err != nil {
		return fmt.Sprintf("decode run state %s: %v", path, err)
	}
	if run.Error != "" {
		return fmt.Sprintf("run status = %s, error = %s", run.Status, run.Error)
	}
	return fmt.Sprintf("run status = %s", run.Status)
}

func assertRuntimeLiveCodexDurableState(t *testing.T, appDataDir string, workspaceID string, conversationID string) {
	t.Helper()

	store, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("open chat store: %v", err)
	}
	page, err := store.LoadMessagePage(workspaceID, conversationID, 0, 40)
	if err != nil {
		t.Fatalf("load durable message page: %v", err)
	}
	if len(page.Messages) != 4 {
		t.Fatalf("durable message count = %d, want 4", len(page.Messages))
	}
	if strings.TrimSpace(runtimeMessageText(page.Messages[1])) == "" ||
		strings.TrimSpace(runtimeMessageText(page.Messages[3])) == "" {
		t.Fatalf("durable assistant messages must be non-empty: %+v", page.Messages)
	}
}

func assertRuntimeNoCriticalDiagnostics(t *testing.T, appDataDir string) {
	t.Helper()

	store, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("open chat store for diagnostics: %v", err)
	}
	diagnostics, err := store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	for _, diagnostic := range diagnostics {
		if diagnostic.Severity == chat.DiagnosticSeverityCritical {
			t.Fatalf("critical diagnostic recorded during live Codex workflow: %+v", diagnostic)
		}
	}
}

func requireRuntimeLiveCodexChatGPTAuth(t *testing.T) {
	t.Helper()

	resolvedRuntime, err := codexruntime.Resolve(context.Background(), codexruntime.ResolveOptions{})
	if err != nil {
		t.Skipf("managed Codex runtime is unavailable for live workflow test: %v", err)
	}
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: resolvedRuntime.Process,
		InitializeParams: map[string]any{
			"clientInfo": map[string]any{
				"name":    "setta-live-test",
				"title":   "Setta Live Test",
				"version": "dev",
			},
			"capabilities": map[string]any{
				"experimentalApi": true,
			},
		},
		StartupInitializeError: codexruntime.StartupInitializeError(resolvedRuntime.Identity),
		StartupProbe:           codexruntime.StartupProbe(resolvedRuntime.Identity),
	})
	defer func() {
		if err := manager.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown live Codex account manager: %v", err)
		}
	}()
	service, err := codexaccount.NewService(manager, nil)
	if err != nil {
		t.Fatalf("create Codex account service: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	state, err := service.Read(ctx)
	if err != nil {
		t.Fatalf("read Codex account: %v", err)
	}
	if state.Status == codexaccount.AccountStatusUnavailable {
		t.Skipf("Codex ChatGPT auth is unavailable: %s", state.Diagnostic)
	}
	if state.Account == nil {
		t.Skip("Codex ChatGPT auth is not signed in")
	}
	switch state.Account.Type {
	case codexaccount.AccountTypeChatGPT, codexaccount.AccountTypeChatGPTAuthTokens:
		return
	case codexaccount.AccountTypeAPIKey:
		t.Skip("Codex is signed in with API-key auth; ChatGPT auth is required")
	default:
		t.Skipf("Codex account type %s is not supported for live tests", state.Account.Type)
	}
}

func unsetRuntimeEnv(t *testing.T, names ...string) {
	t.Helper()

	for _, name := range names {
		value, ok := os.LookupEnv(name)
		if err := os.Unsetenv(name); err != nil {
			t.Fatalf("unset %s: %v", name, err)
		}
		t.Cleanup(func() {
			if ok {
				if err := os.Setenv(name, value); err != nil {
					t.Fatalf("restore %s: %v", name, err)
				}
				return
			}
			if err := os.Unsetenv(name); err != nil {
				t.Fatalf("restore unset %s: %v", name, err)
			}
		})
	}
}
