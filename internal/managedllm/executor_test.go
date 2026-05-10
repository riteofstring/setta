package managedllm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/chatattachments"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/tools"
)

type captureBroadcaster struct {
	mu                   sync.Mutex
	messages             []realtime.LLMStreamingResponseMessage
	resultFollowMessages []realtime.AIFollowToolResultUpdateMessage
}

func (c *captureBroadcaster) BroadcastJSON(_ context.Context, message any, _ realtime.Selection) (int, error) {
	switch typed := message.(type) {
	case realtime.LLMStreamingResponseMessage:
		c.mu.Lock()
		defer c.mu.Unlock()
		c.messages = append(c.messages, typed)
		return 1, nil
	case realtime.AIFollowToolResultUpdateMessage:
		c.mu.Lock()
		defer c.mu.Unlock()
		c.resultFollowMessages = append(c.resultFollowMessages, typed)
		return 1, nil
	default:
		return 0, nil
	}
}

func (c *captureBroadcaster) Count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.messages)
}

func (c *captureBroadcaster) Messages() []realtime.LLMStreamingResponseMessage {
	c.mu.Lock()
	defer c.mu.Unlock()
	cloned := make([]realtime.LLMStreamingResponseMessage, 0, len(c.messages))
	for _, message := range c.messages {
		cloned = append(cloned, message)
	}
	return cloned
}

func (c *captureBroadcaster) ResultFollowMessages() []realtime.AIFollowToolResultUpdateMessage {
	c.mu.Lock()
	defer c.mu.Unlock()
	cloned := make([]realtime.AIFollowToolResultUpdateMessage, 0, len(c.resultFollowMessages))
	for _, message := range c.resultFollowMessages {
		cloned = append(cloned, message)
	}
	return cloned
}

func handledManagedLLMModelLookupTestRequest(t *testing.T, w http.ResponseWriter, r *http.Request) bool {
	t.Helper()

	if strings.HasPrefix(r.URL.Path, "/v1/models/") {
		modelID := strings.TrimPrefix(r.URL.Path, "/v1/models/")
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{
			"id":           modelID,
			"object":       "model",
			"created":      1,
			"owned_by":     "test",
			"created_at":   "2026-01-01T00:00:00Z",
			"display_name": modelID,
			"type":         "model",
		}); err != nil {
			t.Fatalf("encode model metadata: %v", err)
		}
		return true
	}
	if strings.HasPrefix(r.URL.Path, "/v1beta/models/") && !strings.HasSuffix(r.URL.Path, ":streamGenerateContent") {
		modelID := strings.TrimPrefix(r.URL.Path, "/v1beta/models/")
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{
			"name":            "models/" + modelID,
			"displayName":     modelID,
			"inputTokenLimit": 0,
		}); err != nil {
			t.Fatalf("encode gemini model metadata: %v", err)
		}
		return true
	}
	return false
}

func findBroadcastTextDelta(messages []realtime.LLMStreamingResponseMessage, index int, text string) *realtime.MessageTextDelta {
	for _, message := range messages {
		deltaEvent, ok := message.Content.Chunk.(realtime.MessageDeltaEvent)
		if !ok {
			continue
		}
		for _, rawContent := range deltaEvent.Content {
			content, ok := rawContent.(realtime.MessageTextDelta)
			if !ok {
				continue
			}
			if content.Index == index && content.Text == text {
				copied := content
				return &copied
			}
		}
	}
	return nil
}

func findBroadcastThinkingDelta(messages []realtime.LLMStreamingResponseMessage, index int, thinking string, summary *string) *realtime.MessageThinkingDelta {
	for _, message := range messages {
		deltaEvent, ok := message.Content.Chunk.(realtime.MessageDeltaEvent)
		if !ok {
			continue
		}
		for _, rawContent := range deltaEvent.Content {
			content, ok := rawContent.(realtime.MessageThinkingDelta)
			if !ok {
				continue
			}
			if content.Index != index || content.Thinking != thinking {
				continue
			}
			if !sameOptionalString(content.Summary, summary) {
				continue
			}
			copied := content
			return &copied
		}
	}
	return nil
}

