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
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/wsapi"
)

func TestAppSendsOnlyAllowlistedManagedToolDefinitionsToProvider(t *testing.T) {
	// A narrowly allowlisted managed profile should only expose that one tool
	// to the upstream provider, even when the app resolves tools through the
	// internal MCP client.
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

	safeToolName := mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "getProjectConfigNamesAndIds")
	providerRequests := make(chan map[string]any, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		select {
		case providerRequests <- body:
		default:
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "missing flusher", http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Allowlist OK\"},\"finish_reason\":\"stop\"}]}\n\n")
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
			Name:             "Managed Allowlist Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}

	saveAppAgentProfiles(t, cfg, []agentprofiles.Profile{
		{
			ID:            "profile-allowlist",
			Name:          "Managed Allowlist",
			ToolAllowlist: []string{safeToolName},
		},
	})

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	setAppCompletionGuardEnabled(t, app, false)

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
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Reply directly without calling any tool."}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":"profile-allowlist",
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
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	if appTestMessageText(hydrated.Messages[1]) != "Allowlist OK" {
		t.Fatalf("unexpected hydrated assistant reply %#v", hydrated.Messages[1])
	}

	select {
	case providerRequest := <-providerRequests:
		rawTools, ok := providerRequest["tools"].([]any)
		if !ok {
			t.Fatalf("expected provider tools payload, got %#v", providerRequest["tools"])
		}
		got := appManagedToolNamesFromProviderPayload(rawTools)
		want := []string{safeToolName}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("unexpected provider tool names %#v", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for provider request")
	}
}

func TestAppStreamsManagedAnthropicThinkingToolAndTextDeltasOverFrontendWebsocket(t *testing.T) {
	// The real IDE app should forward parsed Anthropic thinking, tool-call,
	// tool-result, and final text stream chunks over the existing frontend
	// websocket contract in the order the frontend consumes them.
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

	safeToolName := mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "getProjectConfigNamesAndIds")
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
			_, _ = io.WriteString(w, "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-tool-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5-20250929\",\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":18,\"output_tokens\":0,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"Plan\"}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\" carefully\"}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tool-call-1\",\"name\":\""+safeToolName+"\",\"input\":{}}}\n\n")
			flusher.Flush()
			_, _ = io.WriteString(w, "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n")
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
			_, _ = io.WriteString(w, "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Tool-backed final reply\"}}\n\n")
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
			Name:             "Managed Streaming Contract Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}

	saveAppAgentProfiles(t, cfg, []agentprofiles.Profile{
		{
			ID:            "profile-stream-contract",
			Name:          "Managed Streaming Contract",
			ToolAllowlist: []string{safeToolName},
		},
	})

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	setAppCompletionGuardEnabled(t, app, false)

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
	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Think briefly, call the tool, then finish the reply."}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":"profile-stream-contract",
			"thinking":true,
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

	chunks := waitForManagedStreamingSequence(t, conn, chatID, 2)
	gotTypes := managedStreamChunkTypes(t, chunks)
	wantTypes := []string{
		string(realtime.StreamingEventTypeMessageStart),
		string(realtime.StreamingEventTypeDelta),
		string(realtime.StreamingEventTypeDelta),
		string(realtime.StreamingEventTypeToolCallDelta),
		string(realtime.StreamingEventTypeMessageStop),
		string(realtime.StreamingEventTypeMessageFinalized),
		string(realtime.StreamingEventTypeToolResult),
		string(realtime.StreamingEventTypeMessageStart),
		string(realtime.StreamingEventTypeDelta),
		string(realtime.StreamingEventTypeMessageStop),
		string(realtime.StreamingEventTypeMessageFinalized),
	}
	if !reflect.DeepEqual(gotTypes, wantTypes) {
		t.Fatalf("unexpected stream chunk types %#v", gotTypes)
	}

	firstThinkingDelta := managedStreamingChunkContent(t, chunks[1])
	thinkingContent, ok := firstThinkingDelta["content"].([]any)
	if !ok || len(thinkingContent) != 1 {
		t.Fatalf("expected first thinking delta content, got %#v", firstThinkingDelta)
	}
	thinkingBlock, ok := thinkingContent[0].(map[string]any)
	if !ok || thinkingBlock["type"] != realtime.MessageContentTypeThinkingDelta || thinkingBlock["thinking"] != "Plan" {
		t.Fatalf("unexpected first thinking delta %#v", thinkingContent[0])
	}

	secondThinkingDelta := managedStreamingChunkContent(t, chunks[2])
	secondThinkingContent, ok := secondThinkingDelta["content"].([]any)
	if !ok || len(secondThinkingContent) != 1 {
		t.Fatalf("expected second thinking delta content, got %#v", secondThinkingDelta)
	}
	secondThinkingBlock, ok := secondThinkingContent[0].(map[string]any)
	if !ok || secondThinkingBlock["thinking"] != " carefully" {
		t.Fatalf("unexpected second thinking delta %#v", secondThinkingContent[0])
	}

	toolDelta := managedStreamingChunkContent(t, chunks[3])
	if toolDelta["tool_call_id"] != "tool-call-1" || toolDelta["tool_name"] != safeToolName {
		t.Fatalf("unexpected tool delta %#v", toolDelta)
	}

	toolResult := managedStreamingChunkContent(t, chunks[6])
	resultMessage, ok := toolResult["result"].(map[string]any)
	if !ok {
		t.Fatalf("expected tool result message map, got %#v", toolResult["result"])
	}
	if resultMessage["role"] != "tool" || resultMessage["tool_name"] != safeToolName {
		t.Fatalf("unexpected tool result message %#v", resultMessage)
	}

	finalTextDelta := managedStreamingChunkContent(t, chunks[8])
	finalTextContent, ok := finalTextDelta["content"].([]any)
	if !ok || len(finalTextContent) != 1 {
		t.Fatalf("expected final text delta content, got %#v", finalTextDelta)
	}
	finalTextBlock, ok := finalTextContent[0].(map[string]any)
	if !ok || finalTextBlock["type"] != realtime.MessageContentTypeTextDelta || finalTextBlock["text"] != "Tool-backed final reply" {
		t.Fatalf("unexpected final text delta %#v", finalTextContent[0])
	}
}

