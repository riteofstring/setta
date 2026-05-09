package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/observability"
	"setta/internal/projectstate"
)

func TestAppServesManagedChatHydrateAndStopRoutes(t *testing.T) {
	// The real IDE app should hydrate persisted managed chats and stop the latest
	// running managed run through the Go-owned route stack.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	saveAppManagedChatProviderEngine(t, cfg, llmconfig.Config{
		ID:        "primary",
		Model:     "gpt-4o-mini",
		Provider:  "openai",
		APIKeyEnv: "OPENAI_API_KEY",
	}, "Managed Engine")
	run := seedAppManagedChatHydrateStopRun(t, cfg)
	_, server, authCookie := startAppManagedChatProviderServer(t, cfg)

	hydrated := waitForAppManagedChatHydration(t, server.URL, authCookie, "chat-app-managed", true, "Partial app reply", "hydrate stop")
	assertAppManagedChatHydratedLLMConfig(t, hydrated, "primary")
	stopResult := stopAppManagedChat(t, server.URL, authCookie, "chat-app-managed", "hydrate stop")
	assertAppManagedChatStopResultRun(t, stopResult, run.ID)
}

func seedAppManagedChatHydrateStopRun(t *testing.T, cfg config.Config) agentruns.Run {
	t.Helper()

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         "llm_chat",
		"chatId":          "chat-app-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages":        []any{appManagedChatHydrateStopUserMessage()},
	}, time.Date(2026, 3, 8, 16, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusRunning
	run.Outputs = map[string]any{
		"messages": []any{
			appManagedChatHydrateStopUserMessage(),
			appManagedChatHydrateStopAssistantMessage(),
		},
		"usage": map[string]any{
			"promptTokens":     11,
			"completionTokens": 2,
			"totalTokens":      13,
		},
	}
	if err := runStore.Save(run); err != nil {
		t.Fatalf("save managed run: %v", err)
	}
	return run
}

func appManagedChatHydrateStopUserMessage() map[string]any {
	return map[string]any{
		"id":   "user-app",
		"role": "user",
		"content": []any{
			map[string]any{"type": "text", "text": "Hello app"},
		},
		"attachments": []any{},
	}
}

func appManagedChatHydrateStopAssistantMessage() map[string]any {
	return map[string]any{
		"id":   "assistant-app",
		"role": "assistant",
		"content": []any{
			map[string]any{"type": "text", "text": "Partial app reply"},
		},
		"attachments": []any{},
		"tool_calls":  nil,
	}
}

func assertAppManagedChatStopResultRun(t *testing.T, stopResult appManagedChatStopResult, wantRunID string) {
	t.Helper()

	if stopResult.RunID != wantRunID {
		t.Fatalf("expected stopped run id %q, got %q", wantRunID, stopResult.RunID)
	}
}

type appManagedChatHydratePayload struct {
	Messages           []map[string]any `json:"messages"`
	WaitingForResponse bool             `json:"waitingForResponse"`
	LLMConfig          *struct {
		ID string `json:"id"`
	} `json:"llmConfig"`
}

type appManagedChatStopResult struct {
	RunID     string
	MessageID string
}

func decodeAppManagedChatID(t *testing.T, response *http.Response, contextLabel string) string {
	t.Helper()

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode %s chat id: %v", contextLabel, err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatalf("expected %s chat id", contextLabel)
	}
	return chatID
}

func waitForAppManagedChatHydration(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	chatID string,
	wantWaiting bool,
	expectedAssistantText string,
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
		return hydrated.WaitingForResponse == wantWaiting &&
			len(hydrated.Messages) == 2 &&
			appTestMessageText(hydrated.Messages[1]) == expectedAssistantText
	})
	return hydrated
}