func findBroadcastThinkingSignatureDelta(messages []realtime.LLMStreamingResponseMessage, index int, signature string) *realtime.MessageThinkingDelta {
	for _, message := range messages {
		deltaEvent, ok := message.Content.Chunk.(realtime.MessageDeltaEvent)
		if !ok {
			continue
		}
		for _, rawContent := range deltaEvent.Content {
			content, ok := rawContent.(realtime.MessageThinkingDelta)
			if !ok {
				continue
			}
			if content.Index != index || content.Signature == nil || *content.Signature != signature {
				continue
			}
			copied := content
			return &copied
		}
	}
	return nil
}

func sameOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

type stubToolClient struct {
	initTools         map[string]mcpx.ToolDescriptor
	discoverableTools map[string]mcpx.ToolDescriptor
	call              func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error)
}

func managedCompletionStatusInitTools() map[string]mcpx.ToolDescriptor {
	return map[string]mcpx.ToolDescriptor{
		"setta__report_completion_status": {
			ServerID:       mcpx.DefaultServerID,
			NamespacedName: "setta__report_completion_status",
			RemoteName:     "report_completion_status",
			Description:    "Report completion status.",
			InputSchema: map[string]any{
				"type": "object",
			},
		},
	}
}

func toolPayloadIncludesName(payload []any, want string) bool {
	for _, rawTool := range payload {
		tool, ok := rawTool.(map[string]any)
		if !ok {
			continue
		}
		if name, ok := tool["name"].(string); ok && strings.TrimSpace(name) == want {
			return true
		}
		function, ok := tool["function"].(map[string]any)
		if !ok {
			continue
		}
		if name, ok := function["name"].(string); ok && strings.TrimSpace(name) == want {
			return true
		}
	}
	return false
}

type executorTestSessionProvider struct {
	current *auth.CurrentSession
}

func (p executorTestSessionProvider) CurrentSession() (*auth.CurrentSession, bool) {
	if p.current == nil {
		return nil, false
	}
	return p.current, true
}

func (s *stubToolClient) InitToolsForServers(serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor {
	return filterToolDescriptorsForServers(s.initTools, serverIDs)
}

func (s *stubToolClient) DiscoverableToolsForServers(serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor {
	return filterToolDescriptorsForServers(s.discoverableTools, serverIDs)
}

func (s *stubToolClient) CallToolWithMeta(ctx context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error) {
	if s.call != nil {
		return s.call(ctx, namespacedToolName, arguments, meta)
	}
	return mcpx.ToolCallResult{}, nil
}

func TestExecutorExecuteStreamsManagedChatAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Fatalf("unexpected auth header %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"}}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" world\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":11,\"completion_tokens\":2,\"total_tokens\":13}}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		RequestParams: map[string]any{
			"temperature": 0.2,
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       testStringPtr("section-chat"),
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Hello from the user"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm stream: %v", err)
	}

	assertManagedChatTextStreamResult(t, live, run, broadcaster, result, "Hello world", 5, 11)

	if seenRequest["model"] != "gpt-4o-mini" {
		t.Fatalf("unexpected provider model %#v", seenRequest["model"])
	}
	if seenRequest["stream"] != true {
		t.Fatalf("expected provider stream=true, got %#v", seenRequest["stream"])
	}
	streamOptions, ok := seenRequest["stream_options"].(map[string]any)
	if !ok || streamOptions["include_usage"] != true {
		t.Fatalf("unexpected stream options %#v", seenRequest["stream_options"])
	}
	if seenRequest["temperature"] != 0.2 {
		t.Fatalf("expected request param passthrough, got %#v", seenRequest["temperature"])
	}
	providerMessages, ok := seenRequest["messages"].([]any)
	if !ok || len(providerMessages) != 2 {
		t.Fatalf("unexpected provider messages %#v", seenRequest["messages"])
	}
	first, ok := providerMessages[0].(map[string]any)
	if !ok || first["role"] != "system" || first["content"] != "System prompt" {
		t.Fatalf("unexpected system message %#v", providerMessages[0])
	}
}

