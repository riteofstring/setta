package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/transcriptionprofiles"
)

func TestAppServesFoundationRoutes(t *testing.T) {
	t.Parallel()

	cfg := config.Config{
		Server: config.Server{
			Mode:     config.ModeLauncher,
			LogLevel: 0,
		},
		Paths: config.Paths{
			WorkspaceRoot:         "/tmp/workspace",
			SettaHome:             "/tmp/.setta",
			ProfileLookupHome:     "/tmp/.setta",
			SettaFilesRoot:        "/tmp/workspace/setta_files",
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           "/tmp/workspace/setta_files/runtime",
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: "/tmp/.setta/setta_files",
			AutoMode:             config.AutoModeCreateLocal,
		},
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

	response, err := http.Get(server.URL + "/api/runtimeInfo")
	if err != nil {
		t.Fatalf("get runtime info: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}

	var payload httpapi.RuntimeInfo
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode runtime info: %v", err)
	}
	if payload.Mode != "launcher" {
		t.Fatalf("expected mode launcher, got %q", payload.Mode)
	}
	if payload.Paths.SettaFilesLocation != "local" {
		t.Fatalf("expected local files location, got %q", payload.Paths.SettaFilesLocation)
	}
}

func TestAppServesStatusMetaRoutes(t *testing.T) {
	// These live frontend reads should all resolve from the real app stack in IDE mode.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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

	cookie := newAppTestAuthCookie(t, app)

	for _, testCase := range []struct {
		name string
		path string
	}{
		{name: "backend init status", path: "/api" + httpapi.RouteGetBackendInitStatus},
		{name: "auth refresh status", path: "/api" + httpapi.RouteGetAuthRefreshStatus},
		{name: "setta home info", path: "/api" + httpapi.RouteGetSettaHomeInfo},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request, err := http.NewRequest(http.MethodGet, server.URL+testCase.path, nil)
			if err != nil {
				t.Fatalf("new request: %v", err)
			}
			request.AddCookie(cookie)

			response, err := http.DefaultClient.Do(request)
			if err != nil {
				t.Fatalf("get %s: %v", testCase.name, err)
			}
			defer response.Body.Close()
			if response.StatusCode != http.StatusOK {
				body, _ := io.ReadAll(response.Body)
				t.Fatalf("expected %s 200, got %d with body %q", testCase.name, response.StatusCode, string(body))
			}
		})
	}
}

func TestAppServesDocstringToMarkdownRoute(t *testing.T) {
	// The text-block markdown toggle should hit the real IDE app route instead of
	// falling back to the Python helper.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteDocstringToMarkdown,
		strings.NewReader(`{"docstring":"just text"}`),
	)
	if err != nil {
		t.Fatalf("new docstring request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(newAppTestAuthCookie(t, app))

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post docstring route: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected docstring route 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload string
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode docstring payload: %v", err)
	}
	if payload != "just text" {
		t.Fatalf("unexpected docstring route payload %q", payload)
	}
}

func TestAppServesAppDefinitionRoutes(t *testing.T) {
	// The app-config pane should load catalog/read/write/validate through the
	// real IDE app route stack without falling back to Python.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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

	catalogRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RouteGetAppCatalog, nil)
	if err != nil {
		t.Fatalf("new app catalog request: %v", err)
	}
	catalogRequest.AddCookie(authCookie)
	catalogResponse, err := http.DefaultClient.Do(catalogRequest)
	if err != nil {
		t.Fatalf("get app catalog: %v", err)
	}
	defer catalogResponse.Body.Close()
	if catalogResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(catalogResponse.Body)
		t.Fatalf("expected app catalog 200, got %d with body %q", catalogResponse.StatusCode, string(body))
	}

	setRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetAppDefinition,
		strings.NewReader(`{"appSpec":{"root":"root","elements":{"root":{"key":"root","type":"Stack"}}},"theme":{"mode":"dark"}}`),
	)
	if err != nil {
		t.Fatalf("new set app definition request: %v", err)
	}
	setRequest.Header.Set("Content-Type", "application/json")
	setRequest.AddCookie(authCookie)
	setResponse, err := http.DefaultClient.Do(setRequest)
	if err != nil {
		t.Fatalf("set app definition: %v", err)
	}
	defer setResponse.Body.Close()
	if setResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(setResponse.Body)
		t.Fatalf("expected set app definition 200, got %d with body %q", setResponse.StatusCode, string(body))
	}

	getRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetAppDefinition,
		strings.NewReader(`{}`),
	)
	if err != nil {
		t.Fatalf("new get app definition request: %v", err)
	}
	getRequest.Header.Set("Content-Type", "application/json")
	getRequest.AddCookie(authCookie)
	getResponse, err := http.DefaultClient.Do(getRequest)
	if err != nil {
		t.Fatalf("get app definition: %v", err)
	}
	defer getResponse.Body.Close()
	if getResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getResponse.Body)
		t.Fatalf("expected get app definition 200, got %d with body %q", getResponse.StatusCode, string(body))
	}

	validateRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteValidateAppDefinition,
		strings.NewReader(`{"appSpec":{"root":"root","elements":{"root":{"key":"root","type":"Stack"}}}}`),
	)
	if err != nil {
		t.Fatalf("new validate app definition request: %v", err)
	}
	validateRequest.Header.Set("Content-Type", "application/json")
	validateRequest.AddCookie(authCookie)
	validateResponse, err := http.DefaultClient.Do(validateRequest)
	if err != nil {
		t.Fatalf("validate app definition: %v", err)
	}
	defer validateResponse.Body.Close()
	if validateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(validateResponse.Body)
		t.Fatalf("expected validate app definition 200, got %d with body %q", validateResponse.StatusCode, string(body))
	}
}

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
				Transport: "sse",
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

