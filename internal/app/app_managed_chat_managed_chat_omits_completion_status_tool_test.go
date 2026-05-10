package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"
)

func TestAppManagedChatOmitsCompletionStatusToolWhenGuardDisabled(t *testing.T) {
	// Managed chat should read the persisted completion guard setting from the
	// real app runtime and omit the completion-reporting tool when disabled.
	fixture := startAppCompletionGuardFixture(t)
	t.Setenv("OPENAI_API_KEY", "secret")

	providerRequests, provider := startAppCompletionGuardNoStatusToolProvider(t)
	saveAppCompletionGuardEngine(
		t,
		fixture.cfg,
		provider.URL+"/v1",
		[]string{mcpx.DefaultServerID},
		map[string]llmconfig.ServerConfig{
			mcpx.DefaultServerID: {
				Transport: "streamable_http",
				URL:       fixture.serverURL + "/mcp",
			},
		},
	)
	fixture.startApp(t)

	setAppCompletionGuardEnabled(t, fixture.app, false)
	waitForAppMCPClientState(t, fixture.app, mcpx.RuntimeStateConnected)
	seedAppEmptyProject(t, fixture.app)

	chatID := sendAppManagedChatProviderMessage(t, fixture.serverURL, fixture.authCookie, "Reply without completion reporting.", false, "completion guard disabled")
	waitForAppManagedChatHydration(t, fixture.serverURL, fixture.authCookie, chatID, false, "No completion tool needed", "completion guard disabled")
	assertAppCompletionGuardRequestOmitsStatusTool(t, providerRequests)
}

func TestAppManagedChatFailsClosedWhenCompletionReportToolMissing(t *testing.T) {
	// Managed chat should fail before any provider call when completion guard
	// is enabled but the managed LLM config cannot supply report_completion_status.
	fixture := startAppCompletionGuardFixture(t)
	t.Setenv("OPENAI_API_KEY", "secret")

	providerCalled, provider := startAppCompletionGuardUnexpectedProvider(t)
	saveAppCompletionGuardEngine(t, fixture.cfg, provider.URL+"/v1", []string{}, map[string]llmconfig.ServerConfig{})
	fixture.startApp(t)
	setAppCompletionGuardEnabled(t, fixture.app, true)
	seedAppEmptyProject(t, fixture.app)

	chatID := sendAppManagedChatProviderMessage(t, fixture.serverURL, fixture.authCookie, "Reply only after completion reporting.", false, "completion guard fail-closed")
	waitForAppManagedChatFailedRun(t, fixture.app, fixture.cfg.Paths.SettaFilesRoot, chatID)
	hydrated := waitForAppManagedChatHydrationMessages(t, fixture.serverURL, fixture.authCookie, chatID, "completion guard fail-closed")
	assertAppCompletionGuardFailureMessage(t, hydrated)
	assertAppCompletionGuardProviderNotCalled(t, providerCalled)
}