func TestExecutorExecuteStreamsManagedAzureChatAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	type requestMeta struct {
		Path   string
		Query  string
		APIKey string
		Auth   string
	}
	var meta requestMeta
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		meta = requestMeta{
			Path:   r.URL.Path,
			Query:  r.URL.RawQuery,
			APIKey: r.Header.Get("Api-Key"),
			Auth:   r.Header.Get("Authorization"),
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Azure\"}}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":2,\"total_tokens\":11}}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-4o-mini",
			Provider:  "azure",
			BaseURL:   server.URL,
			APIKeyEnv: "AZURE_OPENAI_API_KEY",
		},
		RequestParams: map[string]any{
			"api_version": "2024-06-01",
			"temperature": 0.2,
		},
		APIKeys: map[string]string{
			"AZURE_OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       testStringPtr("section-chat"),
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Hello from the user"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed azure stream: %v", err)
	}

	state, err := live.GetLiveChatState(run.ID)
	if err != nil {
		t.Fatalf("get live state: %v", err)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	if len(state.Messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %#v", state.Messages)
	}
	if assistantText(state.Messages[1]) != "Azure reply" {
		t.Fatalf("unexpected assistant text %#v", state.Messages[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected 5 streaming broadcasts, got %d", broadcaster.Count())
	}

	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok || int(usage["prompt_tokens"].(float64)) != 9 {
		t.Fatalf("unexpected usage payload %#v", result.Outputs["usage"])
	}
	if meta.Path != "/openai/deployments/gpt-4o-mini/chat/completions" {
		t.Fatalf("unexpected provider path %q", meta.Path)
	}
	if meta.Query != "api-version=2024-06-01" {
		t.Fatalf("unexpected provider query %q", meta.Query)
	}
	if meta.APIKey != "secret" {
		t.Fatalf("unexpected api key header %q", meta.APIKey)
	}
	if meta.Auth != "" {
		t.Fatalf("expected azure requests to avoid Authorization header, got %q", meta.Auth)
	}
	if seenRequest["temperature"] != 0.2 {
		t.Fatalf("expected request param passthrough, got %#v", seenRequest["temperature"])
	}
}

func TestExecutorExecuteStreamsManagedToolArgumentPreview(t *testing.T) {
	t.Parallel()

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"tool-call-1\",\"type\":\"function\",\"function\":{\"name\":\"setta__stream_app_definition\",\"arguments\":\"{\\\"projectConfigId\\\":\\\"project-alpha\\\",\\\"patches\\\":\\\"{\\\\\\\"op\\\\\\\":\\\\\\\"set\\\\\\\",\\\\\\\"path\\\\\\\":\\\\\\\"/root\\\\\\\",\\\\\\\"value\\\\\\\":\\\\\\\"stream-root\\\\\\\"}\\\\n\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n")
			flusher.Flush()
			fmt.Fprint(w, "data: [DONE]\n\n")
		case 1:
			fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Preview applied\"},\"finish_reason\":\"stop\"}]}\n\n")
			flusher.Flush()
			fmt.Fprint(w, "data: [DONE]\n\n")
		default:
			t.Fatalf("unexpected provider request count %d", requestCount)
		}
		requestCount++
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	toolClient := &stubToolClient{
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__stream_app_definition": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__stream_app_definition",
				RemoteName:     "stream_app_definition",
				Description:    "Stream app definition patches.",
				InputSchema: map[string]any{
					"type": "object",
				},
				Metadata: &tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{},
						PreviewValuePath:    "patches",
						PreviewKind:         tools.PreviewKindAppSpecPatch,
					},
				},
			},
		},
		call: func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error) {
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"status": "ok"},
				Text:              "{\"status\":\"ok\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	_, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		MCPServerIDs: []string{mcpx.DefaultServerID},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Stream the app definition"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm preview stream: %v", err)
	}

	var previewEvent *realtime.ToolArgumentPreviewDeltaEvent
	for _, message := range broadcaster.Messages() {
		chunk, ok := message.Content.Chunk.(realtime.ToolArgumentPreviewDeltaEvent)
		if !ok {
			continue
		}
		previewEvent = &chunk
		break
	}
	if previewEvent == nil {
		t.Fatalf("expected tool preview event in %#v", broadcaster.Messages())
	}
	if previewEvent.ToolName != "setta__stream_app_definition" {
		t.Fatalf("unexpected preview event %#v", previewEvent)
	}
	if previewEvent.PreviewKind != tools.PreviewKindAppSpecPatch {
		t.Fatalf("unexpected preview kind %#v", previewEvent)
	}
	if previewEvent.PreviewValueDelta != "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n" {
		t.Fatalf("unexpected preview delta %#v", previewEvent)
	}
}

