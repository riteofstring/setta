package managedllm

import (
	"context"
	"net/http"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/realtime"
	"setta/internal/tools"
)

const (
	openAIResponsesPreviewArguments = `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`
	openAIResponsesPreviewValue     = "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"
)

type openAIResponsesLiveFixture struct {
	broadcaster *captureBroadcaster
	live        *managedchat.LiveRuntime
	run         agentruns.Run
}

type openAIResponsesExecutionOptions struct {
	Run                    agentruns.Run
	BaseURL                string
	UserText               string
	MCPServerIDs           []string
	CompletionGuardEnabled bool
	SectionID              *string
}

func newOpenAIResponsesLiveFixture(t *testing.T) openAIResponsesLiveFixture {
	t.Helper()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)
	return openAIResponsesLiveFixture{
		broadcaster: broadcaster,
		live:        live,
		run:         run,
	}
}

func newOpenAIResponsesExecutor(live *managedchat.LiveRuntime, toolClient *stubToolClient, client *http.Client) *Executor {
	return NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: client,
	})
}

func executeOpenAIResponsesRequest(
	t *testing.T,
	executor *Executor,
	options openAIResponsesExecutionOptions,
) (agentruns.ExecutionResult, error) {
	t.Helper()

	userText := options.UserText
	if userText == "" {
		userText = "Use the tool"
	}
	return executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: options.Run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   options.BaseURL,
			APIKeyEnv: "OPENAI_API_KEY",
		},
		MCPServerIDs:           options.MCPServerIDs,
		CompletionGuardEnabled: options.CompletionGuardEnabled,
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       options.SectionID,
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": userText},
					},
					"attachments": []any{},
				},
			},
		},
	})
}

