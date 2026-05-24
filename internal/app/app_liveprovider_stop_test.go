//go:build liveprovider

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

	"github.com/coder/websocket"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/wsapi"
)

func TestAppStopsManagedOpenAIChatAgainstLiveProviderThroughStopRoute(t *testing.T) {
	runAppManagedChatLiveProviderStopTest(t, appManagedLiveProviderTestCase{
		provider:  "openai",
		model:     "gpt-4o-mini",
		apiKeyEnv: "OPENAI_API_KEY",
		host:      "api.openai.com:443",
		otherParams: map[string]any{
			"temperature": 0,
			"max_tokens":  4096,
		},
	})
}

func TestAppStopsManagedAnthropicChatAgainstLiveProviderThroughStopRoute(t *testing.T) {
	runAppManagedChatLiveProviderStopTest(t, appManagedLiveProviderTestCase{
		provider:  "anthropic",
		model:     "claude-sonnet-4-5-20250929",
		apiKeyEnv: "ANTHROPIC_API_KEY",
		host:      "api.anthropic.com:443",
		otherParams: map[string]any{
			"temperature": 0,
			"max_tokens":  4096,
		},
	})
}

func runAppManagedChatLiveProviderStopTest(t *testing.T, testCase appManagedLiveProviderTestCase) {
	t.Helper()

	fixture := newAppManagedLiveProviderStopFixture(t, testCase)
	defer fixture.server.Close()

	conn := dialAppManagedLiveProviderStopFrontend(t, fixture)
	defer conn.CloseNow()

	chatID := sendAppManagedLiveProviderStopChat(t, fixture)
	firstDeltaText := waitForAppManagedStreamingTextDelta(t, conn, chatID)
	if strings.TrimSpace(firstDeltaText) == "" {
		t.Fatal("expected non-empty streamed text delta before stop")
	}

	stopPayload := stopAppManagedLiveProviderChat(t, fixture, chatID)
	hydrated := waitForStoppedAppManagedLiveProviderChat(t, fixture, chatID)
	hydratedAssistantText := appTestMessageText(hydrated.Messages[1])
	if !strings.Contains(hydratedAssistantText, firstDeltaText) {
		t.Fatalf("expected hydrated assistant text %q to include first delta %q", hydratedAssistantText, firstDeltaText)
	}

	stoppedRun := waitForStoppedAppManagedLiveProviderRun(t, fixture.app, *stopPayload.StoppedRunID)
	assertStoppedAppManagedLiveProviderRun(t, stoppedRun, *stopPayload.StoppedMessageID, firstDeltaText)
}

type appManagedLiveProviderStopFixture struct {
	app        *App
	server     *httptest.Server
	authCookie *http.Cookie
}

type appManagedLiveProviderStopPayload struct {
	AlreadyStopped   bool    `json:"alreadyStopped"`
	StoppedRunID     *string `json:"stoppedRunId"`
	StoppedMessageID *string `json:"stoppedMessageId"`
}

type appManagedLiveProviderHydratePayload struct {
	Messages           []map[string]any `json:"messages"`
	WaitingForResponse bool             `json:"waitingForResponse"`
}

func newAppManagedLiveProviderStopFixture(t *testing.T, testCase appManagedLiveProviderTestCase) appManagedLiveProviderStopFixture {
	t.Helper()

	apiKey := requireAppLiveProviderAPIKey(t, testCase.apiKeyEnv, testCase.host)
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv(testCase.apiKeyEnv, apiKey)

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:          "primary",
				Model:       testCase.model,
				Provider:    testCase.provider,
				APIKeyEnv:   testCase.apiKeyEnv,
				OtherParams: testCase.otherParams,
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
			Name:             "Managed Live Provider Stop Engine",
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
	seedAppManagedLiveProviderStopProject(t, app)

	return appManagedLiveProviderStopFixture{
		app:        app,
		server:     httptest.NewServer(app.Handler()),
		authCookie: newAppTestAuthCookie(t, app),
	}
}

func seedAppManagedLiveProviderStopProject(t *testing.T, app *App) {
	t.Helper()

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
}