func TestExecutorExecuteReturnsPartialResultOnCancellation(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Partial\"}}]}\n\n")
		flusher.Flush()
		<-r.Context().Done()
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	type executionOutcome struct {
		result agentruns.ExecutionResult
		err    error
	}
	outcomeCh := make(chan executionOutcome, 1)
	go func() {
		result, err := executor.Execute(ctx, agentruns.ExecutionRequest{
			Run: run,
			LLMConfig: llmconfig.Config{
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
			APIKeys: map[string]string{
				"OPENAI_API_KEY": "secret",
			},
			SystemPrompt:    "System prompt",
			ProjectConfigID: "project-alpha",
			ChatID:          "chat-alpha",
			Inputs: map[string]any{
				"runType": "llm_chat",
				"messages": []any{
					map[string]any{
						"id":   "user-1",
						"role": "user",
						"content": []any{
							map[string]any{"type": "text", "text": "Hello from the user"},
						},
						"attachments": []any{},
					},
				},
			},
		})
		outcomeCh <- executionOutcome{result: result, err: err}
	}()

	waitForCondition(t, 2*time.Second, func() bool {
		state, err := live.GetLiveChatState(run.ID)
		if err != nil || state == nil || len(state.Messages) != 2 {
			return false
		}
		return assistantText(state.Messages[1]) == "Partial"
	})
	cancel()

	select {
	case outcome := <-outcomeCh:
		if !errors.Is(outcome.err, context.Canceled) {
			t.Fatalf("expected context canceled, got %v", outcome.err)
		}
		messages, ok := outcome.result.Outputs["messages"].([]any)
		if !ok || len(messages) != 2 {
			t.Fatalf("expected partial result messages, got %#v", outcome.result.Outputs["messages"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for cancelled execution")
	}

	state, err := live.GetLiveChatState(run.ID)
	if err != nil {
		t.Fatalf("get live state after cancel: %v", err)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected cancelled live state to clear waiting flag, got %#v", state)
	}
	if assistantText(state.Messages[1]) != "Partial" {
		t.Fatalf("unexpected partial assistant state %#v", state.Messages[1])
	}
	if broadcaster.Count() != 4 {
		t.Fatalf("expected start, delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorRejectsAttachments(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	_, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Hello"},
					},
					"attachments": []any{
						map[string]any{"id": "attachment-1"},
					},
				},
			},
		},
	})
	if !errors.Is(err, ErrAttachmentsUnsupported) {
		t.Fatalf("expected attachments unsupported, got %v", err)
	}
}

