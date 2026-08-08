package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
)

func TestAppServesManagedChatSendThroughAzureOpenAIExecutor(t *testing.T) {
	// The real IDE app should run managed Azure OpenAI chat sends through the
	// Go-owned OpenAI adapter with Azure endpoint and API-version routing.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("AZURE_OPENAI_API_KEY", "secret")

	providerRequests, provider := startAppManagedChatAzureProvider(t)
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
	app, server, authCookie := startAppManagedChatProviderServer(t, cfg)

	chatID := sendAppManagedChatProviderMessage(t, server.URL, authCookie, "Create a managed Azure project.", false, "Azure")
	waitForAppManagedChatProviderResult(t, app, cfg, server.URL, authCookie, chatID, "Azure reply", "Azure")
	assertAppManagedChatAzureProviderRequest(t, providerRequests)
}

func TestAppServesManagedChatSendThroughAnthropicExecutor(t *testing.T) {
	// The real IDE app should run managed Anthropic chat sends through the
	// Go-owned provider executor and persist the streamed assistant reply.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("ANTHROPIC_API_KEY", "secret")

	providerRequests, provider := startAppManagedChatAnthropicProvider(t)
	saveAppManagedChatProviderEngine(t, cfg, llmconfig.Config{
		ID:        "primary",
		Model:     "claude-sonnet-4-5-20250929",
		Provider:  "anthropic",
		BaseURL:   provider.URL,
		APIKeyEnv: "ANTHROPIC_API_KEY",
	}, "Managed Anthropic Engine")
	app, server, authCookie := startAppManagedChatProviderServer(t, cfg)

	chatID := sendAppManagedChatProviderMessage(t, server.URL, authCookie, "Create a managed anthropic project.", false, "anthropic")
	waitForAppManagedChatProviderResult(t, app, cfg, server.URL, authCookie, chatID, "Go owned anthropic reply", "anthropic")
	assertAppManagedChatAnthropicProviderRequest(t, providerRequests, false)
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

	providerRequests, provider := startAppManagedChatAnthropicThinkingProvider(t)
	saveAppManagedChatProviderEngine(t, cfg, llmconfig.Config{
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
	}, "Managed Anthropic Thinking Engine")
	app, server, authCookie := startAppManagedChatProviderServer(t, cfg)

	chatID := sendAppManagedChatProviderMessage(t, server.URL, authCookie, "Create a managed Anthropic thinking project.", true, "Anthropic thinking")
	hydrated := waitForAppManagedChatProviderResult(t, app, cfg, server.URL, authCookie, chatID, "Anthropic answer", "Anthropic thinking")
	assertAppManagedChatAnthropicThinkingHydration(t, hydrated)
	assertAppManagedChatAnthropicProviderRequest(t, providerRequests, true)
}