func TestAppServesManagedChatSendThroughOpenAIThinkingExecutor(t *testing.T) {
	// The real IDE app should run managed OpenAI thinking chat sends through
	// the Go-owned Responses executor and persist the streamed thinking block.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")
	t.Cleanup(func() {
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			_ = os.RemoveAll(cfg.Paths.WorkspaceRoot)
			if _, err := os.Stat(cfg.Paths.WorkspaceRoot); errors.Is(err, os.ErrNotExist) {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
	})

	providerRequests, provider := startAppManagedChatOpenAIThinkingProvider(t)
	saveAppManagedChatProviderEngine(t, cfg, llmconfig.Config{
		ID:       "primary",
		Model:    "gpt-5-codex",
		Provider: "openai",
		BaseURL:  provider.URL + "/v1",
		OtherParams: map[string]any{
			"reasoning_effort": "high",
		},
		APIKeyEnv: "OPENAI_API_KEY",
	}, "Managed OpenAI Thinking Engine")
	app, server, authCookie := startAppManagedChatProviderServer(t, cfg)

	chatID := sendAppManagedChatProviderMessage(t, server.URL, authCookie, "Create a managed OpenAI thinking project.", true, "OpenAI thinking")
	hydrated := waitForAppManagedChatProviderResult(t, app, cfg, server.URL, authCookie, chatID, "Final answer", "OpenAI thinking")
	assertAppManagedChatOpenAIThinkingHydration(t, hydrated)
	assertAppManagedChatOpenAIThinkingProviderRequest(t, providerRequests)
}

type appCompletionGuardFixture struct {
	cfg        config.Config
	listener   net.Listener
	serverURL  string
	app        *App
	authCookie *http.Cookie
}

func startAppCompletionGuardFixture(t *testing.T) appCompletionGuardFixture {
	t.Helper()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	prepareAppCurrentSession(t, cfg)
	cleanupAppTestWorkspaceRoot(t, cfg.Paths.WorkspaceRoot, 2*time.Second)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	cfg.Server.Port = listener.Addr().(*net.TCPAddr).Port
	return appCompletionGuardFixture{
		cfg:       cfg,
		listener:  listener,
		serverURL: "http://" + listener.Addr().String(),
	}
}

func (fixture *appCompletionGuardFixture) startApp(t *testing.T) {
	t.Helper()

	fixture.app = startAppCompletionGuardHTTPServer(t, fixture.cfg, fixture.listener)
	fixture.authCookie = newAppTestAuthCookie(t, fixture.app)
}

func cleanupAppTestWorkspaceRoot(t *testing.T, workspaceRoot string, timeout time.Duration) {
	t.Helper()

	t.Cleanup(func() {
		deadline := time.Now().Add(timeout)
		for time.Now().Before(deadline) {
			_ = os.RemoveAll(workspaceRoot)
			if _, err := os.Stat(workspaceRoot); errors.Is(err, os.ErrNotExist) {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
	})
}

func startAppCompletionGuardHTTPServer(t *testing.T, cfg config.Config, listener net.Listener) *App {
	t.Helper()

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	server := &http.Server{Handler: app.Handler()}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.Serve(listener)
	}()

	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("shutdown http server: %v", err)
		}
		err := <-serverErrors
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("serve app: %v", err)
		}
	})
	return app
}

func startAppCompletionGuardNoStatusToolProvider(
	t *testing.T,
) (<-chan appManagedChatAttachmentProviderRequest, *httptest.Server) {
	t.Helper()

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, ok := captureAppManagedChatProviderRequest(w, r, "")
		if !ok {
			return
		}
		providerRequests <- captured
		writeAppManagedChatProviderStream(w,
			"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"No completion tool\"}}]}\n\n",
			"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" needed\"},\"finish_reason\":\"stop\"}]}\n\n",
			"data: [DONE]\n\n",
		)
	}))
	t.Cleanup(provider.Close)
	return providerRequests, provider
}

func startAppCompletionGuardUnexpectedProvider(t *testing.T) (<-chan struct{}, *httptest.Server) {
	t.Helper()

	providerCalled := make(chan struct{}, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case providerCalled <- struct{}{}:
		default:
		}
		http.Error(w, "provider should not be called", http.StatusInternalServerError)
	}))
	t.Cleanup(provider.Close)
	return providerCalled, provider
}

func saveAppCompletionGuardEngine(
	t *testing.T,
	cfg config.Config,
	providerBaseURL string,
	mcpServerIDs []string,
	mcpServers map[string]llmconfig.ServerConfig,
) {
	t.Helper()

	saveAppTestLLMConfigs(t, cfg, map[string]llmconfig.Config{
		"primary": {
			ID:           "primary",
			Model:        "gpt-4o-mini",
			Provider:     "openai",
			BaseURL:      providerBaseURL,
			APIKeyEnv:    "OPENAI_API_KEY",
			MCPServerIDs: mcpServerIDs,
		},
	}, mcpServers)
	writeAppManagedChatEngineConfig(t, cfg, "Managed Engine")
}