func executeOpenAIResponsesLiveEvents(
	t *testing.T,
	events []string,
) (agentruns.ExecutionResult, openAIResponsesLiveFixture) {
	t.Helper()

	requestBodies := make([]map[string]any, 0, 1)
	server := newManagedLLMProviderEventServer(t, &requestBodies, events)
	defer server.Close()

	fixture := newOpenAIResponsesLiveFixture(t)
	executor := newOpenAIResponsesExecutor(fixture.live, nil, server.Client())
	result, err := executeOpenAIResponsesRequest(t, executor, openAIResponsesExecutionOptions{
		Run:       fixture.run,
		BaseURL:   server.URL + "/v1",
		SectionID: testStringPtr("section-chat"),
		UserText:  "Think this through",
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses event stream: %v", err)
	}
	return result, fixture
}

func executeOpenAIResponsesRecoveryEvents(
	t *testing.T,
	events []string,
) (agentruns.ExecutionResult, openAIResponsesLiveFixture, error) {
	t.Helper()

	requestBodies := make([]map[string]any, 0, 1)
	server := newManagedLLMProviderEventServer(t, &requestBodies, events)
	defer server.Close()

	fixture := newOpenAIResponsesLiveFixture(t)
	executor := newOpenAIResponsesExecutor(fixture.live, nil, server.Client())
	result, err := executeOpenAIResponsesRequest(t, executor, openAIResponsesExecutionOptions{
		Run:       fixture.run,
		BaseURL:   server.URL + "/v1",
		SectionID: testStringPtr("section-chat"),
		UserText:  "Keep going",
	})
	return result, fixture, err
}

func assertOpenAIResponsesInputPreservesProviderMetadata(t *testing.T, input []any) {
	t.Helper()

	if !openAIResponsesInputHasProviderReasoning(input, "reasoning-provider-1", "enc-prior") ||
		!openAIResponsesInputHasOutputMessage(input, "provider-message-1", "commentary", "Earlier answer") {
		t.Fatalf("expected follow-up Responses input to preserve provider reasoning/message metadata, got %#v", input)
	}
}

func openAIResponsesInputHasProviderReasoning(input []any, itemID string, encryptedContent string) bool {
	for _, rawItem := range input {
		item, ok := rawItem.(map[string]any)
		if ok && item["type"] == "reasoning" && item["id"] == itemID && item["encrypted_content"] == encryptedContent {
			return true
		}
	}
	return false
}

func openAIResponsesInputHasOutputMessage(input []any, messageID string, phase string, text string) bool {
	for _, rawItem := range input {
		item, ok := rawItem.(map[string]any)
		if !ok || item["type"] != "message" || item["id"] != messageID || item["phase"] != phase {
			continue
		}
		content, ok := item["content"].([]any)
		if !ok || len(content) != 1 {
			continue
		}
		contentItem, ok := content[0].(map[string]any)
		if ok && contentItem["type"] == "output_text" && contentItem["text"] == text {
			return true
		}
	}
	return false
}

func assertOpenAIResponsesInputPreservesRefusalContent(t *testing.T, input []any) {
	t.Helper()

	if !openAIResponsesInputHasRefusalMessage(input, "provider-message-1", "Cannot comply") {
		t.Fatalf("expected follow-up Responses input to preserve refusal content type, got %#v", input)
	}
}

func openAIResponsesInputHasRefusalMessage(input []any, messageID string, text string) bool {
	for _, rawItem := range input {
		item, ok := rawItem.(map[string]any)
		if !ok || item["type"] != "message" || item["id"] != messageID {
			continue
		}
		content, ok := item["content"].([]any)
		if !ok || len(content) != 1 {
			continue
		}
		contentItem, ok := content[0].(map[string]any)
		if ok && contentItem["type"] == "refusal" && contentItem["refusal"] == text {
			return true
		}
	}
	return false
}

func assertOpenAIResponsesProviderError(t *testing.T, err error, want string) {
	t.Helper()

	if err == nil {
		t.Fatal("expected provider failure")
	}
	if err.Error() != want {
		t.Fatalf("unexpected provider error %q", err.Error())
	}
}

func requireOpenAIResponsesInput(t *testing.T, rawInput any, minLen int) []any {
	t.Helper()

	input, ok := rawInput.([]any)
	if !ok || len(input) < minLen {
		t.Fatalf("expected follow-up Responses transcript input, got %#v", rawInput)
	}
	return input
}

func assertOpenAIResponsesInputHasReasoning(t *testing.T, input []any, itemID string, encryptedContent string) {
	t.Helper()

	for _, rawItem := range input {
		item, ok := rawItem.(map[string]any)
		if ok && item["type"] == "reasoning" && item["id"] == itemID && item["encrypted_content"] == encryptedContent {
			return
		}
	}
	t.Fatalf("expected follow-up Responses reasoning item %q in %#v", itemID, input)
}

func assertOpenAIResponsesInputHasFunctionCall(t *testing.T, input []any, callID string, itemID string) {
	t.Helper()

	for _, rawItem := range input {
		item, ok := rawItem.(map[string]any)
		if ok && item["type"] == "function_call" && item["call_id"] == callID && item["id"] == itemID {
			return
		}
	}
	t.Fatalf("expected follow-up Responses function call %q/%q in %#v", callID, itemID, input)
}

func assertOpenAIResponsesInputHasFunctionOutput(t *testing.T, input []any, callID string) {
	t.Helper()

	for _, rawItem := range input {
		item, ok := rawItem.(map[string]any)
		if ok && item["type"] == "function_call_output" && item["call_id"] == callID {
			return
		}
	}
	t.Fatalf("expected follow-up Responses function output %q in %#v", callID, input)
}

func assertOpenAIResponsesTextRecovery(
	t *testing.T,
	result agentruns.ExecutionResult,
	fixture openAIResponsesLiveFixture,
	finalText string,
	broadcastDelta string,
	wantBroadcasts int,
) {
	t.Helper()

	assistant := requireOpenAIResponsesAssistantMessage(t, result, 2)
	if assistantText(assistant) != finalText {
		t.Fatalf("expected recovered assistant text %q, got %#v", finalText, assistant)
	}
	state := requireOpenAIResponsesLiveState(t, fixture.live, fixture.run.ID, 2)
	if assistantText(state.Messages[1]) != finalText {
		t.Fatalf("expected finalized live assistant text %q, got %#v", finalText, state)
	}
	broadcastMessages := fixture.broadcaster.Messages()
	if findBroadcastTextDelta(broadcastMessages, 0, broadcastDelta) == nil {
		t.Fatalf("expected recovered text delta in %#v", broadcastMessages)
	}
	assertOpenAIResponsesBroadcastCount(t, fixture.broadcaster, wantBroadcasts)
}

func assertOpenAIResponsesReasoningRecovery(
	t *testing.T,
	result agentruns.ExecutionResult,
	fixture openAIResponsesLiveFixture,
	thinkingDelta string,
	wantBroadcasts int,
) {
	t.Helper()

	assistantContent := requireOpenAIResponsesAssistantContent(t, requireOpenAIResponsesAssistantMessage(t, result, 2), 1)
	assertOpenAIResponsesRecoveredThinkingBlock(t, assistantContent[0])
	state := requireOpenAIResponsesLiveState(t, fixture.live, fixture.run.ID, 2)
	stateContent := requireOpenAIResponsesLiveContent(t, state, 1)
	assertOpenAIResponsesRecoveredThinkingBlock(t, stateContent[0])
	assertOpenAIResponsesRecoveredThinkingBroadcasts(t, fixture.broadcaster, thinkingDelta)
	assertOpenAIResponsesBroadcastCount(t, fixture.broadcaster, wantBroadcasts)
}

func assertOpenAIResponsesPayloadContentRecovery(
	t *testing.T,
	result agentruns.ExecutionResult,
	fixture openAIResponsesLiveFixture,
	text string,
	wantBroadcasts int,
) {
	t.Helper()

	assistantContent := requireOpenAIResponsesAssistantContent(t, requireOpenAIResponsesAssistantMessage(t, result, 2), 2)
	assertOpenAIResponsesRecoveredContent(t, assistantContent, text)
	assertReasoningUsageTokens(t, result, 2)
	state := requireOpenAIResponsesLiveState(t, fixture.live, fixture.run.ID, 2)
	stateContent := requireOpenAIResponsesLiveContent(t, state, 2)
	assertOpenAIResponsesRecoveredContent(t, stateContent, text)
	assertOpenAIResponsesRecoveredThinkingBroadcasts(t, fixture.broadcaster, "Planning deeply")
	if findBroadcastTextDelta(fixture.broadcaster.Messages(), 1, text) == nil {
		t.Fatalf("expected recovered text delta in %#v", fixture.broadcaster.Messages())
	}
	assertOpenAIResponsesBroadcastCount(t, fixture.broadcaster, wantBroadcasts)
}

func assertOpenAIResponsesThinkingTextFinalState(
	t *testing.T,
	result agentruns.ExecutionResult,
	fixture openAIResponsesLiveFixture,
	summary string,
	thinking string,
	text string,
	wantBroadcasts int,
) {
	t.Helper()

	assertOpenAIResponsesThinkingTextResult(t, result, summary, thinking, text)
	assertOpenAIResponsesThinkingTextLiveState(t, fixture, summary, thinking, text)
	assertOpenAIResponsesBroadcastCount(t, fixture.broadcaster, wantBroadcasts)
}

func assertOpenAIResponsesThinkingTextResult(
	t *testing.T,
	result agentruns.ExecutionResult,
	summary string,
	thinking string,
	text string,
) {
	t.Helper()

	assistant := requireOpenAIResponsesAssistantMessage(t, result, 2)
	content := requireOpenAIResponsesAssistantContent(t, assistant, 2)
	assertOpenAIResponsesThinkingTextContent(t, content, summary, thinking, text)
}

func assertOpenAIResponsesThinkingTextLiveState(
	t *testing.T,
	fixture openAIResponsesLiveFixture,
	summary string,
	thinking string,
	text string,
) {
	t.Helper()

	state := requireOpenAIResponsesLiveState(t, fixture.live, fixture.run.ID, 2)
	content := requireOpenAIResponsesLiveContent(t, state, 2)
	assertOpenAIResponsesThinkingTextContent(t, content, summary, thinking, text)
}

func assertOpenAIResponsesThinkingTextContent(
	t *testing.T,
	content []any,
	summary string,
	thinking string,
	text string,
) {
	t.Helper()

	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != summary || thinkingBlock["thinking"] != thinking {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != text {
		t.Fatalf("unexpected text block %#v", content[1])
	}
}

func assertOpenAIResponsesSummaryTextFinalState(
	t *testing.T,
	result agentruns.ExecutionResult,
	fixture openAIResponsesLiveFixture,
	summary string,
	text string,
	wantBroadcasts int,
) {
	t.Helper()

	assertOpenAIResponsesSummaryTextResult(t, result, summary, text)
	assertOpenAIResponsesSummaryTextLiveState(t, fixture, summary, text)
	assertOpenAIResponsesBroadcastCount(t, fixture.broadcaster, wantBroadcasts)
}

func assertOpenAIResponsesSummaryTextResult(
	t *testing.T,
	result agentruns.ExecutionResult,
	summary string,
	text string,
) {
	t.Helper()

	assistant := requireOpenAIResponsesAssistantMessage(t, result, 2)
	content := requireOpenAIResponsesAssistantContent(t, assistant, 2)
	assertOpenAIResponsesSummaryTextContent(t, content, summary, text)
}

func assertOpenAIResponsesSummaryTextLiveState(
	t *testing.T,
	fixture openAIResponsesLiveFixture,
	summary string,
	text string,
) {
	t.Helper()

	state := requireOpenAIResponsesLiveState(t, fixture.live, fixture.run.ID, 2)
	content := requireOpenAIResponsesLiveContent(t, state, 2)
	assertOpenAIResponsesSummaryTextContent(t, content, summary, text)
}

func assertOpenAIResponsesSummaryTextContent(t *testing.T, content []any, summary string, text string) {
	t.Helper()

	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != summary {
		t.Fatalf("expected preserved reasoning summary block, got %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != text {
		t.Fatalf("expected preserved text block, got %#v", content[1])
	}
}

func assertOpenAIResponsesPlainTextFinalState(
	t *testing.T,
	result agentruns.ExecutionResult,
	fixture openAIResponsesLiveFixture,
	text string,
	wantBroadcasts int,
) {
	t.Helper()

	assistant := assertOpenAIResponsesPlainTextResult(t, result, text)
	assertOpenAIResponsesNoThinking(t, assistant)
	liveAssistant := assertOpenAIResponsesPlainTextLiveState(t, fixture, text)
	assertOpenAIResponsesNoThinking(t, liveAssistant)
	assertOpenAIResponsesBroadcastCount(t, fixture.broadcaster, wantBroadcasts)
}

func assertOpenAIResponsesPlainTextResult(
	t *testing.T,
	result agentruns.ExecutionResult,
	text string,
) map[string]any {
	t.Helper()

	assistant := requireOpenAIResponsesAssistantMessage(t, result, 2)
	if assistantText(assistant) != text {
		t.Fatalf("expected assistant text %q, got %#v", text, assistant)
	}
	return assistant
}

func assertOpenAIResponsesPlainTextLiveState(
	t *testing.T,
	fixture openAIResponsesLiveFixture,
	text string,
) map[string]any {
	t.Helper()

	state := requireOpenAIResponsesLiveState(t, fixture.live, fixture.run.ID, 2)
	if assistantText(state.Messages[1]) != text {
		t.Fatalf("expected finalized live text %q, got %#v", text, state)
	}
	return state.Messages[1]
}

func assertOpenAIResponsesNoThinking(t *testing.T, assistant map[string]any) {
	t.Helper()

	if hasMessageThinking(assistant) {
		t.Fatalf("expected assistant message without thinking content, got %#v", assistant)
	}
}

func assertOpenAIResponsesRefusalFinalState(
	t *testing.T,
	result agentruns.ExecutionResult,
	fixture openAIResponsesLiveFixture,
	text string,
	providerMessageID string,
	wantBroadcasts int,
) {
	t.Helper()

	assertOpenAIResponsesRefusalResult(t, result, text, providerMessageID)
	assertOpenAIResponsesRefusalLiveState(t, fixture, text, providerMessageID)
	assertOpenAIResponsesBroadcastCount(t, fixture.broadcaster, wantBroadcasts)
}

func assertOpenAIResponsesRefusalResult(
	t *testing.T,
	result agentruns.ExecutionResult,
	text string,
	providerMessageID string,
) {
	t.Helper()

	assistant := requireOpenAIResponsesAssistantMessage(t, result, 2)
	if assistantText(assistant) != text {
		t.Fatalf("unexpected refusal assistant message %#v", assistant)
	}
	assertOpenAIResponsesRefusalMetadata(t, assistant, providerMessageID)
}

func assertOpenAIResponsesRefusalLiveState(
	t *testing.T,
	fixture openAIResponsesLiveFixture,
	text string,
	providerMessageID string,
) {
	t.Helper()

	state := requireOpenAIResponsesLiveState(t, fixture.live, fixture.run.ID, 2)
	if assistantText(state.Messages[1]) != text {
		t.Fatalf("expected finalized live refusal text, got %#v", state)
	}
	assertOpenAIResponsesRefusalMetadata(t, state.Messages[1], providerMessageID)
}

func assertOpenAIResponsesRefusalMetadata(t *testing.T, assistant map[string]any, providerMessageID string) {
	t.Helper()

	if assistant["provider_message_id"] != providerMessageID {
		t.Fatalf("expected refusal provider message id %q, got %#v", providerMessageID, assistant)
	}
	if assistant["provider_message_content_type"] != "refusal" {
		t.Fatalf("expected refusal provider content type, got %#v", assistant)
	}
}

func requireOpenAIResponsesAssistantMessage(
	t *testing.T,
	result agentruns.ExecutionResult,
	wantMessages int,
) map[string]any {
	t.Helper()

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != wantMessages {
		t.Fatalf("expected %d output messages, got %#v", wantMessages, result.Outputs["messages"])
	}
	assistant, ok := messages[wantMessages-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[wantMessages-1])
	}
	return assistant
}

func requireOpenAIResponsesAssistantContent(t *testing.T, assistant map[string]any, wantBlocks int) []any {
	t.Helper()

	content, ok := assistant["content"].([]any)
	if !ok || len(content) != wantBlocks {
		t.Fatalf("expected %d assistant content blocks, got %#v", wantBlocks, assistant)
	}
	return content
}

func requireOpenAIResponsesLiveState(
	t *testing.T,
	live *managedchat.LiveRuntime,
	runID string,
	wantMessages int,
) *managedchat.ChatState {
	t.Helper()

	state, stateErr := live.GetLiveChatState(runID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse || len(state.Messages) != wantMessages {
		t.Fatalf("expected finalized live state with %d messages, got %#v", wantMessages, state)
	}
	return state
}

func requireOpenAIResponsesLiveContent(t *testing.T, state *managedchat.ChatState, wantBlocks int) []any {
	t.Helper()

	content, ok := state.Messages[1]["content"].([]any)
	if !ok || len(content) != wantBlocks {
		t.Fatalf("expected %d finalized live content blocks, got %#v", wantBlocks, state)
	}
	return content
}

func assertOpenAIResponsesRecoveredContent(t *testing.T, content []any, text string) {
	t.Helper()

	assertOpenAIResponsesRecoveredThinkingBlock(t, content[0])
	assertOpenAIResponsesRecoveredTextBlock(t, content[1], text)
}

func assertOpenAIResponsesRecoveredThinkingBlock(t *testing.T, rawBlock any) {
	t.Helper()

	block, ok := rawBlock.(map[string]any)
	if !ok || block["summary"] != "Plan summary" || block["thinking"] != "Planning deeply" {
		t.Fatalf("expected recovered authoritative reasoning block, got %#v", rawBlock)
	}
}

func assertOpenAIResponsesRecoveredTextBlock(t *testing.T, rawBlock any, text string) {
	t.Helper()

	block, ok := rawBlock.(map[string]any)
	if !ok || block["text"] != text {
		t.Fatalf("expected recovered text block %q, got %#v", text, rawBlock)
	}
}

func assertOpenAIResponsesRecoveredThinkingBroadcasts(
	t *testing.T,
	broadcaster *captureBroadcaster,
	thinkingDelta string,
) {
	t.Helper()

	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected recovered summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, thinkingDelta, nil) == nil {
		t.Fatalf("expected recovered thinking delta in %#v", broadcastMessages)
	}
}

func assertOpenAIResponsesBroadcastCount(t *testing.T, broadcaster *captureBroadcaster, want int) {
	t.Helper()

	if broadcaster.Count() != want {
		t.Fatalf("expected %d managed stream broadcasts, got %d", want, broadcaster.Count())
	}
}

func assertOpenAIResponsesToolLoopResult(
	t *testing.T,
	result agentruns.ExecutionResult,
	finalText string,
	providerItemID string,
) []any {
	t.Helper()

	messages := assertOutputMessagesWithFinalAssistant(t, result, 4, finalText)
	assertSinglePersistedToolCall(t, result)
	assertOpenAIResponsesProviderToolCall(t, messages[1], providerItemID)
	return messages
}

func assertOpenAIResponsesProviderToolCall(t *testing.T, rawMessage any, providerItemID string) {
	t.Helper()

	assistant, ok := rawMessage.(map[string]any)
	if !ok {
		t.Fatalf("expected assistant tool-call message map, got %#v", rawMessage)
	}
	persistedToolCalls := assistantToolCalls(assistant)
	if len(persistedToolCalls) != 1 || persistedToolCalls[0]["provider_item_id"] != providerItemID {
		t.Fatalf("expected provider tool-call item id %q, got %#v", providerItemID, assistant["tool_calls"])
	}
}

func assertOpenAIResponsesPreservedToolCall(
	t *testing.T,
	toolCalls []map[string]any,
	callID string,
	providerItemID string,
) {
	t.Helper()

	if len(toolCalls) != 1 {
		t.Fatalf("expected one preserved tool call, got %#v", toolCalls)
	}
	if toolCalls[0]["id"] != callID {
		t.Fatalf("unexpected preserved tool call %#v", toolCalls[0])
	}
	if toolCalls[0]["provider_item_id"] != providerItemID {
		t.Fatalf("expected preserved provider tool-call item id, got %#v", toolCalls[0])
	}
}

func assertOpenAIResponsesLivePreservedToolCall(
	t *testing.T,
	live *managedchat.LiveRuntime,
	runID string,
	callID string,
) {
	t.Helper()

	state, stateErr := live.GetLiveChatState(runID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse || len(state.Messages) != 2 {
		t.Fatalf("expected finalized live assistant message, got %#v", state)
	}
	stateToolCalls := assistantToolCalls(state.Messages[1])
	if len(stateToolCalls) != 1 || stateToolCalls[0]["id"] != callID {
		t.Fatalf("expected finalized live preserved tool call, got %#v", state.Messages[1])
	}
}

func assertOpenAIResponsesToolDelta(
	t *testing.T,
	broadcaster *captureBroadcaster,
	toolCallID string,
	argumentsDelta string,
) {
	t.Helper()

	for _, message := range broadcaster.Messages() {
		chunk, ok := message.Content.Chunk.(realtime.ToolCallDeltaEvent)
		if ok && chunk.ToolCallID == toolCallID && chunk.ArgumentsDelta == argumentsDelta {
			return
		}
	}
	t.Fatalf("expected live tool delta event in %#v", broadcaster.Messages())
}

func newOpenAIResponsesStreamAppDefinitionToolClient() *stubToolClient {
	return &stubToolClient{
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
}

func assertOpenAIResponsesToolPreviewResult(
	t *testing.T,
	result agentruns.ExecutionResult,
	broadcaster *captureBroadcaster,
) {
	t.Helper()

	assertOpenAIResponsesToolPreviewBroadcasts(t, broadcaster)
	assertSinglePersistedToolCall(t, result)
	assertOutputMessagesWithFinalAssistant(t, result, 4, "Preview applied")
}

func assertOpenAIResponsesToolPreviewBroadcasts(t *testing.T, broadcaster *captureBroadcaster) {
	t.Helper()

	toolDeltaEvent, previewEvent := findOpenAIResponsesToolPreviewBroadcasts(broadcaster.Messages(), "tool-call-1")
	if toolDeltaEvent == nil {
		t.Fatalf("expected tool call delta event in %#v", broadcaster.Messages())
	}
	if toolDeltaEvent.ArgumentsDelta != openAIResponsesPreviewArguments {
		t.Fatalf("unexpected tool delta event %#v", toolDeltaEvent)
	}
	if toolDeltaEvent.ToolName == nil || *toolDeltaEvent.ToolName != "setta__stream_app_definition" {
		t.Fatalf("unexpected tool delta tool name %#v", toolDeltaEvent)
	}
	if previewEvent == nil {
		t.Fatalf("expected tool preview event in %#v", broadcaster.Messages())
	}
	if previewEvent.PreviewKind != tools.PreviewKindAppSpecPatch {
		t.Fatalf("unexpected preview kind %#v", previewEvent)
	}
	if previewEvent.PreviewValueDelta != openAIResponsesPreviewValue {
		t.Fatalf("unexpected preview delta %#v", previewEvent)
	}
	if previewEvent.ArgumentsDelta != openAIResponsesPreviewArguments {
		t.Fatalf("unexpected preview arguments delta %#v", previewEvent)
	}
}

func findOpenAIResponsesToolPreviewBroadcasts(
	messages []realtime.LLMStreamingResponseMessage,
	toolCallID string,
) (*realtime.ToolCallDeltaEvent, *realtime.ToolArgumentPreviewDeltaEvent) {
	var toolDeltaEvent *realtime.ToolCallDeltaEvent
	var previewEvent *realtime.ToolArgumentPreviewDeltaEvent
	for _, message := range messages {
		switch chunk := message.Content.Chunk.(type) {
		case realtime.ToolCallDeltaEvent:
			if chunk.ToolCallID == toolCallID {
				copied := chunk
				toolDeltaEvent = &copied
			}
		case realtime.ToolArgumentPreviewDeltaEvent:
			if chunk.ToolCallID == toolCallID {
				copied := chunk
				previewEvent = &copied
			}
		}
	}
	return toolDeltaEvent, previewEvent
}