func TestAppServesManagedChatSendWithAttachmentsThroughGeminiExecutor(t *testing.T) {
	// Attachment-bearing managed chat sends should flow through the real IDE
	// app, preserve user attachment metadata in hydrated history, and inline
	// attachment prompt text before the Gemini provider boundary.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("GEMINI_API_KEY", "secret")

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- appManagedChatAttachmentProviderRequest{
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

	seedAppManagedChatAttachmentArtifacts(t, cfg)
	saveAppManagedChatAttachmentEngine(t, cfg, llmconfig.Config{
		ID:        "primary",
		Model:     "gemini-2.5-pro",
		Provider:  "gemini",
		BaseURL:   provider.URL,
		APIKeyEnv: "GEMINI_API_KEY",
	}, "Managed Gemini Engine")
	app, server, authCookie := startAppManagedChatAttachmentServer(t, cfg)
	chatID := sendAppManagedChatAttachmentMessage(t, server.URL, authCookie, "gemini")
	waitForAppManagedChatAttachmentResult(t, app, cfg, server.URL, authCookie, chatID, "Go owned gemini attachment reply", "gemini")

	captured := waitForAppManagedChatAttachmentProviderRequest(t, providerRequests, "gemini")
	if captured.Path != "/v1beta/models/gemini-2.5-pro:streamGenerateContent" {
		t.Fatalf("unexpected provider path %q", captured.Path)
	}
	if captured.Query != "alt=sse" {
		t.Fatalf("unexpected provider query %q", captured.Query)
	}
	if captured.APIKey != "secret" {
		t.Fatalf("unexpected provider api key %q", captured.APIKey)
	}
	assertAppManagedChatGeminiAttachmentPayload(t, captured.Body)
}

func assertAppManagedChatGeminiAttachmentPayload(t *testing.T, body map[string]any) {
	t.Helper()

	contents, ok := body["contents"].([]any)
	if !ok || len(contents) != 1 {
		t.Fatalf("unexpected provider contents %#v", body["contents"])
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
	assertAppManagedChatAttachmentPromptText(t, strings.Join(textParts, "\n"))
}

func TestAppServesManagedChatSendThroughGeminiExecutor(t *testing.T) {
	// The real IDE app should run managed Gemini chat sends through the
	// Go-owned provider executor and persist the streamed assistant reply.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("GEMINI_API_KEY", "secret")

	providerRequests, provider := startAppManagedChatGeminiProvider(t)
	saveAppManagedChatProviderEngine(t, cfg, llmconfig.Config{
		ID:        "primary",
		Model:     "gemini-2.5-pro",
		Provider:  "gemini",
		BaseURL:   provider.URL,
		APIKeyEnv: "GEMINI_API_KEY",
	}, "Managed Gemini Engine")
	app, server, authCookie := startAppManagedChatProviderServer(t, cfg)

	chatID := sendAppManagedChatProviderMessage(t, server.URL, authCookie, "Create a managed Gemini project.", false, "Gemini")
	waitForAppManagedChatProviderResult(t, app, cfg, server.URL, authCookie, chatID, "Go owned gemini reply", "Gemini")
	assertAppManagedChatGeminiProviderRequest(t, providerRequests)
}

func saveAppManagedChatProviderEngine(t *testing.T, cfg config.Config, llmConfig llmconfig.Config, engineName string) {
	t.Helper()

	saveAppManagedChatAttachmentEngine(t, cfg, llmConfig, engineName)
}

func startAppManagedChatProviderServer(t *testing.T, cfg config.Config) (*App, *httptest.Server, *http.Cookie) {
	t.Helper()

	return startAppManagedChatAttachmentServer(t, cfg)
}

func startAppManagedChatAzureProvider(t *testing.T) (<-chan appManagedChatAttachmentProviderRequest, *httptest.Server) {
	t.Helper()

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, ok := captureAppManagedChatProviderRequest(w, r, "Api-Key")
		if !ok {
			return
		}
		providerRequests <- captured
		writeAppManagedChatProviderStream(w,
			"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Azure\"}}]}\n\n",
			"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n",
			"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":17,\"completion_tokens\":2,\"total_tokens\":19}}\n\n",
			"data: [DONE]\n\n",
		)
	}))
	t.Cleanup(provider.Close)
	return providerRequests, provider
}

func startAppManagedChatAnthropicProvider(t *testing.T) (<-chan appManagedChatAttachmentProviderRequest, *httptest.Server) {
	t.Helper()

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, ok := captureAppManagedChatProviderRequest(w, r, "X-Api-Key")
		if !ok {
			return
		}
		providerRequests <- captured
		writeAppManagedChatProviderStream(w,
			"event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-app-anthropic\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5-20250929\",\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":19,\"output_tokens\":0,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n",
			"event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
			"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Go owned\"}}\n\n",
			"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" anthropic reply\"}}\n\n",
			"event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
			"event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"input_tokens\":19,\"output_tokens\":3,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0}}}\n\n",
			"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
		)
	}))
	t.Cleanup(provider.Close)
	return providerRequests, provider
}

func startAppManagedChatAnthropicThinkingProvider(t *testing.T) (<-chan appManagedChatAttachmentProviderRequest, *httptest.Server) {
	t.Helper()

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, ok := captureAppManagedChatProviderRequest(w, r, "X-Api-Key")
		if !ok {
			return
		}
		providerRequests <- captured
		writeAppManagedChatProviderStream(w,
			"event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg-thinking\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-sonnet-4-5-20250929\",\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":12,\"output_tokens\":0,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n",
			"event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"Planning\"}}\n\n",
			"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\" deeply\"}}\n\n",
			"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"sig-thinking\"}}\n\n",
			"event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
			"event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
			"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"Anthropic answer\"}}\n\n",
			"event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":1}\n\n",
			"event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"input_tokens\":12,\"output_tokens\":3,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0}}}\n\n",
			"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
		)
	}))
	t.Cleanup(provider.Close)
	return providerRequests, provider
}