func TestAppServesFileModeTranscriptionSessionRoutes(t *testing.T) {
	// The real IDE app should own file-mode transcription session lifecycle and
	// upload buffered WAV audio through the Go runtime.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "app-transcription-secret")

	type providerRequest struct {
		Path          string
		Authorization string
		Model         string
		Language      string
		FileSize      int
	}
	providerRequests := make(chan providerRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(2 << 20); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()
		fileBytes, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- providerRequest{
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Model:         r.FormValue("model"),
			Language:      r.FormValue("language"),
			FileSize:      len(fileBytes),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"text": "transcribed by go"})
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
				Provider:  "openai",
				BaseURL:   provider.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	transcriptionStore, err := transcriptionprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new transcription store: %v", err)
	}
	if err := transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-file",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
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
	startRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-file","language":"en"}`),
	)
	if err != nil {
		t.Fatalf("new start request: %v", err)
	}
	startRequest.Header.Set("Content-Type", "application/json")
	startRequest.AddCookie(authCookie)

	startResponse, err := http.DefaultClient.Do(startRequest)
	if err != nil {
		t.Fatalf("start transcription session: %v", err)
	}
	defer startResponse.Body.Close()
	if startResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(startResponse.Body)
		t.Fatalf("expected start 200, got %d with body %q", startResponse.StatusCode, string(body))
	}
	var started httpapi.StartTranscriptionSessionResponse
	if err := json.NewDecoder(startResponse.Body).Decode(&started); err != nil {
		t.Fatalf("decode start payload: %v", err)
	}
	if started.ResolvedTransportMode != "file" || started.ChunkMs != 0 {
		t.Fatalf("unexpected start payload %#v", started)
	}

	appendRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	if err != nil {
		t.Fatalf("new append request: %v", err)
	}
	appendRequest.Header.Set("Content-Type", "application/json")
	appendRequest.AddCookie(authCookie)

	appendResponse, err := http.DefaultClient.Do(appendRequest)
	if err != nil {
		t.Fatalf("append transcription audio: %v", err)
	}
	defer appendResponse.Body.Close()
	if appendResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(appendResponse.Body)
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.StatusCode, string(body))
	}
	var appendPayload httpapi.TranscriptionSessionDeltaResponse
	if err := json.NewDecoder(appendResponse.Body).Decode(&appendPayload); err != nil {
		t.Fatalf("decode append payload: %v", err)
	}
	if appendPayload.AppendText != "" || appendPayload.IsFinal {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	if err != nil {
		t.Fatalf("new stop request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop transcription session: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}
	var stopPayload httpapi.TranscriptionSessionDeltaResponse
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopPayload); err != nil {
		t.Fatalf("decode stop payload: %v", err)
	}
	if !stopPayload.IsFinal || stopPayload.AppendText != "transcribed by go" || stopPayload.FullText != "transcribed by go" {
		t.Fatalf("unexpected stop payload %#v", stopPayload)
	}

	select {
	case captured := <-providerRequests:
		if captured.Path != "/v1/audio/transcriptions" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Authorization != "Bearer app-transcription-secret" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.Model != "whisper-1" {
			t.Fatalf("unexpected model %q", captured.Model)
		}
		if captured.Language != "en" {
			t.Fatalf("unexpected language %q", captured.Language)
		}
		if captured.FileSize <= 44 {
			t.Fatalf("expected wav payload larger than header, got %d bytes", captured.FileSize)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for provider request")
	}
}

func TestAppRejectsUnauthorizedTranscriptionAppendBeforeJSONDecode(t *testing.T) {
	// Auth middleware should reject appendTranscriptionAudio before the route
	// tries to decode invalid JSON request bodies.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId"`),
	)
	if err != nil {
		t.Fatalf("new append request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("append transcription audio without auth: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected append 401, got %d with body %q", response.StatusCode, string(body))
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read unauthorized append body: %v", err)
	}
	if strings.Contains(string(body), "invalid_json") {
		t.Fatalf("expected auth rejection before JSON decode, got %q", string(body))
	}
	if !strings.Contains(string(body), "unauthorized") {
		t.Fatalf("expected unauthorized auth error, got %q", string(body))
	}
}

func TestAppServesRealtimeTranscriptionSessionRoutes(t *testing.T) {
	// The real IDE app should own realtime transcription session lifecycle and
	// stream incremental transcript deltas through the bounded Go runtime.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "app-realtime-secret")

	type handshake struct {
		Path          string
		Query         string
		Authorization string
		OpenAIBeta    string
	}

	handshakes := make(chan handshake, 1)
	updates := make(chan map[string]any, 1)
	appends := make(chan map[string]any, 1)
	commits := make(chan map[string]any, 1)
	closed := make(chan error, 1)
	emitFinal := make(chan struct{})

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handshakes <- handshake{
			Path:          r.URL.Path,
			Query:         r.URL.RawQuery,
			Authorization: r.Header.Get("Authorization"),
			OpenAIBeta:    r.Header.Get("OpenAI-Beta"),
		}
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		update, err := readRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		updates <- update
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcription_session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}

		appendPayload, err := readRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		appends <- appendPayload

		commitPayload, err := readRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		commits <- commitPayload

		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","item_id":"item-1","transcript":"ready"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","item_id":"item-2","transcript":"now"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer provider.Close()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   provider.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	transcriptionStore, err := transcriptionprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new transcription store: %v", err)
	}
	if err := transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-realtime",
			Name:                     "Realtime",
			TranscriptionLLMConfigID: "openai-realtime",
			TransportMode:            transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                  200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
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
	startRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime","language":"en"}`),
	)
	if err != nil {
		t.Fatalf("new start request: %v", err)
	}
	startRequest.Header.Set("Content-Type", "application/json")
	startRequest.AddCookie(authCookie)

	startResponse, err := http.DefaultClient.Do(startRequest)
	if err != nil {
		t.Fatalf("start realtime transcription session: %v", err)
	}
	defer startResponse.Body.Close()
	if startResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(startResponse.Body)
		t.Fatalf("expected realtime start 200, got %d with body %q", startResponse.StatusCode, string(body))
	}
	var started httpapi.StartTranscriptionSessionResponse
	if err := json.NewDecoder(startResponse.Body).Decode(&started); err != nil {
		t.Fatalf("decode realtime start payload: %v", err)
	}
	if started.ResolvedTransportMode != "realtime" || started.ChunkMs != 200 {
		t.Fatalf("unexpected realtime start payload %#v", started)
	}

	appendRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	if err != nil {
		t.Fatalf("new realtime append request: %v", err)
	}
	appendRequest.Header.Set("Content-Type", "application/json")
	appendRequest.AddCookie(authCookie)

	appendResponse, err := http.DefaultClient.Do(appendRequest)
	if err != nil {
		t.Fatalf("append realtime transcription audio: %v", err)
	}
	defer appendResponse.Body.Close()
	if appendResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(appendResponse.Body)
		t.Fatalf("expected realtime append 200, got %d with body %q", appendResponse.StatusCode, string(body))
	}
	var appendPayload httpapi.TranscriptionSessionDeltaResponse
	if err := json.NewDecoder(appendResponse.Body).Decode(&appendPayload); err != nil {
		t.Fatalf("decode realtime append payload: %v", err)
	}
	if appendPayload.IsFinal || appendPayload.AppendText != "ready" || appendPayload.FullText != "ready" {
		t.Fatalf("unexpected realtime append payload %#v", appendPayload)
	}

	close(emitFinal)
	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	if err != nil {
		t.Fatalf("new realtime stop request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop realtime transcription session: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected realtime stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}
	var stopPayload httpapi.TranscriptionSessionDeltaResponse
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopPayload); err != nil {
		t.Fatalf("decode realtime stop payload: %v", err)
	}
	if !stopPayload.IsFinal || stopPayload.AppendText != " now" || stopPayload.FullText != "ready now" {
		t.Fatalf("unexpected realtime stop payload %#v", stopPayload)
	}

	select {
	case captured := <-handshakes:
		if captured.Path != "/v1/realtime" {
			t.Fatalf("unexpected realtime path %q", captured.Path)
		}
		if captured.Query != "intent=transcription" {
			t.Fatalf("unexpected realtime query %q", captured.Query)
		}
		if captured.Authorization != "Bearer app-realtime-secret" {
			t.Fatalf("unexpected realtime authorization %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime handshake")
	}

	select {
	case payload := <-updates:
		if payload["type"] != "transcription_session.update" {
			t.Fatalf("unexpected realtime update payload %#v", payload)
		}
		if payload["input_audio_format"] != "pcm16" {
			t.Fatalf("unexpected realtime audio input format %#v", payload)
		}
		transcriptionPayload, ok := payload["input_audio_transcription"].(map[string]any)
		if !ok {
			t.Fatalf("expected transcription payload, got %#v", payload)
		}
		if transcriptionPayload["model"] != "gpt-4o-mini-transcribe" || transcriptionPayload["language"] != "en" {
			t.Fatalf("unexpected transcription payload %#v", transcriptionPayload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime session update")
	}

	select {
	case payload := <-appends:
		if payload["type"] != "input_audio_buffer.append" {
			t.Fatalf("unexpected realtime append payload %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime append payload")
	}

	select {
	case payload := <-commits:
		if payload["type"] != "input_audio_buffer.commit" {
			t.Fatalf("unexpected realtime commit payload %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime commit payload")
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal realtime close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime close")
	}
}

func readRealtimeProviderMessage(ctx context.Context, conn *websocket.Conn) (map[string]any, error) {
	_, payload, err := conn.Read(ctx)
	if err != nil {
		return nil, err
	}
	decoded := map[string]any{}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, err
	}
	return decoded, nil
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
				Transport: "sse",
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
				Transport: "sse",
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
				Transport: "sse",
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

func TestAppServesAppGenSkillRoutes(t *testing.T) {
	// The real app should serve the skills browser routes from the Go-owned filesystem owner.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	fakeHome := filepath.Join(filepath.Dir(cfg.Paths.WorkspaceRoot), "home")
	if err := os.MkdirAll(fakeHome, 0o755); err != nil {
		t.Fatalf("mkdir fake home: %v", err)
	}
	t.Setenv("HOME", fakeHome)
	t.Setenv("AGENTS_HOME", "")
	t.Setenv("CODEX_HOME", "")
	t.Setenv("XDG_CONFIG_HOME", "")

	skillDocPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".agents", "skills", "ui-layout", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(skillDocPath), 0o755); err != nil {
		t.Fatalf("mkdir skill dir: %v", err)
	}
	if err := os.WriteFile(skillDocPath, []byte("# UI Layout\n\nCreate dense dashboard layouts.\n"), 0o644); err != nil {
		t.Fatalf("write skill doc: %v", err)
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

	listRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RouteGetAppGenSkills, nil)
	if err != nil {
		t.Fatalf("new list request: %v", err)
	}
	listRequest.AddCookie(authCookie)
	listResponse, err := http.DefaultClient.Do(listRequest)
	if err != nil {
		t.Fatalf("list app gen skills: %v", err)
	}
	defer listResponse.Body.Close()
	if listResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResponse.Body)
		t.Fatalf("expected list 200, got %d with body %q", listResponse.StatusCode, string(body))
	}

	var listPayload struct {
		Skills []struct {
			SkillID string `json:"skillId"`
		} `json:"skills"`
		CustomSkillCreateRootPath *string `json:"customSkillCreateRootPath"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&listPayload); err != nil {
		t.Fatalf("decode list payload: %v", err)
	}
	if len(listPayload.Skills) != 1 || listPayload.Skills[0].SkillID != "workspace_agents_skills::ui-layout" {
		t.Fatalf("unexpected list payload %#v", listPayload)
	}
	expectedCreateRoot := filepath.Join(fakeHome, ".agents", "skills")
	if listPayload.CustomSkillCreateRootPath == nil || *listPayload.CustomSkillCreateRootPath != expectedCreateRoot {
		t.Fatalf("unexpected create root %#v", listPayload.CustomSkillCreateRootPath)
	}

	contentRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetAppGenSkillContent, strings.NewReader(`{"skillId":"workspace_agents_skills::ui-layout"}`))
	if err != nil {
		t.Fatalf("new content request: %v", err)
	}
	contentRequest.Header.Set("Content-Type", "application/json")
	contentRequest.AddCookie(authCookie)
	contentResponse, err := http.DefaultClient.Do(contentRequest)
	if err != nil {
		t.Fatalf("read app gen skill content: %v", err)
	}
	defer contentResponse.Body.Close()
	if contentResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(contentResponse.Body)
		t.Fatalf("expected content 200, got %d with body %q", contentResponse.StatusCode, string(body))
	}

	var contentPayload struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(contentResponse.Body).Decode(&contentPayload); err != nil {
		t.Fatalf("decode content payload: %v", err)
	}
	if !strings.Contains(contentPayload.Content, "Create dense dashboard layouts.") {
		t.Fatalf("unexpected content payload %#v", contentPayload)
	}

	upsertRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteUpsertAppGenCustomSkill,
		strings.NewReader(`{"skillId":null,"relativePath":"route-created","content":"# route-created\n\nBody.\n"}`),
	)
	if err != nil {
		t.Fatalf("new upsert request: %v", err)
	}
	upsertRequest.Header.Set("Content-Type", "application/json")
	upsertRequest.AddCookie(authCookie)
	upsertResponse, err := http.DefaultClient.Do(upsertRequest)
	if err != nil {
		t.Fatalf("upsert app gen skill: %v", err)
	}
	defer upsertResponse.Body.Close()
	if upsertResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(upsertResponse.Body)
		t.Fatalf("expected upsert 200, got %d with body %q", upsertResponse.StatusCode, string(body))
	}

	var upsertPayload struct {
		SkillID      string `json:"skillId"`
		SkillDocPath string `json:"skillDocPath"`
		Created      bool   `json:"created"`
	}
	if err := json.NewDecoder(upsertResponse.Body).Decode(&upsertPayload); err != nil {
		t.Fatalf("decode upsert payload: %v", err)
	}
	expectedSkillDocPath := filepath.Join(fakeHome, ".agents", "skills", "route-created", "SKILL.md")
	if upsertPayload.SkillID != "user_agents_skills::route-created" || !upsertPayload.Created || upsertPayload.SkillDocPath != expectedSkillDocPath {
		t.Fatalf("unexpected upsert payload %#v", upsertPayload)
	}
	content, err := os.ReadFile(expectedSkillDocPath)
	if err != nil {
		t.Fatalf("read created skill doc: %v", err)
	}
	if string(content) != "# route-created\n\nBody.\n" {
		t.Fatalf("unexpected created skill doc content %q", string(content))
	}
}

func TestAppServesPluginRuntimeAndFrontendAssets(t *testing.T) {
	// The real app should serve plugin runtime hydration plus declared frontend assets from Go.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "full")
	manifestPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-full", "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	frontend := manifest["frontend"].(map[string]any)
	frontend["entrypoint"] = "frontend/src/index.js"
	frontend["style"] = "frontend/src/index.css"
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
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

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)
	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		List struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
			} `json:"plugins"`
		} `json:"list"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if len(runtimePayload.List.Plugins) != 1 || runtimePayload.List.Plugins[0].PluginID != "setta-fixture-full" {
		t.Fatalf("unexpected plugin runtime payload %#v", runtimePayload.List.Plugins)
	}

	assetResponse, err := http.Get(server.URL + "/plugins/setta-fixture-full/frontend/src/index.js")
	if err != nil {
		t.Fatalf("get plugin asset: %v", err)
	}
	defer assetResponse.Body.Close()
	if assetResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(assetResponse.Body)
		t.Fatalf("expected plugin asset 200, got %d with body %q", assetResponse.StatusCode, string(body))
	}
	assetBody, err := io.ReadAll(assetResponse.Body)
	if err != nil {
		t.Fatalf("read plugin asset body: %v", err)
	}
	if !strings.Contains(string(assetBody), "register(") {
		t.Fatalf("expected frontend asset payload, got %q", string(assetBody))
	}
}

func TestAppServesPluginBackendRoutesAndStaticDirs(t *testing.T) {
	// The real IDE app should route backend plugin HTTP registrations through the Go root handler while keeping static dirs public.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend")

	manifestPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend", "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read backend plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode backend plugin manifest: %v", err)
	}
	manifest["capabilities"] = []string{"registerRouter", "registerStaticDir"}
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode backend plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write backend plugin manifest: %v", err)
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

	unauthorizedRouteResponse, err := http.Get(server.URL + "/health")
	if err != nil {
		t.Fatalf("get unauthorized backend route: %v", err)
	}
	defer unauthorizedRouteResponse.Body.Close()
	if unauthorizedRouteResponse.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(unauthorizedRouteResponse.Body)
		t.Fatalf("expected unauthorized backend route 401, got %d with body %q", unauthorizedRouteResponse.StatusCode, string(body))
	}

	staticResponse, err := http.Get(server.URL + "/static/fixture.txt")
	if err != nil {
		t.Fatalf("get backend static dir asset: %v", err)
	}
	defer staticResponse.Body.Close()
	if staticResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(staticResponse.Body)
		t.Fatalf("expected backend static asset 200, got %d with body %q", staticResponse.StatusCode, string(body))
	}
	staticBody, err := io.ReadAll(staticResponse.Body)
	if err != nil {
		t.Fatalf("read backend static asset body: %v", err)
	}
	if strings.TrimSpace(string(staticBody)) != "backend static fixture" {
		t.Fatalf("unexpected backend static asset body %q", string(staticBody))
	}

	authCookie := newAppTestAuthCookie(t, app)

	healthRequest, err := http.NewRequest(http.MethodGet, server.URL+"/health", nil)
	if err != nil {
		t.Fatalf("new backend health request: %v", err)
	}
	healthRequest.AddCookie(authCookie)
	healthResponse, err := http.DefaultClient.Do(healthRequest)
	if err != nil {
		t.Fatalf("get authorized backend route: %v", err)
	}
	defer healthResponse.Body.Close()
	if healthResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(healthResponse.Body)
		t.Fatalf("expected backend health 200, got %d with body %q", healthResponse.StatusCode, string(body))
	}
	var healthPayload map[string]any
	if err := json.NewDecoder(healthResponse.Body).Decode(&healthPayload); err != nil {
		t.Fatalf("decode backend health payload: %v", err)
	}
	if healthPayload["hasAuth"] != true {
		t.Fatalf("expected auth context in backend health payload, got %#v", healthPayload)
	}

	createRequest, err := http.NewRequest(http.MethodPost, server.URL+"/items?view=app", strings.NewReader(`{"name":"app-item"}`))
	if err != nil {
		t.Fatalf("new backend create request: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createRequest.AddCookie(authCookie)
	createResponse, err := http.DefaultClient.Do(createRequest)
	if err != nil {
		t.Fatalf("post backend route: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("expected backend create 201, got %d with body %q", createResponse.StatusCode, string(body))
	}
	if createResponse.Header.Get("X-Plugin") != "backend-fixture" {
		t.Fatalf("expected plugin response header, got %#v", createResponse.Header)
	}
	var createPayload map[string]any
	if err := json.NewDecoder(createResponse.Body).Decode(&createPayload); err != nil {
		t.Fatalf("decode backend create payload: %v", err)
	}
	if createPayload["rawQuery"] != "view=app" || createPayload["contentType"] != "application/json" {
		t.Fatalf("unexpected backend create payload %#v", createPayload)
	}
}

func TestAppLinksPluginRoutesAndServesRuntime(t *testing.T) {
	// The real app should expose local plugin linking through the shared Go plugin service.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	repoRoot := appTestRepoRoot(t)
	localPluginRoot := filepath.Join(t.TempDir(), "frontend")
	copyAppTestDir(t, filepath.Join(repoRoot, "tests", "fixtures", "plugins", "frontend"), localPluginRoot)
	manifestPath := filepath.Join(localPluginRoot, "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	frontend := manifest["frontend"].(map[string]any)
	frontend["entrypoint"] = "frontend/src/index.js"
	frontend["style"] = "frontend/src/index.css"
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
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

	linkRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RoutePluginsLink,
		bytes.NewReader(mustAppJSON(t, map[string]any{
			"localPluginRoot": localPluginRoot,
			"scope":           "workspace",
			"enable":          true,
			"force":           false,
		})),
	)
	if err != nil {
		t.Fatalf("new plugin link request: %v", err)
	}
	linkRequest.Header.Set("Content-Type", "application/json")
	linkRequest.AddCookie(authCookie)

	linkResponse, err := http.DefaultClient.Do(linkRequest)
	if err != nil {
		t.Fatalf("post plugin link: %v", err)
	}
	defer linkResponse.Body.Close()
	if linkResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(linkResponse.Body)
		t.Fatalf("expected plugin link 200, got %d with body %q", linkResponse.StatusCode, string(body))
	}

	var linkPayload struct {
		PluginID         string `json:"pluginId"`
		SourceScopeLabel string `json:"sourceScopeLabel"`
		TrustStatus      string `json:"trustStatus"`
		TrustWarning     string `json:"trustWarning"`
		State            string `json:"state"`
	}
	if err := json.NewDecoder(linkResponse.Body).Decode(&linkPayload); err != nil {
		t.Fatalf("decode plugin link payload: %v", err)
	}
	if linkPayload.PluginID != "setta-fixture-frontend" || linkPayload.State != "active" {
		t.Fatalf("unexpected plugin link payload %#v", linkPayload)
	}
	if linkPayload.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace source scope label, got %#v", linkPayload.SourceScopeLabel)
	}
	if linkPayload.TrustStatus != "unverified" || linkPayload.TrustWarning != "Source is unverified. Install only from trusted owners." {
		t.Fatalf("unexpected plugin link trust payload %#v", linkPayload)
	}

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime after link: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		Status struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
				State    string `json:"state"`
			} `json:"plugins"`
		} `json:"status"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload after link: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one linked plugin in runtime payload, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-frontend" || runtimePayload.Status.Plugins[0].State != "active" {
		t.Fatalf("unexpected plugin runtime payload after link %#v", runtimePayload.Status.Plugins[0])
	}
}

func TestAppWritesPluginConfigAndUpdatesRuntime(t *testing.T) {
	// The real app should accept plugin config writes and reflect them in subsequent runtime reads.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "full")
	manifestPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-full", "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	frontend := manifest["frontend"].(map[string]any)
	frontend["entrypoint"] = "frontend/src/index.js"
	frontend["style"] = "frontend/src/index.css"
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
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

	configRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RoutePluginsConfig,
		strings.NewReader(`{"pluginId":"setta-fixture-full","config":{"enabled":true,"label":"app-write"}}`),
	)
	if err != nil {
		t.Fatalf("new plugin config request: %v", err)
	}
	configRequest.Header.Set("Content-Type", "application/json")
	configRequest.AddCookie(authCookie)

	configResponse, err := http.DefaultClient.Do(configRequest)
	if err != nil {
		t.Fatalf("post plugin config: %v", err)
	}
	defer configResponse.Body.Close()
	if configResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(configResponse.Body)
		t.Fatalf("expected plugin config 200, got %d with body %q", configResponse.StatusCode, string(body))
	}

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime after config write: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		List struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
				Config   struct {
					CurrentConfig map[string]any `json:"currentConfig"`
				} `json:"config"`
			} `json:"plugins"`
		} `json:"list"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if len(runtimePayload.List.Plugins) != 1 {
		t.Fatalf("expected one plugin after config write, got %#v", runtimePayload.List.Plugins)
	}
	if got := runtimePayload.List.Plugins[0].Config.CurrentConfig["label"]; got != "app-write" {
		t.Fatalf("expected runtime config label app-write, got %#v", got)
	}
}

