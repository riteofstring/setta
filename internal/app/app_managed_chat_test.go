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

func TestAppServesManagedChatHydrateAndStopRoutes(t *testing.T) {
	// The real IDE app should hydrate persisted managed chats and stop the latest
	// running managed run through the Go-owned route stack.
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

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         "llm_chat",
		"chatId":          "chat-app-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages": []any{
			map[string]any{
				"id":   "user-app",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello app"},
				},
				"attachments": []any{},
			},
		},
	}, time.Date(2026, 3, 8, 16, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusRunning
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "user-app",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello app"},
				},
				"attachments": []any{},
			},
			map[string]any{
				"id":   "assistant-app",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Partial app reply"},
				},
				"attachments": []any{},
				"tool_calls":  nil,
			},
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

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	hydrateRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMChat,
		strings.NewReader(`{"chatId":"chat-app-managed","projectConfigId":"project-alpha"}`),
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

	var hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
		LLMConfig          *struct {
			ID string `json:"id"`
		} `json:"llmConfig"`
	}
	if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratePayload); err != nil {
		t.Fatalf("decode hydrate payload: %v", err)
	}
	if len(hydratePayload.Messages) != 2 {
		t.Fatalf("expected hydrated managed chat messages, got %#v", hydratePayload.Messages)
	}
	if !hydratePayload.WaitingForResponse {
		t.Fatalf("expected running managed chat hydration, got %#v", hydratePayload)
	}
	if hydratePayload.LLMConfig == nil || hydratePayload.LLMConfig.ID != "primary" {
		t.Fatalf("expected primary llm config, got %#v", hydratePayload.LLMConfig)
	}

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopLLMChat,
		strings.NewReader(`{"chatId":"chat-app-managed"}`),
	)
	if err != nil {
		t.Fatalf("new stop request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop managed chat: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var stopPayload struct {
		AlreadyStopped bool    `json:"alreadyStopped"`
		StoppedRunID   *string `json:"stoppedRunId"`
	}
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopPayload); err != nil {
		t.Fatalf("decode stop payload: %v", err)
	}
	if stopPayload.AlreadyStopped {
		t.Fatalf("expected active stop payload, got %#v", stopPayload)
	}
	if stopPayload.StoppedRunID == nil || *stopPayload.StoppedRunID != run.ID {
		t.Fatalf("expected stopped run id %q, got %#v", run.ID, stopPayload.StoppedRunID)
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

	var chatID string
	if err := json.NewDecoder(sendResponse.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode managed chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydratedRunning hydratePayload
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
			t.Fatalf("hydrate managed chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratedRunning); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return hydratedRunning.WaitingForResponse &&
			len(hydratedRunning.Messages) == 2 &&
			appTestMessageText(hydratedRunning.Messages[1]) == "Streaming"
	})

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopLLMChat,
		strings.NewReader(`{"chatId":"`+chatID+`"}`),
	)
	if err != nil {
		t.Fatalf("new stop request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop managed chat: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var stopPayload struct {
		AlreadyStopped   bool    `json:"alreadyStopped"`
		StoppedRunID     *string `json:"stoppedRunId"`
		StoppedMessageID *string `json:"stoppedMessageId"`
	}
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopPayload); err != nil {
		t.Fatalf("decode stop payload: %v", err)
	}
	if stopPayload.AlreadyStopped {
		t.Fatalf("expected active stop payload, got %#v", stopPayload)
	}
	if stopPayload.StoppedRunID == nil || strings.TrimSpace(*stopPayload.StoppedRunID) == "" {
		t.Fatalf("expected stopped run id, got %#v", stopPayload)
	}
	if stopPayload.StoppedMessageID == nil || strings.TrimSpace(*stopPayload.StoppedMessageID) == "" {
		t.Fatalf("expected stopped message id, got %#v", stopPayload)
	}

	select {
	case <-providerAborted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for provider abort")
	}

	var hydratedStopped hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new stopped hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate stopped managed chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratedStopped); err != nil {
			t.Fatalf("decode stopped hydrate payload: %v", err)
		}
		return !hydratedStopped.WaitingForResponse &&
			len(hydratedStopped.Messages) == 2 &&
			appTestMessageText(hydratedStopped.Messages[1]) == "Streaming"
	})

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stoppedRun, err := app.agentRuntime.WaitForRun(waitCtx, *stopPayload.StoppedRunID)
	if err != nil {
		t.Fatalf("wait for stopped managed runtime: %v", err)
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
		t.Fatalf("expected persisted assistant message map, got %#v", outputMessages[1])
	}
	assistantMessageID, _ := assistantMessage["id"].(string)
	if appTestMessageText(assistantMessage) != "Streaming" {
		t.Fatalf("unexpected persisted assistant message %#v", assistantMessage)
	}
	if assistantMessageID != *stopPayload.StoppedMessageID {
		t.Fatalf("expected stopped message id %q, got %q", *stopPayload.StoppedMessageID, assistantMessageID)
	}

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

	type providerRequest struct {
		Path          string
		Query         string
		APIKey        string
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

	var chatID string
	if err := json.NewDecoder(sendResponse.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode managed azure chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed azure chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydratedRunning hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new azure hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed azure chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratedRunning); err != nil {
			t.Fatalf("decode azure hydrate payload: %v", err)
		}
		return hydratedRunning.WaitingForResponse &&
			len(hydratedRunning.Messages) == 2 &&
			appTestMessageText(hydratedRunning.Messages[1]) == "Streaming"
	})

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopLLMChat,
		strings.NewReader(`{"chatId":"`+chatID+`"}`),
	)
	if err != nil {
		t.Fatalf("new azure stop request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop managed azure chat: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var stopPayload struct {
		AlreadyStopped   bool    `json:"alreadyStopped"`
		StoppedRunID     *string `json:"stoppedRunId"`
		StoppedMessageID *string `json:"stoppedMessageId"`
	}
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopPayload); err != nil {
		t.Fatalf("decode azure stop payload: %v", err)
	}
	if stopPayload.AlreadyStopped {
		t.Fatalf("expected active stop payload, got %#v", stopPayload)
	}
	if stopPayload.StoppedRunID == nil || strings.TrimSpace(*stopPayload.StoppedRunID) == "" {
		t.Fatalf("expected stopped run id, got %#v", stopPayload)
	}
	if stopPayload.StoppedMessageID == nil || strings.TrimSpace(*stopPayload.StoppedMessageID) == "" {
		t.Fatalf("expected stopped message id, got %#v", stopPayload)
	}

	select {
	case <-providerAborted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for azure provider abort")
	}

	var hydratedStopped hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new stopped azure hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate stopped managed azure chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratedStopped); err != nil {
			t.Fatalf("decode stopped azure hydrate payload: %v", err)
		}
		return !hydratedStopped.WaitingForResponse &&
			len(hydratedStopped.Messages) == 2 &&
			appTestMessageText(hydratedStopped.Messages[1]) == "Streaming"
	})

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stoppedRun, err := app.agentRuntime.WaitForRun(waitCtx, *stopPayload.StoppedRunID)
	if err != nil {
		t.Fatalf("wait for stopped managed azure runtime: %v", err)
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
		t.Fatalf("expected assistant message map, got %#v", outputMessages[1])
	}
	if appTestMessageText(assistantMessage) != "Streaming" {
		t.Fatalf("unexpected stopped azure assistant message %#v", assistantMessage)
	}
	assistantMessageID, ok := assistantMessage["id"].(string)
	if !ok || strings.TrimSpace(assistantMessageID) == "" {
		t.Fatalf("expected stopped assistant id, got %#v", assistantMessage["id"])
	}
	if assistantMessageID != *stopPayload.StoppedMessageID {
		t.Fatalf("expected stopped message id %q, got %q", *stopPayload.StoppedMessageID, assistantMessageID)
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

	var chatID string
	if err := json.NewDecoder(sendResponse.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode managed anthropic chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed anthropic chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydratedRunning hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new anthropic hydrate request: %v", err)
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
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratedRunning); err != nil {
			t.Fatalf("decode anthropic hydrate payload: %v", err)
		}
		return hydratedRunning.WaitingForResponse &&
			len(hydratedRunning.Messages) == 2 &&
			appTestMessageText(hydratedRunning.Messages[1]) == "Streaming"
	})

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopLLMChat,
		strings.NewReader(`{"chatId":"`+chatID+`"}`),
	)
	if err != nil {
		t.Fatalf("new anthropic stop request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop managed anthropic chat: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var stopPayload struct {
		AlreadyStopped   bool    `json:"alreadyStopped"`
		StoppedRunID     *string `json:"stoppedRunId"`
		StoppedMessageID *string `json:"stoppedMessageId"`
	}
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopPayload); err != nil {
		t.Fatalf("decode anthropic stop payload: %v", err)
	}
	if stopPayload.AlreadyStopped {
		t.Fatalf("expected active stop payload, got %#v", stopPayload)
	}
	if stopPayload.StoppedRunID == nil || strings.TrimSpace(*stopPayload.StoppedRunID) == "" {
		t.Fatalf("expected stopped run id, got %#v", stopPayload)
	}
	if stopPayload.StoppedMessageID == nil || strings.TrimSpace(*stopPayload.StoppedMessageID) == "" {
		t.Fatalf("expected stopped message id, got %#v", stopPayload)
	}

	select {
	case <-providerAborted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for anthropic provider abort")
	}

	var hydratedStopped hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new stopped anthropic hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate stopped managed anthropic chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratedStopped); err != nil {
			t.Fatalf("decode stopped anthropic hydrate payload: %v", err)
		}
		return !hydratedStopped.WaitingForResponse &&
			len(hydratedStopped.Messages) == 2 &&
			appTestMessageText(hydratedStopped.Messages[1]) == "Streaming"
	})

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stoppedRun, err := app.agentRuntime.WaitForRun(waitCtx, *stopPayload.StoppedRunID)
	if err != nil {
		t.Fatalf("wait for stopped managed anthropic runtime: %v", err)
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
		t.Fatalf("expected persisted anthropic assistant message map, got %#v", outputMessages[1])
	}
	assistantMessageID, _ := assistantMessage["id"].(string)
	if appTestMessageText(assistantMessage) != "Streaming" {
		t.Fatalf("unexpected persisted anthropic assistant message %#v", assistantMessage)
	}
	if assistantMessageID != *stopPayload.StoppedMessageID {
		t.Fatalf("expected stopped message id %q, got %q", *stopPayload.StoppedMessageID, assistantMessageID)
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

	var chatID string
	if err := json.NewDecoder(sendResponse.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode managed gemini chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed gemini chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
	}
	var hydratedRunning hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new gemini hydrate request: %v", err)
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
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratedRunning); err != nil {
			t.Fatalf("decode gemini hydrate payload: %v", err)
		}
		return hydratedRunning.WaitingForResponse &&
			len(hydratedRunning.Messages) == 2 &&
			appTestMessageText(hydratedRunning.Messages[1]) == "Streaming"
	})

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopLLMChat,
		strings.NewReader(`{"chatId":"`+chatID+`"}`),
	)
	if err != nil {
		t.Fatalf("new gemini stop request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop managed gemini chat: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var stopPayload struct {
		AlreadyStopped   bool    `json:"alreadyStopped"`
		StoppedRunID     *string `json:"stoppedRunId"`
		StoppedMessageID *string `json:"stoppedMessageId"`
	}
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopPayload); err != nil {
		t.Fatalf("decode gemini stop payload: %v", err)
	}
	if stopPayload.AlreadyStopped {
		t.Fatalf("expected active stop payload, got %#v", stopPayload)
	}
	if stopPayload.StoppedRunID == nil || strings.TrimSpace(*stopPayload.StoppedRunID) == "" {
		t.Fatalf("expected stopped run id, got %#v", stopPayload)
	}
	if stopPayload.StoppedMessageID == nil || strings.TrimSpace(*stopPayload.StoppedMessageID) == "" {
		t.Fatalf("expected stopped message id, got %#v", stopPayload)
	}

	select {
	case <-providerAborted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for gemini provider abort")
	}

	var hydratedStopped hydratePayload
	waitForAppCondition(t, 5*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new stopped gemini hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate stopped managed gemini chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydratedStopped); err != nil {
			t.Fatalf("decode stopped gemini hydrate payload: %v", err)
		}
		return !hydratedStopped.WaitingForResponse &&
			len(hydratedStopped.Messages) == 2 &&
			appTestMessageText(hydratedStopped.Messages[1]) == "Streaming"
	})

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stoppedRun, err := app.agentRuntime.WaitForRun(waitCtx, *stopPayload.StoppedRunID)
	if err != nil {
		t.Fatalf("wait for stopped managed gemini runtime: %v", err)
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
		t.Fatalf("expected persisted gemini assistant message map, got %#v", outputMessages[1])
	}
	assistantMessageID, _ := assistantMessage["id"].(string)
	if appTestMessageText(assistantMessage) != "Streaming" {
		t.Fatalf("unexpected persisted gemini assistant message %#v", assistantMessage)
	}
	if assistantMessageID != *stopPayload.StoppedMessageID {
		t.Fatalf("expected stopped message id %q, got %q", *stopPayload.StoppedMessageID, assistantMessageID)
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

	type providerRequest struct {
		Path          string
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
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":21,\"completion_tokens\":2,\"total_tokens\":23}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
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
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
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
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed chat id")
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
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	if hydrated.LLMConfig == nil || hydrated.LLMConfig.ID != "primary" {
		t.Fatalf("expected hydrated llm config primary, got %#v", hydrated.LLMConfig)
	}
	if appTestMessageText(hydrated.Messages[1]) != "Go owned reply" {
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
			t.Fatalf("list managed runs: %v", err)
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
		t.Fatal("expected completed managed run id")
	}
	if _, err := app.agentRuntime.WaitForRun(context.Background(), completedRunID); err != nil {
		t.Fatalf("wait for managed runtime completion: %v", err)
	}

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

func TestAppManagedChatOmitsCompletionStatusToolWhenGuardDisabled(t *testing.T) {
	// Managed chat should read the persisted completion guard setting from the
	// real app runtime and omit the completion-reporting tool when disabled.
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
	providerRequests := make([]providerRequest, 0, 1)
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
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"No completion tool\"}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" needed\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
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

	setAppCompletionGuardEnabled(t, app, false)
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
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Reply without completion reporting."}]},
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
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed chat id")
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
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	if appTestMessageText(hydrated.Messages[1]) != "No completion tool needed" {
		t.Fatalf("unexpected assistant reply %#v", hydrated.Messages[1])
	}

	if len(providerRequests) != 1 {
		t.Fatalf("expected one provider request, got %d", len(providerRequests))
	}
	firstTools, ok := providerRequests[0].Body["tools"].([]any)
	if !ok || len(firstTools) == 0 {
		t.Fatalf("expected openai tool definitions, got %#v", providerRequests[0].Body["tools"])
	}
	firstToolsJSON, err := json.Marshal(firstTools)
	if err != nil {
		t.Fatalf("marshal openai tool definitions: %v", err)
	}
	if strings.Contains(string(firstToolsJSON), "setta__report_completion_status") {
		t.Fatalf("expected openai tool set to omit report_completion_status, got %s", string(firstToolsJSON))
	}
}

func TestAppManagedChatFailsClosedWhenCompletionReportToolMissing(t *testing.T) {
	// Managed chat should fail before any provider call when completion guard
	// is enabled but the managed LLM config cannot supply report_completion_status.
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

	providerCalled := make(chan struct{}, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case providerCalled <- struct{}{}:
		default:
		}
		http.Error(w, "provider should not be called", http.StatusInternalServerError)
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
				MCPServerIDs: []string{},
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

	setAppCompletionGuardEnabled(t, app, true)
	seedAppEmptyProject(t, app)

	authCookie := newAppTestAuthCookie(t, app)
	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Reply only after completion reporting."}]},
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
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed chat id")
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
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
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	assistantText := appTestMessageText(hydrated.Messages[1])
	if !strings.Contains(assistantText, "Completion guard is enabled") {
		t.Fatalf("expected completion-guard failure text, got %#v", hydrated.Messages[1])
	}
	if !strings.Contains(assistantText, "report_completion_status") {
		t.Fatalf("expected completion tool name in failure text, got %#v", hydrated.Messages[1])
	}

	select {
	case <-providerCalled:
		t.Fatal("expected managed chat to fail before contacting provider")
	default:
	}
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

	type providerRequest struct {
		Path          string
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
			Authorization: r.Header.Get("Authorization"),
			Body:          body,
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"type\":\"response.output_item.added\",\"sequence_number\":1,\"output_index\":0,\"item\":{\"type\":\"reasoning\",\"id\":\"reasoning-1\",\"summary\":[],\"content\":[],\"status\":\"in_progress\"}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"type\":\"response.reasoning_summary_text.delta\",\"sequence_number\":2,\"item_id\":\"reasoning-1\",\"output_index\":0,\"summary_index\":0,\"delta\":\"Plan summary\"}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"type\":\"response.reasoning_text.delta\",\"sequence_number\":3,\"item_id\":\"reasoning-1\",\"output_index\":0,\"content_index\":0,\"delta\":\"Planning deeply\"}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"type\":\"response.output_text.delta\",\"sequence_number\":4,\"item_id\":\"message-1\",\"output_index\":1,\"content_index\":0,\"delta\":\"Final answer\",\"logprobs\":[]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"type\":\"response.completed\",\"sequence_number\":99,\"response\":{\"id\":\"response-1\",\"object\":\"response\",\"created_at\":1741567200,\"status\":\"completed\",\"model\":\"gpt-5-codex\",\"output\":[{\"type\":\"reasoning\",\"id\":\"reasoning-1\",\"summary\":[{\"text\":\"Plan summary\"}],\"content\":[{\"type\":\"reasoning_text\",\"text\":\"Planning deeply\"}],\"status\":\"completed\"},{\"type\":\"message\",\"id\":\"message-1\",\"role\":\"assistant\",\"status\":\"completed\",\"content\":[{\"type\":\"output_text\",\"text\":\"Final answer\",\"annotations\":[]}]}],\"usage\":{\"input_tokens\":8,\"input_tokens_details\":{\"cached_tokens\":0},\"output_tokens\":3,\"output_tokens_details\":{\"reasoning_tokens\":2},\"total_tokens\":11}}}\n\n")
		flusher.Flush()
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:       "primary",
				Model:    "gpt-5-codex",
				Provider: "openai",
				BaseURL:  provider.URL + "/v1",
				OtherParams: map[string]any{
					"reasoning_effort": "high",
				},
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
			Name:             "Managed OpenAI Thinking Engine",
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
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed OpenAI thinking project."}]},
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
		t.Fatalf("new OpenAI thinking send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send OpenAI thinking managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode OpenAI thinking chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed OpenAI thinking chat id")
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
			t.Fatalf("hydrate managed OpenAI thinking chat: %v", err)
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
	if thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected OpenAI thinking block %#v", thinkingBlock)
	}
	if appTestMessageText(hydrated.Messages[1]) != "Final answer" {
		t.Fatalf("unexpected assistant reply %#v", hydrated.Messages[1])
	}

	select {
	case captured := <-providerRequests:
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
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for OpenAI thinking provider request")
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

	type providerRequest struct {
		Path          string
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
		t.Fatalf("new send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send managed chat with attachments: %v", err)
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
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed chat id")
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
	if appTestMessageText(hydrated.Messages[1]) != "Go owned attachment reply" {
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
			t.Fatalf("list managed runs: %v", err)
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
		t.Fatal("expected completed managed run id")
	}
	if _, err := app.agentRuntime.WaitForRun(context.Background(), completedRunID); err != nil {
		t.Fatalf("wait for managed runtime completion: %v", err)
	}

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
		messages, ok := captured.Body["messages"].([]any)
		if !ok || len(messages) != 2 {
			t.Fatalf("expected provider messages, got %#v", captured.Body["messages"])
		}
		userMessage, ok := messages[1].(map[string]any)
		if !ok {
			t.Fatalf("expected provider user message, got %#v", messages[1])
		}
		if _, exists := userMessage["attachments"]; exists {
			t.Fatalf("expected provider payload to omit raw attachments, got %#v", userMessage)
		}
		content, _ := userMessage["content"].(string)
		if !strings.Contains(content, "Use the project attachments.") {
			t.Fatalf("expected original user text in provider payload, got %q", content)
		}
		if !strings.Contains(content, "[Attachment: notes.txt]") || !strings.Contains(content, "Hello from attachment.") {
			t.Fatalf("expected text attachment block in provider payload, got %q", content)
		}
		if !strings.Contains(content, "[Attachment: image.png]") ||
			!strings.Contains(content, "Type: image/png") ||
			!strings.Contains(content, "Content not inlined.") {
			t.Fatalf("expected image placeholder block in provider payload, got %q", content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for provider request")
	}
}

func TestAppServesManagedChatSendWithAttachmentsThroughAnthropicExecutor(t *testing.T) {
	// Attachment-bearing managed chat sends should flow through the real IDE
	// app, preserve user attachment metadata in hydrated history, and inline
	// attachment prompt text before the Anthropic provider boundary.
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
		t.Fatalf("new anthropic attachment send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send anthropic managed chat with attachments: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode anthropic attachment chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed anthropic attachment chat id")
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
			t.Fatalf("new anthropic attachment hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed anthropic attachment chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode anthropic attachment hydrate payload: %v", err)
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
	if appTestMessageText(hydrated.Messages[1]) != "Go owned anthropic attachment reply" {
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
			t.Fatalf("list managed anthropic attachment runs: %v", err)
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
		t.Fatal("expected completed managed anthropic attachment run id")
	}
	if _, err := app.agentRuntime.WaitForRun(context.Background(), completedRunID); err != nil {
		t.Fatalf("wait for managed anthropic attachment runtime completion: %v", err)
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
		messages, ok := captured.Body["messages"].([]any)
		if !ok || len(messages) != 1 {
			t.Fatalf("expected provider messages, got %#v", captured.Body["messages"])
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
		t.Fatal("timed out waiting for anthropic attachment provider request")
	}
}

func TestAppServesManagedChatSendWithAttachmentsThroughAzureOpenAIExecutor(t *testing.T) {
	// Attachment-bearing managed chat sends should flow through the real IDE
	// app, preserve user attachment metadata in hydrated history, and inline
	// attachment prompt text before the Azure OpenAI provider boundary.
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
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" attachment reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":34,\"completion_tokens\":3,\"total_tokens\":37}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
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
		t.Fatalf("new azure attachment send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send azure managed chat with attachments: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode azure attachment chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed azure attachment chat id")
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
			t.Fatalf("new azure attachment hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed azure attachment chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode azure attachment hydrate payload: %v", err)
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
	if appTestMessageText(hydrated.Messages[1]) != "Azure attachment reply" {
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
			t.Fatalf("list managed azure attachment runs: %v", err)
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
		t.Fatal("expected completed managed azure attachment run id")
	}
	if _, err := app.agentRuntime.WaitForRun(context.Background(), completedRunID); err != nil {
		t.Fatalf("wait for managed azure attachment runtime completion: %v", err)
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
		messages, ok := captured.Body["messages"].([]any)
		if !ok || len(messages) != 2 {
			t.Fatalf("expected provider messages, got %#v", captured.Body["messages"])
		}
		userMessage, ok := messages[1].(map[string]any)
		if !ok {
			t.Fatalf("expected provider user message, got %#v", messages[1])
		}
		if _, exists := userMessage["attachments"]; exists {
			t.Fatalf("expected provider payload to omit raw attachments, got %#v", userMessage)
		}
		content, _ := userMessage["content"].(string)
		if !strings.Contains(content, "Use the project attachments.") {
			t.Fatalf("expected original user text in provider payload, got %q", content)
		}
		if !strings.Contains(content, "[Attachment: notes.txt]") || !strings.Contains(content, "Hello from attachment.") {
			t.Fatalf("expected text attachment block in provider payload, got %q", content)
		}
		if !strings.Contains(content, "[Attachment: image.png]") ||
			!strings.Contains(content, "Type: image/png") ||
			!strings.Contains(content, "Content not inlined.") {
			t.Fatalf("expected image placeholder block in provider payload, got %q", content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for azure attachment provider request")
	}
}