func appManagedToolNamesFromProviderPayload(rawTools []any) []string {
	names := make([]string, 0, len(rawTools))
	for _, rawTool := range rawTools {
		tool, ok := rawTool.(map[string]any)
		if !ok {
			continue
		}
		function, ok := tool["function"].(map[string]any)
		if !ok {
			continue
		}
		name, ok := function["name"].(string)
		if !ok {
			continue
		}
		names = append(names, name)
	}
	return names
}

func waitForManagedStreamingSequence(t *testing.T, conn *websocket.Conn, chatID string, finalizedMessages int) []appRouteEnvelope {
	t.Helper()

	deadline := time.Now().Add(10 * time.Second)
	envelopes := []appRouteEnvelope{}
	seenChunkTypes := []string{}
	finalizedCount := 0
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
			t.Fatalf("decode llm streaming response: %v", err)
		}
		if content.ChatID != chatID {
			continue
		}
		chunkType, _ := content.Chunk["type"].(string)
		seenChunkTypes = append(seenChunkTypes, chunkType)
		envelopes = append(envelopes, envelope)
		if chunkType == string(realtime.StreamingEventTypeMessageFinalized) {
			finalizedCount++
			if finalizedCount >= finalizedMessages {
				return envelopes
			}
		}
	}

	t.Fatalf("did not receive %d finalized managed streaming messages for chat %q; seen chunk types=%#v", finalizedMessages, chatID, seenChunkTypes)
	return nil
}

func managedStreamChunkTypes(t *testing.T, envelopes []appRouteEnvelope) []string {
	t.Helper()

	types := make([]string, 0, len(envelopes))
	for _, envelope := range envelopes {
		chunk := managedStreamingChunkContent(t, envelope)
		chunkType, _ := chunk["type"].(string)
		types = append(types, chunkType)
	}
	return types
}

func managedStreamingChunkContent(t *testing.T, envelope appRouteEnvelope) map[string]any {
	t.Helper()

	var content struct {
		Chunk map[string]any `json:"chunk"`
	}
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode managed streaming chunk: %v", err)
	}
	return content.Chunk
}