func TestAppHandlesPluginRescanEnableAndDisableRoutes(t *testing.T) {
	// The real app should wire rescan plus enable/disable plugin lifecycle routes through the shared Go service.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "frontend")
	manifestPath := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-frontend", "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	frontend := manifest["frontend"].(map[string]any)
	frontend["entrypoint"] = "frontend/src/index.js"
	frontend["style"] = "frontend/src/index.css"
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
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
	requestPluginLifecycle := func(path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s request: %v", path, err)
		}
		if body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		return response
	}

	rescanResponse := requestPluginLifecycle(httpapi.RoutePluginsRescan, "")
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugin rescan 200, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	var initialRescan struct {
		InstalledPlugins int `json:"installedPlugins"`
		ActivePlugins    int `json:"activePlugins"`
	}
	if err := json.NewDecoder(rescanResponse.Body).Decode(&initialRescan); err != nil {
		t.Fatalf("decode initial rescan payload: %v", err)
	}
	if initialRescan.InstalledPlugins != 1 || initialRescan.ActivePlugins != 1 {
		t.Fatalf("unexpected initial rescan payload %#v", initialRescan)
	}

	disableResponse := requestPluginLifecycle(httpapi.RoutePluginsDisable, `{"pluginId":"setta-fixture-frontend"}`)
	defer disableResponse.Body.Close()
	if disableResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(disableResponse.Body)
		t.Fatalf("expected plugin disable 200, got %d with body %q", disableResponse.StatusCode, string(body))
	}

	var disabledPayload struct {
		State           string `json:"state"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(disableResponse.Body).Decode(&disabledPayload); err != nil {
		t.Fatalf("decode disable payload: %v", err)
	}
	if disabledPayload.State != "disabled" || disabledPayload.RestartRequired {
		t.Fatalf("unexpected disable payload %#v", disabledPayload)
	}

	rescanAfterDisableResponse := requestPluginLifecycle(httpapi.RoutePluginsRescan, "")
	defer rescanAfterDisableResponse.Body.Close()
	if rescanAfterDisableResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanAfterDisableResponse.Body)
		t.Fatalf("expected plugin rescan after disable 200, got %d with body %q", rescanAfterDisableResponse.StatusCode, string(body))
	}

	var rescanAfterDisable struct {
		InstalledPlugins int `json:"installedPlugins"`
		ActivePlugins    int `json:"activePlugins"`
	}
	if err := json.NewDecoder(rescanAfterDisableResponse.Body).Decode(&rescanAfterDisable); err != nil {
		t.Fatalf("decode post-disable rescan payload: %v", err)
	}
	if rescanAfterDisable.InstalledPlugins != 1 || rescanAfterDisable.ActivePlugins != 0 {
		t.Fatalf("unexpected post-disable rescan payload %#v", rescanAfterDisable)
	}

	enableResponse := requestPluginLifecycle(httpapi.RoutePluginsEnable, `{"pluginId":"setta-fixture-frontend"}`)
	defer enableResponse.Body.Close()
	if enableResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(enableResponse.Body)
		t.Fatalf("expected plugin enable 200, got %d with body %q", enableResponse.StatusCode, string(body))
	}

	var enabledPayload struct {
		State           string `json:"state"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(enableResponse.Body).Decode(&enabledPayload); err != nil {
		t.Fatalf("decode enable payload: %v", err)
	}
	if enabledPayload.State != "active" || enabledPayload.RestartRequired {
		t.Fatalf("unexpected enable payload %#v", enabledPayload)
	}
}

func TestAppInstallsAndUninstallsPluginRoutes(t *testing.T) {
	// The real app should wire install and uninstall plugin routes through the production candidate-provider boundary.
	sourceSpec := configureAppLocalPyPIFixture(t, "frontend", "setta-fixture-frontend", "0.1.0")

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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
	postPluginMutation := func(path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s request: %v", path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		return response
	}

	installResponse := postPluginMutation(httpapi.RoutePluginsInstall, `{"sourceSpec":"`+sourceSpec+`","scope":"workspace","installer":"pip","enable":true,"force":false}`)
	defer installResponse.Body.Close()
	if installResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(installResponse.Body)
		t.Fatalf("expected plugin install 200, got %d with body %q", installResponse.StatusCode, string(body))
	}

	var installPayload struct {
		PluginID         string `json:"pluginId"`
		SourceScopeLabel string `json:"sourceScopeLabel"`
		TrustStatus      string `json:"trustStatus"`
		State            string `json:"state"`
	}
	if err := json.NewDecoder(installResponse.Body).Decode(&installPayload); err != nil {
		t.Fatalf("decode install payload: %v", err)
	}
	if installPayload.PluginID != "setta-fixture-frontend" || installPayload.SourceScopeLabel != "workspace" {
		t.Fatalf("unexpected install payload %#v", installPayload)
	}
	if installPayload.TrustStatus != "unverified" || installPayload.State != "active" {
		t.Fatalf("unexpected install trust/state payload %#v", installPayload)
	}

	uninstallResponse := postPluginMutation(httpapi.RoutePluginsUninstall, `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`)
	defer uninstallResponse.Body.Close()
	if uninstallResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uninstallResponse.Body)
		t.Fatalf("expected plugin uninstall 200, got %d with body %q", uninstallResponse.StatusCode, string(body))
	}

	var uninstallPayload struct {
		PluginID         string `json:"pluginId"`
		RemovedFromScope string `json:"removedFromScope"`
	}
	if err := json.NewDecoder(uninstallResponse.Body).Decode(&uninstallPayload); err != nil {
		t.Fatalf("decode uninstall payload: %v", err)
	}
	if uninstallPayload.PluginID != "setta-fixture-frontend" || uninstallPayload.RemovedFromScope != "workspace" {
		t.Fatalf("unexpected uninstall payload %#v", uninstallPayload)
	}

	rescanResponse := postPluginMutation(httpapi.RoutePluginsRescan, `{}`)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugin rescan 200, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	var rescanPayload struct {
		InstalledPlugins int `json:"installedPlugins"`
		ActivePlugins    int `json:"activePlugins"`
	}
	if err := json.NewDecoder(rescanResponse.Body).Decode(&rescanPayload); err != nil {
		t.Fatalf("decode rescan payload: %v", err)
	}
	if rescanPayload.InstalledPlugins != 0 || rescanPayload.ActivePlugins != 0 {
		t.Fatalf("unexpected post-uninstall rescan payload %#v", rescanPayload)
	}
}

func TestAppUpdatesAndRollsBackPluginRoutes(t *testing.T) {
	// The real app should wire update and rollback plugin routes through install metadata and the production candidate-provider boundary.
	artifactDir := t.TempDir()
	buildAppLocalPyPIWheelFromFixture(t, artifactDir, "frontend", "setta-fixture-frontend", "0.1.0")
	buildAppLocalPyPIWheelFromFixture(t, artifactDir, "frontend", "setta-fixture-frontend", "0.2.0")
	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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
	postPluginMutation := func(path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s request: %v", path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		return response
	}

	installResponse := postPluginMutation(httpapi.RoutePluginsInstall, `{"sourceSpec":"pypi:setta-fixture-frontend==0.1.0","scope":"workspace","installer":"pip","enable":true,"force":false}`)
	defer installResponse.Body.Close()
	if installResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(installResponse.Body)
		t.Fatalf("expected plugin install 200, got %d with body %q", installResponse.StatusCode, string(body))
	}

	updateResponse := postPluginMutation(httpapi.RoutePluginsUpdate, `{"pluginId":"setta-fixture-frontend","scope":"workspace","to":"0.2.0"}`)
	defer updateResponse.Body.Close()
	if updateResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(updateResponse.Body)
		t.Fatalf("expected plugin update 200, got %d with body %q", updateResponse.StatusCode, string(body))
	}

	var updatePayload struct {
		PluginID        string `json:"pluginId"`
		FromVersion     string `json:"fromVersion"`
		ToVersion       string `json:"toVersion"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(updateResponse.Body).Decode(&updatePayload); err != nil {
		t.Fatalf("decode update payload: %v", err)
	}
	if updatePayload.PluginID != "setta-fixture-frontend" || updatePayload.FromVersion != "0.1.0" || updatePayload.ToVersion != "0.2.0" || updatePayload.RestartRequired {
		t.Fatalf("unexpected update payload %#v", updatePayload)
	}

	rollbackResponse := postPluginMutation(httpapi.RoutePluginsRollback, `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`)
	defer rollbackResponse.Body.Close()
	if rollbackResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rollbackResponse.Body)
		t.Fatalf("expected plugin rollback 200, got %d with body %q", rollbackResponse.StatusCode, string(body))
	}

	var rollbackPayload struct {
		PluginID        string `json:"pluginId"`
		RestoredVersion string `json:"restoredVersion"`
		RestartRequired bool   `json:"restartRequired"`
	}
	if err := json.NewDecoder(rollbackResponse.Body).Decode(&rollbackPayload); err != nil {
		t.Fatalf("decode rollback payload: %v", err)
	}
	if rollbackPayload.PluginID != "setta-fixture-frontend" || rollbackPayload.RestoredVersion != "0.1.0" || rollbackPayload.RestartRequired {
		t.Fatalf("unexpected rollback payload %#v", rollbackPayload)
	}

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime after rollback: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		Status struct {
			Plugins []struct {
				PluginID string  `json:"pluginId"`
				Version  string  `json:"version"`
				Shadowed *string `json:"shadowedBySourcePath"`
			} `json:"plugins"`
		} `json:"status"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one plugin after rollback, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-frontend" || runtimePayload.Status.Plugins[0].Version != "0.1.0" {
		t.Fatalf("unexpected runtime payload after rollback %#v", runtimePayload.Status.Plugins[0])
	}
}

func TestAppWritesAndAppliesPluginLockRoutes(t *testing.T) {
	// The real app should expose plugin lockfile write/apply routes over the shared Go plugin service.
	sourceSpec := configureAppLocalPyPIFixture(t, "frontend", "setta-fixture-frontend", "0.1.0")

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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
	postPluginMutation := func(path string, body string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, strings.NewReader(body))
		if err != nil {
			t.Fatalf("new %s request: %v", path, err)
		}
		if body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		return response
	}

	installResponse := postPluginMutation(httpapi.RoutePluginsInstall, `{"sourceSpec":"`+sourceSpec+`","scope":"workspace","installer":"pip","enable":true,"force":false}`)
	defer installResponse.Body.Close()
	if installResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(installResponse.Body)
		t.Fatalf("expected plugin install 200, got %d with body %q", installResponse.StatusCode, string(body))
	}

	lockWriteResponse := postPluginMutation(httpapi.RoutePluginsLockWrite, "")
	defer lockWriteResponse.Body.Close()
	if lockWriteResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(lockWriteResponse.Body)
		t.Fatalf("expected lock write 200, got %d with body %q", lockWriteResponse.StatusCode, string(body))
	}

	var lockWritePayload struct {
		LockfilePath string `json:"lockfilePath"`
		PluginCount  int    `json:"pluginCount"`
	}
	if err := json.NewDecoder(lockWriteResponse.Body).Decode(&lockWritePayload); err != nil {
		t.Fatalf("decode lock write payload: %v", err)
	}
	if lockWritePayload.PluginCount != 1 || lockWritePayload.LockfilePath == "" {
		t.Fatalf("unexpected lock write payload %#v", lockWritePayload)
	}

	uninstallResponse := postPluginMutation(httpapi.RoutePluginsUninstall, `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`)
	defer uninstallResponse.Body.Close()
	if uninstallResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uninstallResponse.Body)
		t.Fatalf("expected plugin uninstall 200, got %d with body %q", uninstallResponse.StatusCode, string(body))
	}

	lockApplyCheckResponse := postPluginMutation(httpapi.RoutePluginsLockApply, `{"check":true}`)
	defer lockApplyCheckResponse.Body.Close()
	if lockApplyCheckResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(lockApplyCheckResponse.Body)
		t.Fatalf("expected lock apply check 200, got %d with body %q", lockApplyCheckResponse.StatusCode, string(body))
	}

	var lockApplyCheckPayload struct {
		PlannedChanges []string `json:"plannedChanges"`
		Applied        bool     `json:"applied"`
	}
	if err := json.NewDecoder(lockApplyCheckResponse.Body).Decode(&lockApplyCheckPayload); err != nil {
		t.Fatalf("decode lock apply check payload: %v", err)
	}
	if lockApplyCheckPayload.Applied {
		t.Fatalf("expected check-only lock apply payload, got %#v", lockApplyCheckPayload)
	}
	if len(lockApplyCheckPayload.PlannedChanges) != 1 || !strings.Contains(lockApplyCheckPayload.PlannedChanges[0], "install setta-fixture-frontend in workspace") {
		t.Fatalf("unexpected lock apply check payload %#v", lockApplyCheckPayload)
	}

	lockApplyResponse := postPluginMutation(httpapi.RoutePluginsLockApply, `{"check":false}`)
	defer lockApplyResponse.Body.Close()
	if lockApplyResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(lockApplyResponse.Body)
		t.Fatalf("expected lock apply 200, got %d with body %q", lockApplyResponse.StatusCode, string(body))
	}

	var lockApplyPayload struct {
		Applied bool `json:"applied"`
	}
	if err := json.NewDecoder(lockApplyResponse.Body).Decode(&lockApplyPayload); err != nil {
		t.Fatalf("decode lock apply payload: %v", err)
	}
	if !lockApplyPayload.Applied {
		t.Fatalf("expected applied lock payload, got %#v", lockApplyPayload)
	}

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime after lock apply: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		Status struct {
			Plugins []struct {
				PluginID string `json:"pluginId"`
				State    string `json:"state"`
			} `json:"plugins"`
		} `json:"status"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode runtime payload after lock apply: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one plugin after lock apply, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-frontend" || runtimePayload.Status.Plugins[0].State != "active" {
		t.Fatalf("unexpected runtime payload after lock apply %#v", runtimePayload.Status.Plugins[0])
	}
}

func TestAppServesProgrammaticPluginRestartRouteInIDE(t *testing.T) {
	// The real IDE app should wire plugin restart into the live backend-runtime refresh path.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RoutePluginsRestart, nil)
	if err != nil {
		t.Fatalf("new plugin restart request: %v", err)
	}
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugin restart: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugin restart 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		Accepted bool    `json:"accepted"`
		Mode     string  `json:"mode"`
		Command  *string `json:"command"`
		Reason   *string `json:"reason"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode plugin restart payload: %v", err)
	}
	if !payload.Accepted {
		t.Fatalf("expected accepted restart payload, got %#v", payload)
	}
	if payload.Mode != "programmatic" {
		t.Fatalf("expected programmatic restart mode, got %#v", payload.Mode)
	}
	if payload.Command != nil {
		t.Fatalf("expected accepted restart to omit fallback command, got %#v", payload.Command)
	}
	if payload.Reason != nil {
		t.Fatalf("expected accepted restart to omit fallback reason, got %#v", payload.Reason)
	}
}