func TestExecutorInlinesManagedAttachmentTextWhenAttachmentServiceIsAvailable(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	artifactsRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(artifactsRoot, 0o755); err != nil {
		t.Fatalf("mkdir artifacts root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(artifactsRoot, "notes.txt"), []byte("Hello from attachment."), 0o644); err != nil {
		t.Fatalf("write attachment: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	attachmentService, err := chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: executorTestSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Fatalf("unexpected auth header %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"}}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" world\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":11,\"completion_tokens\":2,\"total_tokens\":13}}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	executor := NewExecutor(ExecutorOptions{
		HTTPClient:  server.Client(),
		Attachments: attachmentService,
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
			BaseURL:   server.URL + "/v1",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Use the attachment."},
					},
					"attachments": []any{
						map[string]any{"id": "artifacts/notes.txt", "name": "notes.txt", "mimeType": "text/plain"},
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed chat with attachments: %v", err)
	}

	messages, _ := seenRequest["messages"].([]any)
	if len(messages) != 2 {
		t.Fatalf("expected system and user messages, got %#v", seenRequest["messages"])
	}
	userMessage, _ := messages[1].(map[string]any)
	content, _ := userMessage["content"].(string)
	if !strings.Contains(content, "Use the attachment.") {
		t.Fatalf("expected original message text, got %q", content)
	}
	if !strings.Contains(content, "[Attachment: notes.txt]") || !strings.Contains(content, "Hello from attachment.") {
		t.Fatalf("expected attachment text to be inlined, got %q", content)
	}
	outputMessages, _ := result.Outputs["messages"].([]any)
	if len(outputMessages) != 2 {
		t.Fatalf("expected persisted output messages, got %#v", result.Outputs["messages"])
	}
	persistedUserMessage, _ := outputMessages[0].(map[string]any)
	persistedAttachments, _ := persistedUserMessage["attachments"].([]any)
	if len(persistedAttachments) != 1 {
		t.Fatalf("expected persisted user attachment metadata, got %#v", persistedUserMessage["attachments"])
	}
	persistedAttachment, _ := persistedAttachments[0].(map[string]any)
	if persistedAttachment["id"] != "artifacts/notes.txt" || persistedAttachment["name"] != "notes.txt" {
		t.Fatalf("unexpected persisted attachment %#v", persistedAttachment)
	}
}

func TestExecutorBuildsMissingAttachmentPlaceholderForExternalPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	externalRoot := filepath.Join(root, "attachments")
	if err := os.MkdirAll(externalRoot, 0o755); err != nil {
		t.Fatalf("mkdir external attachment root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(externalRoot, "notes.txt"), []byte("Secrets outside artifacts."), 0o644); err != nil {
		t.Fatalf("write external attachment: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	attachmentService, err := chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: executorTestSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}

	executor := NewExecutor(ExecutorOptions{Attachments: attachmentService})
	_, executionTranscript, err := executor.parseTranscriptMessages([]any{
		map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Hello"},
			},
			"attachments": []any{
				map[string]any{"id": "attachments/notes.txt", "name": "notes.txt", "mimeType": "text/plain"},
			},
		},
	}, "project-alpha")
	if err != nil {
		t.Fatalf("parse transcript messages with external attachment path: %v", err)
	}

	providerMessages, err := buildProviderMessages(openAIProvider, "System prompt", executionTranscript)
	if err != nil {
		t.Fatalf("build provider messages with external attachment path: %v", err)
	}
	if len(providerMessages) != 2 {
		t.Fatalf("expected system and user provider messages, got %#v", providerMessages)
	}
	userPayload := providerMessages[1]
	if _, ok := userPayload["attachments"]; ok {
		t.Fatalf("expected provider payload to omit attachments, got %#v", userPayload["attachments"])
	}
	content, _ := userPayload["content"].(string)
	if !strings.Contains(content, "Hello") {
		t.Fatalf("expected original user text, got %q", content)
	}
	if !strings.Contains(content, "[Attachment missing: notes.txt]") {
		t.Fatalf("expected missing attachment placeholder, got %q", content)
	}
	if strings.Contains(content, "Secrets outside artifacts.") {
		t.Fatalf("expected external attachment contents to stay hidden, got %q", content)
	}
}

func TestBuildOpenAIProviderMessageStripsCreatedAtFromToolMessages(t *testing.T) {
	t.Parallel()

	payload, include, err := buildOpenAIProviderMessage(map[string]any{
		"id":           "tool-1",
		"role":         "tool",
		"tool_call_id": "tool-call-1",
		"content":      []any{},
		"createdAt":    123,
	})
	if err != nil {
		t.Fatalf("build openai provider tool message: %v", err)
	}
	if !include {
		t.Fatal("expected tool message to be included")
	}
	if payload["role"] != "tool" {
		t.Fatalf("expected tool role, got %#v", payload["role"])
	}
	if payload["tool_call_id"] != "tool-call-1" {
		t.Fatalf("expected tool call id tool-call-1, got %#v", payload["tool_call_id"])
	}
	if _, ok := payload["createdAt"]; ok {
		t.Fatalf("expected createdAt to be stripped from provider payload, got %#v", payload)
	}
	content, ok := payload["content"].(string)
	if !ok || content != "" {
		t.Fatalf("expected empty string tool content fallback, got %#v", payload["content"])
	}
}

func TestBuildProviderMessagesRejectsToolReferenceContent(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		provider string
	}{
		{name: "openai", provider: openAIProvider},
		{name: "anthropic", provider: anthropicProvider},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			_, err := buildProviderMessages(testCase.provider, "", []map[string]any{
				{
					"id":           "tool-1",
					"role":         "tool",
					"tool_call_id": "tool-call-1",
					"content": []any{
						map[string]any{
							"type":      "tool_reference",
							"tool_name": "setta__tool_alpha",
						},
					},
				},
			})
			if !errors.Is(err, ErrHistoryUnsupported) {
				t.Fatalf("expected ErrHistoryUnsupported, got %v", err)
			}
			if !strings.Contains(err.Error(), "tool_reference") {
				t.Fatalf("expected tool_reference error, got %q", err.Error())
			}
		})
	}
}