func stopAppManagedChat(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	chatID string,
	contextLabel string,
) appManagedChatStopResult {
	t.Helper()

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteStopLLMChat,
		strings.NewReader(`{"chatId":"`+chatID+`"}`),
	)
	if err != nil {
		t.Fatalf("new %s stop request: %v", contextLabel, err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop %s managed chat: %v", contextLabel, err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var payload struct {
		AlreadyStopped   bool    `json:"alreadyStopped"`
		StoppedRunID     *string `json:"stoppedRunId"`
		StoppedMessageID *string `json:"stoppedMessageId"`
	}
	if err := json.NewDecoder(stopResponse.Body).Decode(&payload); err != nil {
		t.Fatalf("decode %s stop payload: %v", contextLabel, err)
	}
	if payload.AlreadyStopped {
		t.Fatalf("expected active stop payload, got %#v", payload)
	}
	if payload.StoppedRunID == nil || strings.TrimSpace(*payload.StoppedRunID) == "" {
		t.Fatalf("expected stopped run id, got %#v", payload)
	}
	if payload.StoppedMessageID == nil || strings.TrimSpace(*payload.StoppedMessageID) == "" {
		t.Fatalf("expected stopped message id, got %#v", payload)
	}
	return appManagedChatStopResult{
		RunID:     *payload.StoppedRunID,
		MessageID: *payload.StoppedMessageID,
	}
}

func waitForAppManagedChatProviderAbort(t *testing.T, providerAborted <-chan struct{}, contextLabel string) {
	t.Helper()

	select {
	case <-providerAborted:
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s provider abort", contextLabel)
	}
}

func assertAppManagedChatStoppedRun(
	t *testing.T,
	app *App,
	stopResult appManagedChatStopResult,
	expectedAssistantText string,
	contextLabel string,
) {
	t.Helper()

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stoppedRun, err := app.agentRuntime.WaitForRun(waitCtx, stopResult.RunID)
	if err != nil {
		t.Fatalf("wait for stopped %s managed runtime: %v", contextLabel, err)
	}
	if stoppedRun.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled run, got %q", stoppedRun.Status)
	}
	outputMessages, ok := stoppedRun.Outputs["messages"].([]any)
	if !ok || len(outputMessages) != 2 {
		t.Fatalf("expected persisted user and assistant messages, got %#v", stoppedRun.Outputs["messages"])
	}
	assistantMessage, ok := outputMessages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted %s assistant message map, got %#v", contextLabel, outputMessages[1])
	}
	assistantMessageID, _ := assistantMessage["id"].(string)
	if appTestMessageText(assistantMessage) != expectedAssistantText {
		t.Fatalf("unexpected persisted %s assistant message %#v", contextLabel, assistantMessage)
	}
	if assistantMessageID != stopResult.MessageID {
		t.Fatalf("expected stopped message id %q, got %q", stopResult.MessageID, assistantMessageID)
	}
}