func TestAppPluginRuntimeReportsProgrammaticRestartCapabilityInIDE(t *testing.T) {
	// The plugins runtime payload consumed by the overview pane should expose
	// programmatic restart capability in the real IDE app.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

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
	request, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("get plugin runtime: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		List struct {
			ServerMode        string `json:"serverMode"`
			RestartCapability struct {
				Mode    string  `json:"mode"`
				Command *string `json:"command"`
				Reason  *string `json:"reason"`
			} `json:"restartCapability"`
		} `json:"list"`
		Status struct {
			ServerMode        string `json:"serverMode"`
			RestartCapability struct {
				Mode    string  `json:"mode"`
				Command *string `json:"command"`
				Reason  *string `json:"reason"`
			} `json:"restartCapability"`
		} `json:"status"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if payload.List.ServerMode != "ide" || payload.Status.ServerMode != "ide" {
		t.Fatalf("expected ide runtime payload, got list=%q status=%q", payload.List.ServerMode, payload.Status.ServerMode)
	}
	if payload.List.RestartCapability.Mode != "programmatic" {
		t.Fatalf("expected programmatic list restart capability, got %#v", payload.List.RestartCapability)
	}
	if payload.Status.RestartCapability.Mode != "programmatic" {
		t.Fatalf("expected programmatic status restart capability, got %#v", payload.Status.RestartCapability)
	}
	if payload.List.RestartCapability.Command != nil || payload.List.RestartCapability.Reason != nil {
		t.Fatalf("expected list restart capability without fallback payload, got %#v", payload.List.RestartCapability)
	}
	if payload.Status.RestartCapability.Command != nil || payload.Status.RestartCapability.Reason != nil {
		t.Fatalf("expected status restart capability without fallback payload, got %#v", payload.Status.RestartCapability)
	}
}

func TestAppPluginRestartClearsPendingBackendPluginState(t *testing.T) {
	// Programmatic restart should rebuild backend plugin runtime and clear persisted pending_restart markers.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend")
	if err := os.WriteFile(
		filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"),
		[]byte(`{"pendingRestartBackendPluginIds":["setta-fixture-backend"]}`),
		0o644,
	); err != nil {
		t.Fatalf("write pending restart plugin state: %v", err)
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
	doRequest := func(method string, path string) *http.Response {
		t.Helper()

		request, err := http.NewRequest(method, server.URL+path, nil)
		if err != nil {
			t.Fatalf("new %s %s request: %v", method, path, err)
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		return response
	}
	readPluginState := func() string {
		t.Helper()

		response := doRequest(http.MethodGet, "/api"+httpapi.RoutePluginsRuntime)
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(response.Body)
			t.Fatalf("expected plugin runtime 200, got %d with body %q", response.StatusCode, string(body))
		}

		var payload struct {
			Status struct {
				Plugins []struct {
					PluginID string `json:"pluginId"`
					State    string `json:"state"`
				} `json:"plugins"`
			} `json:"status"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			t.Fatalf("decode plugin runtime payload: %v", err)
		}
		for _, entry := range payload.Status.Plugins {
			if entry.PluginID == "setta-fixture-backend" {
				return entry.State
			}
		}
		t.Fatal("expected backend plugin runtime entry")
		return ""
	}

	if state := readPluginState(); state != "pending_restart" {
		t.Fatalf("expected backend plugin to start pending_restart, got %q", state)
	}

	restartResponse := doRequest(http.MethodPost, "/api"+httpapi.RoutePluginsRestart)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected plugin restart 200, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	var restartPayload struct {
		Accepted bool   `json:"accepted"`
		Mode     string `json:"mode"`
	}
	if err := json.NewDecoder(restartResponse.Body).Decode(&restartPayload); err != nil {
		t.Fatalf("decode plugin restart payload: %v", err)
	}
	if !restartPayload.Accepted || restartPayload.Mode != "programmatic" {
		t.Fatalf("expected accepted programmatic restart payload, got %#v", restartPayload)
	}

	if state := readPluginState(); state != "active" {
		t.Fatalf("expected backend plugin to be active after restart, got %q", state)
	}
}

func TestAppSaveProjectsPythonCodeSectionFilesForLSP(t *testing.T) {
	cfg := testConfig(t)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppLSPCodeSectionProject(t, app)

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save lsp code section project: %v", err)
	}

	sectionPath := filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "runner.py")
	content, err := os.ReadFile(sectionPath)
	if err != nil {
		t.Fatalf("read canonical lsp section file: %v", err)
	}
	if string(content) != "print('runner')\n" {
		t.Fatalf("unexpected canonical lsp section content %q", string(content))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("runner")
	if err != nil {
		t.Fatalf("resolve runner after save: %v", err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatal("expected normalized runner binding after save")
	}
	if impl.Code.Binding.Path != "code/sections/alpha/runner.py" {
		t.Fatalf("unexpected runner binding path %q", impl.Code.Binding.Path)
	}
}

func TestAppShutdownStopsRuntime(t *testing.T) {
	t.Parallel()

	app, err := New(testConfig(t), observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	stopped := make(chan struct{})
	app.Runtime().Go("wait", func(ctx context.Context) error {
		defer close(stopped)
		<-ctx.Done()
		return nil
	})

	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	if err := app.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("shutdown app: %v", err)
	}
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("runtime task did not stop")
	}
}

func TestAppWiresSeparateProjectStateRuntimes(t *testing.T) {
	t.Parallel()

	cfg := testConfig(t)
	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	projectStates := app.ProjectStates()
	if projectStates == nil {
		t.Fatal("expected project state registry")
	}
	if app.Terminals() == nil {
		t.Fatal("expected terminal service")
	}

	paths := projectStates.Paths()
	if paths.Main != filepath.Join(cfg.Paths.SettaFilesRoot, "project.json") {
		t.Fatalf("expected main project path %q, got %q", filepath.Join(cfg.Paths.SettaFilesRoot, "project.json"), paths.Main)
	}
	if paths.Settings != filepath.Join(cfg.Paths.SettaFilesRoot, "setta-settings-project.json") {
		t.Fatalf("expected settings project path %q, got %q", filepath.Join(cfg.Paths.SettaFilesRoot, "setta-settings-project.json"), paths.Settings)
	}
	settingsProject, err := projectStates.Settings().Snapshot().Document.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("expected bootstrapped settings project runtime: %v", err)
	}
	if settingsProject.Name != settingsstate.SettingsProjectName {
		t.Fatalf("expected bootstrapped settings project name %q, got %q", settingsstate.SettingsProjectName, settingsProject.Name)
	}

	if _, err := projectStates.Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate main runtime: %v", err)
	}
	if _, err := projectStates.Settings().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["settings-home"] = projectstate.Project{
			ID:   "settings-home",
			Name: "Settings Home",
		}
		document.DefaultProjectID = "settings-home"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate settings runtime: %v", err)
	}

	mainSnapshot, err := projectStates.Main().Save(context.Background())
	if err != nil {
		t.Fatalf("save main runtime: %v", err)
	}
	settingsSnapshot, err := projectStates.Settings().Save(context.Background())
	if err != nil {
		t.Fatalf("save settings runtime: %v", err)
	}

	if mainSnapshot.Revision != 2 {
		t.Fatalf("expected main revision 2, got %d", mainSnapshot.Revision)
	}
	if settingsSnapshot.Revision != 3 {
		t.Fatalf("expected settings revision 3 after bootstrap and mutation, got %d", settingsSnapshot.Revision)
	}
	if _, ok := settingsSnapshot.Document.Projects["project-alpha"]; ok {
		t.Fatal("did not expect main project in settings runtime")
	}
}

func TestAppWiresManagedAgentRunFoundationInIDEMode(t *testing.T) {
	t.Parallel()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 8000

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.agentRuns == nil {
		t.Fatal("expected managed agent run service")
	}
	if app.agentRuns.Disabled() {
		t.Fatal("expected managed agent run service to be wired")
	}
	if app.agentRuntime == nil {
		t.Fatal("expected managed agent run runtime")
	}
	if app.agentRuntime.Disabled() {
		t.Fatal("expected managed agent run runtime to be wired")
	}
	if app.runChains == nil {
		t.Fatal("expected run-chain runtime")
	}
	if app.runChains.Disabled() {
		t.Fatal("expected run-chain runtime to stay available through the external-agent step boundary")
	}
}

func TestAppServesManagedAgentRunRoutesWithManagedExecutor(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Managed agent\"}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":8,\"completion_tokens\":2,\"total_tokens\":10}}\n\n")
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

	profileStore, err := agentprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new profile store: %v", err)
	}
	engineConfigID := "engine-managed"
	if err := profileStore.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			EngineConfigID: &engineConfigID,
		},
	}); err != nil {
		t.Fatalf("write agent profile: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
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
	startRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStartAgentRun,
		strings.NewReader(`{"profileId":"profile-alpha","inputs":{"allowUnscoped":true,"prompt":"Plan this task."}}`),
	)
	if err != nil {
		t.Fatalf("new start run request: %v", err)
	}
	startRequest.Header.Set("Content-Type", "application/json")
	startRequest.AddCookie(authCookie)

	startResponse, err := http.DefaultClient.Do(startRequest)
	if err != nil {
		t.Fatalf("start managed agent run: %v", err)
	}
	defer startResponse.Body.Close()
	if startResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(startResponse.Body)
		t.Fatalf("expected start run 200, got %d with body %q", startResponse.StatusCode, string(body))
	}

	var started agentruns.Run
	if err := json.NewDecoder(startResponse.Body).Decode(&started); err != nil {
		t.Fatalf("decode started run: %v", err)
	}
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running managed run, got %#v", started)
	}

	var loaded agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		getRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetAgentRun,
			strings.NewReader(`{"runId":"`+started.ID+`"}`),
		)
		if err != nil {
			t.Fatalf("new get run request: %v", err)
		}
		getRequest.Header.Set("Content-Type", "application/json")
		getRequest.AddCookie(authCookie)

		getResponse, err := http.DefaultClient.Do(getRequest)
		if err != nil {
			t.Fatalf("get managed run: %v", err)
		}
		defer getResponse.Body.Close()
		if getResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(getResponse.Body)
			t.Fatalf("expected get run 200, got %d with body %q", getResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(getResponse.Body).Decode(&loaded); err != nil {
			t.Fatalf("decode managed run: %v", err)
		}
		return loaded.Status == agentruns.RunStatusCompleted
	})
	if _, err := app.agentRuntime.WaitForRun(context.Background(), started.ID); err != nil {
		t.Fatalf("wait for managed runtime completion: %v", err)
	}

	messages, ok := loaded.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected prompt and assistant outputs, got %#v", loaded.Outputs["messages"])
	}
	if message, ok := messages[1].(map[string]any); !ok || appTestMessageText(message) != "Managed agent reply" {
		t.Fatalf("unexpected managed agent output %#v", loaded.Outputs["messages"])
	}
}