func assertAppCompletionGuardRequestOmitsStatusTool(
	t *testing.T,
	providerRequests <-chan appManagedChatAttachmentProviderRequest,
) {
	t.Helper()

	captured := waitForAppManagedChatProviderRequest(t, providerRequests, "completion guard disabled")
	firstTools, ok := captured.Body["tools"].([]any)
	if !ok || len(firstTools) == 0 {
		t.Fatalf("expected openai tool definitions, got %#v", captured.Body["tools"])
	}
	firstToolsJSON, err := json.Marshal(firstTools)
	if err != nil {
		t.Fatalf("marshal openai tool definitions: %v", err)
	}
	if strings.Contains(string(firstToolsJSON), "setta__report_completion_status") {
		t.Fatalf("expected openai tool set to omit report_completion_status, got %s", string(firstToolsJSON))
	}
}

func waitForAppManagedChatFailedRun(t *testing.T, app *App, settaFilesRoot string, chatID string) {
	t.Helper()

	runStore, err := agentruns.NewRunStore(settaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	runType := "llm_chat"
	projectID := "project-alpha"
	failedRunID := ""
	waitForAppCondition(t, 5*time.Second, func() bool {
		runs, err := runStore.ListByMetadata(agentruns.RunFilter{
			RunType:         &runType,
			ChatID:          &chatID,
			ProjectConfigID: &projectID,
		})
		if err != nil {
			t.Fatalf("list managed runs: %v", err)
		}
		for _, run := range runs {
			if run.Status == agentruns.RunStatusFailed {
				failedRunID = run.ID
				return true
			}
		}
		return false
	})
	if strings.TrimSpace(failedRunID) == "" {
		t.Fatal("expected failed managed run id")
	}
	failedRun, err := app.agentRuntime.WaitForRun(context.Background(), failedRunID)
	if err != nil {
		t.Fatalf("wait for managed runtime failure: %v", err)
	}
	if failedRun.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed managed run, got %#v", failedRun)
	}
}

func waitForAppManagedChatHydrationMessages(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	chatID string,
	contextLabel string,
) appManagedChatHydratePayload {
	t.Helper()

	var hydrated appManagedChatHydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			serverURL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new %s hydrate request: %v", contextLabel, err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate %s managed chat: %v", contextLabel, err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode %s hydrate payload: %v", contextLabel, err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})
	return hydrated
}

func assertAppCompletionGuardFailureMessage(t *testing.T, hydrated appManagedChatHydratePayload) {
	t.Helper()

	assistantText := appTestMessageText(hydrated.Messages[1])
	if !strings.Contains(assistantText, "Completion guard is enabled") {
		t.Fatalf("expected completion-guard failure text, got %#v", hydrated.Messages[1])
	}
	if !strings.Contains(assistantText, "report_completion_status") {
		t.Fatalf("expected completion tool name in failure text, got %#v", hydrated.Messages[1])
	}
}

func assertAppCompletionGuardProviderNotCalled(t *testing.T, providerCalled <-chan struct{}) {
	t.Helper()

	select {
	case <-providerCalled:
		t.Fatal("expected managed chat to fail before contacting provider")
	default:
	}
}