func TestBuildProviderMessagesPrefixesOpenAISystemPromptBeforeTranscript(t *testing.T) {
	t.Parallel()

	providerMessages, err := buildProviderMessages(openAIProvider, "System prompt", []map[string]any{
		{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Hello from the user"},
			},
			"attachments": []any{},
		},
	})
	if err != nil {
		t.Fatalf("build provider messages: %v", err)
	}
	if len(providerMessages) != 2 {
		t.Fatalf("expected system and user messages, got %#v", providerMessages)
	}
	if providerMessages[0]["role"] != "system" || providerMessages[0]["content"] != "System prompt" {
		t.Fatalf("expected system prompt first, got %#v", providerMessages[0])
	}
	if providerMessages[1]["role"] != "user" || providerMessages[1]["content"] != "Hello from the user" {
		t.Fatalf("expected user transcript after system prompt, got %#v", providerMessages[1])
	}
}

func TestBuildAnthropicProviderMessageStripsThinkingSummary(t *testing.T) {
	t.Parallel()

	payload, include, err := buildAnthropicProviderMessage(map[string]any{
		"id":   "assistant-1",
		"role": "assistant",
		"content": []any{
			map[string]any{
				"type":      "thinking",
				"thinking":  "Reasoning details.",
				"summary":   "Short summary.",
				"signature": "sig",
			},
			map[string]any{
				"type": "text",
				"text": "Answer.",
			},
		},
	})
	if err != nil {
		t.Fatalf("build anthropic provider message: %v", err)
	}
	if !include {
		t.Fatal("expected anthropic provider message to be included")
	}

	content, ok := payload["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", payload["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected thinking block map, got %#v", content[0])
	}
	if thinkingBlock["type"] != "thinking" || thinkingBlock["thinking"] != "Reasoning details." || thinkingBlock["signature"] != "sig" {
		t.Fatalf("unexpected anthropic thinking block %#v", thinkingBlock)
	}
	if _, ok := thinkingBlock["summary"]; ok {
		t.Fatalf("expected anthropic thinking block to drop summary, got %#v", thinkingBlock)
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["type"] != "text" || textBlock["text"] != "Answer." {
		t.Fatalf("unexpected anthropic text block %#v", content[1])
	}
}

func TestExecutorExecuteToolCallsReturnsSearchHintForMissingTool(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	toolCalls := []map[string]any{
		{
			"id": "tool-call-1",
			"function": map[string]any{
				"name":      "setta__change_section_impl",
				"arguments": map[string]any{},
			},
		},
	}

	toolMessages, providerMessages, err := executor.executeToolCalls(
		context.Background(),
		preparedExecution{
			provider:       openAIProvider,
			availableTools: map[string]mcpx.ToolDescriptor{},
		},
		agentruns.ExecutionRequest{},
		toolCalls,
	)
	if err != nil {
		t.Fatalf("execute tool calls: %v", err)
	}
	if len(toolMessages) != 1 {
		t.Fatalf("expected one tool message, got %#v", toolMessages)
	}
	if len(providerMessages) != 1 {
		t.Fatalf("expected one provider message, got %#v", providerMessages)
	}

	toolMessage := toolMessages[0]
	if toolMessage["is_error"] != true {
		t.Fatalf("expected error tool message, got %#v", toolMessage)
	}
	content, ok := toolMessage["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected one content block, got %#v", toolMessage["content"])
	}
	block, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected object content block, got %#v", content[0])
	}
	text, _ := block["text"].(string)
	if !strings.Contains(text, "not registered") {
		t.Fatalf("expected missing-tool message, got %q", text)
	}
	if !strings.Contains(text, "setta__search_mcp_tools") {
		t.Fatalf("expected search tool hint, got %q", text)
	}

	resultPayload, ok := toolMessage["result"].(map[string]any)
	if !ok {
		t.Fatalf("expected structured result payload, got %#v", toolMessage["result"])
	}
	structuredContent, ok := resultPayload["structuredContent"].(map[string]any)
	if !ok {
		t.Fatalf("expected structured result content, got %#v", resultPayload["structuredContent"])
	}
	if structuredContent["tool_name"] != "setta__change_section_impl" {
		t.Fatalf("expected missing tool name in structured result, got %#v", structuredContent["tool_name"])
	}

	providerContent, _ := providerMessages[0]["content"].(string)
	if !strings.Contains(providerContent, "setta__search_mcp_tools") {
		t.Fatalf("expected provider follow-up message to include search hint, got %q", providerContent)
	}
}