func TestAppServesStateMachineRunRoutesWithManagedChatExecutor(t *testing.T) {
	// The real IDE app should be able to start a workflow run, dispatch the
	// child managed chat through the Go executor, and mark the parent workflow
	// completed when the child finishes.
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
		select {
		case providerRequests <- providerRequest{
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Body:          body,
		}:
		default:
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Workflow child\"}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":13,\"completion_tokens\":2,\"total_tokens\":15}}\n\n")
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

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
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
		document.Projects["project-alpha"] = appManagedWorkflowTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed workflow project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	startRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStartStateMachineRun,
		strings.NewReader(`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`),
	)
	if err != nil {
		t.Fatalf("new start workflow request: %v", err)
	}
	startRequest.Header.Set("Content-Type", "application/json")
	startRequest.AddCookie(authCookie)

	startResponse, err := http.DefaultClient.Do(startRequest)
	if err != nil {
		t.Fatalf("start workflow run: %v", err)
	}
	defer startResponse.Body.Close()
	if startResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(startResponse.Body)
		t.Fatalf("expected workflow start 200, got %d with body %q", startResponse.StatusCode, string(body))
	}

	var started agentruns.Run
	if err := json.NewDecoder(startResponse.Body).Decode(&started); err != nil {
		t.Fatalf("decode started workflow run: %v", err)
	}
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running workflow run, got %#v", started)
	}
	childRunIDs := appTestStringList(started.Outputs["childRunIds"])
	if len(childRunIDs) != 1 || strings.TrimSpace(childRunIDs[0]) == "" {
		t.Fatalf("expected one child run id, got %#v", started.Outputs["childRunIds"])
	}
	childRun, err := app.agentRuntime.WaitForRun(context.Background(), childRunIDs[0])
	if err != nil {
		t.Fatalf("wait for child run completion: %v", err)
	}
	if childRun.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed child run, got %#v", childRun)
	}
	if got := appTestMessageTextMapList(childRun.Outputs["messages"]); len(got) != 2 || appTestMessageText(got[1]) != "Workflow child reply" {
		t.Fatalf("unexpected child run messages %#v", childRun.Outputs["messages"])
	}

	var parentByID agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		getRunRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetAgentRun,
			strings.NewReader(`{"runId":"`+started.ID+`"}`),
		)
		if err != nil {
			t.Fatalf("new get parent run request: %v", err)
		}
		getRunRequest.Header.Set("Content-Type", "application/json")
		getRunRequest.AddCookie(authCookie)

		getRunResponse, err := http.DefaultClient.Do(getRunRequest)
		if err != nil {
			t.Fatalf("get parent run by id: %v", err)
		}
		defer getRunResponse.Body.Close()
		if getRunResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(getRunResponse.Body)
			t.Fatalf("expected get parent run 200, got %d with body %q", getRunResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(getRunResponse.Body).Decode(&parentByID); err != nil {
			t.Fatalf("decode parent run by id: %v", err)
		}
		return parentByID.Status == agentruns.RunStatusCompleted || parentByID.Status == agentruns.RunStatusFailed
	})
	if parentByID.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed parent run, got %#v", parentByID)
	}

	var latest agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		getRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetStateMachineRun,
			strings.NewReader(`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`),
		)
		if err != nil {
			t.Fatalf("new get workflow run request: %v", err)
		}
		getRequest.Header.Set("Content-Type", "application/json")
		getRequest.AddCookie(authCookie)

		getResponse, err := http.DefaultClient.Do(getRequest)
		if err != nil {
			t.Fatalf("get workflow run: %v", err)
		}
		defer getResponse.Body.Close()
		if getResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(getResponse.Body)
			t.Fatalf("expected workflow get 200, got %d with body %q", getResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(getResponse.Body).Decode(&latest); err != nil {
			t.Fatalf("decode latest workflow run: %v", err)
		}
		return latest.ID == started.ID && latest.Status == agentruns.RunStatusCompleted
	})
	if latest.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed workflow run, got %#v", latest)
	}
	if !appTestHasRunEventType(latest, "run_completed") {
		t.Fatalf("expected workflow run_completed event, got %#v", latest.Events)
	}
	if got := appTestStringList(latest.Outputs["reachedEndSectionIds"]); len(got) != 1 || got[0] != "end-section" {
		t.Fatalf("expected workflow to reach end-section, got %#v", latest.Outputs["reachedEndSectionIds"])
	}

	select {
	case request := <-providerRequests:
		if request.Path != "/v1/chat/completions" {
			t.Fatalf("expected OpenAI chat-completions request, got %q", request.Path)
		}
		if request.Authorization != "Bearer secret" {
			t.Fatalf("expected provider authorization header, got %q", request.Authorization)
		}
		if request.Body["model"] != "gpt-4o-mini" {
			t.Fatalf("expected provider model gpt-4o-mini, got %#v", request.Body["model"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for workflow provider request")
	}
}

func TestAppStopsStateMachineRunWhileManagedChildIsStillStreaming(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("OPENAI_API_KEY", "secret")

	providerStarted := make(chan struct{}, 1)
	providerCancelled := make(chan struct{}, 1)
	releaseProvider := make(chan struct{})
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		select {
		case providerStarted <- struct{}{}:
		default:
		}
		select {
		case <-r.Context().Done():
			select {
			case providerCancelled <- struct{}{}:
			default:
			}
			return
		case <-releaseProvider:
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Workflow child\"}}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":13,\"completion_tokens\":2,\"total_tokens\":15}}\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer provider.Close()
	defer close(releaseProvider)

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

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
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
		document.Projects["project-alpha"] = appManagedWorkflowTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed workflow project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	startRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStartStateMachineRun,
		strings.NewReader(`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`),
	)
	if err != nil {
		t.Fatalf("new start workflow request: %v", err)
	}
	startRequest.Header.Set("Content-Type", "application/json")
	startRequest.AddCookie(authCookie)

	startResponse, err := http.DefaultClient.Do(startRequest)
	if err != nil {
		t.Fatalf("start workflow run: %v", err)
	}
	defer startResponse.Body.Close()
	if startResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(startResponse.Body)
		t.Fatalf("expected workflow start 200, got %d with body %q", startResponse.StatusCode, string(body))
	}

	select {
	case <-providerStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for workflow child provider request")
	}

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteStopStateMachineRun,
		strings.NewReader(`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`),
	)
	if err != nil {
		t.Fatalf("new stop workflow request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopClient := &http.Client{Timeout: 2 * time.Second}
	stopResponse, err := stopClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop workflow run: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected workflow stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	select {
	case <-providerCancelled:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for workflow child provider cancellation")
	}

	var latest agentruns.Run
	waitForAppCondition(t, 5*time.Second, func() bool {
		getRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetStateMachineRun,
			strings.NewReader(`{"projectConfigId":"project-alpha","machineGroupId":"workflow-a"}`),
		)
		if err != nil {
			t.Fatalf("new get workflow run request: %v", err)
		}
		getRequest.Header.Set("Content-Type", "application/json")
		getRequest.AddCookie(authCookie)

		getResponse, err := http.DefaultClient.Do(getRequest)
		if err != nil {
			t.Fatalf("get workflow run: %v", err)
		}
		defer getResponse.Body.Close()
		if getResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(getResponse.Body)
			t.Fatalf("expected workflow get 200, got %d with body %q", getResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(getResponse.Body).Decode(&latest); err != nil {
			t.Fatalf("decode latest workflow run: %v", err)
		}
		return latest.Status == agentruns.RunStatusCancelled
	})
	if latest.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled workflow run, got %#v", latest)
	}
	if !appTestHasRunEventType(latest, "run_cancelled") {
		t.Fatalf("expected workflow run_cancelled event, got %#v", latest.Events)
	}
}

func TestAppServesRunChainRoutesAndPersistedReadback(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
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

	startRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteStartRunChain, strings.NewReader(`{"spec":{"id":"chain-alpha","name":"Chain Alpha","steps":[]}}`))
	if err != nil {
		t.Fatalf("new start run chain request: %v", err)
	}
	startRequest.Header.Set("Content-Type", "application/json")
	startRequest.AddCookie(authCookie)

	startResponse, err := http.DefaultClient.Do(startRequest)
	if err != nil {
		t.Fatalf("post start run chain: %v", err)
	}
	defer startResponse.Body.Close()
	if startResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(startResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", startResponse.StatusCode, string(body))
	}

	var started agentruns.Run
	if err := json.NewDecoder(startResponse.Body).Decode(&started); err != nil {
		t.Fatalf("decode started run chain: %v", err)
	}
	if strings.TrimSpace(started.ID) == "" {
		t.Fatalf("expected run id, got %#v", started)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	completed, err := app.runChains.WaitForRun(waitCtx, started.ID)
	if err != nil {
		t.Fatalf("wait for run chain completion: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run chain, got %#v", completed)
	}

	getRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetAgentRun, strings.NewReader(`{"runId":"`+started.ID+`"}`))
	if err != nil {
		t.Fatalf("new get agent run request: %v", err)
	}
	getRequest.Header.Set("Content-Type", "application/json")
	getRequest.AddCookie(authCookie)

	getResponse, err := http.DefaultClient.Do(getRequest)
	if err != nil {
		t.Fatalf("post get agent run: %v", err)
	}
	defer getResponse.Body.Close()
	if getResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", getResponse.StatusCode, string(body))
	}

	var fetched agentruns.Run
	if err := json.NewDecoder(getResponse.Body).Decode(&fetched); err != nil {
		t.Fatalf("decode fetched run: %v", err)
	}
	if fetched.ID != started.ID || fetched.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed fetched run %q, got %#v", started.ID, fetched)
	}

	listRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RouteGetAgentRuns, nil)
	if err != nil {
		t.Fatalf("new get agent runs request: %v", err)
	}
	listRequest.AddCookie(authCookie)

	listResponse, err := http.DefaultClient.Do(listRequest)
	if err != nil {
		t.Fatalf("get agent runs: %v", err)
	}
	defer listResponse.Body.Close()
	if listResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", listResponse.StatusCode, string(body))
	}

	var runs []agentruns.Run
	if err := json.NewDecoder(listResponse.Body).Decode(&runs); err != nil {
		t.Fatalf("decode runs list: %v", err)
	}
	if len(runs) != 1 || runs[0].ID != started.ID {
		t.Fatalf("expected one run %q in list, got %#v", started.ID, runs)
	}

	stopRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteStopRunChain, strings.NewReader(`{"runId":"`+started.ID+`"}`))
	if err != nil {
		t.Fatalf("new stop run chain request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("post stop run chain: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var stopped agentruns.Run
	if err := json.NewDecoder(stopResponse.Body).Decode(&stopped); err != nil {
		t.Fatalf("decode stopped run chain: %v", err)
	}
	if stopped.ID != started.ID || stopped.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed stopped run %q, got %#v", started.ID, stopped)
	}
}

func TestAppIDEStartupSyncsWatchCodeServiceFromSavedProjectState(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/watch.py"},
				WatchCodeFolders: []projectstate.WatchCodeFolder{
					{Path: "pkg", Recursive: true},
				},
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("seed saved main project state: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.watchCode == nil {
		t.Fatal("expected IDE app to start watch code service")
	}

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}
	watchFile := filepath.Join(watchDir, "watch.py")
	if err := os.WriteFile(watchFile, []byte("def watch(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeCallable(t, app, "project-alpha", "pkg.watch.watch:function", watchFile)
}

func TestAppMainRuntimeSaveSyncsWatchCodeServiceConfigs(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)
	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.watchCode == nil {
		t.Fatal("expected IDE app to start watch code service")
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			WatchCodeEnabled: true,
			WatchCodeFiles:   []string{"pkg/watch.py"},
			WatchCodeFolders: []projectstate.WatchCodeFolder{
				{Path: "pkg/nested", Recursive: false},
			},
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate main runtime: %v", err)
	}

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save main runtime: %v", err)
	}

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "nested")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}
	watchFile := filepath.Join(watchDir, "nested_watch.py")
	if err := os.WriteFile(watchFile, []byte("def nested_watch(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeCallable(t, app, "project-alpha", "pkg.nested.nested_watch.nested_watch:function", watchFile)
}

func TestAppWatchCodeRuntimeAppliesFileCreateAndDeleteCallbacks(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	watchDir := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg")
	if err := os.MkdirAll(watchDir, 0o755); err != nil {
		t.Fatalf("mkdir watch dir: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			WatchCodeEnabled: true,
			WatchCodeFolders: []projectstate.WatchCodeFolder{
				{Path: "pkg", Recursive: false},
			},
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  json.RawMessage(`{"language":"python"}`),
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed watch code project: %v", err)
	}

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code project: %v", err)
	}

	watchFile := filepath.Join(watchDir, "created.py")
	if err := os.WriteFile(watchFile, []byte("def created(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project) bool {
		entry, ok := project.WatchCodeRegistry["pkg.created.created:function"]
		if !ok || entry.SourcePath != watchFile || len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
			return false
		}
		_, _, impl, err := project.ResolveSection(entry.SectionIDs[0])
		if err != nil {
			return false
		}
		if string(impl.Kind) != "callable" {
			return false
		}
		return true
	})

	if err := os.Remove(watchFile); err != nil {
		t.Fatalf("remove watched file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project) bool {
		return len(project.WatchCodeRegistry) == 0 && len(project.WatchCodeBaselineByPath) == 0
	})
}

func TestAppSetCodeRouteAppliesWatchCodeBoundSectionUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppWatchCodeBoundSectionProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main","code":"def sorted(iterable):\n    return iterable\n"}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	entry, ok := project.WatchCodeRegistry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", project.WatchCodeRegistry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected one callable section binding, got %#v", entry)
	}

	callableSectionID := entry.SectionIDs[0]
	_, _, impl, err := project.ResolveSection(callableSectionID)
	if err != nil {
		t.Fatalf("resolve callable section: %v", err)
	}
	if impl.Kind != projectstate.SectionKind("callable") {
		t.Fatalf("expected callable section impl, got %q", impl.Kind)
	}

	codeObjNames := map[string]struct{}{}
	for _, codeObj := range project.CodeObjs {
		codeObjNames[codeObj.Name] = struct{}{}
	}
	if _, ok := codeObjNames["sorted"]; !ok {
		t.Fatalf("expected callable code object after setCode route, got %#v", codeObjNames)
	}
}

func TestAppSetCodeRoutePublishesMissingArgDiagnosticsForRootWatchCodeBoundSection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "python", "setta-basedpyright")

	seedAppRootWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save root watch code bound project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	cookie := newAppTestAuthCookie(t, app)

	recordedStates := []string{
		"def cool_fn",
		"def cool_fn()",
		"def cool_fn(,)",
		"def cool_fn()",
		"def cool_fn(a)",
		"def cool_fn(a,)",
		"def cool_fn(a,b)",
		"def cool_fn(a,b,)",
		"def cool_fn(a,b,c)",
		"def cool_fn(a,b,c):",
		"def cool_fn(a,b,c):\n    print(\"dog\")\n",
	}
	for _, state := range recordedStates {
		request, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteSetCode,
			strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main","code":`+strconv.Quote(state)+`}`),
		)
		if err != nil {
			t.Fatalf("new setCode request for %q: %v", state, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(cookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post setCode for %q: %v", state, err)
		}
		if response.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(response.Body)
			response.Body.Close()
			t.Fatalf("expected setCode 200 for %q, got %d with body %q", state, response.StatusCode, string(body))
		}
		response.Body.Close()
	}

	waitForAppCondition(t, 15*time.Second, func() bool {
		payload := fetchAppLatestLSPDiagnostics(t, server.URL, cookie, "project-alpha")
		if generatedDiagnosticsContain(payload, `Arguments missing for parameters "a", "b", "c"`) {
			return true
		}
		return generatedDiagnosticsContain(payload, "watch_code_test")
	})

	project := app.ProjectStates().Main().Snapshot().Document.Projects["project-alpha"]
	entry, ok := project.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry, got %#v", project.WatchCodeRegistry)
	}

	payload := fetchAppLatestLSPDiagnostics(t, server.URL, cookie, "project-alpha")
	paramMessages := watchCodeEntryParamMessagesByName(t, project, entry, payload)
	for _, paramName := range []string{"a", "b", "c"} {
		if len(paramMessages[paramName]) == 0 {
			t.Fatalf("expected generated missing-arg diagnostics for %q, got payload %#v", paramName, payload)
		}
	}
}

func TestAppSavePublishesMissingArgDiagnosticsForExistingRootWatchCodeCallable(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "python", "setta-basedpyright")

	project := watchCodeRootBoundProject(t, "watch_code_test.py")
	if err := project.SetCode("section-main", "def cool_fn(a,b,c):\n    print(\"dog\")\n"); err != nil {
		t.Fatalf("set root watch code source: %v", err)
	}
	if _, err := project.ApplyWatchCodeBoundSectionUpdate(context.Background(), "section-main", cfg.Paths.WorkspaceRoot, nil); err != nil {
		t.Fatalf("apply root watch code bound update: %v", err)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("seed existing root watch code callable project: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save existing root watch code callable project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	cookie := newAppTestAuthCookie(t, app)

	waitForAppCondition(t, 15*time.Second, func() bool {
		payload := fetchAppLatestLSPDiagnostics(t, server.URL, cookie, "project-alpha")
		if generatedDiagnosticsContain(payload, `Arguments missing for parameters "a", "b", "c"`) {
			return true
		}
		return generatedDiagnosticsContain(payload, "watch_code_test")
	})

	project = app.ProjectStates().Main().Snapshot().Document.Projects["project-alpha"]
	entry, ok := project.WatchCodeRegistry["watch_code_test.cool_fn:function"]
	if !ok {
		t.Fatalf("expected cool_fn watch code entry after save, got %#v", project.WatchCodeRegistry)
	}
	payload := fetchAppLatestLSPDiagnostics(t, server.URL, cookie, "project-alpha")
	paramMessages := watchCodeEntryParamMessagesByName(t, project, entry, payload)
	for _, paramName := range []string{"a", "b", "c"} {
		if len(paramMessages[paramName]) == 0 {
			t.Fatalf("expected generated missing-arg diagnostics for %q after save, got payload %#v", paramName, payload)
		}
	}
}

func TestAppFormatCodeRouteAppliesWatchCodeBoundSectionUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	addRepoVenvRuffToPath(t)
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().SetCode(
		context.Background(),
		"project-alpha",
		"section-main",
		"def sorted( iterable ):\n return iterable\n",
	); err != nil {
		t.Fatalf("seed app set_code before route format_code: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteFormatCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-main"}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post format code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after formatCode route: %v", err)
	}
	entry, ok := project.WatchCodeRegistry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", project.WatchCodeRegistry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected one callable section binding, got %#v", entry)
	}

	payload := mustDecodedProjectPayloadValue(t, project.SectionImpls["impl-main"].Payload)
	if got := payload["code"]; got != "def sorted(iterable):\n    return iterable\n" {
		t.Fatalf("expected formatted code payload, got %#v", got)
	}
}

func TestAppBoundCodeFileRuntimeAppliesWatchCodeReloads(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save watch code bound project: %v", err)
	}
	time.Sleep(400 * time.Millisecond)

	boundPath := filepath.Join(cfg.Paths.WorkspaceRoot, "pkg", "bound.py")
	if err := os.MkdirAll(filepath.Dir(boundPath), 0o755); err != nil {
		t.Fatalf("mkdir bound file parent: %v", err)
	}
	updatedSource := "def existing(value):\n    return value\n\n\ndef external_added(value):\n    return value\n"
	if err := os.WriteFile(boundPath, []byte(updatedSource), 0o644); err != nil {
		t.Fatalf("write bound file: %v", err)
	}

	waitForAppWatchCodeProject(t, app, "project-alpha", func(project projectstate.Project) bool {
		entry, ok := project.WatchCodeRegistry["pkg.bound.external_added:function"]
		if !ok || len(entry.SectionIDs) != 1 {
			return false
		}
		boundSection, ok, err := project.ResolveWatchCodeBoundSection("section-main", cfg.Paths.WorkspaceRoot)
		if err != nil || !ok {
			return false
		}
		return boundSection.Code == updatedSource
	})
}

