package managedllm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
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

type stubToolClient struct {
	initTools         map[string]mcpx.ToolDescriptor
	discoverableTools map[string]mcpx.ToolDescriptor
	call              func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error)
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
	if assistantText(state.Messages[1]) != "Hello world" {
		t.Fatalf("unexpected assistant text %#v", state.Messages[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected 5 streaming broadcasts, got %d", broadcaster.Count())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected two output messages, got %#v", result.Outputs["messages"])
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok || int(usage["prompt_tokens"].(float64)) != 11 {
		t.Fatalf("unexpected usage payload %#v", result.Outputs["usage"])
	}

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

func TestExecutorExecuteStreamsManagedToolArgumentPreview(t *testing.T) {
	t.Parallel()

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	if previewEvent.PreviewKind != string(tools.PreviewKindAppSpecPatch) {
		t.Fatalf("unexpected preview kind %#v", previewEvent)
	}
	if previewEvent.PreviewValueDelta != "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n" {
		t.Fatalf("unexpected preview delta %#v", previewEvent)
	}
}

func TestExecutorExecuteReturnsPartialResultOnCancellation(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	if assistantText(state.Messages[1]) != "Hello world" {
		t.Fatalf("unexpected assistant text %#v", state.Messages[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected 5 streaming broadcasts, got %d", broadcaster.Count())
	}

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

	outputMessages, ok := result.Outputs["messages"].([]any)
	if !ok || len(outputMessages) != 2 {
		t.Fatalf("expected two output messages, got %#v", result.Outputs["messages"])
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok || int(usage["prompt_tokens"].(float64)) != 11 {
		t.Fatalf("unexpected usage payload %#v", result.Outputs["usage"])
	}
}

func TestExecutorValidateRejectsUnsupportedProvider(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gemini-2.5-pro",
			Provider:  "gemini",
			APIKeyEnv: "GEMINI_API_KEY",
		},
		APIKeys: map[string]string{
			"GEMINI_API_KEY": "secret",
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

func TestExecutorExecuteRunsAnthropicToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	createdSectionID, err := temporaryIDs.EnsureTemporaryID("section-created")
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}

	requestBodies := make([]map[string]any, 0, 2)
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		requestBodies = append(requestBodies, body)

		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, anthropicMessageStartEvent("msg-tool-1", "claude-sonnet-4-5-20250929", 18, 0))
			flusher.Flush()
			fmt.Fprint(w, anthropicToolUseBlockStartEvent(0, "tool-call-1", "setta__create_top_level_section"))
			flusher.Flush()
			fmt.Fprint(w, anthropicInputJSONDeltaEvent(0, `{"projectConfigId":"project-alpha","implType":"Dict"}`))
			flusher.Flush()
			fmt.Fprint(w, anthropicContentBlockStopEvent(0))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageDeltaEvent("tool_use", 18, 4))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageStopEvent())
			flusher.Flush()
		case 1:
			fmt.Fprint(w, anthropicMessageStartEvent("msg-tool-2", "claude-sonnet-4-5-20250929", 23, 0))
			flusher.Flush()
			fmt.Fprint(w, anthropicTextBlockStartEvent(0))
			flusher.Flush()
			fmt.Fprint(w, anthropicTextDeltaEvent(0, "Tool loop complete"))
			flusher.Flush()
			fmt.Fprint(w, anthropicContentBlockStopEvent(0))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageDeltaEvent("end_turn", 23, 3))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageStopEvent())
			flusher.Flush()
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

	capturedCalls := make([]struct {
		ToolName  string
		Arguments map[string]any
		Meta      map[string]any
	}, 0, 1)
	toolClient := &stubToolClient{
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__create_top_level_section": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__create_top_level_section",
				RemoteName:     "create_top_level_section",
				Description:    "Create a top-level section.",
				InputSchema: map[string]any{
					"type": "object",
				},
				Metadata: &tools.Metadata{
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
				},
			},
		},
		call: func(_ context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error) {
			capturedCalls = append(capturedCalls, struct {
				ToolName  string
				Arguments map[string]any
				Meta      map[string]any
			}{
				ToolName:  namespacedToolName,
				Arguments: arguments,
				Meta:      meta,
			})
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"sectionId": createdSectionID},
				Text:              "{\"sectionId\":\"" + createdSectionID + "\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
		ResultFollow: NewToolResultFollowEmitter(ToolResultFollowEmitterOptions{
			Broadcaster:  broadcaster,
			TemporaryIDs: temporaryIDs,
		}),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Profile: agentprofiles.Profile{
			ID:   "profile-alpha",
			Name: "Alpha",
		},
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "claude-sonnet-4-5-20250929",
			Provider:  "anthropic",
			BaseURL:   server.URL,
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		MCPServerIDs:           []string{mcpx.DefaultServerID},
		CompletionGuardEnabled: true,
		APIKeys: map[string]string{
			"ANTHROPIC_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Inputs: map[string]any{
			"runType":       "llm_chat",
			"allowUnscoped": true,
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Use the tool"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed anthropic tool stream: %v", err)
	}

	if len(capturedCalls) != 1 {
		t.Fatalf("expected one tool call, got %#v", capturedCalls)
	}
	if capturedCalls[0].ToolName != "setta__create_top_level_section" {
		t.Fatalf("unexpected tool name %#v", capturedCalls[0])
	}
	if capturedCalls[0].Arguments["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected tool arguments %#v", capturedCalls[0].Arguments)
	}

	if len(requestBodies) != 2 {
		t.Fatalf("expected two provider requests, got %d", len(requestBodies))
	}
	firstTools, ok := requestBodies[0]["tools"].([]any)
	if !ok || len(firstTools) != 1 {
		t.Fatalf("expected one anthropic tool definition, got %#v", requestBodies[0]["tools"])
	}
	secondMessages, ok := requestBodies[1]["messages"].([]any)
	if !ok || len(secondMessages) < 3 {
		t.Fatalf("expected follow-up anthropic transcript, got %#v", requestBodies[1]["messages"])
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

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	if assistantText(messages[3].(map[string]any)) != "Tool loop complete" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
	if broadcaster.Count() != 10 {
		t.Fatalf("expected 10 managed stream broadcasts, got %d", broadcaster.Count())
	}
	followMessages := broadcaster.ResultFollowMessages()
	if len(followMessages) != 1 {
		t.Fatalf("expected one result-follow update, got %#v", followMessages)
	}
	if got := followMessages[0].Content.IDsByType["section"]; len(got) != 1 || got[0] != "section-created" {
		t.Fatalf("expected canonical section follow id, got %#v", followMessages[0].Content.IDsByType)
	}
}