func startAppManagedChatOpenAIThinkingProvider(
	t *testing.T,
) (<-chan appManagedChatAttachmentProviderRequest, *httptest.Server) {
	t.Helper()

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, ok := captureAppManagedChatProviderRequest(w, r, "")
		if !ok {
			return
		}
		providerRequests <- captured
		writeAppManagedChatProviderStream(w,
			"data: {\"type\":\"response.output_item.added\",\"sequence_number\":1,\"output_index\":0,\"item\":{\"type\":\"reasoning\",\"id\":\"reasoning-1\",\"summary\":[],\"content\":[],\"status\":\"in_progress\"}}\n\n",
			"data: {\"type\":\"response.reasoning_summary_text.delta\",\"sequence_number\":2,\"item_id\":\"reasoning-1\",\"output_index\":0,\"summary_index\":0,\"delta\":\"Plan summary\"}\n\n",
			"data: {\"type\":\"response.reasoning_text.delta\",\"sequence_number\":3,\"item_id\":\"reasoning-1\",\"output_index\":0,\"content_index\":0,\"delta\":\"Planning deeply\"}\n\n",
			"data: {\"type\":\"response.output_text.delta\",\"sequence_number\":4,\"item_id\":\"message-1\",\"output_index\":1,\"content_index\":0,\"delta\":\"Final answer\",\"logprobs\":[]}\n\n",
			"data: {\"type\":\"response.completed\",\"sequence_number\":99,\"response\":{\"id\":\"response-1\",\"object\":\"response\",\"created_at\":1741567200,\"status\":\"completed\",\"model\":\"gpt-5-codex\",\"output\":[{\"type\":\"reasoning\",\"id\":\"reasoning-1\",\"summary\":[{\"text\":\"Plan summary\"}],\"content\":[{\"type\":\"reasoning_text\",\"text\":\"Planning deeply\"}],\"status\":\"completed\"},{\"type\":\"message\",\"id\":\"message-1\",\"role\":\"assistant\",\"status\":\"completed\",\"content\":[{\"type\":\"output_text\",\"text\":\"Final answer\",\"annotations\":[]}]}],\"usage\":{\"input_tokens\":8,\"input_tokens_details\":{\"cached_tokens\":0},\"output_tokens\":3,\"output_tokens_details\":{\"reasoning_tokens\":2},\"total_tokens\":11}}}\n\n",
		)
	}))
	t.Cleanup(provider.Close)
	return providerRequests, provider
}

func assertAppManagedChatOpenAIThinkingHydration(t *testing.T, hydrated appManagedChatHydratePayload) {
	t.Helper()

	assistantContent, ok := hydrated.Messages[1]["content"].([]any)
	if !ok || len(assistantContent) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", hydrated.Messages[1])
	}
	thinkingBlock, ok := assistantContent[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block, got %#v", assistantContent[0])
	}
	if thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected OpenAI thinking block %#v", thinkingBlock)
	}
}

func assertAppManagedChatOpenAIThinkingProviderRequest(
	t *testing.T,
	providerRequests <-chan appManagedChatAttachmentProviderRequest,
) {
	t.Helper()

	captured := waitForAppManagedChatProviderRequest(t, providerRequests, "OpenAI thinking")
	if captured.Path != "/v1/responses" {
		t.Fatalf("unexpected provider path %q", captured.Path)
	}
	if captured.Authorization != "Bearer secret" {
		t.Fatalf("unexpected provider authorization %q", captured.Authorization)
	}
	if captured.Body["model"] != "gpt-5-codex" {
		t.Fatalf("unexpected provider model %#v", captured.Body["model"])
	}
	if captured.Body["store"] != false {
		t.Fatalf("unexpected provider store %#v", captured.Body["store"])
	}
	reasoning, ok := captured.Body["reasoning"].(map[string]any)
	if !ok || reasoning["effort"] != "high" || reasoning["summary"] != "auto" {
		t.Fatalf("unexpected provider reasoning payload %#v", captured.Body["reasoning"])
	}
}

type appManagedChatAttachmentProviderRequest struct {
	Path          string
	Query         string
	APIKey        string
	Authorization string
	Body          map[string]any
}

func seedAppManagedChatAttachmentArtifacts(t *testing.T, cfg config.Config) {
	t.Helper()

	artifactsRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "notes.txt"), []byte("Hello from attachment."), 0o644); err != nil {
		t.Fatalf("write notes attachment: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "image.png"), []byte{0x89, 'P', 'N', 'G'}, 0o644); err != nil {
		t.Fatalf("write image attachment: %v", err)
	}
}