func TestAppLauncherDoesNotStartWatchCodeService(t *testing.T) {
	t.Parallel()

	app, err := New(testConfig(t), observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if app.watchCode != nil {
		t.Fatal("did not expect launcher mode to start watch code service")
	}
}

func TestAppServesDeleteTerminalsRoute(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-a", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["section-a"]}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post delete terminals: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if _, ok := app.Terminals().Session(terminals.BuildTerminalID("section-a", "")); ok {
		t.Fatal("expected terminal session to be deleted")
	}
}

func TestAppServesInterruptTerminalProcessesRoute(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	sessionID := terminals.BuildTerminalID("section-a", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    interactiveAppTestBashCommand(t),
	}); err != nil {
		t.Fatalf("open terminal: %v", err)
	}

	attachment := attachAppTestTerminal(t, app.Terminals(), sessionID)
	prepareAppInterruptShell(t, app.Terminals(), sessionID, attachment)
	scriptPath := writeAppInterruptibleScript(t)
	startAppInterruptibleForegroundJob(t, app.Terminals(), sessionID, attachment, scriptPath)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":"project-a"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post interrupt terminal processes: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload httpapi.InterruptTerminalProcessesResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode interrupt response: %v", err)
	}
	if payload.InterruptedSessionCount != 1 {
		t.Fatalf("expected one interrupted session, got %#v", payload)
	}

	output := waitForAppTestOutputContains(t, app.Terminals(), sessionID, attachment, "CHILD_EXIT:130")
	if !strings.Contains(output, "CHILD_INTERRUPTED") {
		t.Fatalf("expected terminal to report interrupt, got %q", output)
	}
}

func TestAppServesRunCodeRoute(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	authCookie := &http.Cookie{
		Name:  cookieName,
		Value: token,
	}
	linkAppBackendCodegenFixture(t, server.URL, authCookie)

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if impl.Code == nil || impl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected run route to ensure an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(impl.Code.AttachedTerminalSectionID, "")
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_RUN_OK")
	if !strings.Contains(output, "APP_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppRunCodeSaveDoesNotMaterializePluginCodegenOutputs(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	codeRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "code")
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.sh"), []byte("echo APP_PLUGIN_RUN_OK\n"), 0o644); err != nil {
		t.Fatalf("write run.sh: %v", err)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			EntryCodeBlockID: "code-section",
			TopLevelSectionIDs: []string{
				"code-section",
			},
			SectionVariantMap: map[string]string{
				"code-section": "code-bash-variant",
			},
			Sections: map[string]projectstate.Section{
				"code-section": {
					ID:               "code-section",
					Name:             "Runner",
					VariantIDs:       []string{"code-bash-variant"},
					DefaultVariantID: "code-bash-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"code-bash-variant": {
					ID:     "code-bash-variant",
					ImplID: "code-bash-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"code-bash-impl": {
					ID:   "code-bash-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguageBash,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/run.sh",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
			},
		}
		project.CodegenTargets = []projectstate.ProjectCodegenTarget{
			{
				Language: "setta-fixture-backend-codegen:typescript",
				Payload: mustAppJSON(t, map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
					"options": map[string]any{
						"className": "AppPluginState",
					},
				}),
			},
		}
		document.Projects["project-alpha"] = project
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}

	outputRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "plugin_codegen")
	if _, err := os.Stat(outputRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected no plugin codegen output before run save, got %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	matches, err := filepath.Glob(filepath.Join(outputRoot, "*", "fixture_state.ts"))
	if err != nil {
		t.Fatalf("glob plugin codegen output: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("expected no plugin codegen output after run save, got %v", matches)
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if impl.Code == nil || impl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected run route to ensure an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(impl.Code.AttachedTerminalSectionID, "")
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_PLUGIN_RUN_OK")
	if !strings.Contains(output, "APP_PLUGIN_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppMainRuntimeSaveMaterializesPluginCodegenOutputsToCanonicalPath(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
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
	linkAppBackendCodegenFixture(t, server.URL, newAppTestAuthCookie(t, app))

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: "setta-fixture-backend-codegen:typescript",
					Payload: mustAppJSON(t, map[string]any{
						"language": "setta-fixture-backend-codegen:typescript",
						"options": map[string]any{
							"className":  "DirectSaveState",
							"outputPath": "./nested//setta_gen.ts",
						},
					}),
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}

	matches, err := filepath.Glob(filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "plugin_codegen", "*", "nested", "setta_gen.ts"))
	if err != nil {
		t.Fatalf("glob plugin codegen output: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("expected one plugin codegen output after main save, got %v", matches)
	}
	content, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatalf("read plugin codegen output: %v", err)
	}
	if !strings.Contains(string(content), "export class DirectSaveState") {
		t.Fatalf("expected materialized plugin codegen output, got %q", string(content))
	}
}

func TestAppMainRuntimeSaveRejectsAbsolutePluginCodegenOutputPath(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
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
	linkAppBackendCodegenFixture(t, server.URL, newAppTestAuthCookie(t, app))

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: "setta-fixture-backend-codegen:typescript",
					Payload: mustAppJSON(t, map[string]any{
						"language": "setta-fixture-backend-codegen:typescript",
						"options": map[string]any{
							"className":  "DirectSaveState",
							"outputPath": "C:/outside.ts",
						},
					}),
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}

	_, err = app.ProjectStates().Main().Save(context.Background())
	if err == nil {
		t.Fatal("expected plugin codegen absolute-path rejection")
	}
	if !strings.Contains(err.Error(), "cannot be absolute") {
		t.Fatalf("expected absolute-path rejection, got %v", err)
	}

	matches, err := filepath.Glob(filepath.Join(cfg.Paths.SettaFilesRoot, "code", "sections", "alpha", "plugin_codegen", "*", "*"))
	if err != nil {
		t.Fatalf("glob plugin codegen output: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("expected no plugin codegen output after failed save, got %v", matches)
	}
}

func TestAppMainRuntimeSaveMaterializesPythonCodegenOutputs(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppPythonCodegenProject(t, app)

	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}

	projectRoot := projectstate.ProjectCodeSectionsRoot(cfg.Paths.SettaFilesRoot, "Alpha")
	codePath := filepath.Join(projectRoot, projectstate.GeneratedPythonCodeFileName)
	metaPath := filepath.Join(projectRoot, projectstate.GeneratedPythonMetadataFileName)

	code, err := os.ReadFile(codePath)
	if err != nil {
		t.Fatalf("read generated python code: %v", err)
	}
	if !strings.Contains(string(code), "from . import setta_gen_meta") {
		t.Fatalf("expected metadata import in generated code:\n%s", string(code))
	}
	if !strings.Contains(string(code), "state.Greeting = 'hello world'") {
		t.Fatalf("expected generated section assignment:\n%s", string(code))
	}

	meta, err := os.ReadFile(metaPath)
	if err != nil {
		t.Fatalf("read generated python metadata: %v", err)
	}
	if !strings.Contains(string(meta), "class SettaGenMetadata:") {
		t.Fatalf("expected generated python metadata:\n%s", string(meta))
	}
}

func TestAppRejectsPluginSetProjectConfigCodegenTargetsRoute(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetProjectConfigCodegenTargets, strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"RouteState"}}]}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post codegen targets: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 400, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode project error response: %v", err)
	}
	if payload.Error.Code != "invalid_project_codegen_targets" {
		t.Fatalf("expected invalid_project_codegen_targets, got %#v", payload)
	}
	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after rejection: %v", err)
	}
	if len(project.CodegenTargets) != 0 {
		t.Fatalf("expected no persisted codegen targets after rejection, got %#v", project.CodegenTargets)
	}
}

func TestAppLinkedPluginCodegenTargetsBecomeAvailableAfterLink(t *testing.T) {
	// Linking a backend plugin after startup should make its registered codegen targets available without a separate app restart.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	localPluginRoot := filepath.Join(t.TempDir(), "backend")
	copyAppTestDir(t, sourceRoot, localPluginRoot)
	manifestPath := filepath.Join(localPluginRoot, "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read linked plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode linked plugin manifest: %v", err)
	}
	manifest["capabilities"] = []string{"registerCodegenTarget"}
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode linked plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write linked plugin manifest: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	postJSON := func(path string, body any, responseBody any) {
		t.Helper()

		requestBody := mustAppJSON(t, body)
		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+path, bytes.NewReader(requestBody))
		if err != nil {
			t.Fatalf("new request %s: %v", path, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", path, err)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			payload, _ := io.ReadAll(response.Body)
			t.Fatalf("expected %s 200, got %d with body %q", path, response.StatusCode, string(payload))
		}
		if responseBody == nil {
			return
		}
		if err := json.NewDecoder(response.Body).Decode(responseBody); err != nil {
			t.Fatalf("decode %s response: %v", path, err)
		}
	}
	getRuntime := func() struct {
		Status struct {
			Plugins []struct {
				PluginID                 string                                  `json:"pluginId"`
				RegisteredCodegenTargets []plugins.PluginRegisteredCodegenTarget `json:"registeredCodegenTargets"`
			} `json:"plugins"`
		} `json:"status"`
	} {
		t.Helper()

		request, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
		if err != nil {
			t.Fatalf("new plugin runtime request: %v", err)
		}
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("get plugin runtime: %v", err)
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(response.Body)
			t.Fatalf("expected plugin runtime 200, got %d with body %q", response.StatusCode, string(body))
		}

		var payload struct {
			Status struct {
				Plugins []struct {
					PluginID                 string                                  `json:"pluginId"`
					RegisteredCodegenTargets []plugins.PluginRegisteredCodegenTarget `json:"registeredCodegenTargets"`
				} `json:"plugins"`
			} `json:"status"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			t.Fatalf("decode plugin runtime payload: %v", err)
		}
		return payload
	}

	postJSON(httpapi.RoutePluginsLink, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	}, nil)

	runtimePayload := getRuntime()
	if len(runtimePayload.Status.Plugins) != 1 {
		t.Fatalf("expected one linked plugin in runtime payload, got %#v", runtimePayload.Status.Plugins)
	}
	if runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-backend" {
		t.Fatalf("unexpected linked plugin runtime payload %#v", runtimePayload.Status.Plugins[0])
	}
	if len(runtimePayload.Status.Plugins[0].RegisteredCodegenTargets) != 1 {
		t.Fatalf("expected linked plugin codegen registration in runtime payload, got %#v", runtimePayload.Status.Plugins[0].RegisteredCodegenTargets)
	}

	requestBody := mustAppJSON(t, map[string]any{
		"projectConfigId": "project-alpha",
		"codegenTargets": []map[string]any{
			{
				"language": "setta-fixture-backend-codegen:typescript",
				"options": map[string]any{
					"className": "LinkedState",
				},
			},
		},
	})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteSetProjectConfigCodegenTargets, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new setProjectConfigCodegenTargets request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post setProjectConfigCodegenTargets: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected setProjectConfigCodegenTargets 200, got %d with body %q", response.StatusCode, string(payload))
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after linked plugin codegen update: %v", err)
	}
	if len(project.CodegenTargets) != 1 || project.CodegenTargets[0].Language != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("expected persisted linked plugin codegen target, got %#v", project.CodegenTargets)
	}
}

func TestAppStartsWithoutPythonLanguageServerPluginOrSelection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	selection, ok, err := settingsstate.LanguageServerSelectionForLanguage(
		app.SettingsState().Snapshot().Document,
		"python",
	)
	if err != nil {
		t.Fatalf("python language-server selection: %v", err)
	}
	if ok || selection != nil {
		t.Fatalf("expected missing Python selection by default, got ok=%v selection=%#v", ok, selection)
	}

	seedAppLSPCodeSectionProjectWithSource(t, app, "math.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		Status struct {
			Plugins []plugins.PluginStatusEntry `json:"plugins"`
		} `json:"status"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 0 {
		t.Fatalf("expected no installed plugins at startup, got %#v", runtimePayload.Status.Plugins)
	}

	completions := requestAppCodeAreaCompletion(
		t,
		server.URL,
		authCookie,
		"project-alpha",
		"runner",
		"math.",
		len("math."),
	)
	if len(completions) != 0 {
		t.Fatalf("expected no Python completions without a selected plugin, got %#v", completions)
	}

	diagnostics := fetchAppLatestLSPDiagnostics(t, server.URL, authCookie, "project-alpha")
	if diagnostics.ProjectID != "project-alpha" {
		t.Fatalf("expected diagnostics payload for project-alpha, got %#v", diagnostics.ProjectID)
	}
	if len(diagnostics.CodeSections) != 0 {
		t.Fatalf("expected empty code-section diagnostics without a selected plugin, got %#v", diagnostics.CodeSections)
	}
	if len(diagnostics.UnmappedGenCode) != 0 {
		t.Fatalf("expected no unmapped generated diagnostics without a selected plugin, got %#v", diagnostics.UnmappedGenCode)
	}
	if len(diagnostics.GenCode.Errors) != 0 {
		t.Fatalf("expected no generated-code diagnostics without a selected plugin, got %#v", diagnostics.GenCode.Errors)
	}

	restartRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRestartLanguageServer, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new restart language server request: %v", err)
	}
	restartRequest.Header.Set("Content-Type", "application/json")
	restartRequest.AddCookie(authCookie)

	restartResponse, err := http.DefaultClient.Do(restartRequest)
	if err != nil {
		t.Fatalf("post restart language server: %v", err)
	}
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart conflict when no plugin is selected, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	var restartPayload struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(restartResponse.Body).Decode(&restartPayload); err != nil {
		t.Fatalf("decode restart response: %v", err)
	}
	if restartPayload.Error.Code != "language_server_not_configured" {
		t.Fatalf("expected language_server_not_configured restart error, got %#v", restartPayload.Error)
	}
	if restartPayload.Error.Message != "Language server is not configured. Select a plugin and restart after it is available." {
		t.Fatalf("unexpected restart error message %#v", restartPayload.Error)
	}
}

func TestAppStartsWithPluginLanguageServerCompletion(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)

	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	completions := requestAppCodeAreaCompletion(
		t,
		server.URL,
		newAppTestAuthCookie(t, app),
		"project-alpha",
		"runner",
		"fixture.",
		8,
	)
	if len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected startup plugin completions %#v", completions)
	}
}

