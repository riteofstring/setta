package managedllm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/tools"
)

type capturedManagedLLMToolCall struct {
	ToolName  string
	Arguments map[string]any
	Meta      map[string]any
}

type managedLLMToolLoopHarness struct {
	temporaryIDs     *mcpx.TemporaryIDStore
	createdSectionID string
	broadcaster      *captureBroadcaster
	live             *managedchat.LiveRuntime
	run              agentruns.Run
	capturedCalls    []capturedManagedLLMToolCall
	toolClient       *stubToolClient
}

func newManagedLLMToolLoopHarness(t *testing.T) *managedLLMToolLoopHarness {
	t.Helper()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	createdSectionID, err := temporaryIDs.EnsureTemporaryID("section-created")
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	harness := &managedLLMToolLoopHarness{
		temporaryIDs:     temporaryIDs,
		createdSectionID: createdSectionID,
		broadcaster:      broadcaster,
		live:             live,
		run:              run,
	}
	harness.toolClient = newCreateSectionToolClient(createdSectionID, &harness.capturedCalls)
	return harness
}

func (h *managedLLMToolLoopHarness) executor(client *http.Client) *Executor {
	return NewExecutor(ExecutorOptions{
		Live:       h.live,
		Tools:      h.toolClient,
		HTTPClient: client,
		ResultFollow: NewToolResultFollowEmitter(ToolResultFollowEmitterOptions{
			Broadcaster:  h.broadcaster,
			TemporaryIDs: h.temporaryIDs,
		}),
	})
}

func newCreateSectionToolClient(createdSectionID string, captured *[]capturedManagedLLMToolCall) *stubToolClient {
	return &stubToolClient{
		initTools: managedCompletionStatusInitTools(),
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
			*captured = append(*captured, capturedManagedLLMToolCall{
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
}

func newManagedLLMProviderEventServer(
	t *testing.T,
	requestBodies *[]map[string]any,
	eventsByRequest ...[]string,
) *httptest.Server {
	t.Helper()

	requestCount := 0
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		*requestBodies = append(*requestBodies, body)
		if requestCount >= len(eventsByRequest) {
			t.Fatalf("unexpected provider request count %d", requestCount)
		}
		flusher := managedLLMTestSSEFlusher(t, w)
		for _, event := range eventsByRequest[requestCount] {
			fmt.Fprint(w, event)
			flusher.Flush()
		}
		requestCount++
	}))
}

func managedLLMTestSSEFlusher(t *testing.T, w http.ResponseWriter) http.Flusher {
	t.Helper()

	w.Header().Set("Content-Type", "text/event-stream")
	flusher, ok := w.(http.Flusher)
	if !ok {
		t.Fatal("expected flusher")
	}
	return flusher
}

func assertCreateSectionToolCall(t *testing.T, capturedCalls []capturedManagedLLMToolCall) capturedManagedLLMToolCall {
	t.Helper()

	if len(capturedCalls) != 1 {
		t.Fatalf("expected one tool call, got %#v", capturedCalls)
	}
	call := capturedCalls[0]
	if call.ToolName != "setta__create_top_level_section" {
		t.Fatalf("unexpected tool name %#v", call)
	}
	if call.Arguments["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected tool arguments %#v", call.Arguments)
	}
	return call
}

func assertCreateSectionToolMeta(t *testing.T, call capturedManagedLLMToolCall) {
	t.Helper()

	if call.Meta["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected tool meta %#v", call.Meta)
	}
	if call.Meta["chatId"] != "chat-alpha" {
		t.Fatalf("unexpected tool meta %#v", call.Meta)
	}
	if call.Meta["allowUnscoped"] != true {
		t.Fatalf("unexpected tool meta %#v", call.Meta)
	}
}

func assertProviderRequestCount(t *testing.T, requestBodies []map[string]any, want int) {
	t.Helper()

	if len(requestBodies) != want {
		t.Fatalf("expected %d provider requests, got %d", want, len(requestBodies))
	}
}

func assertToolDefinitionsInclude(t *testing.T, rawTools any, wantLen int, names ...string) {
	t.Helper()

	toolsPayload, ok := rawTools.([]any)
	if !ok || len(toolsPayload) != wantLen {
		t.Fatalf("expected tool definitions including completion reporting, got %#v", rawTools)
	}
	for _, name := range names {
		if !toolPayloadIncludesName(toolsPayload, name) {
			t.Fatalf("expected tool payload to include %s, got %#v", name, toolsPayload)
		}
	}
}

func assertOutputMessagesWithFinalAssistant(
	t *testing.T,
	result agentruns.ExecutionResult,
	wantLen int,
	finalText string,
) []any {
	t.Helper()

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != wantLen {
		t.Fatalf("expected %d output messages, got %#v", wantLen, result.Outputs["messages"])
	}
	finalAssistant, ok := messages[wantLen-1].(map[string]any)
	if !ok || assistantText(finalAssistant) != finalText {
		t.Fatalf("unexpected final assistant %#v", messages[wantLen-1])
	}
	return messages
}