func saveAppManagedChatAttachmentEngine(t *testing.T, cfg config.Config, llmConfig llmconfig.Config, engineName string) {
	t.Helper()

	saveAppTestLLMConfigs(t, cfg, map[string]llmconfig.Config{"primary": llmConfig}, map[string]llmconfig.ServerConfig{})
	writeAppManagedChatEngineConfig(t, cfg, engineName)
}

func writeAppManagedChatEngineConfig(t *testing.T, cfg config.Config, engineName string) {
	t.Helper()

	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	managedConfigID := "primary"
	if err := engineStore.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             engineName,
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}
}

func saveAppTestLLMConfigs(
	t *testing.T,
	cfg config.Config,
	configs map[string]llmconfig.Config,
	servers map[string]llmconfig.ServerConfig,
) {
	t.Helper()

	path := llmconfig.Path(cfg.Paths.SettaFilesRoot)
	allConfigs, err := llmconfig.Load(path, llmconfig.LoadOptions{})
	if err != nil {
		t.Fatalf("load llm config: %v", err)
	}
	if allConfigs.Configs == nil {
		allConfigs.Configs = map[string]llmconfig.Config{}
	}
	for id, llmConfig := range configs {
		allConfigs.Configs[id] = llmConfig
	}
	if allConfigs.MCPServers == nil {
		allConfigs.MCPServers = map[string]llmconfig.ServerConfig{}
	}
	for id, server := range servers {
		allConfigs.MCPServers[id] = server
	}
	if err := llmconfig.Save(path, allConfigs); err != nil {
		t.Fatalf("save llm config: %v", err)
	}
}

func startAppManagedChatAttachmentServer(
	t *testing.T,
	cfg config.Config,
) (*App, *httptest.Server, *http.Cookie) {
	t.Helper()

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed app project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)
	return app, server, newAppTestAuthCookie(t, app)
}

