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

func TestAppServesManagedChatSendThroughAzureOpenAIExecutor(t *testing.T) {
	// The real IDE app should run managed Azure OpenAI chat sends through the
	// Go-owned OpenAI adapter with Azure endpoint and API-version routing.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("AZURE_OPENAI_API_KEY", "secret")

	type providerRequest struct {
		Path          string
		Query         string
		APIKey        string
		Authorization string
		Body          map[string]any
	}
	providerRequests := make(chan providerRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- providerRequest{
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
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":17,\"completion_tokens\":2,\"total_tokens\":19}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "azure",
				BaseURL:   provider.URL,
				APIKeyEnv: "AZURE_OPENAI_API_KEY",
				OtherParams: map[string]any{
					"api_version": "2024-06-01",
				},
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
			Name:             "Managed Azure Engine",
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
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed Azure project."}]},
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
		t.Fatalf("new Azure send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send Azure managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode Azure chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed Azure chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed Azure chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	if appTestMessageText(hydrated.Messages[1]) != "Azure reply" {
		t.Fatalf("unexpected assistant reply %#v", hydrated.Messages[1])
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
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
			t.Fatalf("list managed Azure runs: %v", err)
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
		t.Fatal("expected completed managed Azure run id")
	}
	if _, err := app.agentRuntime.WaitForRun(context.Background(), completedRunID); err != nil {
		t.Fatalf("wait for managed Azure runtime completion: %v", err)
	}

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

func TestAppServesManagedChatSendThroughAnthropicExecutor(t *testing.T) {
	// The real IDE app should run managed Anthropic chat sends through the
	// Go-owned provider executor and persist the streamed assistant reply.
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
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-app-anthropic\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5-20250929\",\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":19,\"output_tokens\":0,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Go owned\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" anthropic reply\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"input_tokens\":19,\"output_tokens\":3,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0}}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
		flusher.Flush()
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
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed anthropic project."}]},
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
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send anthropic managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode anthropic chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed anthropic chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed anthropic chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	if appTestMessageText(hydrated.Messages[1]) != "Go owned anthropic reply" {
		t.Fatalf("unexpected assistant reply %#v", hydrated.Messages[1])
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
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
			t.Fatalf("list managed anthropic runs: %v", err)
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
		t.Fatal("expected completed managed anthropic run id")
	}
	if _, err := app.agentRuntime.WaitForRun(context.Background(), completedRunID); err != nil {
		t.Fatalf("wait for managed anthropic runtime completion: %v", err)
	}

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
		if captured.Body["max_tokens"] != float64(4096) {
			t.Fatalf("unexpected provider max_tokens %#v", captured.Body["max_tokens"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for anthropic provider request")
	}
}

func TestAppServesManagedChatSendThroughAnthropicThinkingExecutor(t *testing.T) {
	// The real IDE app should run managed Anthropic thinking chat sends through
	// the Go-owned provider executor and persist the streamed thinking block.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("ANTHROPIC_API_KEY", "secret")
	t.Cleanup(func() {
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			_ = os.RemoveAll(cfg.Paths.WorkspaceRoot)
			if _, err := os.Stat(cfg.Paths.WorkspaceRoot); errors.Is(err, os.ErrNotExist) {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
	})

	type providerRequest struct {
		Path   string
		APIKey string
		Body   map[string]any
	}
	providerRequests := make(chan providerRequest, 1)
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
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-thinking\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5-20250929\",\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":12,\"output_tokens\":0,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"Planning\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\" deeply\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"sig-thinking\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"Anthropic answer\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"input_tokens\":12,\"output_tokens\":3,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0}}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
		flusher.Flush()
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:       "primary",
				Model:    "claude-sonnet-4-5-20250929",
				Provider: "anthropic",
				BaseURL:  provider.URL,
				OtherParams: map[string]any{
					"max_tokens": 4096,
					"thinking": map[string]any{
						"type":          "enabled",
						"budget_tokens": 1024,
					},
				},
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
			Name:             "Managed Anthropic Thinking Engine",
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
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed Anthropic thinking project."}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":true,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	if err != nil {
		t.Fatalf("new Anthropic thinking send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send Anthropic thinking managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode Anthropic thinking chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed Anthropic thinking chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed Anthropic thinking chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	assistantContent, ok := hydrated.Messages[1]["content"].([]any)
	if !ok || len(assistantContent) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", hydrated.Messages[1])
	}
	thinkingBlock, ok := assistantContent[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block, got %#v", assistantContent[0])
	}
	if thinkingBlock["thinking"] != "Planning deeply" || thinkingBlock["signature"] != "sig-thinking" {
		t.Fatalf("unexpected Anthropic thinking block %#v", thinkingBlock)
	}
	if appTestMessageText(hydrated.Messages[1]) != "Anthropic answer" {
		t.Fatalf("unexpected assistant reply %#v", hydrated.Messages[1])
	}

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
		if captured.Body["max_tokens"] != float64(4096) {
			t.Fatalf("unexpected provider max_tokens %#v", captured.Body["max_tokens"])
		}
		thinkingConfig, ok := captured.Body["thinking"].(map[string]any)
		if !ok || thinkingConfig["type"] != "enabled" || thinkingConfig["budget_tokens"] != float64(1024) {
			t.Fatalf("unexpected provider thinking config %#v", captured.Body["thinking"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for Anthropic thinking provider request")
	}
}

func TestAppServesManagedChatSendWithAttachmentsThroughGeminiExecutor(t *testing.T) {
	// Attachment-bearing managed chat sends should flow through the real IDE
	// app, preserve user attachment metadata in hydrated history, and inline
	// attachment prompt text before the Gemini provider boundary.
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
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Go owned\"}]}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\" gemini attachment reply\"}]}}],\"usageMetadata\":{\"promptTokenCount\":17,\"candidatesTokenCount\":3,\"totalTokenCount\":20}}\n\n")
		flusher.Flush()
	}))
	defer provider.Close()

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
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
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
		t.Fatalf("new Gemini attachment send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send Gemini managed chat with attachments: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode Gemini attachment chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed Gemini attachment chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
		LLMConfig          *struct {
			ID string `json:"id"`
		} `json:"llmConfig"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new Gemini attachment hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed Gemini attachment chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode Gemini attachment hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

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
	if appTestMessageText(hydrated.Messages[1]) != "Go owned gemini attachment reply" {
		t.Fatalf("unexpected assistant reply %#v", hydrated.Messages[1])
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
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
			t.Fatalf("list managed Gemini attachment runs: %v", err)
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
		t.Fatal("expected completed managed Gemini attachment run id")
	}
	if _, err := app.agentRuntime.WaitForRun(context.Background(), completedRunID); err != nil {
		t.Fatalf("wait for managed Gemini attachment runtime completion: %v", err)
	}

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
		contents, ok := captured.Body["contents"].([]any)
		if !ok || len(contents) != 1 {
			t.Fatalf("unexpected provider contents %#v", captured.Body["contents"])
		}
		userContent, ok := contents[0].(map[string]any)
		if !ok {
			t.Fatalf("expected provider content map, got %#v", contents[0])
		}
		parts, ok := userContent["parts"].([]any)
		if !ok || len(parts) < 2 {
			t.Fatalf("expected Gemini parts, got %#v", userContent["parts"])
		}
		textParts := make([]string, 0, len(parts))
		for _, entry := range parts {
			part, ok := entry.(map[string]any)
			if !ok {
				t.Fatalf("expected Gemini part map, got %#v", entry)
			}
			textParts = append(textParts, strings.TrimSpace(fmt.Sprint(part["text"])))
		}
		text := strings.Join(textParts, "\n")
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
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for Gemini attachment provider request")
	}
}

func TestAppServesManagedChatSendThroughGeminiExecutor(t *testing.T) {
	// The real IDE app should run managed Gemini chat sends through the
	// Go-owned provider executor and persist the streamed assistant reply.
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
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Go owned\"}]}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\" gemini reply\"}]}}],\"usageMetadata\":{\"promptTokenCount\":17,\"candidatesTokenCount\":3,\"totalTokenCount\":20}}\n\n")
		flusher.Flush()
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
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed Gemini project."}]},
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
		t.Fatalf("new Gemini send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send Gemini managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode Gemini chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed Gemini chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed Gemini chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	if appTestMessageText(hydrated.Messages[1]) != "Go owned gemini reply" {
		t.Fatalf("unexpected assistant reply %#v", hydrated.Messages[1])
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
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
			t.Fatalf("list managed Gemini runs: %v", err)
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
		t.Fatal("expected completed managed Gemini run id")
	}
	if _, err := app.agentRuntime.WaitForRun(context.Background(), completedRunID); err != nil {
		t.Fatalf("wait for managed Gemini runtime completion: %v", err)
	}

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
		contents, ok := captured.Body["contents"].([]any)
		if !ok || len(contents) != 1 {
			t.Fatalf("unexpected provider contents %#v", captured.Body["contents"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for Gemini provider request")
	}
}

func TestAppServesManagedChatSendThroughGeminiThinkingExecutor(t *testing.T) {
	// The real IDE app should run managed Gemini thinking chat sends through the
	// Go-owned provider executor and persist the streamed thinking block.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("GEMINI_API_KEY", "secret")
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

	type providerRequest struct {
		Path   string
		Query  string
		APIKey string
		Body   map[string]any
	}
	providerRequests := make(chan providerRequest, 1)
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
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Planning\",\"thought\":true,\"thoughtSignature\":\"c2ln\"}]}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Gemini answer\"}]}}],\"usageMetadata\":{\"promptTokenCount\":18,\"candidatesTokenCount\":3,\"totalTokenCount\":21,\"thoughtsTokenCount\":2}}\n\n")
		flusher.Flush()
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:       "primary",
				Model:    "gemini-2.5-pro",
				Provider: "gemini",
				BaseURL:  provider.URL,
				OtherParams: map[string]any{
					"thinking_config": map[string]any{
						"thinking_budget": 128,
						"thinking_level":  "medium",
					},
				},
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
			Name:             "Managed Gemini Thinking Engine",
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
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed Gemini thinking project."}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":true,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	if err != nil {
		t.Fatalf("new Gemini thinking send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send Gemini thinking managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode Gemini thinking chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed Gemini thinking chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed Gemini thinking chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	assistantContent, ok := hydrated.Messages[1]["content"].([]any)
	if !ok || len(assistantContent) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", hydrated.Messages[1])
	}
	thinkingBlock, ok := assistantContent[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block, got %#v", assistantContent[0])
	}
	if thinkingBlock["thinking"] != "Planning" || thinkingBlock["signature"] != "c2ln" {
		t.Fatalf("unexpected Gemini thinking block %#v", thinkingBlock)
	}
	if appTestMessageText(hydrated.Messages[1]) != "Gemini answer" {
		t.Fatalf("unexpected assistant reply %#v", hydrated.Messages[1])
	}

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
		generationConfig, ok := captured.Body["generationConfig"].(map[string]any)
		if !ok {
			t.Fatalf("expected generationConfig payload, got %#v", captured.Body["generationConfig"])
		}
		thinkingConfig, ok := generationConfig["thinkingConfig"].(map[string]any)
		if !ok || thinkingConfig["includeThoughts"] != true {
			t.Fatalf("expected gemini thinkingConfig with includeThoughts, got %#v", generationConfig["thinkingConfig"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for Gemini thinking provider request")
	}
}

func TestAppServesManagedChatThinkingUnsupportedWithoutExplicitProviderConfig(t *testing.T) {
	// The real IDE app should reject managed thinking requests synchronously
	// when the selected config does not declare explicit provider-native
	// reasoning parameters.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
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
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Think through this."}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":true,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	if err != nil {
		t.Fatalf("new managed thinking request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send managed thinking request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 400, got %d with body %q", response.StatusCode, string(body))
	}
	var payload struct {
		Error struct {
			Code    string `json:"code"`
			Detail  string `json:"detail"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode managed thinking error: %v", err)
	}
	if payload.Error.Code != "thinking_unsupported" {
		t.Fatalf("expected thinking_unsupported, got %#v", payload)
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	runs, err := runStore.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("expected no persisted runs, got %#v", runs)
	}
}

func TestAppServesManagedChatProviderUnsupportedWithoutPersistingRun(t *testing.T) {
	// The real IDE app should reject managed chat configs whose provider does not
	// have a landed Go adapter before a background run is persisted.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "mistral-large-latest",
				Provider:  "mistral",
				APIKeyEnv: "MISTRAL_API_KEY",
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
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Use the managed Mistral config."}]},
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
		t.Fatalf("new managed provider request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send managed provider request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 400, got %d with body %q", response.StatusCode, string(body))
	}
	var payload struct {
		Error struct {
			Code    string `json:"code"`
			Detail  string `json:"detail"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode managed provider error: %v", err)
	}
	if payload.Error.Code != "provider_unsupported" {
		t.Fatalf("expected provider_unsupported, got %#v", payload)
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	runs, err := runStore.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("expected no persisted runs, got %#v", runs)
	}
}

func TestAppServesManagedChatToolCallThroughInternalMCPClient(t *testing.T) {
	// Managed chat tool calls should run through the real IDE app's internal
	// MCP client with scoped per-call metadata and continue the provider turn.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
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

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	cfg.Server.Port = listener.Addr().(*net.TCPAddr).Port
	serverURL := "http://" + listener.Addr().String()

	type providerRequest struct {
		Body map[string]any
	}
	providerRequests := make([]providerRequest, 0, 2)
	requestCount := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests = append(providerRequests, providerRequest{Body: body})
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		switch requestCount {
		case 0:
			_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"tool-call-1\",\"type\":\"function\",\"function\":{\"name\":\"setta__report_completion_status\",\"arguments\":\"{\\\"completionIntent\\\":false,\\\"requiresVerification\\\":false}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "data: [DONE]\n\n")
		case 1:
			_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Tool-backed reply\"},\"finish_reason\":\"stop\"}]}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "data: [DONE]\n\n")
		default:
			http.Error(w, "unexpected request", http.StatusInternalServerError)
			return
		}
		requestCount++
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:           "primary",
				Model:        "gpt-4o-mini",
				Provider:     "openai",
				BaseURL:      provider.URL + "/v1",
				APIKeyEnv:    "OPENAI_API_KEY",
				MCPServerIDs: []string{mcpx.DefaultServerID},
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{
			mcpx.DefaultServerID: {
				Transport: "streamable_http",
				URL:       serverURL + "/mcp",
			},
		},
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
	setAppCompletionGuardEnabled(t, app, true)

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

	waitForAppMCPClientState(t, app, mcpx.RuntimeStateConnected)

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

	authCookie := newAppTestAuthCookie(t, app)
	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Report status and then respond."}]},
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
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode send chat id: %v", err)
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			serverURL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 4
	})

	if appTestMessageText(hydrated.Messages[3]) != "Tool-backed reply" {
		t.Fatalf("unexpected hydrated assistant reply %#v", hydrated.Messages[3])
	}

	if len(providerRequests) != 2 {
		t.Fatalf("expected two provider requests, got %d", len(providerRequests))
	}
	secondMessages, ok := providerRequests[1].Body["messages"].([]any)
	if !ok {
		t.Fatalf("expected follow-up provider messages, got %#v", providerRequests[1].Body["messages"])
	}
	foundToolMessage := false
	for _, rawMessage := range secondMessages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		if message["role"] != "tool" {
			continue
		}
		if message["tool_call_id"] != "tool-call-1" {
			t.Fatalf("unexpected tool message %#v", message)
		}
		foundToolMessage = true
	}
	if !foundToolMessage {
		t.Fatalf("expected provider follow-up to include tool result, got %#v", secondMessages)
	}
}

func TestAppServesManagedChatAnthropicToolCallThroughInternalMCPClient(t *testing.T) {
	// Managed Anthropic chat tool calls should run through the real IDE app's
	// internal MCP client and continue the provider turn with tool_use/tool_result
	// transcript shaping.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	prepareAppCurrentSession(t, cfg)
	t.Setenv("ANTHROPIC_API_KEY", "secret")
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

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	cfg.Server.Port = listener.Addr().(*net.TCPAddr).Port
	serverURL := "http://" + listener.Addr().String()

	type providerRequest struct {
		Path   string
		APIKey string
		Body   map[string]any
	}
	providerRequests := make([]providerRequest, 0, 2)
	requestCount := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests = append(providerRequests, providerRequest{
			Path:   r.URL.Path,
			APIKey: r.Header.Get("X-Api-Key"),
			Body:   body,
		})
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		switch requestCount {
		case 0:
			_, _ = io.WriteString(w, "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-tool-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5-20250929\",\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":18,\"output_tokens\":0,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tool-call-1\",\"name\":\"setta__report_completion_status\",\"input\":{}}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"completionIntent\\\":false,\\\"requiresVerification\\\":false}\"}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\",\"stop_sequence\":null},\"usage\":{\"input_tokens\":18,\"output_tokens\":4,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0}}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
			flusher.Flush()
		case 1:
			_, _ = io.WriteString(w, "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-tool-2\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5-20250929\",\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-2\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":23,\"output_tokens\":0,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Tool-backed anthropic reply\"}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"input_tokens\":23,\"output_tokens\":3,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0}}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
			flusher.Flush()
		default:
			http.Error(w, "unexpected request", http.StatusInternalServerError)
			return
		}
		requestCount++
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:           "primary",
				Model:        "claude-sonnet-4-5-20250929",
				Provider:     "anthropic",
				BaseURL:      provider.URL,
				APIKeyEnv:    "ANTHROPIC_API_KEY",
				MCPServerIDs: []string{mcpx.DefaultServerID},
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{
			mcpx.DefaultServerID: {
				Transport: "streamable_http",
				URL:       serverURL + "/mcp",
			},
		},
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
	setAppCompletionGuardEnabled(t, app, true)

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

	waitForAppMCPClientState(t, app, mcpx.RuntimeStateConnected)

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

	authCookie := newAppTestAuthCookie(t, app)
	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Report status and then respond."}]},
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
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send managed anthropic chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode send chat id: %v", err)
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			serverURL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed anthropic chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 4
	})

	if appTestMessageText(hydrated.Messages[3]) != "Tool-backed anthropic reply" {
		t.Fatalf("unexpected hydrated assistant reply %#v", hydrated.Messages[3])
	}

	if len(providerRequests) != 2 {
		t.Fatalf("expected two provider requests, got %d", len(providerRequests))
	}
	if providerRequests[0].Path != "/v1/messages" {
		t.Fatalf("unexpected provider path %q", providerRequests[0].Path)
	}
	if providerRequests[0].APIKey != "secret" {
		t.Fatalf("unexpected provider api key %q", providerRequests[0].APIKey)
	}
	firstTools, ok := providerRequests[0].Body["tools"].([]any)
	if !ok || len(firstTools) == 0 {
		t.Fatalf("expected anthropic tool definitions, got %#v", providerRequests[0].Body["tools"])
	}
	foundCompletionStatusTool := false
	for _, rawTool := range firstTools {
		tool, ok := rawTool.(map[string]any)
		if !ok {
			continue
		}
		if tool["name"] == "setta__report_completion_status" {
			foundCompletionStatusTool = true
			break
		}
	}
	if !foundCompletionStatusTool {
		t.Fatalf("expected anthropic tool set to include report_completion_status, got %#v", firstTools)
	}
	secondMessages, ok := providerRequests[1].Body["messages"].([]any)
	if !ok || len(secondMessages) < 3 {
		t.Fatalf("expected follow-up anthropic transcript, got %#v", providerRequests[1].Body["messages"])
	}
	foundAssistantToolUse := false
	foundUserToolResult := false
	for _, rawMessage := range secondMessages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := message["role"].(string)
		content, _ := message["content"].([]any)
		if role == "assistant" {
			for _, rawBlock := range content {
				block, _ := rawBlock.(map[string]any)
				if block["type"] == "tool_use" && block["id"] == "tool-call-1" {
					foundAssistantToolUse = true
				}
			}
		}
		if role == "user" {
			for _, rawBlock := range content {
				block, _ := rawBlock.(map[string]any)
				if block["type"] == "tool_result" && block["tool_use_id"] == "tool-call-1" {
					foundUserToolResult = true
				}
			}
		}
	}
	if !foundAssistantToolUse || !foundUserToolResult {
		t.Fatalf("expected anthropic follow-up transcript with tool_use and tool_result, got %#v", secondMessages)
	}
}

func TestAppServesManagedChatGeminiToolCallThroughInternalMCPClient(t *testing.T) {
	// Managed Gemini chat tool calls should run through the real IDE app's
	// internal MCP client and continue the provider turn with functionCall/
	// functionResponse transcript shaping.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	prepareAppCurrentSession(t, cfg)
	t.Setenv("GEMINI_API_KEY", "secret")
	t.Cleanup(func() {
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			_ = os.RemoveAll(cfg.Paths.WorkspaceRoot)
			if _, err := os.Stat(cfg.Paths.WorkspaceRoot); errors.Is(err, os.ErrNotExist) {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
	})

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	cfg.Server.Port = listener.Addr().(*net.TCPAddr).Port
	serverURL := "http://" + listener.Addr().String()

	type providerRequest struct {
		Path   string
		Query  string
		APIKey string
		Body   map[string]any
	}
	providerRequests := make([]providerRequest, 0, 2)
	requestCount := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests = append(providerRequests, providerRequest{
			Path:   r.URL.Path,
			Query:  r.URL.RawQuery,
			APIKey: r.Header.Get("X-Goog-Api-Key"),
			Body:   body,
		})
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		switch requestCount {
		case 0:
			_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"id\":\"tool-call-1\",\"name\":\"setta__report_completion_status\",\"args\":{\"completionIntent\":false,\"requiresVerification\":false}}}]}}],\"usageMetadata\":{\"promptTokenCount\":18,\"candidatesTokenCount\":4,\"totalTokenCount\":22}}\n\n")
			flusher.Flush()
		case 1:
			_, _ = io.WriteString(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Tool-backed gemini reply\"}]}}],\"usageMetadata\":{\"promptTokenCount\":23,\"candidatesTokenCount\":3,\"totalTokenCount\":26}}\n\n")
			flusher.Flush()
		default:
			http.Error(w, "unexpected request", http.StatusInternalServerError)
			return
		}
		requestCount++
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:           "primary",
				Model:        "gemini-2.5-pro",
				Provider:     "gemini",
				BaseURL:      provider.URL,
				APIKeyEnv:    "GEMINI_API_KEY",
				MCPServerIDs: []string{mcpx.DefaultServerID},
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{
			mcpx.DefaultServerID: {
				Transport: "streamable_http",
				URL:       serverURL + "/mcp",
			},
		},
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
	setAppCompletionGuardEnabled(t, app, true)

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

	waitForAppMCPClientState(t, app, mcpx.RuntimeStateConnected)

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

	authCookie := newAppTestAuthCookie(t, app)
	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Report status and then respond."}]},
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
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send managed gemini chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode send chat id: %v", err)
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			serverURL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed gemini chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 4
	})

	if appTestMessageText(hydrated.Messages[3]) != "Tool-backed gemini reply" {
		t.Fatalf("unexpected hydrated assistant reply %#v", hydrated.Messages[3])
	}

	if len(providerRequests) != 2 {
		t.Fatalf("expected two provider requests, got %d", len(providerRequests))
	}
	if providerRequests[0].Path != "/v1beta/models/gemini-2.5-pro:streamGenerateContent" {
		t.Fatalf("unexpected provider path %q", providerRequests[0].Path)
	}
	if providerRequests[0].Query != "alt=sse" {
		t.Fatalf("unexpected provider query %q", providerRequests[0].Query)
	}
	if providerRequests[0].APIKey != "secret" {
		t.Fatalf("unexpected provider api key %q", providerRequests[0].APIKey)
	}
	firstTools, ok := providerRequests[0].Body["tools"].([]any)
	if !ok || len(firstTools) == 0 {
		t.Fatalf("expected gemini tool definitions, got %#v", providerRequests[0].Body["tools"])
	}
	firstToolsJSON, err := json.Marshal(firstTools)
	if err != nil {
		t.Fatalf("marshal gemini tool definitions: %v", err)
	}
	if !strings.Contains(string(firstToolsJSON), "setta__report_completion_status") {
		t.Fatalf("expected gemini tool set to include report_completion_status, got %s", string(firstToolsJSON))
	}
	secondContents, ok := providerRequests[1].Body["contents"].([]any)
	if !ok || len(secondContents) < 3 {
		t.Fatalf("expected follow-up gemini contents, got %#v", providerRequests[1].Body["contents"])
	}
	foundFunctionCall := false
	foundFunctionResponse := false
	for _, rawContent := range secondContents {
		content, ok := rawContent.(map[string]any)
		if !ok {
			continue
		}
		parts, _ := content["parts"].([]any)
		for _, rawPart := range parts {
			part, ok := rawPart.(map[string]any)
			if !ok {
				continue
			}
			functionCall, _ := part["functionCall"].(map[string]any)
			if functionCall != nil && functionCall["id"] == "tool-call-1" {
				foundFunctionCall = true
			}
			functionResponse, _ := part["functionResponse"].(map[string]any)
			if functionResponse != nil && functionResponse["id"] == "tool-call-1" {
				foundFunctionResponse = true
			}
		}
	}
	if !foundFunctionCall || !foundFunctionResponse {
		t.Fatalf("expected gemini follow-up transcript with functionCall and functionResponse, got %#v", secondContents)
	}
}