func TestAppStopsLiveManagedChatThroughStopRoute(t *testing.T) {
	// The real IDE app should stop an in-flight managed provider turn through
	// the Go-owned stop route, cancel the live provider request, and persist the
	// partial assistant reply on the cancelled run.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	type providerRequest struct {
		Path          string
		Authorization string
		Body          map[string]any
	}
	providerRequests := make(chan providerRequest, 1)
	providerAborted := make(chan struct{}, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- providerRequest{
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Body:          body,
		}
		go func() {
			<-r.Context().Done()
			select {
			case providerAborted <- struct{}{}:
			default:
			}
		}()
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Streaming\"}}]}\n\n")
		flusher.Flush()
		<-r.Context().Done()
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				BaseURL:   provider.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	managedConfigID := "primary"
	if err := engineStore.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             "Managed Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}

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
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	sendRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-stop","role":"user","content":[{"type":"text","text":"Stop this managed response."}]},
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
		t.Fatalf("new send request: %v", err)
	}
	sendRequest.Header.Set("Content-Type", "application/json")
	sendRequest.AddCookie(authCookie)

	sendResponse, err := http.DefaultClient.Do(sendRequest)
	if err != nil {
		t.Fatalf("send managed chat: %v", err)
	}
	defer sendResponse.Body.Close()
	if sendResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(sendResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", sendResponse.StatusCode, string(body))
	}

	chatID := decodeAppManagedChatID(t, sendResponse, "managed")
	waitForAppManagedChatHydration(t, server.URL, authCookie, chatID, true, "Streaming", "running")
	stopResult := stopAppManagedChat(t, server.URL, authCookie, chatID, "openai")
	waitForAppManagedChatProviderAbort(t, providerAborted, "openai")
	waitForAppManagedChatHydration(t, server.URL, authCookie, chatID, false, "Streaming", "stopped")
	assertAppManagedChatStoppedRun(t, app, stopResult, "Streaming", "openai")

	select {
	case captured := <-providerRequests:
		if captured.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Authorization != "Bearer secret" {
			t.Fatalf("unexpected provider authorization %q", captured.Authorization)
		}
		if captured.Body["model"] != "gpt-4o-mini" {
			t.Fatalf("unexpected provider model %#v", captured.Body["model"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for provider request")
	}
}

func TestAppStopsLiveManagedAzureChatThroughStopRoute(t *testing.T) {
	// The real IDE app should stop an in-flight managed Azure provider turn
	// through the Go-owned stop route and persist the partial assistant reply.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("AZURE_OPENAI_API_KEY", "secret")

	providerRequests := make(chan appManagedChatAzureStopProviderRequest, 1)
	providerAborted := make(chan struct{}, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- appManagedChatAzureStopProviderRequest{
			Path:          r.URL.Path,
			Query:         r.URL.RawQuery,
			APIKey:        r.Header.Get("Api-Key"),
			Authorization: r.Header.Get("Authorization"),
			Body:          body,
		}
		go func() {
			<-r.Context().Done()
			select {
			case providerAborted <- struct{}{}:
			default:
			}
		}()
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Streaming\"}}]}\n\n")
		flusher.Flush()
		<-r.Context().Done()
	}))
	defer provider.Close()

	saveAppManagedChatProviderEngine(t, cfg, llmconfig.Config{
		ID:        "primary",
		Model:     "gpt-4o-mini",
		Provider:  "azure",
		BaseURL:   provider.URL,
		APIKeyEnv: "AZURE_OPENAI_API_KEY",
		OtherParams: map[string]any{
			"api_version": "2024-06-01",
		},
	}, "Managed Azure Engine")

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
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	sendRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-stop","role":"user","content":[{"type":"text","text":"Stop this managed response."}]},
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
		t.Fatalf("new azure send request: %v", err)
	}
	sendRequest.Header.Set("Content-Type", "application/json")
	sendRequest.AddCookie(authCookie)

	sendResponse, err := http.DefaultClient.Do(sendRequest)
	if err != nil {
		t.Fatalf("send managed azure chat: %v", err)
	}
	defer sendResponse.Body.Close()
	if sendResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(sendResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", sendResponse.StatusCode, string(body))
	}

	chatID := decodeAppManagedChatID(t, sendResponse, "managed azure")
	waitForAppManagedChatHydration(t, server.URL, authCookie, chatID, true, "Streaming", "running azure")
	stopResult := stopAppManagedChat(t, server.URL, authCookie, chatID, "azure")
	waitForAppManagedChatProviderAbort(t, providerAborted, "azure")
	waitForAppManagedChatHydration(t, server.URL, authCookie, chatID, false, "Streaming", "stopped azure")
	assertAppManagedChatStoppedRun(t, app, stopResult, "Streaming", "azure")
	assertAppManagedChatAzureStopProviderRequest(t, providerRequests)
}

type appManagedChatAzureStopProviderRequest struct {
	Path          string
	Query         string
	APIKey        string
	Authorization string
	Body          map[string]any
}

func assertAppManagedChatAzureStopProviderRequest(
	t *testing.T,
	providerRequests <-chan appManagedChatAzureStopProviderRequest,
) {
	t.Helper()

	select {
	case captured := <-providerRequests:
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
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for Azure provider request")
	}
}