func sendAppManagedChatAttachmentMessage(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	contextLabel string,
) string {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{
				"id":"user-managed",
				"role":"user",
				"content":[{"type":"text","text":"Use the project attachments."}],
				"attachments":[
					{"id":"artifacts/notes.txt","name":"notes.txt","mimeType":"text/plain","size":22},
					{"id":"artifacts/image.png","name":"image.png","mimeType":"image/png","size":4}
				]
			},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	if err != nil {
		t.Fatalf("new %s attachment send request: %v", contextLabel, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send %s managed chat with attachments: %v", contextLabel, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}
	return decodeAppManagedChatID(t, response, contextLabel+" attachment")
}

func waitForAppManagedChatAttachmentResult(
	t *testing.T,
	app *App,
	cfg config.Config,
	serverURL string,
	authCookie *http.Cookie,
	chatID string,
	expectedAssistantText string,
	contextLabel string,
) {
	t.Helper()

	hydrated := waitForAppManagedChatHydration(t, serverURL, authCookie, chatID, false, expectedAssistantText, contextLabel+" attachment")
	assertAppManagedChatAttachmentHydration(t, hydrated, expectedAssistantText)
	waitForAppManagedChatCompletedRun(t, app, cfg.Paths.SettaFilesRoot, chatID, contextLabel+" attachment")
}

func assertAppManagedChatAttachmentHydration(t *testing.T, hydrated appManagedChatHydratePayload, expectedAssistantText string) {
	t.Helper()

	if hydrated.LLMConfig == nil || hydrated.LLMConfig.ID != "primary" {
		t.Fatalf("expected hydrated llm config primary, got %#v", hydrated.LLMConfig)
	}
	if appTestMessageText(hydrated.Messages[0]) != "Use the project attachments." {
		t.Fatalf("unexpected hydrated user message %#v", hydrated.Messages[0])
	}
	userAttachments, ok := hydrated.Messages[0]["attachments"].([]any)
	if !ok || len(userAttachments) != 2 {
		t.Fatalf("expected hydrated user attachments, got %#v", hydrated.Messages[0]["attachments"])
	}
	attachmentNames := make([]string, 0, len(userAttachments))
	for _, entry := range userAttachments {
		typed, ok := entry.(map[string]any)
		if !ok {
			t.Fatalf("expected hydrated attachment map, got %#v", entry)
		}
		attachmentNames = append(attachmentNames, strings.TrimSpace(fmt.Sprint(typed["name"])))
	}
	if !reflect.DeepEqual(attachmentNames, []string{"notes.txt", "image.png"}) {
		t.Fatalf("unexpected hydrated attachment names %#v", attachmentNames)
	}
	if appTestMessageText(hydrated.Messages[1]) != expectedAssistantText {
		t.Fatalf("unexpected assistant reply %#v", hydrated.Messages[1])
	}
}

func waitForAppManagedChatCompletedRun(t *testing.T, app *App, settaFilesRoot string, chatID string, contextLabel string) {
	t.Helper()

	runStore, err := agentruns.NewRunStore(settaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	runType := "llm_chat"
	projectID := "project-alpha"
	completedRunID := ""
	waitForAppCondition(t, 5*time.Second, func() bool {
		runs, err := runStore.ListByMetadata(agentruns.RunFilter{
			RunType:         &runType,
			ChatID:          &chatID,
			ProjectConfigID: &projectID,
		})
		if err != nil {
			t.Fatalf("list managed %s runs: %v", contextLabel, err)
		}
		for _, run := range runs {
			if run.Status == agentruns.RunStatusCompleted {
				completedRunID = run.ID
				return true
			}
		}
		return false
	})
	if strings.TrimSpace(completedRunID) == "" {
		t.Fatalf("expected completed managed %s run id", contextLabel)
	}
	if _, err := app.agentRuntime.WaitForRun(context.Background(), completedRunID); err != nil {
		t.Fatalf("wait for managed %s runtime completion: %v", contextLabel, err)
	}
}

func waitForAppManagedChatAttachmentProviderRequest(
	t *testing.T,
	providerRequests <-chan appManagedChatAttachmentProviderRequest,
	contextLabel string,
) appManagedChatAttachmentProviderRequest {
	t.Helper()

	select {
	case captured := <-providerRequests:
		return captured
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s attachment provider request", contextLabel)
	}
	return appManagedChatAttachmentProviderRequest{}
}

func assertAppManagedChatOpenAIStyleAttachmentPayload(t *testing.T, body map[string]any, messageIndex int) {
	t.Helper()

	messages, ok := body["messages"].([]any)
	if !ok || len(messages) <= messageIndex {
		t.Fatalf("expected provider messages, got %#v", body["messages"])
	}
	userMessage, ok := messages[messageIndex].(map[string]any)
	if !ok {
		t.Fatalf("expected provider user message, got %#v", messages[messageIndex])
	}
	if _, exists := userMessage["attachments"]; exists {
		t.Fatalf("expected provider payload to omit raw attachments, got %#v", userMessage)
	}
	content, _ := userMessage["content"].(string)
	assertAppManagedChatAttachmentPromptText(t, content)
}

func assertAppManagedChatAnthropicAttachmentPayload(t *testing.T, body map[string]any) {
	t.Helper()

	messages, ok := body["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected provider messages, got %#v", body["messages"])
	}
	userMessage, ok := messages[0].(map[string]any)
	if !ok {
		t.Fatalf("expected provider user message, got %#v", messages[0])
	}
	if _, exists := userMessage["attachments"]; exists {
		t.Fatalf("expected provider payload to omit raw attachments, got %#v", userMessage)
	}
	contentBlocks, ok := userMessage["content"].([]any)
	if !ok || len(contentBlocks) < 2 {
		t.Fatalf("expected anthropic content blocks, got %#v", userMessage["content"])
	}
	textParts := make([]string, 0, len(contentBlocks))
	for _, entry := range contentBlocks {
		textBlock, ok := entry.(map[string]any)
		if !ok {
			t.Fatalf("expected anthropic text block, got %#v", entry)
		}
		if textBlock["type"] != "text" {
			t.Fatalf("expected anthropic text block, got %#v", textBlock)
		}
		textParts = append(textParts, strings.TrimSpace(fmt.Sprint(textBlock["text"])))
	}
	assertAppManagedChatAttachmentPromptText(t, strings.Join(textParts, "\n"))
}

func assertAppManagedChatAttachmentPromptText(t *testing.T, text string) {
	t.Helper()

	if !strings.Contains(text, "Use the project attachments.") {
		t.Fatalf("expected original user text in provider payload, got %q", text)
	}
	if !strings.Contains(text, "[Attachment: notes.txt]") || !strings.Contains(text, "Hello from attachment.") {
		t.Fatalf("expected text attachment block in provider payload, got %q", text)
	}
	if !strings.Contains(text, "[Attachment: image.png]") ||
		!strings.Contains(text, "Type: image/png") ||
		!strings.Contains(text, "Content not inlined.") {
		t.Fatalf("expected image placeholder block in provider payload, got %q", text)
	}
}

func TestAppServesManagedChatSendWithAttachmentsThroughManagedExecutor(t *testing.T) {
	// Attachment-bearing managed chat sends should flow through the real IDE
	// app, preserve user attachment metadata in hydrated history, and inline
	// attachment prompt text before the OpenAI provider boundary.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- appManagedChatAttachmentProviderRequest{
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Body:          body,
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Go owned\"}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" attachment reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":34,\"completion_tokens\":3,\"total_tokens\":37}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer provider.Close()

	seedAppManagedChatAttachmentArtifacts(t, cfg)
	saveAppManagedChatAttachmentEngine(t, cfg, llmconfig.Config{
		ID:        "primary",
		Model:     "gpt-4o-mini",
		Provider:  "openai",
		BaseURL:   provider.URL + "/v1",
		APIKeyEnv: "OPENAI_API_KEY",
	}, "Managed Engine")
	app, server, authCookie := startAppManagedChatAttachmentServer(t, cfg)
	chatID := sendAppManagedChatAttachmentMessage(t, server.URL, authCookie, "openai")
	waitForAppManagedChatAttachmentResult(t, app, cfg, server.URL, authCookie, chatID, "Go owned attachment reply", "openai")

	captured := waitForAppManagedChatAttachmentProviderRequest(t, providerRequests, "openai")
	if captured.Path != "/v1/chat/completions" {
		t.Fatalf("unexpected provider path %q", captured.Path)
	}
	if captured.Authorization != "Bearer secret" {
		t.Fatalf("unexpected provider authorization %q", captured.Authorization)
	}
	if captured.Body["model"] != "gpt-4o-mini" {
		t.Fatalf("unexpected provider model %#v", captured.Body["model"])
	}
	assertAppManagedChatOpenAIStyleAttachmentPayload(t, captured.Body, 1)
}

func TestAppServesManagedChatSendWithAttachmentsThroughAnthropicExecutor(t *testing.T) {
	// Attachment-bearing managed chat sends should flow through the real IDE
	// app, preserve user attachment metadata in hydrated history, and inline
	// attachment prompt text before the Anthropic provider boundary.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("ANTHROPIC_API_KEY", "secret")

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- appManagedChatAttachmentProviderRequest{
			Path:   r.URL.Path,
			APIKey: r.Header.Get("X-Api-Key"),
			Body:   body,
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-attachment-anthropic\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5-20250929\",\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":19,\"output_tokens\":0,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Go owned\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" anthropic attachment reply\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"input_tokens\":19,\"output_tokens\":3,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0}}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
		flusher.Flush()
	}))
	defer provider.Close()

	seedAppManagedChatAttachmentArtifacts(t, cfg)
	saveAppManagedChatAttachmentEngine(t, cfg, llmconfig.Config{
		ID:        "primary",
		Model:     "claude-sonnet-4-5-20250929",
		Provider:  "anthropic",
		BaseURL:   provider.URL,
		APIKeyEnv: "ANTHROPIC_API_KEY",
	}, "Managed Anthropic Engine")
	app, server, authCookie := startAppManagedChatAttachmentServer(t, cfg)
	chatID := sendAppManagedChatAttachmentMessage(t, server.URL, authCookie, "anthropic")
	waitForAppManagedChatAttachmentResult(t, app, cfg, server.URL, authCookie, chatID, "Go owned anthropic attachment reply", "anthropic")

	captured := waitForAppManagedChatAttachmentProviderRequest(t, providerRequests, "anthropic")
	if captured.Path != "/v1/messages" {
		t.Fatalf("unexpected provider path %q", captured.Path)
	}
	if captured.APIKey != "secret" {
		t.Fatalf("unexpected provider api key %q", captured.APIKey)
	}
	if captured.Body["model"] != "claude-sonnet-4-5-20250929" {
		t.Fatalf("unexpected provider model %#v", captured.Body["model"])
	}
	assertAppManagedChatAnthropicAttachmentPayload(t, captured.Body)
}