func dialAppManagedLiveProviderStopFrontend(t *testing.T, fixture appManagedLiveProviderStopFixture) *websocket.Conn {
	t.Helper()

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(fixture.server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{fixture.authCookie.Name + "=" + fixture.authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)
	return conn
}

func sendAppManagedLiveProviderStopChat(t *testing.T, fixture appManagedLiveProviderStopFixture) string {
	t.Helper()

	sendRequest, err := http.NewRequest(
		http.MethodPost,
		fixture.server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-stop","role":"user","content":[{"type":"text","text":"Count from 1 to 600, one number per line, with no extra words or punctuation."}]},
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
		t.Fatalf("new live-provider stop send request: %v", err)
	}
	sendRequest.Header.Set("Content-Type", "application/json")
	sendRequest.AddCookie(fixture.authCookie)

	sendResponse, err := http.DefaultClient.Do(sendRequest)
	if err != nil {
		t.Fatalf("send managed live-provider chat: %v", err)
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
	return chatID
}

func stopAppManagedLiveProviderChat(t *testing.T, fixture appManagedLiveProviderStopFixture, chatID string) appManagedLiveProviderStopPayload {
	t.Helper()

	stopRequest, err := http.NewRequest(
		http.MethodPost,
		fixture.server.URL+"/api"+httpapi.RouteStopLLMChat,
		strings.NewReader(`{"chatId":"`+chatID+`"}`),
	)
	if err != nil {
		t.Fatalf("new live-provider stop request: %v", err)
	}
	stopRequest.Header.Set("Content-Type", "application/json")
	stopRequest.AddCookie(fixture.authCookie)

	stopResponse, err := http.DefaultClient.Do(stopRequest)
	if err != nil {
		t.Fatalf("stop managed live-provider chat: %v", err)
	}
	defer stopResponse.Body.Close()
	if stopResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(stopResponse.Body)
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.StatusCode, string(body))
	}

	var stopPayload appManagedLiveProviderStopPayload
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
	return stopPayload
}

func waitForStoppedAppManagedLiveProviderChat(t *testing.T, fixture appManagedLiveProviderStopFixture, chatID string) appManagedLiveProviderHydratePayload {
	t.Helper()

	var hydrated appManagedLiveProviderHydratePayload
	waitForAppCondition(t, 90*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			fixture.server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(fixture.authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate stopped managed chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		if hydrated.WaitingForResponse || len(hydrated.Messages) != 2 {
			return false
		}
		return strings.TrimSpace(appTestMessageText(hydrated.Messages[1])) != ""
	})
	return hydrated
}

func waitForStoppedAppManagedLiveProviderRun(t *testing.T, app *App, stoppedRunID string) agentruns.Run {
	t.Helper()

	waitCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	stoppedRun, err := app.agentRuntime.WaitForRun(waitCtx, stoppedRunID)
	if err != nil {
		t.Fatalf("wait for stopped managed runtime: %v", err)
	}
	return stoppedRun
}

func assertStoppedAppManagedLiveProviderRun(t *testing.T, stoppedRun agentruns.Run, stoppedMessageID string, firstDeltaText string) {
	t.Helper()

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
	assistantText := appTestMessageText(assistantMessage)
	if strings.TrimSpace(assistantText) == "" {
		t.Fatalf("expected persisted assistant text, got %#v", assistantMessage)
	}
	if !strings.Contains(assistantText, firstDeltaText) {
		t.Fatalf("expected persisted assistant text %q to include first delta %q", assistantText, firstDeltaText)
	}
	if assistantMessageID != stoppedMessageID {
		t.Fatalf("expected stopped message id %q, got %q", stoppedMessageID, assistantMessageID)
	}
}

func waitForAppManagedStreamingTextDelta(t *testing.T, conn *websocket.Conn, chatID string) string {
	t.Helper()

	deadline := time.Now().Add(30 * time.Second)
	seenChunkTypes := []string{}
	for time.Now().Before(deadline) {
		envelope := readAppRouteEnvelope(t, conn)
		if envelope.MessageType != realtime.MessageTypeLLMStreamingResponse {
			continue
		}

		var content struct {
			ChatID string         `json:"chatId"`
			Chunk  map[string]any `json:"chunk"`
		}
		if err := json.Unmarshal(envelope.Content, &content); err != nil {
			t.Fatalf("decode llm streaming content: %v", err)
		}
		if content.ChatID != chatID {
			continue
		}
		chunkType, _ := content.Chunk["type"].(string)
		seenChunkTypes = append(seenChunkTypes, chunkType)
		if chunkType != string(realtime.StreamingEventTypeDelta) {
			continue
		}
		rawContent, ok := content.Chunk["content"].([]any)
		if !ok {
			continue
		}
		for _, rawDelta := range rawContent {
			delta, ok := rawDelta.(map[string]any)
			if !ok {
				continue
			}
			if delta["type"] != realtime.MessageContentTypeTextDelta {
				continue
			}
			text, _ := delta["text"].(string)
			if strings.TrimSpace(text) != "" {
				return text
			}
		}
	}

	t.Fatalf("did not receive managed text delta for chat %q; seen chunk types=%#v", chatID, seenChunkTypes)
	return ""
}