func TestExecutorExecuteToolCallsReturnsDisallowedToolErrorResult(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	toolCalls := []map[string]any{
		{
			"id": "tool-call-1",
			"function": map[string]any{
				"name":      "setta__change_section_impl",
				"arguments": map[string]any{},
			},
		},
	}

	toolMessages, providerMessages, err := executor.executeToolCalls(
		context.Background(),
		preparedExecution{
			provider: openAIProvider,
			availableTools: map[string]mcpx.ToolDescriptor{
				"setta__change_section_impl": {
					NamespacedName: "setta__change_section_impl",
				},
			},
			toolAllowlist: &toolAllowlist{
				toolNames:     map[string]struct{}{},
				toolBasenames: map[string]struct{}{},
				serverIDs:     map[string]struct{}{},
			},
		},
		agentruns.ExecutionRequest{},
		toolCalls,
	)
	if err != nil {
		t.Fatalf("execute tool calls: %v", err)
	}
	if len(toolMessages) != 1 {
		t.Fatalf("expected one tool message, got %#v", toolMessages)
	}
	if len(providerMessages) != 1 {
		t.Fatalf("expected one provider message, got %#v", providerMessages)
	}

	toolMessage := toolMessages[0]
	if toolMessage["is_error"] != true {
		t.Fatalf("expected error tool message, got %#v", toolMessage)
	}
	content, ok := toolMessage["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected one content block, got %#v", toolMessage["content"])
	}
	block, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected object content block, got %#v", content[0])
	}
	text, _ := block["text"].(string)
	if !strings.Contains(text, "not allowed for this chat") {
		t.Fatalf("expected disallowed-tool message, got %q", text)
	}

	resultPayload, ok := toolMessage["result"].(map[string]any)
	if !ok {
		t.Fatalf("expected structured result payload, got %#v", toolMessage["result"])
	}
	structuredContent, ok := resultPayload["structuredContent"].(map[string]any)
	if !ok {
		t.Fatalf("expected structured result content, got %#v", resultPayload["structuredContent"])
	}
	if structuredContent["tool_name"] != "setta__change_section_impl" {
		t.Fatalf("expected disallowed tool name in structured result, got %#v", structuredContent["tool_name"])
	}

	providerContent, _ := providerMessages[0]["content"].(string)
	if !strings.Contains(providerContent, "not allowed for this chat") {
		t.Fatalf("expected provider follow-up message to include disallowed tool text, got %q", providerContent)
	}
}

