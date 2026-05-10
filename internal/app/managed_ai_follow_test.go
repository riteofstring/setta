package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/tools"
	"setta/internal/wsapi"
)

func TestAppStreamsManagedAIFollowToolResultUpdateOverFrontendWebsocket(t *testing.T) {
	// The real IDE app should broadcast managed AI-follow result updates over
	// the existing frontend websocket contract after a Setta MCP tool returns a
	// result with declared target ids.
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

	requestCount := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		switch requestCount {
		case 0:
			_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"tool-call-1\",\"type\":\"function\",\"function\":{\"name\":\"setta__create_top_level_section\",\"arguments\":\"{\\\"projectConfigId\\\":\\\"project-alpha\\\",\\\"implType\\\":\\\"Dict\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "data: [DONE]\n\n")
		case 1:
			_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Section created\"},\"finish_reason\":\"stop\"}]}\n\n")
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
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(serverURL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a section and tell me when it is done."}]},
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

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAIFollowToolResultUpdate, 40)
	var content realtime.AIFollowToolResultUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode ai follow tool result update: %v", err)
	}
	if content.ProjectConfigID != "project-alpha" || content.ChatID != chatID {
		t.Fatalf("unexpected result-follow content %#v", content)
	}
	sectionIDs := content.IDsByType[string(tools.IDTypeSection)]
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one section follow id, got %#v", content.IDsByType)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id: %v", err)
	}
	if _, ok := project.Sections[sectionIDs[0]]; !ok {
		t.Fatalf("expected canonical follow id in project state, got %#v", sectionIDs)
	}

	waitForAppCondition(t, 5*time.Second, func() bool {
		runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
		if err != nil {
			t.Fatalf("new run store: %v", err)
		}
		runType := "llm_chat"
		projectID := "project-alpha"
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
				return true
			}
		}
		return false
	})
}