func TestAppStopsLiveManagedAnthropicChatThroughStopRoute(t *testing.T) {
	// The real IDE app should stop an in-flight managed Anthropic provider turn
	// through the Go-owned stop route and persist the partial assistant reply.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("ANTHROPIC_API_KEY", "secret")

	type providerRequest struct {
		Path   string
		APIKey string
		Body   map[string]any
	}
	providerRequests := make(chan providerRequest, 1)
	providerAborted := make(chan struct{}, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- providerRequest{
			Path:   r.URL.Path,
			APIKey: r.Header.Get("X-Api-Key"),
			Body:   body,
		}
		go func() {
			<-r.Context().Done()
			select {
			case providerAborted <- struct{}{}:
			default:
			}
		}()
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-stop-anthropic\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5-20250929\",\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-stop\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":12,\"output_tokens\":0,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Streaming\"}}\n\n")
		flusher.Flush()
		<-r.Context().Done()
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "claude-sonnet-4-5-20250929",
				Provider:  "anthropic",
				BaseURL:   provider.URL,
				APIKeyEnv: "ANTHROPIC_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	managedConfigID := "primary"
	if err := engineStore.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             "Managed Anthropic Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}

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
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	sendRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-stop","role":"user","content":[{"type":"text","text":"Stop this managed response."}]},
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
		t.Fatalf("new anthropic send request: %v", err)
	}
	sendRequest.Header.Set("Content-Type", "application/json")
	sendRequest.AddCookie(authCookie)

	sendResponse, err := http.DefaultClient.Do(sendRequest)
	if err != nil {
		t.Fatalf("send managed anthropic chat: %v", err)
	}
	defer sendResponse.Body.Close()
	if sendResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(sendResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", sendResponse.StatusCode, string(body))
	}

	chatID := decodeAppManagedChatID(t, sendResponse, "managed anthropic")
	waitForAppManagedChatHydration(t, server.URL, authCookie, chatID, true, "Streaming", "running anthropic")
	stopResult := stopAppManagedChat(t, server.URL, authCookie, chatID, "anthropic")
	waitForAppManagedChatProviderAbort(t, providerAborted, "anthropic")
	waitForAppManagedChatHydration(t, server.URL, authCookie, chatID, false, "Streaming", "stopped anthropic")
	assertAppManagedChatStoppedRun(t, app, stopResult, "Streaming", "anthropic")

	select {
	case captured := <-providerRequests:
		if captured.Path != "/v1/messages" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.APIKey != "secret" {
			t.Fatalf("unexpected provider api key %q", captured.APIKey)
		}
		if captured.Body["model"] != "claude-sonnet-4-5-20250929" {
			t.Fatalf("unexpected provider model %#v", captured.Body["model"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for anthropic provider request")
	}
}

func TestAppStopsLiveManagedGeminiChatThroughStopRoute(t *testing.T) {
	// The real IDE app should stop an in-flight managed Gemini provider turn
	// through the Go-owned stop route and persist the partial assistant reply.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("GEMINI_API_KEY", "secret")

	type providerRequest struct {
		Path   string
		Query  string
		APIKey string
		Body   map[string]any
	}
	providerRequests := make(chan providerRequest, 1)
	providerAborted := make(chan struct{}, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- providerRequest{
			Path:   r.URL.Path,
			Query:  r.URL.RawQuery,
			APIKey: r.Header.Get("X-Goog-Api-Key"),
			Body:   body,
		}
		go func() {
			<-r.Context().Done()
			select {
			case providerAborted <- struct{}{}:
			default:
			}
		}()
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Streaming\"}]}}],\"usageMetadata\":{\"promptTokenCount\":18,\"candidatesTokenCount\":1,\"totalTokenCount\":19}}\n\n")
		flusher.Flush()
		<-r.Context().Done()
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gemini-2.5-pro",
				Provider:  "gemini",
				BaseURL:   provider.URL,
				APIKeyEnv: "GEMINI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	managedConfigID := "primary"
	if err := engineStore.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             "Managed Gemini Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}

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
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	sendRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-stop","role":"user","content":[{"type":"text","text":"Stop this managed response."}]},
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
		t.Fatalf("new gemini send request: %v", err)
	}
	sendRequest.Header.Set("Content-Type", "application/json")
	sendRequest.AddCookie(authCookie)

	sendResponse, err := http.DefaultClient.Do(sendRequest)
	if err != nil {
		t.Fatalf("send managed gemini chat: %v", err)
	}
	defer sendResponse.Body.Close()
	if sendResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(sendResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", sendResponse.StatusCode, string(body))
	}

	chatID := decodeAppManagedChatID(t, sendResponse, "managed gemini")
	waitForAppManagedChatHydration(t, server.URL, authCookie, chatID, true, "Streaming", "running gemini")
	stopResult := stopAppManagedChat(t, server.URL, authCookie, chatID, "gemini")
	waitForAppManagedChatProviderAbort(t, providerAborted, "gemini")
	waitForAppManagedChatHydration(t, server.URL, authCookie, chatID, false, "Streaming", "stopped gemini")
	assertAppManagedChatStoppedRun(t, app, stopResult, "Streaming", "gemini")

	select {
	case captured := <-providerRequests:
		if captured.Path != "/v1beta/models/gemini-2.5-pro:streamGenerateContent" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Query != "alt=sse" {
			t.Fatalf("unexpected provider query %q", captured.Query)
		}
		if captured.APIKey != "secret" {
			t.Fatalf("unexpected provider api key %q", captured.APIKey)
		}
		if captured.Body["model"] != nil {
			t.Fatalf("expected gemini payload to omit top-level model, got %#v", captured.Body["model"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for gemini provider request")
	}
}

func TestAppServesManagedChatSendThroughManagedExecutor(t *testing.T) {
	// The real IDE app should run managed chat sends through the Go-owned
	// provider executor and persist the streamed assistant reply.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	providerRequests, provider := startAppManagedChatOpenAIProvider(t)
	saveAppManagedChatProviderEngine(t, cfg, llmconfig.Config{
		ID:        "primary",
		Model:     "gpt-4o-mini",
		Provider:  "openai",
		BaseURL:   provider.URL + "/v1",
		APIKeyEnv: "OPENAI_API_KEY",
	}, "Managed Engine")
	app, server, authCookie := startAppManagedChatProviderServer(t, cfg)

	chatID := sendAppManagedChatProviderMessage(t, server.URL, authCookie, "Create a managed project.", false, "managed")
	hydrated := waitForAppManagedChatProviderResult(t, app, cfg, server.URL, authCookie, chatID, "Go owned reply", "managed")
	assertAppManagedChatHydratedLLMConfig(t, hydrated, "primary")
	assertAppManagedChatOpenAIProviderRequest(t, providerRequests)
}

func startAppManagedChatOpenAIProvider(t *testing.T) (<-chan appManagedChatAttachmentProviderRequest, *httptest.Server) {
	t.Helper()

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, ok := captureAppManagedChatProviderRequest(w, r, "")
		if !ok {
			return
		}
		providerRequests <- captured
		writeAppManagedChatProviderStream(w,
			"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Go owned\"}}]}\n\n",
			"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n",
			"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":21,\"completion_tokens\":2,\"total_tokens\":23}}\n\n",
			"data: [DONE]\n\n",
		)
	}))
	t.Cleanup(provider.Close)
	return providerRequests, provider
}

func assertAppManagedChatHydratedLLMConfig(t *testing.T, hydrated appManagedChatHydratePayload, wantID string) {
	t.Helper()

	if hydrated.LLMConfig == nil || hydrated.LLMConfig.ID != wantID {
		t.Fatalf("expected hydrated llm config %s, got %#v", wantID, hydrated.LLMConfig)
	}
}

func assertAppManagedChatOpenAIProviderRequest(
	t *testing.T,
	providerRequests <-chan appManagedChatAttachmentProviderRequest,
) {
	t.Helper()

	captured := waitForAppManagedChatProviderRequest(t, providerRequests, "OpenAI")
	if captured.Path != "/v1/chat/completions" {
		t.Fatalf("unexpected provider path %q", captured.Path)
	}
	if captured.Authorization != "Bearer secret" {
		t.Fatalf("unexpected provider authorization %q", captured.Authorization)
	}
	if captured.Body["model"] != "gpt-4o-mini" {
		t.Fatalf("unexpected provider model %#v", captured.Body["model"])
	}
}