func TestExecutorRejectsThinkingWithoutExplicitProviderConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if !errors.Is(err, ErrReasoningUnsupported) {
		t.Fatalf("expected reasoning unsupported, got %v", err)
	}
}

func TestExecutorExecuteStreamsAnthropicManagedChatAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/messages" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if got := r.Header.Get("X-Api-Key"); got != "secret" {
			t.Fatalf("unexpected auth header %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, anthropicMessageStartEvent("msg-text", "claude-sonnet-4-5-20250929", 11, 0))
		flusher.Flush()
		fmt.Fprint(w, anthropicTextBlockStartEvent(0))
		flusher.Flush()
		fmt.Fprint(w, anthropicTextDeltaEvent(0, "Hello"))
		flusher.Flush()
		fmt.Fprint(w, anthropicTextDeltaEvent(0, " world"))
		flusher.Flush()
		fmt.Fprint(w, anthropicContentBlockStopEvent(0))
		flusher.Flush()
		fmt.Fprint(w, anthropicMessageDeltaEvent("end_turn", 11, 2))
		flusher.Flush()
		fmt.Fprint(w, anthropicMessageStopEvent())
		flusher.Flush()
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "claude-sonnet-4-5-20250929",
			Provider:  "anthropic",
			BaseURL:   server.URL,
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		APIKeys: map[string]string{
			"ANTHROPIC_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Hello from the user"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed anthropic stream: %v", err)
	}

	assertManagedChatTextStreamResult(t, live, run, broadcaster, result, "Hello world", 5, 11)

	if seenRequest["model"] != "claude-sonnet-4-5-20250929" {
		t.Fatalf("unexpected provider model %#v", seenRequest["model"])
	}
	if seenRequest["max_tokens"] != float64(defaultAnthropicMaxTokens) {
		t.Fatalf("expected default anthropic max_tokens, got %#v", seenRequest["max_tokens"])
	}
	systemBlocks, ok := seenRequest["system"].([]any)
	if !ok || len(systemBlocks) != 1 {
		t.Fatalf("unexpected anthropic system blocks %#v", seenRequest["system"])
	}
	messages, ok := seenRequest["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("unexpected anthropic messages %#v", seenRequest["messages"])
	}
}

func TestExecutorValidateRejectsUnsupportedProvider(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "mistral-large-latest",
			Provider:  "mistral",
			APIKeyEnv: "MISTRAL_API_KEY",
		},
		APIKeys: map[string]string{
			"MISTRAL_API_KEY": "secret",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if !errors.Is(err, ErrProviderUnsupported) {
		t.Fatalf("expected provider unsupported, got %v", err)
	}
}
