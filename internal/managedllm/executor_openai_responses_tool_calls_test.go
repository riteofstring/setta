package managedllm

import (
	"testing"

	"setta/internal/mcpx"
)

func TestExecutorExecuteRunsOpenAIResponsesToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 2)
	server := newManagedLLMProviderEventServer(
		t,
		&requestBodies,
		openAIResponsesToolCallTurnEvents(),
		openAIResponsesFinalMessageEvents("Tool loop complete"),
	)
	defer server.Close()

	fixture := newOpenAIResponsesLiveFixture(t)
	capturedCalls := make([]capturedManagedLLMToolCall, 0, 1)
	executor := newOpenAIResponsesExecutor(
		fixture.live,
		newCreateSectionToolClient("section-created", &capturedCalls),
		server.Client(),
	)
	result, err := executeOpenAIResponsesRequest(t, executor, openAIResponsesExecutionOptions{
		Run:                    fixture.run,
		BaseURL:                server.URL + "/v1",
		MCPServerIDs:           []string{mcpx.DefaultServerID},
		CompletionGuardEnabled: true,
		UserText:               "Use the tool",
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses tool stream: %v", err)
	}

	assertCreateSectionToolCall(t, capturedCalls)
	assertProviderRequestCount(t, requestBodies, 2)
	assertToolDefinitionsInclude(
		t,
		requestBodies[0]["tools"],
		2,
		"setta__create_top_level_section",
		"setta__report_completion_status",
	)
	secondInput := requireOpenAIResponsesInput(t, requestBodies[1]["input"], 3)
	assertOpenAIResponsesInputHasReasoning(t, secondInput, "reasoning-1", "enc-tool-turn")
	assertOpenAIResponsesInputHasFunctionCall(t, secondInput, "tool-call-1", "function-item-1")
	assertOpenAIResponsesInputHasFunctionOutput(t, secondInput, "tool-call-1")
	assertOpenAIResponsesToolLoopResult(t, result, "Tool loop complete", "function-item-1")
}

func TestExecutorExecuteRecoversOpenAIResponsesToolCallsFromCompletedFallback(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 2)
	server := newManagedLLMProviderEventServer(
		t,
		&requestBodies,
		openAIResponsesCompletedFallbackToolCallEvents(),
		openAIResponsesFinalMessageEvents("Recovered tool call"),
	)
	defer server.Close()

	capturedCalls := make([]capturedManagedLLMToolCall, 0, 1)
	executor := newOpenAIResponsesExecutor(
		nil,
		newCreateSectionToolClient("section-created", &capturedCalls),
		server.Client(),
	)
	result, err := executeOpenAIResponsesRequest(t, executor, openAIResponsesExecutionOptions{
		Run:          newManagedChatTestRun(),
		BaseURL:      server.URL + "/v1",
		MCPServerIDs: []string{mcpx.DefaultServerID},
		UserText:     "Use the tool",
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses completed-fallback tool stream: %v", err)
	}

	call := assertCreateSectionToolCall(t, capturedCalls)
	if call.Arguments["implType"] != "Dict" {
		t.Fatalf("unexpected tool arguments %#v", call.Arguments)
	}
	assertProviderRequestCount(t, requestBodies, 2)
	secondInput := requireOpenAIResponsesInput(t, requestBodies[1]["input"], 3)
	assertOpenAIResponsesInputHasFunctionCall(t, secondInput, "tool-call-1", "function-item-1")
	assertOpenAIResponsesInputHasFunctionOutput(t, secondInput, "tool-call-1")
	assertOpenAIResponsesToolLoopResult(t, result, "Recovered tool call", "function-item-1")
}

func TestExecutorExecutePreservesCompletedOpenAIResponsesToolCallBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 1)
	server := newManagedLLMProviderEventServer(
		t,
		&requestBodies,
		[]string{
			openAIResponseFunctionCallItemDoneEvent(
				0,
				"function-item-1",
				"tool-call-1",
				"setta__create_top_level_section",
				`{"projectConfigId":"project-alpha","implType":"Dict"}`,
			),
			openAIResponseIncompleteEvent("max_output_tokens"),
		},
	)
	defer server.Close()

	fixture := newOpenAIResponsesLiveFixture(t)
	capturedCalls := make([]capturedManagedLLMToolCall, 0, 1)
	executor := newOpenAIResponsesExecutor(
		fixture.live,
		newCreateSectionToolClient("section-created", &capturedCalls),
		server.Client(),
	)
	result, err := executeOpenAIResponsesRequest(t, executor, openAIResponsesExecutionOptions{
		Run:          fixture.run,
		BaseURL:      server.URL + "/v1",
		MCPServerIDs: []string{mcpx.DefaultServerID},
		UserText:     "Use the tool",
	})
	assertOpenAIResponsesProviderError(
		t,
		err,
		"managed llm provider request failed: response incomplete (max_output_tokens)",
	)

	if len(capturedCalls) != 0 {
		t.Fatalf("tool execution should not run after provider failure, got %#v", capturedCalls)
	}
	assertProviderRequestCount(t, requestBodies, 1)
	messages := assertOutputMessagesWithFinalAssistant(t, result, 2, "")
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	assertOpenAIResponsesPreservedToolCall(t, assistantToolCalls(assistant), "tool-call-1", "function-item-1")
	assertOpenAIResponsesPreservedToolCall(t, result.ToolCalls, "tool-call-1", "function-item-1")
	assertOpenAIResponsesLivePreservedToolCall(t, fixture.live, fixture.run.ID, "tool-call-1")
	assertOpenAIResponsesToolDelta(t, fixture.broadcaster, "tool-call-1", `{"projectConfigId":"project-alpha","implType":"Dict"}`)
	if fixture.broadcaster.Count() != 4 {
		t.Fatalf("expected start, tool delta, stop, finalized broadcasts, got %d", fixture.broadcaster.Count())
	}
}

func openAIResponsesToolCallTurnEvents() []string {
	return []string{
		openAIResponseReasoningItemAddedWithContentEvent(0, "reasoning-1", "Plan summary", "Planning deeply"),
		openAIResponseFunctionCallItemAddedEvent(1, "function-item-1", "tool-call-1", "setta__create_top_level_section"),
		openAIResponseFunctionCallArgumentsDeltaEvent("function-item-1", 1, `{"projectConfigId":"project-alpha","implType":"Dict"}`),
		openAIResponseCompletedEvent(
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
		),
	}
}

func openAIResponsesCompletedFallbackToolCallEvents() []string {
	return []string{
		openAIResponseCompletedEvent(
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
		),
	}
}

func openAIResponsesFinalMessageEvents(text string) []string {
	return []string{
		openAIResponseOutputTextDeltaEvent("message-2", 0, 0, text),
		openAIResponseCompletedEvent(
			[]map[string]any{
				{
					"type":    "message",
					"id":      "message-2",
					"role":    "assistant",
					"status":  "completed",
					"content": []map[string]any{{"type": "output_text", "text": text, "annotations": []any{}}},
				},
			},
			15,
			3,
			18,
			1,
		),
	}
}