func TestAppLinkedPluginLanguageServerBecomesAvailableAfterLink(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	localPluginRoot := filepath.Join(t.TempDir(), "backend")
	copyAppTestDir(t, sourceRoot, localPluginRoot)
	rewriteAppPluginManifest(t, localPluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8)
	if len(completions) != 0 {
		t.Fatalf("expected no plugin completions before link, got %#v", completions)
	}

	requestBody := mustAppJSON(t, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RoutePluginsLink, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins link request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins link: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins link 200, got %d with body %q", response.StatusCode, string(payload))
	}

	completions = requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8)
	if len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected linked plugin completions %#v", completions)
	}
}

func TestAppStartsWithFirstPartyBasedpyrightPluginCompletion(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "python", "setta-basedpyright")

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "str.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	completions := requestAppCodeAreaCompletion(
		t,
		server.URL,
		newAppTestAuthCookie(t, app),
		"project-alpha",
		"runner",
		"str.",
		4,
	)
	if len(completions) == 0 {
		t.Fatal("expected basedpyright completions from first-party plugin")
	}
}

func TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightOnFirstOpen(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installDefaultsProfilePackageManagerPlugin(t, sitePackages)

	existingPythonPath := strings.TrimSpace(os.Getenv("PYTHONPATH"))
	if existingPythonPath == "" {
		t.Setenv("PYTHONPATH", sitePackages)
	} else {
		t.Setenv("PYTHONPATH", sitePackages+string(os.PathListSeparator)+existingPythonPath)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	selection, ok, err := settingsstate.LanguageServerSelectionForLanguage(app.SettingsState().Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage returned error: %v", err)
	}
	if !ok || selection == nil || *selection != "setta-basedpyright" {
		t.Fatalf("expected bootstrapped defaults selection, got ok=%v selection=%#v", ok, selection)
	}
	if app.pluginRuntime == nil || !app.pluginRuntime.HasConfiguredLanguageServers() {
		t.Fatal("expected defaults profile plugin runtime to configure Python language servers")
	}

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "str.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	completions := requestAppCodeAreaCompletion(
		t,
		server.URL,
		newAppTestAuthCookie(t, app),
		"project-alpha",
		"runner",
		"str.",
		4,
	)
	if len(completions) == 0 {
		t.Fatal("expected basedpyright completions from defaults profile package-manager plugin")
	}
}

func TestAppServesSetProjectConfigCodegenTargetsRouteForPython(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                 "project-alpha",
			Name:               "Alpha",
			TopLevelSectionIDs: []string{"section-1"},
			SectionVariantMap: map[string]string{
				"section-1": "section-variant-1",
			},
			Sections: map[string]projectstate.Section{
				"section-1": {
					ID:               "section-1",
					Name:             "Greeting",
					VariantIDs:       []string{"section-variant-1"},
					DefaultVariantID: "section-variant-1",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"section-variant-1": {
					ID:     "section-variant-1",
					ImplID: "section-impl-1",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"section-impl-1": {
					ID:   "section-impl-1",
					Kind: projectstate.SectionKind("text_block"),
					Payload: mustAppJSON(t, map[string]any{
						"id":   "section-impl-1",
						"type": "TextBlock",
						"text": "hello world",
					}),
				},
			},
			ViewModes: map[string]projectstate.ViewMode{
				"focus": {
					ID: "focus",
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"python","generateMetadata":true}]}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post codegen targets: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload projectview.SingleConfig
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode project state response: %v", err)
	}
	if payload.SingletonSections.GenPythonCode == nil || *payload.SingletonSections.GenPythonCode != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python singleton, got %#v", payload.SingletonSections.GenPythonCode)
	}
	if payload.SingletonSections.GenPythonMetadata == nil || *payload.SingletonSections.GenPythonMetadata != projectstate.GeneratedPythonMetadataSectionID {
		t.Fatalf("expected generated python metadata singleton, got %#v", payload.SingletonSections.GenPythonMetadata)
	}

	codeVariantID := payload.ProjectConfig.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID]
	codeImplID := payload.SectionVariants[codeVariantID].Impl
	if !strings.Contains(string(payload.SectionImpls[codeImplID]), `state.Greeting = 'hello world'`) {
		t.Fatalf("expected generated python body in response payload, got %q", string(payload.SectionImpls[codeImplID]))
	}

	projectRoot := projectstate.ProjectCodeSectionsRoot(cfg.Paths.SettaFilesRoot, "Alpha")
	codePath := filepath.Join(projectRoot, projectstate.GeneratedPythonCodeFileName)
	metaPath := filepath.Join(projectRoot, projectstate.GeneratedPythonMetadataFileName)
	code, err := os.ReadFile(codePath)
	if err != nil {
		t.Fatalf("read generated python code: %v", err)
	}
	if !strings.Contains(string(code), "state.Greeting = 'hello world'") {
		t.Fatalf("expected generated python code file:\n%s", string(code))
	}
	if _, err := os.Stat(metaPath); err != nil {
		t.Fatalf("expected generated python metadata file, got %v", err)
	}
}

func TestAppServesRunCodeRouteWithDrawSnapshots(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	authCookie := &http.Cookie{
		Name:  cookieName,
		Value: token,
	}

	uploadBody, uploadContentType := buildAppBinaryUploadBody(t, []byte("snapshot-bytes"), "false")
	uploadRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteBinaryUpload, uploadBody)
	if err != nil {
		t.Fatalf("new binary upload request: %v", err)
	}
	uploadRequest.Header.Set("Content-Type", uploadContentType)
	uploadRequest.AddCookie(authCookie)

	uploadResponse, err := http.DefaultClient.Do(uploadRequest)
	if err != nil {
		t.Fatalf("post binary upload: %v", err)
	}
	defer uploadResponse.Body.Close()
	if uploadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uploadResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", uploadResponse.StatusCode, string(body))
	}

	var ref binarypayload.ContentRef
	if err := json.NewDecoder(uploadResponse.Body).Decode(&ref); err != nil {
		t.Fatalf("decode binary upload response: %v", err)
	}

	runRequestBody, err := json.Marshal(httpapi.RunCodeRequest{
		ProjectID:       "project-alpha",
		SectionID:       "code-section",
		RunSnapshotMode: "never",
		DrawSnapshotsBySectionID: map[string]binarypayload.ContentRef{
			"draw-section": ref,
		},
	})
	if err != nil {
		t.Fatalf("marshal run code request: %v", err)
	}

	runRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, bytes.NewReader(runRequestBody))
	if err != nil {
		t.Fatalf("new run code request: %v", err)
	}
	runRequest.Header.Set("Content-Type", "application/json")
	runRequest.AddCookie(authCookie)

	runResponse, err := http.DefaultClient.Do(runRequest)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer runResponse.Body.Close()
	if runResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", runResponse.StatusCode, string(body))
	}

	drawSnapshotPath, err := projectstate.BuildDrawSnapshotPath("draw-section", filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts"))
	if err != nil {
		t.Fatalf("build draw snapshot path: %v", err)
	}
	written, err := os.ReadFile(drawSnapshotPath)
	if err != nil {
		t.Fatalf("read draw snapshot path: %v", err)
	}
	if string(written) != "snapshot-bytes" {
		t.Fatalf("expected draw snapshot bytes, got %q", string(written))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, drawImpl, err := project.ResolveSection("draw-section")
	if err != nil {
		t.Fatalf("resolve draw section: %v", err)
	}
	if drawImpl.Draw == nil {
		t.Fatal("expected draw impl")
	}
	if drawImpl.Draw.RenderedImagePath != drawSnapshotPath {
		t.Fatalf("expected rendered image path %q, got %q", drawSnapshotPath, drawImpl.Draw.RenderedImagePath)
	}

	if _, err := app.binaryStore.ReadBytes(ref.ContentID); !errors.Is(err, binarypayload.ErrPayloadNotFound) {
		t.Fatalf("expected binary payload to be deleted, got %v", err)
	}

	_, _, codeImpl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if codeImpl.Code == nil || codeImpl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected run route to ensure an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(codeImpl.Code.AttachedTerminalSectionID, "")
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_RUN_OK")
	if !strings.Contains(output, "APP_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppServesRunCodeRouteWithSectionVariantOverrides(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never","sectionVariantOverrides":{"code-section":"code-bash-variant"}}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if got := project.SectionVariantMap["code-section"]; got != "code-python-variant" {
		t.Fatalf("expected active section variant to stay code-python-variant, got %q", got)
	}

	_, _, pythonImpl, err := project.ResolveSectionWithVariant("code-section", "code-python-variant")
	if err != nil {
		t.Fatalf("resolve python variant: %v", err)
	}
	if pythonImpl.Code == nil {
		t.Fatal("expected python code impl")
	}
	if pythonImpl.Code.AttachedTerminalSectionID != "" {
		t.Fatalf("did not expect python variant to gain an attached terminal, got %q", pythonImpl.Code.AttachedTerminalSectionID)
	}

	_, _, bashImpl, err := project.ResolveSectionWithVariant("code-section", "code-bash-variant")
	if err != nil {
		t.Fatalf("resolve bash variant: %v", err)
	}
	if bashImpl.Code == nil || bashImpl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected bash override variant to gain an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(bashImpl.Code.AttachedTerminalSectionID, "")
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_BASH_OK")
	if !strings.Contains(output, "APP_BASH_OK") {
		t.Fatalf("expected bash override output in attached terminal, got %q", output)
	}
}

func TestAppRunCodeRouteRejectsUnsupportedCLIID(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","cliId":"cli-1"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 400, got %d with body %q", response.StatusCode, string(body))
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	if !strings.Contains(string(body), `"code":"unsupported_run_code_cli"`) {
		t.Fatalf("expected unsupported_run_code_cli error, got %q", string(body))
	}
}

func waitForAppCondition(t *testing.T, timeout time.Duration, check func() bool) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for condition")
}

func appTestMessageText(message map[string]any) string {
	content, ok := message["content"].([]any)
	if !ok {
		return ""
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		blockType, _ := block["type"].(string)
		if strings.TrimSpace(blockType) != "text" {
			continue
		}
		text, _ := block["text"].(string)
		if text != "" {
			return text
		}
	}
	return ""
}

func appTestStringList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if !ok || strings.TrimSpace(text) == "" {
			continue
		}
		result = append(result, text)
	}
	return result
}

func appTestMessageTextMapList(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		message, ok := item.(map[string]any)
		if !ok {
			continue
		}
		result = append(result, message)
	}
	return result
}

func appTestHasRunEventType(run agentruns.Run, eventType string) bool {
	for _, event := range run.Events {
		if strings.TrimSpace(event.Type) == eventType {
			return true
		}
	}
	return false
}

func appManagedWorkflowTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	inlinePrompt := "Review the draft."
	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"start-section",
			"chat-section",
			"end-section",
		},
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-section":  "chat-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-section":  {ID: "chat-section", Name: "Review Chat", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
			"end-section":   {ID: "end-section", Name: "End Section", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant": {ID: "start-variant", ImplID: "start-impl"},
			"chat-variant":  {ID: "chat-variant", ImplID: "chat-impl"},
			"end-variant":   {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {
				ID:      "start-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{"id": "start-impl", "type": "StateMachineStart", "machineGroupId": "workflow-a", "label": "Kickoff"}),
			},
			"chat-impl": {
				ID:   "chat-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{
					"id":             "chat-impl",
					"type":           "Chat",
					"engineConfigId": "engine-managed",
					"agentProfileId": nil,
					"permissionMode": "minimal",
					"searchEnabled":  false,
					"chatId":         nil,
				}),
			},
			"end-impl": {
				ID:      "end-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{"id": "end-impl", "type": "StateMachineEnd", "machineGroupId": "workflow-a", "label": "Done"}),
			},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat",
				MachineGroupID:  "workflow-a",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   &inlinePrompt,
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-end",
				MachineGroupID:  "workflow-a",
				SourceSectionID: "chat-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize workflow app test project: %v", err)
	}
	return project
}

func setAppCompletionGuardEnabled(t *testing.T, app *App, enabled bool) {
	t.Helper()

	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		document["backend"].(map[string]any)["completionGuardEnabled"] = enabled
		return document, nil
	}); err != nil {
		t.Fatalf("set completion guard enabled=%t: %v", enabled, err)
	}
}

func mustMarshalAppWorkflowObject(t *testing.T, payload map[string]any) projectstate.RawJSON {
	t.Helper()

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal workflow app test payload: %v", err)
	}
	return projectstate.RawJSON(raw)
}

func testConfig(t *testing.T) config.Config {
	t.Helper()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")

	return config.Config{
		Server: config.Server{
			Mode:     config.ModeLauncher,
			Host:     "127.0.0.1",
			Port:     61234,
			LogLevel: 0,
		},
		Paths: config.Paths{
			WorkspaceRoot:         workspaceRoot,
			SettaHome:             settaHome,
			ProfileLookupHome:     settaHome,
			SettaFilesRoot:        settaFilesRoot,
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           filepath.Join(settaFilesRoot, "runtime"),
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: filepath.Join(settaHome, "setta_files"),
			AutoMode:             config.AutoModeCreateLocal,
		},
	}
}

func newAppTestAuthCookie(t *testing.T, app *App) *http.Cookie {
	t.Helper()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	return &http.Cookie{
		Name:  cookieName,
		Value: token,
	}
}

func fetchAppLatestLSPDiagnostics(
	t *testing.T,
	serverURL string,
	cookie *http.Cookie,
	projectID string,
) projectstate.LSPDiagnosticsPayload {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":`+strconv.Quote(projectID)+`}`),
	)
	if err != nil {
		t.Fatalf("new diagnostics request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post diagnostics request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected diagnostics 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload projectstate.LSPDiagnosticsPayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diagnostics payload: %v", err)
	}
	return payload
}

func saveAppMainProjectDocument(t *testing.T, cfg config.Config, document projectstate.Document) error {
	t.Helper()

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		return err
	}
	return store.Save(context.Background(), document)
}

func seedAppEmptyProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate empty project: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save empty project: %v", err)
	}
}

func waitForAppWatchCodeProject(t *testing.T, app *App, projectID string, predicate func(projectstate.Project) bool) {
	t.Helper()

	timeout := time.After(15 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		snapshot := app.ProjectStates().Main().Snapshot()
		project, ok := snapshot.Document.Projects[projectID]
		if ok && predicate(project) {
			return
		}

		select {
		case <-timeout:
			t.Fatalf("timed out waiting for watch code project state for %q; latest snapshot %#v", projectID, snapshot.Document.Projects[projectID])
		case <-ticker.C:
		}
	}
}

func waitForAppWatchCodeCallable(t *testing.T, app *App, projectID string, entryKey string, sourcePath string) {
	t.Helper()

	waitForAppWatchCodeProject(t, app, projectID, func(project projectstate.Project) bool {
		entry, ok := project.WatchCodeRegistry[entryKey]
		if !ok || entry.SourcePath != sourcePath || len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
			return false
		}
		_, _, _, err := project.ResolveSection(entry.SectionIDs[0])
		return err == nil
	})
}