func TestAppServesManagedChatSendWithAttachmentsThroughAzureOpenAIExecutor(t *testing.T) {
	// Attachment-bearing managed chat sends should flow through the real IDE
	// app, preserve user attachment metadata in hydrated history, and inline
	// attachment prompt text before the Azure OpenAI provider boundary.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("AZURE_OPENAI_API_KEY", "secret")

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- appManagedChatAttachmentProviderRequest{
			Path:          r.URL.Path,
			Query:         r.URL.RawQuery,
			APIKey:        r.Header.Get("Api-Key"),
			Authorization: r.Header.Get("Authorization"),
			Body:          body,
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Azure\"}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" attachment reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":34,\"completion_tokens\":3,\"total_tokens\":37}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer provider.Close()

	seedAppManagedChatAttachmentArtifacts(t, cfg)
	saveAppManagedChatAttachmentEngine(t, cfg, llmconfig.Config{
		ID:        "primary",
		Model:     "gpt-4o-mini",
		Provider:  "azure",
		BaseURL:   provider.URL,
		APIKeyEnv: "AZURE_OPENAI_API_KEY",
		OtherParams: map[string]any{
			"api_version": "2024-06-01",
		},
	}, "Managed Azure Engine")
	app, server, authCookie := startAppManagedChatAttachmentServer(t, cfg)
	chatID := sendAppManagedChatAttachmentMessage(t, server.URL, authCookie, "azure")
	waitForAppManagedChatAttachmentResult(t, app, cfg, server.URL, authCookie, chatID, "Azure attachment reply", "azure")

	captured := waitForAppManagedChatAttachmentProviderRequest(t, providerRequests, "azure")
	if captured.Path != "/openai/deployments/gpt-4o-mini/chat/completions" {
		t.Fatalf("unexpected provider path %q", captured.Path)
	}
	if captured.Query != "api-version=2024-06-01" {
		t.Fatalf("unexpected provider query %q", captured.Query)
	}
	if captured.APIKey != "secret" {
		t.Fatalf("unexpected provider api key %q", captured.APIKey)
	}
	if captured.Authorization != "" {
		t.Fatalf("expected Azure requests to avoid Authorization header, got %q", captured.Authorization)
	}
	if captured.Body["model"] != "gpt-4o-mini" {
		t.Fatalf("unexpected provider model %#v", captured.Body["model"])
	}
	assertAppManagedChatOpenAIStyleAttachmentPayload(t, captured.Body, 1)
}
