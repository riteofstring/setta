package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/httpapi"
	"setta/internal/workspacesession"
)

func TestBackendAppWorkflowWithLiveCodex(t *testing.T) {
	openAIKey := runtimeOpenAIKeyFromDotEnv(t)
	codexHome := runtimeTempDirWithRetryCleanup(t, "setta-codex-home-*")
	runtimeLoginCodexWithAPIKey(t, codexHome, openAIKey)
	t.Setenv("OPENAI_API_KEY", openAIKey)
	t.Setenv("CODEX_HOME", codexHome)

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

	page = waitForRuntimeLiveCodexReply(t, client, baseURL, config.AppDataDir, opened.Workspace.ID, conversation.ID, result.Run.ID)
	if len(page.Messages) != 2 {
		t.Fatalf("message count = %d, want 2", len(page.Messages))
	}
	if text := strings.TrimSpace(runtimeMessageText(page.Messages[1])); text == "" {
		t.Fatal("assistant reply was empty")
	}

	result = postRuntimeJSON[chat.SendMessageResult](t, client, baseURL, "/chat/messages/send", httpapi.SendChatMessageRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: conversation.ID,
		Prompt:         "write one short sentence about testing",
	}, http.StatusOK)

	if result.UserMessage.Role != chat.RoleUser || result.AssistantMessage.Role != chat.RoleAssistant {
		t.Fatalf("second send result roles = %q/%q, want user/assistant", result.UserMessage.Role, result.AssistantMessage.Role)
	}
	if result.Run.Status != chat.RunStatusRunning {
		t.Fatalf("second run status = %q, want running", result.Run.Status)
	}

	page = waitForRuntimeLiveCodexReply(t, client, baseURL, config.AppDataDir, opened.Workspace.ID, conversation.ID, result.Run.ID)
	if len(page.Messages) != 4 {
		t.Fatalf("message count after second turn = %d, want 4", len(page.Messages))
	}
	if text := strings.TrimSpace(runtimeMessageText(page.Messages[3])); text == "" {
		t.Fatal("second assistant reply was empty")
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

func runtimeLoginCodexWithAPIKey(t *testing.T, codexHome string, openAIKey string) {
	t.Helper()

	command := exec.Command("codex", "login", "--with-api-key")
	command.Env = append(os.Environ(), "CODEX_HOME="+codexHome)
	command.Stdin = strings.NewReader(openAIKey + "\n")
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		t.Fatalf("codex login --with-api-key failed: %v, stderr: %s", err, stderr.String())
	}
}

func runtimeTempDirWithRetryCleanup(t *testing.T, pattern string) string {
	t.Helper()

	dir, err := os.MkdirTemp("", pattern)
	if err != nil {
		t.Fatalf("create temp dir: %v", err)
	}
	t.Cleanup(func() {
		var removeErr error
		for attempt := 0; attempt < 20; attempt++ {
			removeErr = os.RemoveAll(dir)
			if removeErr == nil {
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
		t.Fatalf("remove temp dir %s: %v", dir, removeErr)
	})
	return dir
}

func runtimeOpenAIKeyFromDotEnv(t *testing.T) string {
	t.Helper()

	envPath := filepath.Join(runtimeRepoRoot(t), ".env")
	content, err := os.ReadFile(envPath)
	if errors.Is(err, os.ErrNotExist) {
		t.Skip("OPENAI_API_KEY is not present in .env")
	}
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	for _, line := range strings.Split(string(content), "\n") {
		key, value, ok := parseRuntimeDotEnvLine(line)
		if ok && key == "OPENAI_API_KEY" && value != "" {
			return value
		}
	}
	t.Skip("OPENAI_API_KEY is not present in .env")
	return ""
}

func parseRuntimeDotEnvLine(line string) (string, string, bool) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return "", "", false
	}
	line = strings.TrimPrefix(line, "export ")
	key, value, found := strings.Cut(line, "=")
	if !found {
		return "", "", false
	}
	key = strings.TrimSpace(key)
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "'") && strings.HasSuffix(value, "'") && len(value) >= 2 {
		value = strings.TrimSuffix(strings.TrimPrefix(value, "'"), "'")
	} else if unquoted, err := strconv.Unquote(value); err == nil {
		value = unquoted
	}
	return key, value, key != ""
}

func runtimeRepoRoot(t *testing.T) string {
	t.Helper()

	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find repository root")
		}
		dir = parent
	}
}
