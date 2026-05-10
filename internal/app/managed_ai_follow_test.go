package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/coder/websocket"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/realtime"
	"setta/internal/tools"
	"setta/internal/wsapi"
)

func TestAppStreamsManagedAIFollowToolResultUpdateOverFrontendWebsocket(t *testing.T) {
	// The real IDE app should broadcast managed AI-follow result updates over
	// the existing frontend websocket contract after a Setta MCP tool returns a
	// result with declared target ids.
	fixture := startAppCompletionGuardFixture(t)
	t.Setenv("OPENAI_API_KEY", "secret")

	provider := startAppManagedAIFollowProvider(t)
	saveAppManagedChatToolRouteConfig(t, fixture.cfg, fixture.serverURL, llmconfig.Config{
		ID:           "primary",
		Model:        "gpt-4o-mini",
		Provider:     "openai",
		BaseURL:      provider.URL + "/v1",
		APIKeyEnv:    "OPENAI_API_KEY",
		MCPServerIDs: []string{mcpx.DefaultServerID},
	}, "Managed Engine")
	app := startAppManagedChatToolRouteApp(t, fixture.cfg, fixture.listener)
	authCookie := newAppTestAuthCookie(t, app)
	conn := dialAppFrontendWebsocket(t, fixture.serverURL, authCookie)
	defer conn.CloseNow()

	chatID := sendAppManagedChatProviderMessage(t, fixture.serverURL, authCookie, "Create a section and tell me when it is done.", false, "ai follow")
	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeAIFollowToolResultUpdate, 40)
	assertAppManagedAIFollowUpdate(t, app, envelope, chatID)
	waitForAppManagedChatCompletedRun(t, app, fixture.cfg.Paths.SettaFilesRoot, chatID, "ai follow")
}

func startAppManagedAIFollowProvider(t *testing.T) *httptest.Server {
	t.Helper()

	requestCount := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := captureAppManagedChatProviderRequest(w, r, ""); !ok {
			return
		}
		switch requestCount {
		case 0:
			writeAppManagedChatProviderStream(w,
				"data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"tool-call-1\",\"type\":\"function\",\"function\":{\"name\":\"setta__create_top_level_section\",\"arguments\":\"{\\\"projectConfigId\\\":\\\"project-alpha\\\",\\\"implType\\\":\\\"Dict\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n",
				"data: [DONE]\n\n",
			)
		case 1:
			writeAppManagedChatProviderStream(w,
				"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Section created\"},\"finish_reason\":\"stop\"}]}\n\n",
				"data: [DONE]\n\n",
			)
		default:
			http.Error(w, "unexpected request", http.StatusInternalServerError)
			return
		}
		requestCount++
	}))
	t.Cleanup(provider.Close)
	return provider
}

func dialAppFrontendWebsocket(t *testing.T, serverURL string, authCookie *http.Cookie) *websocket.Conn {
	t.Helper()

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(serverURL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	return conn
}

func assertAppManagedAIFollowUpdate(t *testing.T, app *App, envelope appRouteEnvelope, chatID string) {
	t.Helper()

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
	assertAppManagedAIFollowProjectSection(t, app, sectionIDs[0])
}

func assertAppManagedAIFollowProjectSection(t *testing.T, app *App, sectionID string) {
	t.Helper()

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id: %v", err)
	}
	if _, ok := project.Sections[sectionID]; !ok {
		t.Fatalf("expected canonical follow id in project state, got %q", sectionID)
	}
}