func waitForAppProjectMissing(t *testing.T, app *App, projectID string) {
	t.Helper()

	timeout := time.After(15 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		snapshot := app.ProjectStates().Main().Snapshot()
		if _, ok := snapshot.Document.Projects[projectID]; !ok {
			return
		}

		select {
		case <-timeout:
			t.Fatalf("timed out waiting for project %q to be removed; latest snapshot %#v", projectID, snapshot.Document.Projects[projectID])
		case <-ticker.C:
		}
	}
}

func seedAppRunCodeProject(t *testing.T, app *App, cfg config.Config, source string) {
	t.Helper()

	codeRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "code")
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.py"), []byte(source), 0o644); err != nil {
		t.Fatalf("write run.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.sh"), []byte("echo APP_BASH_OK\n"), 0o644); err != nil {
		t.Fatalf("write run.sh: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "helper.py"), []byte("print('helper')\n"), 0o644); err != nil {
		t.Fatalf("write helper.py: %v", err)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			EntryCodeBlockID: "code-section",
			TopLevelSectionIDs: []string{
				"code-section",
				"helper-section",
				"draw-section",
			},
			SectionVariantMap: map[string]string{
				"code-section":   "code-python-variant",
				"helper-section": "helper-variant",
				"draw-section":   "draw-variant",
			},
			Sections: map[string]projectstate.Section{
				"code-section": {
					ID:               "code-section",
					Name:             "Runner",
					VariantIDs:       []string{"code-python-variant", "code-bash-variant"},
					DefaultVariantID: "code-python-variant",
				},
				"helper-section": {
					ID:               "helper-section",
					Name:             "Helper",
					VariantIDs:       []string{"helper-variant"},
					DefaultVariantID: "helper-variant",
				},
				"draw-section": {
					ID:               "draw-section",
					Name:             "Canvas",
					VariantIDs:       []string{"draw-variant"},
					DefaultVariantID: "draw-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"code-python-variant": {
					ID:     "code-python-variant",
					ImplID: "code-python-impl",
				},
				"code-bash-variant": {
					ID:     "code-bash-variant",
					ImplID: "code-bash-impl",
				},
				"helper-variant": {
					ID:     "helper-variant",
					ImplID: "helper-impl",
				},
				"draw-variant": {
					ID:     "draw-variant",
					ImplID: "draw-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"code-python-impl": {
					ID:   "code-python-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/run.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
				"code-bash-impl": {
					ID:   "code-bash-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguageBash,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/run.sh",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
				"helper-impl": {
					ID:   "helper-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/helper.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
				"draw-impl": {
					ID:   "draw-impl",
					Kind: projectstate.SectionKindDraw,
					Draw: &projectstate.DrawSectionImpl{},
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}
}

func seedAppLSPCodeSectionProject(t *testing.T, app *App) {
	t.Helper()

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "print('runner')\n")
}

func seedAppLSPCodeSectionProjectWithSource(t *testing.T, app *App, source string) {
	t.Helper()

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, source)
}

func seedAppLSPCodeSectionProjectWithLanguage(t *testing.T, app *App, language projectstate.CodeLanguage, source string) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			SectionVariantMap: map[string]string{
				"runner": "runner-variant",
			},
			Sections: map[string]projectstate.Section{
				"runner": {
					ID:               "runner",
					Name:             "Runner",
					VariantIDs:       []string{"runner-variant"},
					DefaultVariantID: "runner-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"runner-variant": {
					ID:     "runner-variant",
					ImplID: "runner-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"runner-impl": {
					ID:   "runner-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: language,
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":           "runner-impl",
						"type":         "Code",
						"code":         source,
						"codeLanguage": string(language),
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate lsp code section project: %v", err)
	}
}

func seedAppPythonCodegenProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                    "project-alpha",
			Name:                  "Alpha",
			EntryCodeBlockID:      "section-1",
			ShowParamDisplayNames: true,
			PreviewImgColor:       "#112233",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload: mustAppJSON(t, map[string]any{
						"language":         string(projectstate.CodeLanguagePython),
						"generateMetadata": true,
					}),
				},
			},
			TopLevelSectionIDs: []string{"section-1"},
			SectionVariantMap: map[string]string{
				"section-1": "section-variant-1",
			},
			Sections: map[string]projectstate.Section{
				"section-1": {
					ID:               "section-1",
					Name:             "Greeting",
					VariantIDs:       []string{"section-variant-1"},
					DefaultVariantID: "section-variant-1",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"section-variant-1": {
					ID:     "section-variant-1",
					Name:   "Greeting Variant",
					ImplID: "section-impl-1",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"section-impl-1": {
					ID:   "section-impl-1",
					Kind: projectstate.SectionKind("text_block"),
					Payload: mustAppJSON(t, map[string]any{
						"id":   "section-impl-1",
						"type": "TextBlock",
						"text": "hello world",
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}
}

func seedAppWatchCodeBoundSectionProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			WatchCodeEnabled: true,
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  mustAppJSON(t, map[string]any{"language": string(projectstate.CodeLanguagePython)}),
				},
			},
			SectionVariantMap: map[string]string{
				"section-main": "variant-main",
			},
			Sections: map[string]projectstate.Section{
				"section-main": {
					ID:               "section-main",
					Name:             "Main",
					VariantIDs:       []string{"variant-main"},
					DefaultVariantID: "variant-main",
					UnsharedKeys:     []string{"code"},
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"variant-main": {
					ID:               "variant-main",
					ImplID:           "impl-main",
					NonPresetImplIDs: []string{"impl-main"},
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"impl-main": {
					ID:   "impl-main",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "pkg/bound.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":   "impl-main",
						"type": "Code",
						"code": "def existing(value):\n    return value\n",
						"codeFileBinding": map[string]any{
							"canonical_path": "pkg/bound.py",
							"access_mode":    "read_write",
						},
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate watch code bound section project: %v", err)
	}
}

func seedAppRootWatchCodeBoundSectionProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			WatchCodeEnabled: true,
			WatchCodeFiles:   []string{"watch_code_test.py"},
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  mustAppJSON(t, map[string]any{"language": string(projectstate.CodeLanguagePython)}),
				},
			},
			SectionVariantMap: map[string]string{
				"section-main": "variant-main",
			},
			Sections: map[string]projectstate.Section{
				"section-main": {
					ID:               "section-main",
					Name:             "Main",
					VariantIDs:       []string{"variant-main"},
					DefaultVariantID: "variant-main",
					UnsharedKeys:     []string{"code"},
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"variant-main": {
					ID:               "variant-main",
					ImplID:           "impl-main",
					NonPresetImplIDs: []string{"impl-main"},
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"impl-main": {
					ID:   "impl-main",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "watch_code_test.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":   "impl-main",
						"type": "Code",
						"code": "",
						"codeFileBinding": map[string]any{
							"canonical_path": "watch_code_test.py",
							"access_mode":    "read_write",
						},
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate root watch code bound section project: %v", err)
	}
}

func prepareAppLSPFixture(t *testing.T) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_LSP_COMMAND", appTestWorkerPython(t, repoRoot))
	t.Setenv(
		"SETTA_LSP_ARGS",
		filepath.Join(
			repoRoot,
			"tests",
			"fixtures",
			"lsp",
			"mini_language_server.py",
		),
	)
}

func prepareAppFirstPartyBasedpyrightPlugin(t *testing.T, cfg config.Config) {
	t.Helper()

	t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))
	installAppRepoPlugin(t, cfg, "setta-basedpyright")
}

func prepareAppPluginLanguageServerFixture(t *testing.T) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_PLUGIN_FIXTURE_PYTHON", appTestWorkerPython(t, repoRoot))
	t.Setenv(
		"SETTA_PLUGIN_FIXTURE_LSP_SCRIPT",
		filepath.Join(
			repoRoot,
			"tests",
			"fixtures",
			"lsp",
			"mini_language_server.py",
		),
	)
}

func prepareAppCurrentSession(t *testing.T, cfg config.Config) {
	t.Helper()

	sessionID := "abc123"
	t.Setenv("SETTA_SESSION_ID", sessionID)

	sessionDir := filepath.Join(cfg.Paths.RuntimeRoot, "sessions", sessionID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	secretPath := filepath.Join(sessionDir, "secret")
	if err := os.WriteFile(secretPath, []byte("test-secret"), 0o600); err != nil {
		t.Fatalf("write session secret: %v", err)
	}

	metadata := auth.SessionMetadata{
		ID:                     sessionID,
		WorkspacePath:          cfg.Paths.WorkspaceRoot,
		WorkspacePathCanonical: cfg.Paths.WorkspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    os.Getpid(),
		StartedAt:              time.Unix(1_700_000_000, 0).UTC(),
		SecretPath:             secretPath,
		RuntimeRoot:            cfg.Paths.RuntimeRoot,
		ServerMode:             string(cfg.Server.Mode),
	}
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal session metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(sessionDir, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("write session metadata: %v", err)
	}
}

func buildAppBinaryUploadBody(t *testing.T, payload []byte, durable string) (*bytes.Buffer, string) {
	t.Helper()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	fileWriter, err := writer.CreateFormFile("file", "snapshot.png")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := fileWriter.Write(payload); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.WriteField("durable", durable); err != nil {
		t.Fatalf("write durable field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	return body, writer.FormDataContentType()
}

func mustAppJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()

	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal app test json: %v", err)
	}
	return payload
}

func quietAppTestCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireAppTestCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func interactiveAppTestBashCommand(t *testing.T) []string {
	t.Helper()

	bash := requireAppTestCommand(t, "bash")
	return []string{bash, "--noprofile", "--norc", "-i"}
}

func attachAppTestTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func prepareAppInterruptShell(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment) {
	t.Helper()

	if err := service.Write(sessionID, []byte("set -m\nstty -echo\nprintf 'READY\\n'\n")); err != nil {
		t.Fatalf("prepare interactive shell: %v", err)
	}
	output := waitForAppTestOutputContains(t, service, sessionID, attachment, "READY")
	if !strings.Contains(output, "READY") {
		t.Fatalf("expected shell readiness output, got %q", output)
	}
}

func writeAppInterruptibleScript(t *testing.T) string {
	t.Helper()

	scriptPath := filepath.Join(t.TempDir(), "interruptible-child.sh")
	script := strings.Join([]string{
		"#!/bin/sh",
		"trap 'printf \"CHILD_INTERRUPTED\\n\"; exit 130' INT",
		"printf 'CHILD_RUNNING\\n'",
		"while :; do sleep 1; done",
		"",
	}, "\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write interruptible script: %v", err)
	}
	return scriptPath
}

func startAppInterruptibleForegroundJob(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, scriptPath string) {
	t.Helper()

	command := "sh " + shellSingleQuoteApp(scriptPath) + "; printf 'CHILD_EXIT:%s\\n' \"$?\"\n"
	if err := service.Write(sessionID, []byte(command)); err != nil {
		t.Fatalf("start foreground job: %v", err)
	}
	output := waitForAppTestOutputContains(t, service, sessionID, attachment, "CHILD_RUNNING")
	if !strings.Contains(output, "CHILD_RUNNING") {
		t.Fatalf("expected child process to start, got %q", output)
	}
}

func waitForAppTestOutputContains(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	readHistory := func() string {
		history, err := service.History(sessionID)
		if err == nil && history != "" {
			return history
		}
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				history := readHistory()
				if strings.Contains(history, needle) {
					return history
				}
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, history)
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			history := readHistory()
			if strings.Contains(history, needle) {
				return history
			}
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, history)
		}
	}
}

func shellSingleQuoteApp(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func requireAppTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func installAppPluginFixture(t *testing.T, cfg config.Config, fixtureName string, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
}

func installAppRepoPlugin(t *testing.T, cfg config.Config, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", pluginID)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
}

func selectAppLanguageServer(t *testing.T, app *App, language string, pluginID string) {
	t.Helper()

	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		languageServerSettings := document["languageServer"].(map[string]any)
		languageServerSettings["selectedByLanguage"] = map[string]any{
			language: pluginID,
		}
		return document, nil
	}); err != nil {
		t.Fatalf("save language server selection: %v", err)
	}
	if _, err := app.pluginRuntime.Refresh(context.Background()); err != nil {
		t.Fatalf("refresh plugin runtime after selection change: %v", err)
	}
}

func rewriteAppPluginManifest(t *testing.T, pluginRoot string, mutate func(map[string]any)) {
	t.Helper()

	manifestPath := filepath.Join(pluginRoot, "setta.plugin.json")
	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest %s: %v", manifestPath, err)
	}

	var manifest map[string]any
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest %s: %v", manifestPath, err)
	}
	mutate(manifest)

	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest %s: %v", manifestPath, err)
	}
	encoded = append(encoded, '\n')
	if err := os.WriteFile(manifestPath, encoded, 0o644); err != nil {
		t.Fatalf("write plugin manifest %s: %v", manifestPath, err)
	}
}

func linkAppBackendCodegenFixture(t *testing.T, serverURL string, authCookie *http.Cookie) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	localPluginRoot := filepath.Join(t.TempDir(), "backend")
	copyAppTestDir(t, sourceRoot, localPluginRoot)
	rewriteAppPluginManifest(t, localPluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	requestBody := mustAppJSON(t, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsLink, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins link request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins link: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins link 200, got %d with body %q", response.StatusCode, string(body))
	}
}

type appCompletionItem struct {
	Label string `json:"label"`
}

func requestAppCodeAreaCompletion(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	projectID string,
	sectionID string,
	fullText string,
	position int,
) []appCompletionItem {
	t.Helper()

	requestBody := mustAppJSON(t, map[string]any{
		"projectConfigId": projectID,
		"sectionId":       sectionID,
		"fullText":        fullText,
		"position":        position,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RouteCodeAreaCompletion, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new code area completion request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post code area completion: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected code area completion 200, got %d with body %q", response.StatusCode, string(payload))
	}

	var payload []appCompletionItem
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode code area completion payload: %v", err)
	}
	return payload
}

func appTestRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve app test file")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func appTestWorkerPython(t *testing.T, repoRoot string) string {
	t.Helper()

	candidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	t.Fatalf("python interpreter not found under %s/.venv", repoRoot)
	return ""
}

func copyAppTestDir(t *testing.T, sourceRoot string, targetRoot string) {
	t.Helper()

	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		t.Fatalf("read fixture directory %s: %v", sourceRoot, err)
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		t.Fatalf("mkdir fixture target %s: %v", targetRoot, err)
	}

	for _, entry := range entries {
		sourcePath := filepath.Join(sourceRoot, entry.Name())
		targetPath := filepath.Join(targetRoot, entry.Name())

		if entry.IsDir() {
			copyAppTestDir(t, sourcePath, targetPath)
			continue
		}

		info, err := entry.Info()
		if err != nil {
			t.Fatalf("stat fixture entry %s: %v", sourcePath, err)
		}
		payload, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatalf("read fixture file %s: %v", sourcePath, err)
		}
		if err := os.WriteFile(targetPath, payload, info.Mode().Perm()); err != nil {
			t.Fatalf("write fixture file %s: %v", targetPath, err)
		}
	}
}

func skipIfAppTerminalPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