func assertSinglePersistedToolCall(t *testing.T, result agentruns.ExecutionResult) {
	t.Helper()

	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
}

func assertResultFollowSectionID(t *testing.T, broadcaster *captureBroadcaster) {
	t.Helper()

	followMessages := broadcaster.ResultFollowMessages()
	if len(followMessages) != 1 {
		t.Fatalf("expected one result-follow update, got %#v", followMessages)
	}
	if got := followMessages[0].Content.IDsByType["section"]; len(got) != 1 || got[0] != "section-created" {
		t.Fatalf("expected canonical section follow id, got %#v", followMessages[0].Content.IDsByType)
	}
}

func assertResultFollowScope(t *testing.T, broadcaster *captureBroadcaster) {
	t.Helper()

	followMessages := broadcaster.ResultFollowMessages()
	if len(followMessages) != 1 {
		t.Fatalf("expected one result-follow update, got %#v", followMessages)
	}
	if followMessages[0].Content.ProjectConfigID != "project-alpha" || followMessages[0].Content.ChatID != "chat-alpha" {
		t.Fatalf("unexpected result-follow message %#v", followMessages[0])
	}
}

func assertAnthropicFollowUpToolExchange(t *testing.T, rawMessages any) {
	t.Helper()

	messages, ok := rawMessages.([]any)
	if !ok || len(messages) < 3 {
		t.Fatalf("expected follow-up anthropic transcript, got %#v", rawMessages)
	}
	if !transcriptContainsBlock(messages, "assistant", "tool_use", "id", "tool-call-1") {
		t.Fatalf("expected anthropic follow-up transcript with tool_use, got %#v", messages)
	}
	if !transcriptContainsBlock(messages, "user", "tool_result", "tool_use_id", "tool-call-1") {
		t.Fatalf("expected anthropic follow-up transcript with tool_result, got %#v", messages)
	}
}

func transcriptContainsBlock(messages []any, role string, blockType string, key string, value string) bool {
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok || message["role"] != role {
			continue
		}
		content, _ := message["content"].([]any)
		for _, rawBlock := range content {
			block, _ := rawBlock.(map[string]any)
			if block["type"] == blockType && block[key] == value {
				return true
			}
		}
	}
	return false
}

func assertOpenAIFollowUpToolResult(t *testing.T, rawMessages any) {
	t.Helper()

	messages, ok := rawMessages.([]any)
	if !ok || len(messages) < 4 {
		t.Fatalf("expected follow-up provider transcript, got %#v", rawMessages)
	}
	foundToolMessage := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok || message["role"] != "tool" {
			continue
		}
		if message["tool_call_id"] != "tool-call-1" {
			t.Fatalf("unexpected tool follow-up message %#v", message)
		}
		foundToolMessage = true
	}
	if !foundToolMessage {
		t.Fatalf("expected provider follow-up to include tool result message, got %#v", messages)
	}
}

func assertAnthropicThinkingRequest(t *testing.T, seenRequest map[string]any) {
	t.Helper()

	thinkingConfig, ok := seenRequest["thinking"].(map[string]any)
	if !ok || thinkingConfig["type"] != "enabled" || thinkingConfig["budget_tokens"] != float64(1024) {
		t.Fatalf("expected anthropic thinking request config, got %#v", seenRequest["thinking"])
	}
	if seenRequest["max_tokens"] != float64(4096) {
		t.Fatalf("expected anthropic max_tokens override, got %#v", seenRequest["max_tokens"])
	}
}

func assertGeminiThinkingRequest(t *testing.T, seenRequest map[string]any) {
	t.Helper()

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
}

func assertThinkingAssistantOutput(
	t *testing.T,
	result agentruns.ExecutionResult,
	expectedThinking string,
	expectedSignature string,
	expectedText string,
) {
	t.Helper()

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
	assertThinkingContentBlocks(t, content, expectedThinking, expectedSignature, expectedText)
}

func assertThinkingContentBlocks(
	t *testing.T,
	content []any,
	expectedThinking string,
	expectedSignature string,
	expectedText string,
) {
	t.Helper()

	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block at content[0], got %#v", content[0])
	}
	if thinkingBlock["thinking"] != expectedThinking {
		t.Fatalf("unexpected thinking content %#v", thinkingBlock)
	}
	if thinkingBlock["signature"] != expectedSignature {
		t.Fatalf("unexpected thinking signature %#v", thinkingBlock)
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != expectedText {
		t.Fatalf("unexpected text block %#v", content[1])
	}
}

func assertReasoningUsageTokens(t *testing.T, result agentruns.ExecutionResult, want int) {
	t.Helper()

	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok || int(usage["reasoning_output_tokens"].(float64)) != want {
		t.Fatalf("unexpected usage payload %#v", result.Outputs["usage"])
	}
}