func TestExecutorValidateAllowsThinkingWithExplicitReasoningConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		RequestParams: map[string]any{
			"model":               "gpt-4o-mini",
			"custom_llm_provider": "openai",
			"reasoning_effort":    "high",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if err != nil {
		t.Fatalf("expected explicit reasoning config to validate, got %v", err)
	}
}

func TestExecutorValidateAllowsThinkingForOpenAIReasoningModel(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-5-codex",
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
	if err != nil {
		t.Fatalf("expected supported OpenAI reasoning model to validate, got %v", err)
	}
}

func TestExecutorExecuteAddsDefaultReasoningEffortForSupportedThinkingModel(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Reasoned reply\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":8,\"completion_tokens\":3,\"total_tokens\":11,\"completion_tokens_details\":{\"reasoning_tokens\":2}}}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	executor := NewExecutor(ExecutorOptions{
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-5-codex",
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think this through"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm reasoning request: %v", err)
	}

	if seenRequest["reasoning_effort"] != "high" {
		t.Fatalf("expected reasoning_effort=high, got %#v", seenRequest["reasoning_effort"])
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", result.Outputs["usage"])
	}
	if int(usage["reasoning_output_tokens"].(float64)) != 2 {
		t.Fatalf("expected reasoning output tokens in usage, got %#v", usage)
	}
}

func TestExecutorExecuteRunsToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	createdSectionID, err := temporaryIDs.EnsureTemporaryID("section-created")
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}

	requestBodies := make([]map[string]any, 0, 2)
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		requestBodies = append(requestBodies, body)

		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}

		switch requestCount {
		case 0:
			fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"tool-call-1\",\"type\":\"function\",\"function\":{\"name\":\"setta__create_top_level_section\",\"arguments\":\"{\\\"projectConfigId\\\":\\\"project-alpha\\\",\\\"implType\\\":\\\"Dict\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n")
			flusher.Flush()
			fmt.Fprint(w, "data: [DONE]\n\n")
		case 1:
			fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Tool loop complete\"},\"finish_reason\":\"stop\"}]}\n\n")
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

	capturedCalls := make([]struct {
		ToolName  string
		Arguments map[string]any
		Meta      map[string]any
	}, 0, 1)
	toolClient := &stubToolClient{
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__create_top_level_section": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__create_top_level_section",
				RemoteName:     "create_top_level_section",
				Description:    "Create a top-level section.",
				InputSchema: map[string]any{
					"type": "object",
				},
				Metadata: &tools.Metadata{
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
				},
			},
		},
		call: func(_ context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error) {
			capturedCalls = append(capturedCalls, struct {
				ToolName  string
				Arguments map[string]any
				Meta      map[string]any
			}{
				ToolName:  namespacedToolName,
				Arguments: arguments,
				Meta:      meta,
			})
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"sectionId": createdSectionID},
				Text:              "{\"sectionId\":\"" + createdSectionID + "\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
		ResultFollow: NewToolResultFollowEmitter(ToolResultFollowEmitterOptions{
			Broadcaster:  broadcaster,
			TemporaryIDs: temporaryIDs,
		}),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Profile: agentprofiles.Profile{
			ID:   "profile-alpha",
			Name: "Alpha",
		},
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		MCPServerIDs:           []string{mcpx.DefaultServerID},
		CompletionGuardEnabled: true,
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Inputs: map[string]any{
			"runType":       "llm_chat",
			"allowUnscoped": true,
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Use the tool"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm tool stream: %v", err)
	}

	if len(capturedCalls) != 1 {
		t.Fatalf("expected one tool call, got %#v", capturedCalls)
	}
	if capturedCalls[0].ToolName != "setta__create_top_level_section" {
		t.Fatalf("unexpected tool name %#v", capturedCalls[0])
	}
	if capturedCalls[0].Arguments["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected tool arguments %#v", capturedCalls[0].Arguments)
	}
	if capturedCalls[0].Meta["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected tool meta %#v", capturedCalls[0].Meta)
	}
	if capturedCalls[0].Meta["chatId"] != "chat-alpha" {
		t.Fatalf("unexpected tool meta %#v", capturedCalls[0].Meta)
	}
	if capturedCalls[0].Meta["allowUnscoped"] != true {
		t.Fatalf("unexpected tool meta %#v", capturedCalls[0].Meta)
	}

	if len(requestBodies) != 2 {
		t.Fatalf("expected two provider requests, got %d", len(requestBodies))
	}
	firstTools, ok := requestBodies[0]["tools"].([]any)
	if !ok || len(firstTools) != 1 {
		t.Fatalf("expected one tool definition, got %#v", requestBodies[0]["tools"])
	}
	secondMessages, ok := requestBodies[1]["messages"].([]any)
	if !ok || len(secondMessages) < 4 {
		t.Fatalf("expected follow-up provider transcript, got %#v", requestBodies[1]["messages"])
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
			t.Fatalf("unexpected tool follow-up message %#v", message)
		}
		foundToolMessage = true
	}
	if !foundToolMessage {
		t.Fatalf("expected provider follow-up to include tool result message, got %#v", secondMessages)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	if assistantText(messages[3].(map[string]any)) != "Tool loop complete" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
	if broadcaster.Count() != 9 {
		t.Fatalf("expected 9 managed stream broadcasts, got %d", broadcaster.Count())
	}
	followMessages := broadcaster.ResultFollowMessages()
	if len(followMessages) != 1 {
		t.Fatalf("expected one result-follow update, got %#v", followMessages)
	}
	if followMessages[0].Content.ProjectConfigID != "project-alpha" || followMessages[0].Content.ChatID != "chat-alpha" {
		t.Fatalf("unexpected result-follow message %#v", followMessages[0])
	}
	if got := followMessages[0].Content.IDsByType["section"]; len(got) != 1 || got[0] != "section-created" {
		t.Fatalf("expected canonical section follow id, got %#v", followMessages[0].Content.IDsByType)
	}
}

func newManagedChatTestRun() agentruns.Run {
	now := time.Date(2026, 3, 9, 22, 0, 0, 0, time.UTC)
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         "llm_chat",
		"chatId":          "chat-alpha",
		"projectConfigId": "project-alpha",
		"sectionId":       "section-chat",
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
	}, now)
	run.ID = "run-alpha"
	run.Status = agentruns.RunStatusRunning
	return run
}

func assistantText(message map[string]any) string {
	content, ok := message["content"].([]any)
	if !ok || len(content) == 0 {
		return ""
	}
	block, ok := content[0].(map[string]any)
	if !ok {
		return ""
	}
	text, _ := block["text"].(string)
	return text
}

func waitForCondition(t *testing.T, timeout time.Duration, check func() bool) {
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

func testStringPtr(value string) *string {
	return &value
}

func filterToolDescriptorsForServers(source map[string]mcpx.ToolDescriptor, serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor {
	filtered := map[string]mcpx.ToolDescriptor{}
	for name, descriptor := range source {
		if len(serverIDs) > 0 {
			if _, ok := serverIDs[descriptor.ServerID]; !ok {
				continue
			}
		}
		filtered[name] = descriptor
	}
	return filtered
}

func anthropicMessageStartEvent(messageID string, model string, inputTokens int, outputTokens int) string {
	return fmt.Sprintf("event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":%q,\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":%q,\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":%d,\"output_tokens\":%d,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n", messageID, model, inputTokens, outputTokens)
}

func anthropicTextBlockStartEvent(index int) string {
	return fmt.Sprintf("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":%d,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n", index)
}

func anthropicToolUseBlockStartEvent(index int, toolCallID string, toolName string) string {
	return fmt.Sprintf("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":%d,\"content_block\":{\"type\":\"tool_use\",\"id\":%q,\"name\":%q,\"input\":{}}}\n\n", index, toolCallID, toolName)
}

func anthropicTextDeltaEvent(index int, text string) string {
	return fmt.Sprintf("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":%d,\"delta\":{\"type\":\"text_delta\",\"text\":%q}}\n\n", index, text)
}

func anthropicInputJSONDeltaEvent(index int, partialJSON string) string {
	return fmt.Sprintf("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":%d,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":%q}}\n\n", index, partialJSON)
}

func anthropicContentBlockStopEvent(index int) string {
	return fmt.Sprintf("event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":%d}\n\n", index)
}

func anthropicMessageDeltaEvent(stopReason string, inputTokens int, outputTokens int) string {
	return fmt.Sprintf("event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":%q,\"stop_sequence\":null},\"usage\":{\"input_tokens\":%d,\"output_tokens\":%d,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0}}}\n\n", stopReason, inputTokens, outputTokens)
}

func anthropicMessageStopEvent() string {
	return "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
}
