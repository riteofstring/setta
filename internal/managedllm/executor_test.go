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

	"setta/internal/agentprofiles"
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

func TestExecutorExecuteStreamsGeminiManagedChatAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-2.5-pro:streamGenerateContent" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if r.URL.RawQuery != "alt=sse" {
			t.Fatalf("unexpected query %q", r.URL.RawQuery)
		}
		if got := r.Header.Get("X-Goog-Api-Key"); got != "secret" {
			t.Fatalf("unexpected api key header %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Hello\"}]}}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\" world\"}]}}],\"usageMetadata\":{\"promptTokenCount\":11,\"candidatesTokenCount\":2,\"totalTokenCount\":13}}\n\n")
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
			Model:     "gemini-2.5-pro",
			Provider:  "gemini",
			BaseURL:   server.URL,
			APIKeyEnv: "GEMINI_API_KEY",
		},
		RequestParams: map[string]any{
			"temperature": 0.2,
		},
		APIKeys: map[string]string{
			"GEMINI_API_KEY": "secret",
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
		t.Fatalf("execute managed gemini stream: %v", err)
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

	outputMessages, ok := result.Outputs["messages"].([]any)
	if !ok || len(outputMessages) != 2 {
		t.Fatalf("expected two output messages, got %#v", result.Outputs["messages"])
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok || int(usage["prompt_tokens"].(float64)) != 11 {
		t.Fatalf("unexpected usage payload %#v", result.Outputs["usage"])
	}

	contents, ok := seenRequest["contents"].([]any)
	if !ok || len(contents) != 1 {
		t.Fatalf("unexpected gemini contents %#v", seenRequest["contents"])
	}
	generationConfig, ok := seenRequest["generationConfig"].(map[string]any)
	if !ok || generationConfig["temperature"] != 0.2 {
		t.Fatalf("unexpected generation config %#v", seenRequest["generationConfig"])
	}
	systemInstruction, ok := seenRequest["systemInstruction"].(map[string]any)
	if !ok {
		t.Fatalf("expected system instruction, got %#v", seenRequest["systemInstruction"])
	}
	systemParts, ok := systemInstruction["parts"].([]any)
	if !ok || len(systemParts) != 1 {
		t.Fatalf("unexpected system instruction parts %#v", seenRequest["systemInstruction"])
	}
}

func TestExecutorExecuteRunsGeminiToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
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
			fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"id\":\"tool-call-1\",\"name\":\"setta__create_top_level_section\",\"args\":{\"projectConfigId\":\"project-alpha\",\"implType\":\"Dict\"}}}]}}],\"usageMetadata\":{\"promptTokenCount\":18,\"candidatesTokenCount\":4,\"totalTokenCount\":22}}\n\n")
			flusher.Flush()
		case 1:
			fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Tool loop complete\"}]}}],\"usageMetadata\":{\"promptTokenCount\":23,\"candidatesTokenCount\":3,\"totalTokenCount\":26}}\n\n")
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
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gemini-2.5-pro",
			Provider:  "gemini",
			BaseURL:   server.URL,
			APIKeyEnv: "GEMINI_API_KEY",
			MCPServerIDs: []string{
				mcpx.DefaultServerID,
			},
		},
		APIKeys: map[string]string{
			"GEMINI_API_KEY": "secret",
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
						map[string]any{"type": "text", "text": "Please create a section"},
					},
					"attachments": []any{},
				},
			},
		},
		MCPServerIDs: []string{mcpx.DefaultServerID},
		TemporaryIDs: temporaryIDs,
	})
	if err != nil {
		t.Fatalf("execute managed gemini tool stream: %v", err)
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

	outputMessages, ok := result.Outputs["messages"].([]any)
	if !ok || len(outputMessages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool result, and final assistant messages, got %#v", result.Outputs["messages"])
	}
	finalAssistant, ok := outputMessages[3].(map[string]any)
	if !ok || assistantText(finalAssistant) != "Tool loop complete" {
		t.Fatalf("unexpected final assistant %#v", outputMessages[3])
	}

	if len(requestBodies) != 2 {
		t.Fatalf("expected two provider requests, got %#v", requestBodies)
	}
	if _, ok := requestBodies[0]["tools"].([]any); !ok {
		t.Fatalf("expected gemini tools on first request, got %#v", requestBodies[0])
	}
	secondContents, ok := requestBodies[1]["contents"].([]any)
	if !ok || len(secondContents) < 3 {
		t.Fatalf("expected follow-up contents with tool history, got %#v", requestBodies[1]["contents"])
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

func TestExecutorValidateRejectsAzureWithoutExplicitConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "azure",
			APIKeyEnv: "AZURE_OPENAI_API_KEY",
			BaseURL:   "https://example-resource.openai.azure.com",
		},
		APIKeys: map[string]string{
			"AZURE_OPENAI_API_KEY": "secret",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if !errors.Is(err, ErrProviderConfigInvalid) {
		t.Fatalf("expected provider config invalid, got %v", err)
	}
}

func TestExecutorValidateRejectsAzureThinking(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "azure",
			APIKeyEnv: "AZURE_OPENAI_API_KEY",
			BaseURL:   "https://example-resource.openai.azure.com",
		},
		RequestParams: map[string]any{
			"api_version": "2024-06-01",
		},
		APIKeys: map[string]string{
			"AZURE_OPENAI_API_KEY": "secret",
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

func TestExecutorValidateAllowsThinkingForAnthropicWithExplicitConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "claude-sonnet-4-5-20250929",
			Provider:  "anthropic",
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		RequestParams: map[string]any{
			"model":               "claude-sonnet-4-5-20250929",
			"custom_llm_provider": "anthropic",
			"max_tokens":          4096,
			"thinking": map[string]any{
				"type":          "enabled",
				"budget_tokens": 1024,
			},
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if err != nil {
		t.Fatalf("expected explicit anthropic thinking config to validate, got %v", err)
	}
}

func TestExecutorValidateAllowsThinkingForGeminiWithExplicitConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gemini-2.5-pro",
			Provider:  "gemini",
			APIKeyEnv: "GEMINI_API_KEY",
		},
		RequestParams: map[string]any{
			"model":               "gemini-2.5-pro",
			"custom_llm_provider": "gemini",
			"thinking_config": map[string]any{
				"thinking_budget": 128,
				"thinking_level":  "medium",
			},
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if err != nil {
		t.Fatalf("expected explicit gemini thinking config to validate, got %v", err)
	}
}

func TestExecutorExecuteStreamsOpenAIResponsesThinkingAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Final"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent(
			[]map[string]any{
				{
					"type":              "reasoning",
					"id":                "reasoning-1",
					"summary":           []map[string]any{{"text": "Plan summary"}},
					"content":           []map[string]any{{"type": "reasoning_text", "text": "Planning deeply"}},
					"encrypted_content": "enc-thinking",
					"status":            "completed",
				},
				{
					"type":    "message",
					"id":      "message-1",
					"role":    "assistant",
					"status":  "completed",
					"content": []map[string]any{{"type": "output_text", "text": "Final answer", "annotations": []any{}}},
				},
			},
			8,
			3,
			11,
			2,
		))
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

	reasoning, ok := seenRequest["reasoning"].(map[string]any)
	if !ok {
		t.Fatalf("expected reasoning payload, got %#v", seenRequest["reasoning"])
	}
	if reasoning["effort"] != "high" {
		t.Fatalf("expected reasoning.effort=high, got %#v", reasoning)
	}
	if reasoning["summary"] != "auto" {
		t.Fatalf("expected reasoning.summary=auto, got %#v", reasoning)
	}
	if seenRequest["instructions"] != "System prompt" {
		t.Fatalf("expected responses instructions, got %#v", seenRequest["instructions"])
	}
	if seenRequest["store"] != false {
		t.Fatalf("expected responses store=false, got %#v", seenRequest["store"])
	}
	includes, ok := seenRequest["include"].([]any)
	if !ok || len(includes) != 1 || includes[0] != "reasoning.encrypted_content" {
		t.Fatalf("expected encrypted reasoning include, got %#v", seenRequest["include"])
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", result.Outputs["usage"])
	}
	if int(usage["reasoning_output_tokens"].(float64)) != 2 {
		t.Fatalf("expected reasoning output tokens in usage, got %#v", usage)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block, got %#v", content[0])
	}
	if thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected OpenAI reasoning block %#v", thinkingBlock)
	}
	if thinkingBlock["signature"] != "enc-thinking" {
		t.Fatalf("expected OpenAI reasoning signature, got %#v", thinkingBlock)
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}
	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected completed response fallback to preserve full live assistant content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected completed response fallback to preserve full live reasoning content, got %#v", state)
	}
	if stateThinkingBlock["signature"] != "enc-thinking" {
		t.Fatalf("expected completed response fallback to preserve encrypted reasoning signature, got %#v", stateThinkingBlock)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Final answer" {
		t.Fatalf("expected completed response fallback to preserve full live assistant text, got %#v", state)
	}
	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected completed fallback summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, " deeply", nil) == nil {
		t.Fatalf("expected completed fallback thinking delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingSignatureDelta(broadcastMessages, 0, "enc-thinking") == nil {
		t.Fatalf("expected completed fallback signature delta in %#v", broadcastMessages)
	}
	if findBroadcastTextDelta(broadcastMessages, 1, " answer") == nil {
		t.Fatalf("expected completed fallback text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 10 {
		t.Fatalf("expected start, seven delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteEmitsOpenAIResponsesOutputItemAddedContentDeltas(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseReasoningItemAddedWithContentEvent(0, "reasoning-1", "Plan summary", "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputMessageAddedEvent("message-1", 1, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2))
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
		t.Fatalf("execute managed llm output_item.added request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected output_item.added summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, "Planning deeply", nil) == nil {
		t.Fatalf("expected output_item.added thinking delta in %#v", broadcastMessages)
	}
	if findBroadcastTextDelta(broadcastMessages, 1, "Final answer") == nil {
		t.Fatalf("expected output_item.added text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 6 {
		t.Fatalf("expected start, three delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesDoneEventsAsAuthoritativeContent(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDoneEvent("reasoning-1", 0, 0, "Plan summary"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningTextDoneEvent("reasoning-1", 0, 0, "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Final"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputTextDoneEvent("message-1", 1, 0, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2))
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
		t.Fatalf("execute managed llm done-event request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live done-event content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live thinking block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Final answer" {
		t.Fatalf("expected finalized live text block, got %#v", state)
	}
	if broadcaster.Count() != 9 {
		t.Fatalf("expected start, six delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesRefusalDoneAsAuthoritativeText(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseRefusalDeltaEvent("message-1", 0, 0, "Cannot"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseRefusalDoneEvent("message-1", 0, 0, "Cannot comply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 0))
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
		t.Fatalf("execute managed llm refusal request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok || assistantText(assistant) != "Cannot comply" {
		t.Fatalf("unexpected refusal assistant message %#v", messages[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Cannot comply" {
		t.Fatalf("expected finalized live refusal text, got %#v", state)
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, two delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesContentPartDoneAsAuthoritativeContent(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDoneEvent("reasoning-1", 0, 0, "Plan summary"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartDoneReasoningTextEvent("reasoning-1", 0, 0, "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Final"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartDoneOutputTextEvent("message-1", 1, 0, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2))
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
		t.Fatalf("execute managed llm content-part-done request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live content-part-done content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live thinking block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Final answer" {
		t.Fatalf("expected finalized live text block, got %#v", state)
	}
	if broadcaster.Count() != 9 {
		t.Fatalf("expected start, six delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesContentPartDoneAsAuthoritativeRefusal(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseRefusalDeltaEvent("message-1", 0, 0, "Cannot"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartDoneRefusalEvent("message-1", 0, 0, "Cannot comply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 0))
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
		t.Fatalf("execute managed llm content-part-done refusal request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok || assistantText(assistant) != "Cannot comply" {
		t.Fatalf("unexpected refusal assistant message %#v", messages[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Cannot comply" {
		t.Fatalf("expected finalized live refusal text, got %#v", state)
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, two delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesSummaryPartAndContentPartAddedEvents(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryPartAddedEvent("reasoning-1", 0, 1, "Second step"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryPartAddedEvent("reasoning-1", 0, 0, "First step"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartAddedReasoningTextEvent("reasoning-1", 0, 0, "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartAddedOutputTextEvent("message-1", 1, 0, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2))
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
		t.Fatalf("execute managed llm summary-part/content-part-added request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "First step\nSecond step" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live summary-part/content-part-added content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "First step\nSecond step" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live thinking block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Final answer" {
		t.Fatalf("expected finalized live text block, got %#v", state)
	}
	if broadcaster.Count() != 7 {
		t.Fatalf("expected start, four delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesSummaryPartDoneAndContentPartAddedBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryPartDoneEvent("reasoning-1", 0, 1, "Second step"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryPartDoneEvent("reasoning-1", 0, 0, "First step"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartAddedReasoningTextEvent("reasoning-1", 0, 0, "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartAddedOutputTextEvent("message-1", 1, 0, "Partial answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
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
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "First step\nSecond step" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Partial answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live summary-part/content-part-added failure content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "First step\nSecond step" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live thinking block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Partial answer" {
		t.Fatalf("expected finalized live text block, got %#v", state)
	}
	if broadcaster.Count() != 7 {
		t.Fatalf("expected start, four delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteTreatsOpenAIResponsesIncompleteEventAsProviderFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 0, 0, "Partial answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
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
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
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
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	if assistantText(assistant) != "Partial answer" {
		t.Fatalf("expected partial assistant text to be preserved, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Partial answer" {
		t.Fatalf("expected finalized live partial assistant message, got %#v", state)
	}
	if broadcaster.Count() != 4 {
		t.Fatalf("expected start, delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecutePreservesOpenAIResponsesEarlyTextWhenReasoningArrivesLaterBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Partial answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
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
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
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
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking and text blocks after late reasoning, got %#v", assistant)
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan" {
		t.Fatalf("expected preserved reasoning summary block, got %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Partial answer" {
		t.Fatalf("expected preserved early text block, got %#v", content[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live thinking and text blocks, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan" {
		t.Fatalf("expected finalized live reasoning summary, got %#v", stateContent[0])
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Partial answer" {
		t.Fatalf("expected finalized live early text block, got %#v", stateContent[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, text delta, reasoning delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteFlushesBufferedOpenAIResponsesTextWhenReasoningNeverMaterializesBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Partial"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, " answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
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
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
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
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	if assistantText(assistant) != "Partial answer" {
		t.Fatalf("expected buffered text to be flushed into the final assistant message, got %#v", assistant)
	}
	if hasMessageThinking(assistant) {
		t.Fatalf("expected empty reasoning placeholder to be compacted away, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Partial answer" {
		t.Fatalf("expected finalized live flushed text message, got %#v", state)
	}
	if hasMessageThinking(state.Messages[1]) {
		t.Fatalf("expected finalized live message to drop empty thinking placeholder, got %#v", state.Messages[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, first text delta, flushed text delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesOutputItemDoneBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 0, 0, "Recovered"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputMessageDoneEvent("message-1", 0, "Recovered final item"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
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
		SectionID:       testStringPtr("section-chat"),
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	if assistantText(assistant) != "Recovered final item" {
		t.Fatalf("expected output_item.done text to be preserved, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Recovered final item" {
		t.Fatalf("expected finalized live output_item.done assistant message, got %#v", state)
	}
	broadcastMessages := broadcaster.Messages()
	if findBroadcastTextDelta(broadcastMessages, 0, " final item") == nil {
		t.Fatalf("expected output_item.done text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, two text deltas, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesReasoningItemDoneBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningItemDoneEvent(
			0,
			"reasoning-1",
			"Plan summary",
			"Planning deeply",
		))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
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
		SectionID:       testStringPtr("section-chat"),
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	assistantContent, ok := assistant["content"].([]any)
	if !ok || len(assistantContent) != 1 {
		t.Fatalf("expected one recovered thinking block, got %#v", assistant)
	}
	thinkingBlock, ok := assistantContent[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected recovered authoritative reasoning block, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 1 {
		t.Fatalf("expected finalized live reasoning block, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live authoritative reasoning block, got %#v", state)
	}
	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected reasoning item done summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, " deeply", nil) == nil {
		t.Fatalf("expected reasoning item done thinking delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 7 {
		t.Fatalf("expected start, four thinking deltas, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesIncompletePayloadContentBeforeFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseIncompleteEventWithOutput(
			"max_output_tokens",
			[]map[string]any{
				{
					"type":    "reasoning",
					"id":      "reasoning-1",
					"summary": []map[string]any{{"text": "Plan summary"}},
					"content": []map[string]any{{"type": "reasoning_text", "text": "Planning deeply"}},
					"status":  "incomplete",
				},
				{
					"type":    "message",
					"id":      "message-1",
					"role":    "assistant",
					"status":  "incomplete",
					"content": []map[string]any{{"type": "output_text", "text": "Recovered final answer", "annotations": []any{}}},
				},
			},
			2,
		))
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
		SectionID:       testStringPtr("section-chat"),
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	assistantContent, ok := assistant["content"].([]any)
	if !ok || len(assistantContent) != 2 {
		t.Fatalf("expected recovered thinking plus text blocks, got %#v", assistant)
	}
	thinkingBlock, ok := assistantContent[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected recovered authoritative reasoning block, got %#v", assistant)
	}
	textBlock, ok := assistantContent[1].(map[string]any)
	if !ok || textBlock["text"] != "Recovered final answer" {
		t.Fatalf("expected recovered authoritative text block, got %#v", assistant)
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload on incomplete response, got %#v", result.Outputs["usage"])
	}
	if int(usage["reasoning_output_tokens"].(float64)) != 2 {
		t.Fatalf("unexpected incomplete response usage payload %#v", usage)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live recovered content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live recovered reasoning block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Recovered final answer" {
		t.Fatalf("expected finalized live recovered text block, got %#v", state)
	}

	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected incomplete payload summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, "Planning deeply", nil) == nil {
		t.Fatalf("expected incomplete payload thinking delta in %#v", broadcastMessages)
	}
	if findBroadcastTextDelta(broadcastMessages, 1, "Recovered final answer") == nil {
		t.Fatalf("expected incomplete payload text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 6 {
		t.Fatalf("expected start, recovered deltas, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesFailedPayloadContentBeforeFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseFailedEventWithOutput(
			"upstream execution failed",
			[]map[string]any{
				{
					"type":    "reasoning",
					"id":      "reasoning-1",
					"summary": []map[string]any{{"text": "Plan summary"}},
					"content": []map[string]any{{"type": "reasoning_text", "text": "Planning deeply"}},
					"status":  "failed",
				},
				{
					"type":    "message",
					"id":      "message-1",
					"role":    "assistant",
					"status":  "failed",
					"content": []map[string]any{{"type": "output_text", "text": "Recovered failed answer", "annotations": []any{}}},
				},
			},
			2,
		))
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
		SectionID:       testStringPtr("section-chat"),
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from failed response")
	}
	if err.Error() != "managed llm provider request failed: upstream execution failed" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	assistantContent, ok := assistant["content"].([]any)
	if !ok || len(assistantContent) != 2 {
		t.Fatalf("expected recovered thinking plus text blocks, got %#v", assistant)
	}
	thinkingBlock, ok := assistantContent[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected recovered authoritative reasoning block, got %#v", assistant)
	}
	textBlock, ok := assistantContent[1].(map[string]any)
	if !ok || textBlock["text"] != "Recovered failed answer" {
		t.Fatalf("expected recovered authoritative text block, got %#v", assistant)
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload on failed response, got %#v", result.Outputs["usage"])
	}
	if int(usage["reasoning_output_tokens"].(float64)) != 2 {
		t.Fatalf("unexpected failed response usage payload %#v", usage)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live recovered content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live recovered reasoning block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Recovered failed answer" {
		t.Fatalf("expected finalized live recovered text block, got %#v", state)
	}

	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected failed payload summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, "Planning deeply", nil) == nil {
		t.Fatalf("expected failed payload thinking delta in %#v", broadcastMessages)
	}
	if findBroadcastTextDelta(broadcastMessages, 1, "Recovered failed answer") == nil {
		t.Fatalf("expected failed payload text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 6 {
		t.Fatalf("expected start, recovered deltas, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRunsOpenAIResponsesToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 2)
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
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
			fmt.Fprint(w, openAIResponseReasoningItemAddedWithContentEvent(0, "reasoning-1", "Plan summary", "Planning deeply"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseFunctionCallItemAddedEvent(1, "function-item-1", "tool-call-1", "setta__create_top_level_section"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseFunctionCallArgumentsDeltaEvent("function-item-1", 1, `{"projectConfigId":"project-alpha","implType":"Dict"}`))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":              "reasoning",
						"id":                "reasoning-1",
						"summary":           []map[string]any{{"text": "Plan summary"}},
						"content":           []map[string]any{{"type": "reasoning_text", "text": "Planning deeply"}},
						"encrypted_content": "enc-tool-turn",
						"status":            "completed",
					},
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__create_top_level_section",
						"arguments": `{"projectConfigId":"project-alpha","implType":"Dict"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				1,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Tool loop complete"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":    "message",
						"id":      "message-2",
						"role":    "assistant",
						"status":  "completed",
						"content": []map[string]any{{"type": "output_text", "text": "Tool loop complete", "annotations": []any{}}},
					},
				},
				15,
				3,
				18,
				1,
			))
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
				StructuredContent: map[string]any{"sectionId": "section-created"},
				Text:              "{\"sectionId\":\"section-created\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
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
		t.Fatalf("execute managed OpenAI Responses tool stream: %v", err)
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
		t.Fatalf("expected two OpenAI responses requests, got %d", len(requestBodies))
	}
	firstTools, ok := requestBodies[0]["tools"].([]any)
	if !ok || len(firstTools) != 1 {
		t.Fatalf("expected one OpenAI function tool, got %#v", requestBodies[0]["tools"])
	}
	secondInput, ok := requestBodies[1]["input"].([]any)
	if !ok || len(secondInput) < 3 {
		t.Fatalf("expected follow-up Responses transcript input, got %#v", requestBodies[1]["input"])
	}
	foundReasoning := false
	foundFunctionCall := false
	foundFunctionResult := false
	for _, rawItem := range secondInput {
		item, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		if item["type"] == "reasoning" && item["encrypted_content"] == "enc-tool-turn" {
			foundReasoning = true
		}
		if item["type"] == "function_call" && item["call_id"] == "tool-call-1" {
			foundFunctionCall = true
		}
		if item["type"] == "function_call_output" && item["call_id"] == "tool-call-1" {
			foundFunctionResult = true
		}
	}
	if !foundReasoning || !foundFunctionCall || !foundFunctionResult {
		t.Fatalf("expected follow-up Responses input with reasoning, function call, and result, got %#v", secondInput)
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
}

func TestExecutorExecuteRecoversOpenAIResponsesToolCallsFromCompletedFallback(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 2)
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
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
			// Some Responses turns may only surface the final function_call item in response.completed.
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__create_top_level_section",
						"arguments": `{"projectConfigId":"project-alpha","implType":"Dict"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				1,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Recovered tool call"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":    "message",
						"id":      "message-2",
						"role":    "assistant",
						"status":  "completed",
						"content": []map[string]any{{"type": "output_text", "text": "Recovered tool call", "annotations": []any{}}},
					},
				},
				15,
				3,
				18,
				1,
			))
			flusher.Flush()
		default:
			t.Fatalf("unexpected provider request count %d", requestCount)
		}
		requestCount++
	}))
	defer server.Close()

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
			},
		},
		call: func(_ context.Context, namespacedToolName string, arguments map[string]any, _ map[string]any) (mcpx.ToolCallResult, error) {
			if namespacedToolName != "setta__create_top_level_section" {
				t.Fatalf("unexpected tool name %q", namespacedToolName)
			}
			if arguments["projectConfigId"] != "project-alpha" || arguments["implType"] != "Dict" {
				t.Fatalf("unexpected tool arguments %#v", arguments)
			}
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"sectionId": "section-created"},
				Text:              "{\"sectionId\":\"section-created\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
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
		t.Fatalf("execute managed OpenAI Responses completed-fallback tool stream: %v", err)
	}

	if len(requestBodies) != 2 {
		t.Fatalf("expected two OpenAI responses requests, got %d", len(requestBodies))
	}
	secondInput, ok := requestBodies[1]["input"].([]any)
	if !ok || len(secondInput) < 3 {
		t.Fatalf("expected follow-up Responses transcript input, got %#v", requestBodies[1]["input"])
	}
	foundFunctionCall := false
	foundFunctionResult := false
	for _, rawItem := range secondInput {
		item, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		if item["type"] == "function_call" && item["call_id"] == "tool-call-1" {
			foundFunctionCall = true
		}
		if item["type"] == "function_call_output" && item["call_id"] == "tool-call-1" {
			foundFunctionResult = true
		}
	}
	if !foundFunctionCall || !foundFunctionResult {
		t.Fatalf("expected recovered function call and result in follow-up input, got %#v", secondInput)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	if assistantText(messages[3].(map[string]any)) != "Recovered tool call" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
}

func TestExecutorExecuteEmitsOpenAIResponsesToolPreviewFromCompletedFallback(t *testing.T) {
	t.Parallel()

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__stream_app_definition",
						"arguments": `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				0,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Preview applied"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 1, 9, 0))
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
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
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
		Thinking:        true,
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
		t.Fatalf("execute managed OpenAI Responses completed-fallback tool preview stream: %v", err)
	}

	var toolDeltaEvent *realtime.ToolCallDeltaEvent
	var previewEvent *realtime.ToolArgumentPreviewDeltaEvent
	for _, message := range broadcaster.Messages() {
		switch chunk := message.Content.Chunk.(type) {
		case realtime.ToolCallDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				toolDeltaEvent = &copied
			}
		case realtime.ToolArgumentPreviewDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				previewEvent = &copied
			}
		}
	}
	if toolDeltaEvent == nil {
		t.Fatalf("expected tool call delta event in %#v", broadcaster.Messages())
	}
	if toolDeltaEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected tool delta event %#v", toolDeltaEvent)
	}
	if toolDeltaEvent.ToolName == nil || *toolDeltaEvent.ToolName != "setta__stream_app_definition" {
		t.Fatalf("unexpected tool delta tool name %#v", toolDeltaEvent)
	}
	if previewEvent == nil {
		t.Fatalf("expected tool preview event in %#v", broadcaster.Messages())
	}
	if previewEvent.PreviewKind != string(tools.PreviewKindAppSpecPatch) {
		t.Fatalf("unexpected preview kind %#v", previewEvent)
	}
	if previewEvent.PreviewValueDelta != "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n" {
		t.Fatalf("unexpected preview delta %#v", previewEvent)
	}
	if previewEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected preview arguments delta %#v", previewEvent)
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if assistantText(messages[3].(map[string]any)) != "Preview applied" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
}

func TestExecutorExecuteEmitsOpenAIResponsesToolPreviewFromArgumentsDoneEvent(t *testing.T) {
	t.Parallel()

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, openAIResponseFunctionCallItemAddedEvent(0, "function-item-1", "tool-call-1", "setta__stream_app_definition"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseFunctionCallArgumentsDoneEvent(
				"function-item-1",
				0,
				"setta__stream_app_definition",
				`{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
			))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__stream_app_definition",
						"arguments": `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				1,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Preview applied"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":    "message",
						"id":      "message-2",
						"role":    "assistant",
						"status":  "completed",
						"content": []map[string]any{{"type": "output_text", "text": "Preview applied", "annotations": []any{}}},
					},
				},
				15,
				3,
				18,
				1,
			))
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
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
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
		Thinking:        true,
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
		t.Fatalf("execute managed OpenAI Responses tool preview stream: %v", err)
	}

	var toolDeltaEvent *realtime.ToolCallDeltaEvent
	var previewEvent *realtime.ToolArgumentPreviewDeltaEvent
	for _, message := range broadcaster.Messages() {
		switch chunk := message.Content.Chunk.(type) {
		case realtime.ToolCallDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				toolDeltaEvent = &copied
			}
		case realtime.ToolArgumentPreviewDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				previewEvent = &copied
			}
		}
	}
	if toolDeltaEvent == nil {
		t.Fatalf("expected tool call delta event in %#v", broadcaster.Messages())
	}
	if toolDeltaEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected tool delta event %#v", toolDeltaEvent)
	}
	if toolDeltaEvent.ToolName == nil || *toolDeltaEvent.ToolName != "setta__stream_app_definition" {
		t.Fatalf("unexpected tool delta tool name %#v", toolDeltaEvent)
	}
	if previewEvent == nil {
		t.Fatalf("expected tool preview event in %#v", broadcaster.Messages())
	}
	if previewEvent.PreviewKind != string(tools.PreviewKindAppSpecPatch) {
		t.Fatalf("unexpected preview kind %#v", previewEvent)
	}
	if previewEvent.PreviewValueDelta != "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n" {
		t.Fatalf("unexpected preview delta %#v", previewEvent)
	}
	if previewEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected preview arguments delta %#v", previewEvent)
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if assistantText(messages[3].(map[string]any)) != "Preview applied" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
}

func TestExecutorExecuteEmitsOpenAIResponsesToolPreviewFromFunctionCallItemDoneEvent(t *testing.T) {
	t.Parallel()

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, openAIResponseFunctionCallItemDoneEvent(
				0,
				"function-item-1",
				"tool-call-1",
				"setta__stream_app_definition",
				`{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
			))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__stream_app_definition",
						"arguments": `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				0,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Preview applied"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 1, 9, 0))
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
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
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
		Thinking:        true,
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
		t.Fatalf("execute managed OpenAI Responses output_item.done tool preview stream: %v", err)
	}

	var toolDeltaEvent *realtime.ToolCallDeltaEvent
	var previewEvent *realtime.ToolArgumentPreviewDeltaEvent
	for _, message := range broadcaster.Messages() {
		switch chunk := message.Content.Chunk.(type) {
		case realtime.ToolCallDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				toolDeltaEvent = &copied
			}
		case realtime.ToolArgumentPreviewDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				previewEvent = &copied
			}
		}
	}
	if toolDeltaEvent == nil {
		t.Fatalf("expected tool call delta event in %#v", broadcaster.Messages())
	}
	if toolDeltaEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected tool delta event %#v", toolDeltaEvent)
	}
	if toolDeltaEvent.ToolName == nil || *toolDeltaEvent.ToolName != "setta__stream_app_definition" {
		t.Fatalf("unexpected tool delta tool name %#v", toolDeltaEvent)
	}
	if previewEvent == nil {
		t.Fatalf("expected tool preview event in %#v", broadcaster.Messages())
	}
	if previewEvent.PreviewKind != string(tools.PreviewKindAppSpecPatch) {
		t.Fatalf("unexpected preview kind %#v", previewEvent)
	}
	if previewEvent.PreviewValueDelta != "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n" {
		t.Fatalf("unexpected preview delta %#v", previewEvent)
	}
	if previewEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected preview arguments delta %#v", previewEvent)
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if assistantText(messages[3].(map[string]any)) != "Preview applied" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
}

func TestExecutorExecutePreservesCompletedOpenAIResponsesToolCallBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
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
		fmt.Fprint(w, openAIResponseFunctionCallItemDoneEvent(0, "function-item-1", "tool-call-1", "setta__create_top_level_section", `{"projectConfigId":"project-alpha","implType":"Dict"}`))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
		flusher.Flush()
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

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
			},
		},
		call: func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error) {
			t.Fatal("tool execution should not run after provider failure")
			return mcpx.ToolCallResult{}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
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
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	if len(requestBodies) != 1 {
		t.Fatalf("expected only the failing Responses request, got %d", len(requestBodies))
	}
	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	preservedToolCalls := assistantToolCalls(assistant)
	if len(preservedToolCalls) != 1 {
		t.Fatalf("expected one preserved assistant tool call, got %#v", assistant["tool_calls"])
	}
	if preservedToolCalls[0]["id"] != "tool-call-1" {
		t.Fatalf("unexpected preserved tool call %#v", preservedToolCalls[0])
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one preserved result tool call, got %#v", result.ToolCalls)
	}
	if result.ToolCalls[0]["id"] != "tool-call-1" {
		t.Fatalf("unexpected preserved result tool call %#v", result.ToolCalls[0])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	if len(state.Messages) != 2 {
		t.Fatalf("expected finalized live assistant message, got %#v", state)
	}
	stateAssistantToolCalls := assistantToolCalls(state.Messages[1])
	if len(stateAssistantToolCalls) != 1 || stateAssistantToolCalls[0]["id"] != "tool-call-1" {
		t.Fatalf("expected finalized live preserved tool call, got %#v", state.Messages[1])
	}
	foundToolDelta := false
	for _, message := range broadcaster.Messages() {
		chunk, ok := message.Content.Chunk.(realtime.ToolCallDeltaEvent)
		if !ok {
			continue
		}
		if chunk.ToolCallID == "tool-call-1" && chunk.ArgumentsDelta == `{"projectConfigId":"project-alpha","implType":"Dict"}` {
			foundToolDelta = true
		}
	}
	if !foundToolDelta {
		t.Fatalf("expected live tool delta event in %#v", broadcaster.Messages())
	}
	if broadcaster.Count() != 4 {
		t.Fatalf("expected start, tool delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteStreamsAnthropicThinkingBlocksAndReturnsOutputs(t *testing.T) {
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
		fmt.Fprint(w, anthropicMessageStartEvent("msg-thinking", "claude-sonnet-4-5-20250929", 12, 0))
		flusher.Flush()
		fmt.Fprint(w, anthropicThinkingBlockStartEvent(0, "Planning"))
		flusher.Flush()
		fmt.Fprint(w, anthropicThinkingDeltaEvent(0, " deeply"))
		flusher.Flush()
		fmt.Fprint(w, anthropicSignatureDeltaEvent(0, "sig-thinking"))
		flusher.Flush()
		fmt.Fprint(w, anthropicContentBlockStopEvent(0))
		flusher.Flush()
		fmt.Fprint(w, anthropicTextBlockStartEvent(1))
		flusher.Flush()
		fmt.Fprint(w, anthropicTextDeltaEvent(1, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, anthropicContentBlockStopEvent(1))
		flusher.Flush()
		fmt.Fprint(w, anthropicMessageDeltaEvent("end_turn", 12, 3))
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
			ID:       "primary",
			Model:    "claude-sonnet-4-5-20250929",
			Provider: "anthropic",
			BaseURL:  server.URL,
			OtherParams: map[string]any{
				"max_tokens": 4096,
				"thinking": map[string]any{
					"type":          "enabled",
					"budget_tokens": 1024,
				},
			},
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		RequestParams: map[string]any{
			"max_tokens": 4096,
			"thinking": map[string]any{
				"type":          "enabled",
				"budget_tokens": 1024,
			},
		},
		APIKeys: map[string]string{
			"ANTHROPIC_API_KEY": "secret",
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
						map[string]any{"type": "text", "text": "Think through this"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed anthropic thinking stream: %v", err)
	}

	thinkingConfig, ok := seenRequest["thinking"].(map[string]any)
	if !ok || thinkingConfig["type"] != "enabled" || thinkingConfig["budget_tokens"] != float64(1024) {
		t.Fatalf("expected anthropic thinking request config, got %#v", seenRequest["thinking"])
	}
	if seenRequest["max_tokens"] != float64(4096) {
		t.Fatalf("expected anthropic max_tokens override, got %#v", seenRequest["max_tokens"])
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block at content[0], got %#v", content[0])
	}
	if thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking content %#v", thinkingBlock)
	}
	if thinkingBlock["signature"] != "sig-thinking" {
		t.Fatalf("unexpected thinking signature %#v", thinkingBlock)
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}
	if broadcaster.Count() != 7 {
		t.Fatalf("expected 7 streaming broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteStreamsGeminiThinkingBlocksAndReturnsOutputs(t *testing.T) {
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
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Planning\",\"thought\":true,\"thoughtSignature\":\"c2ln\"}]}}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Final answer\"}]}}],\"usageMetadata\":{\"promptTokenCount\":12,\"candidatesTokenCount\":3,\"totalTokenCount\":15,\"thoughtsTokenCount\":2}}\n\n")
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
			ID:       "primary",
			Model:    "gemini-2.5-pro",
			Provider: "gemini",
			BaseURL:  server.URL,
			OtherParams: map[string]any{
				"thinking_config": map[string]any{
					"thinking_budget": 128,
					"thinking_level":  "medium",
				},
			},
			APIKeyEnv: "GEMINI_API_KEY",
		},
		RequestParams: map[string]any{
			"thinking_config": map[string]any{
				"thinking_budget": 128,
				"thinking_level":  "medium",
			},
		},
		APIKeys: map[string]string{
			"GEMINI_API_KEY": "secret",
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
						map[string]any{"type": "text", "text": "Think through this"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed gemini thinking stream: %v", err)
	}

	generationConfig, ok := seenRequest["generationConfig"].(map[string]any)
	if !ok {
		t.Fatalf("expected generationConfig payload, got %#v", seenRequest["generationConfig"])
	}
	thinkingConfig, ok := generationConfig["thinkingConfig"].(map[string]any)
	if !ok {
		t.Fatalf("expected gemini thinkingConfig, got %#v", generationConfig["thinkingConfig"])
	}
	if thinkingConfig["includeThoughts"] != true {
		t.Fatalf("expected includeThoughts=true, got %#v", thinkingConfig)
	}
	if thinkingConfig["thinkingBudget"] != float64(128) {
		t.Fatalf("expected gemini thinkingBudget=128, got %#v", thinkingConfig)
	}
	if thinkingConfig["thinkingLevel"] != "MEDIUM" {
		t.Fatalf("expected gemini thinkingLevel=MEDIUM, got %#v", thinkingConfig)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block at content[0], got %#v", content[0])
	}
	if thinkingBlock["thinking"] != "Planning" {
		t.Fatalf("unexpected thinking content %#v", thinkingBlock)
	}
	if thinkingBlock["signature"] != "c2ln" {
		t.Fatalf("unexpected thinking signature %#v", thinkingBlock)
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok || int(usage["reasoning_output_tokens"].(float64)) != 2 {
		t.Fatalf("unexpected usage payload %#v", result.Outputs["usage"])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected 5 streaming broadcasts, got %d", broadcaster.Count())
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

func openAIResponseReasoningItemAddedEvent(outputIndex int, itemID string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.added",
		"sequence_number": 1,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":    "reasoning",
			"id":      itemID,
			"summary": []any{},
			"content": []any{},
			"status":  "in_progress",
		},
	})
}

func openAIResponseReasoningItemAddedWithContentEvent(outputIndex int, itemID string, summary string, reasoning string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.added",
		"sequence_number": 1,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":   "reasoning",
			"id":     itemID,
			"status": "in_progress",
			"summary": []any{
				map[string]any{"text": summary},
			},
			"content": []any{
				map[string]any{"type": "reasoning_text", "text": reasoning},
			},
		},
	})
}

func openAIResponseReasoningSummaryPartAddedEvent(itemID string, outputIndex int, summaryIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_summary_part.added",
		"sequence_number": 2,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"summary_index":   summaryIndex,
		"part": map[string]any{
			"type": "summary_text",
			"text": text,
		},
	})
}

func openAIResponseReasoningSummaryPartDoneEvent(itemID string, outputIndex int, summaryIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_summary_part.done",
		"sequence_number": 3,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"summary_index":   summaryIndex,
		"part": map[string]any{
			"type": "summary_text",
			"text": text,
		},
	})
}

func openAIResponseReasoningSummaryTextDeltaEvent(itemID string, outputIndex int, summaryIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_summary_text.delta",
		"sequence_number": 2,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"summary_index":   summaryIndex,
		"delta":           delta,
	})
}

func openAIResponseReasoningSummaryTextDoneEvent(itemID string, outputIndex int, summaryIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_summary_text.done",
		"sequence_number": 3,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"summary_index":   summaryIndex,
		"text":            text,
	})
}

func openAIResponseReasoningTextDeltaEvent(itemID string, outputIndex int, contentIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_text.delta",
		"sequence_number": 3,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"delta":           delta,
	})
}

func openAIResponseReasoningTextDoneEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_text.done",
		"sequence_number": 4,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"text":            text,
	})
}

func openAIResponseContentPartDoneReasoningTextEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.done",
		"sequence_number": 4,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type": "reasoning_text",
			"text": text,
		},
	})
}

func openAIResponseContentPartAddedReasoningTextEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.added",
		"sequence_number": 4,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type": "reasoning_text",
			"text": text,
		},
	})
}

func openAIResponseReasoningItemDoneEvent(outputIndex int, itemID string, summary string, reasoning string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.done",
		"sequence_number": 4,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":   "reasoning",
			"id":     itemID,
			"status": "completed",
			"summary": []any{
				map[string]any{"text": summary},
			},
			"content": []any{
				map[string]any{"type": "reasoning_text", "text": reasoning},
			},
		},
	})
}

func openAIResponseOutputTextDoneEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_text.done",
		"sequence_number": 5,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"text":            text,
		"logprobs":        []any{},
	})
}

func openAIResponseContentPartDoneOutputTextEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.done",
		"sequence_number": 5,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type":        "output_text",
			"text":        text,
			"annotations": []any{},
			"logprobs":    []any{},
		},
	})
}

func openAIResponseContentPartAddedOutputTextEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.added",
		"sequence_number": 5,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type":        "output_text",
			"text":        text,
			"annotations": []any{},
			"logprobs":    []any{},
		},
	})
}

func openAIResponseOutputTextDeltaEvent(itemID string, outputIndex int, contentIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_text.delta",
		"sequence_number": 4,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"delta":           delta,
		"logprobs":        []any{},
	})
}

func openAIResponseRefusalDeltaEvent(itemID string, outputIndex int, contentIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.refusal.delta",
		"sequence_number": 6,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"delta":           delta,
	})
}

func openAIResponseContentPartDoneRefusalEvent(itemID string, outputIndex int, contentIndex int, refusal string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.done",
		"sequence_number": 7,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type":    "refusal",
			"refusal": refusal,
		},
	})
}

func openAIResponseRefusalDoneEvent(itemID string, outputIndex int, contentIndex int, refusal string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.refusal.done",
		"sequence_number": 7,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"refusal":         refusal,
	})
}

func openAIResponseOutputMessageDoneEvent(itemID string, outputIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.done",
		"sequence_number": 5,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":   "message",
			"id":     itemID,
			"role":   "assistant",
			"status": "incomplete",
			"content": []any{
				map[string]any{
					"type":        "output_text",
					"text":        text,
					"annotations": []any{},
				},
			},
		},
	})
}

func openAIResponseOutputMessageAddedEvent(itemID string, outputIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.added",
		"sequence_number": 5,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":   "message",
			"id":     itemID,
			"role":   "assistant",
			"status": "in_progress",
			"content": []any{
				map[string]any{
					"type":        "output_text",
					"text":        text,
					"annotations": []any{},
				},
			},
		},
	})
}

func openAIResponseFunctionCallItemAddedEvent(outputIndex int, itemID string, callID string, name string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.added",
		"sequence_number": 1,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":      "function_call",
			"id":        itemID,
			"call_id":   callID,
			"name":      name,
			"arguments": "",
			"status":    "in_progress",
		},
	})
}

func openAIResponseFunctionCallItemDoneEvent(outputIndex int, itemID string, callID string, name string, arguments string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.done",
		"sequence_number": 2,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":      "function_call",
			"id":        itemID,
			"call_id":   callID,
			"name":      name,
			"arguments": arguments,
			"status":    "completed",
		},
	})
}

func openAIResponseFunctionCallArgumentsDoneEvent(itemID string, outputIndex int, name string, arguments string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.function_call_arguments.done",
		"sequence_number": 3,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"name":            name,
		"arguments":       arguments,
	})
}

func openAIResponseFunctionCallArgumentsDeltaEvent(itemID string, outputIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.function_call_arguments.delta",
		"sequence_number": 2,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"delta":           delta,
	})
}

func openAIResponseCompletedEvent(output []map[string]any, inputTokens int, outputTokens int, totalTokens int, reasoningTokens int) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.completed",
		"sequence_number": 99,
		"response": map[string]any{
			"id":         "response-1",
			"object":     "response",
			"created_at": 1741567200,
			"status":     "completed",
			"model":      "gpt-5-codex",
			"output":     output,
			"usage": map[string]any{
				"input_tokens": inputTokens,
				"input_tokens_details": map[string]any{
					"cached_tokens": 0,
				},
				"output_tokens": outputTokens,
				"output_tokens_details": map[string]any{
					"reasoning_tokens": reasoningTokens,
				},
				"total_tokens": totalTokens,
			},
		},
	})
}

func openAIResponseIncompleteEvent(reason string) string {
	return openAIResponseIncompleteEventWithOutput(reason, nil, 0)
}

func openAIResponseIncompleteEventWithOutput(reason string, output []map[string]any, reasoningTokens int) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.incomplete",
		"sequence_number": 98,
		"response": map[string]any{
			"id":                 "response-1",
			"object":             "response",
			"created_at":         1741567200,
			"status":             "incomplete",
			"model":              "gpt-5-codex",
			"output":             output,
			"incomplete_details": map[string]any{"reason": reason},
			"usage": map[string]any{
				"input_tokens": 8,
				"input_tokens_details": map[string]any{
					"cached_tokens": 0,
				},
				"output_tokens": 1,
				"output_tokens_details": map[string]any{
					"reasoning_tokens": reasoningTokens,
				},
				"total_tokens": 9,
			},
		},
	})
}

func openAIResponseFailedEventWithOutput(message string, output []map[string]any, reasoningTokens int) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.failed",
		"sequence_number": 98,
		"response": map[string]any{
			"id":         "response-1",
			"object":     "response",
			"created_at": 1741567200,
			"status":     "failed",
			"model":      "gpt-5-codex",
			"output":     output,
			"error": map[string]any{
				"message": message,
			},
			"usage": map[string]any{
				"input_tokens": 8,
				"input_tokens_details": map[string]any{
					"cached_tokens": 0,
				},
				"output_tokens": 1,
				"output_tokens_details": map[string]any{
					"reasoning_tokens": reasoningTokens,
				},
				"total_tokens": 9,
			},
		},
	})
}

func openAIResponseEvent(payload map[string]any) string {
	encoded, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return "data: " + string(encoded) + "\n\n"
}

func anthropicMessageStartEvent(messageID string, model string, inputTokens int, outputTokens int) string {
	return fmt.Sprintf("event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":%q,\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":%q,\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":%d,\"output_tokens\":%d,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n", messageID, model, inputTokens, outputTokens)
}

func anthropicTextBlockStartEvent(index int) string {
	return fmt.Sprintf("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":%d,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n", index)
}

func anthropicThinkingBlockStartEvent(index int, thinking string) string {
	return fmt.Sprintf("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":%d,\"content_block\":{\"type\":\"thinking\",\"thinking\":%q}}\n\n", index, thinking)
}

func anthropicToolUseBlockStartEvent(index int, toolCallID string, toolName string) string {
	return fmt.Sprintf("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":%d,\"content_block\":{\"type\":\"tool_use\",\"id\":%q,\"name\":%q,\"input\":{}}}\n\n", index, toolCallID, toolName)
}

func anthropicTextDeltaEvent(index int, text string) string {
	return fmt.Sprintf("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":%d,\"delta\":{\"type\":\"text_delta\",\"text\":%q}}\n\n", index, text)
}

func anthropicThinkingDeltaEvent(index int, thinking string) string {
	return fmt.Sprintf("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":%d,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":%q}}\n\n", index, thinking)
}

func anthropicSignatureDeltaEvent(index int, signature string) string {
	return fmt.Sprintf("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":%d,\"delta\":{\"type\":\"signature_delta\",\"signature\":%q}}\n\n", index, signature)
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