func startAppManagedChatGeminiProvider(t *testing.T) (<-chan appManagedChatAttachmentProviderRequest, *httptest.Server) {
	t.Helper()

	providerRequests := make(chan appManagedChatAttachmentProviderRequest, 1)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured, ok := captureAppManagedChatProviderRequest(w, r, "X-Goog-Api-Key")
		if !ok {
			return
		}
		providerRequests <- captured
		writeAppManagedChatProviderStream(w,
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Go owned\"}]}}]}\n\n",
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\" gemini reply\"}]}}],\"usageMetadata\":{\"promptTokenCount\":17,\"candidatesTokenCount\":3,\"totalTokenCount\":20}}\n\n",
		)
	}))
	t.Cleanup(provider.Close)
	return providerRequests, provider
}

func captureAppManagedChatProviderRequest(
	w http.ResponseWriter,
	r *http.Request,
	apiKeyHeader string,
) (appManagedChatAttachmentProviderRequest, bool) {
	body := map[string]any{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return appManagedChatAttachmentProviderRequest{}, false
	}
	return appManagedChatAttachmentProviderRequest{
		Path:          r.URL.Path,
		Query:         r.URL.RawQuery,
		APIKey:        r.Header.Get(apiKeyHeader),
		Authorization: r.Header.Get("Authorization"),
		Body:          body,
	}, true
}

func writeAppManagedChatProviderStream(w http.ResponseWriter, events ...string) {
	w.Header().Set("Content-Type", "text/event-stream")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "missing flusher", http.StatusInternalServerError)
		return
	}
	for _, event := range events {
		_, _ = io.WriteString(w, event)
		flusher.Flush()
	}
}

func sendAppManagedChatProviderMessage(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	prompt string,
	thinking bool,
	contextLabel string,
) string {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(fmt.Sprintf(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":%q}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":%t,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`, prompt, thinking)),
	)
	if err != nil {
		t.Fatalf("new %s send request: %v", contextLabel, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send %s managed chat: %v", contextLabel, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}
	return decodeAppManagedChatID(t, response, contextLabel)
}

func waitForAppManagedChatProviderResult(
	t *testing.T,
	app *App,
	cfg config.Config,
	serverURL string,
	authCookie *http.Cookie,
	chatID string,
	expectedAssistantText string,
	contextLabel string,
) appManagedChatHydratePayload {
	t.Helper()

	hydrated := waitForAppManagedChatHydration(t, serverURL, authCookie, chatID, false, expectedAssistantText, contextLabel)
	waitForAppManagedChatCompletedRun(t, app, cfg.Paths.SettaFilesRoot, chatID, contextLabel)
	return hydrated
}

func waitForAppManagedChatProviderRequest(
	t *testing.T,
	providerRequests <-chan appManagedChatAttachmentProviderRequest,
	contextLabel string,
) appManagedChatAttachmentProviderRequest {
	t.Helper()

	select {
	case captured := <-providerRequests:
		return captured
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s provider request", contextLabel)
	}
	return appManagedChatAttachmentProviderRequest{}
}

func assertAppManagedChatAzureProviderRequest(
	t *testing.T,
	providerRequests <-chan appManagedChatAttachmentProviderRequest,
) {
	t.Helper()

	captured := waitForAppManagedChatProviderRequest(t, providerRequests, "Azure")
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
}

func assertAppManagedChatAnthropicProviderRequest(
	t *testing.T,
	providerRequests <-chan appManagedChatAttachmentProviderRequest,
	expectThinking bool,
) {
	t.Helper()

	captured := waitForAppManagedChatProviderRequest(t, providerRequests, "Anthropic")
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
	if expectThinking {
		assertAppManagedChatAnthropicThinkingRequest(t, captured.Body)
	}
}

func assertAppManagedChatAnthropicThinkingRequest(t *testing.T, body map[string]any) {
	t.Helper()

	thinkingConfig, ok := body["thinking"].(map[string]any)
	if !ok || thinkingConfig["type"] != "enabled" || thinkingConfig["budget_tokens"] != float64(1024) {
		t.Fatalf("unexpected provider thinking config %#v", body["thinking"])
	}
}

func assertAppManagedChatAnthropicThinkingHydration(t *testing.T, hydrated appManagedChatHydratePayload) {
	t.Helper()

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
}

func assertAppManagedChatGeminiProviderRequest(
	t *testing.T,
	providerRequests <-chan appManagedChatAttachmentProviderRequest,
) {
	t.Helper()

	captured := waitForAppManagedChatProviderRequest(t, providerRequests, "Gemini")
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
}
