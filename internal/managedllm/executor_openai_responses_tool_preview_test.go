package managedllm

import (
	"testing"

	"setta/internal/mcpx"
)

func TestExecutorExecuteEmitsOpenAIResponsesToolPreviewFromCompletedFallback(t *testing.T) {
	t.Parallel()

	runOpenAIResponsesToolPreviewScenario(
		t,
		openAIResponsesCompletedFallbackPreviewEvents(),
		openAIResponsesPreviewFinalDeltaOnlyEvents(),
		"completed-fallback",
	)
}

func TestExecutorExecuteEmitsOpenAIResponsesToolPreviewFromArgumentsDoneEvent(t *testing.T) {
	t.Parallel()

	runOpenAIResponsesToolPreviewScenario(
		t,
		openAIResponsesArgumentsDonePreviewEvents(),
		openAIResponsesFinalMessageEvents("Preview applied"),
		"arguments.done",
	)
}

func TestExecutorExecuteEmitsOpenAIResponsesToolPreviewFromFunctionCallItemDoneEvent(t *testing.T) {
	t.Parallel()

	runOpenAIResponsesToolPreviewScenario(
		t,
		openAIResponsesFunctionCallItemDonePreviewEvents(),
		openAIResponsesPreviewFinalDeltaOnlyEvents(),
		"output_item.done",
	)
}

func runOpenAIResponsesToolPreviewScenario(
	t *testing.T,
	firstTurnEvents []string,
	finalTurnEvents []string,
	label string,
) {
	t.Helper()

	requestBodies := make([]map[string]any, 0, 2)
	server := newManagedLLMProviderEventServer(t, &requestBodies, firstTurnEvents, finalTurnEvents)
	defer server.Close()

	fixture := newOpenAIResponsesLiveFixture(t)
	executor := newOpenAIResponsesExecutor(
		fixture.live,
		newOpenAIResponsesStreamAppDefinitionToolClient(),
		server.Client(),
	)
	result, err := executeOpenAIResponsesRequest(t, executor, openAIResponsesExecutionOptions{
		Run:          fixture.run,
		BaseURL:      server.URL + "/v1",
		MCPServerIDs: []string{mcpx.DefaultServerID},
		UserText:     "Stream the app definition",
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses %s tool preview stream: %v", label, err)
	}

	assertOpenAIResponsesToolPreviewResult(t, result, fixture.broadcaster)
}

func openAIResponsesCompletedFallbackPreviewEvents() []string {
	return []string{
		openAIResponseCompletedEvent(openAIResponsesPreviewFunctionCallOutput(), 12, 2, 14, 0),
	}
}

func openAIResponsesArgumentsDonePreviewEvents() []string {
	return []string{
		openAIResponseFunctionCallItemAddedEvent(0, "function-item-1", "tool-call-1", "setta__stream_app_definition"),
		openAIResponseFunctionCallArgumentsDoneEvent(
			"function-item-1",
			0,
			"setta__stream_app_definition",
			openAIResponsesPreviewArguments,
		),
		openAIResponseCompletedEvent(openAIResponsesPreviewFunctionCallOutput(), 12, 2, 14, 1),
	}
}

func openAIResponsesFunctionCallItemDonePreviewEvents() []string {
	return []string{
		openAIResponseFunctionCallItemDoneEvent(
			0,
			"function-item-1",
			"tool-call-1",
			"setta__stream_app_definition",
			openAIResponsesPreviewArguments,
		),
		openAIResponseCompletedEvent(openAIResponsesPreviewFunctionCallOutput(), 12, 2, 14, 0),
	}
}

func openAIResponsesPreviewFunctionCallOutput() []map[string]any {
	return []map[string]any{
		{
			"type":      "function_call",
			"id":        "function-item-1",
			"call_id":   "tool-call-1",
			"name":      "setta__stream_app_definition",
			"arguments": openAIResponsesPreviewArguments,
			"status":    "completed",
		},
	}
}

func openAIResponsesPreviewFinalDeltaOnlyEvents() []string {
	return []string{
		openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Preview applied"),
		openAIResponseCompletedEvent([]map[string]any{}, 8, 1, 9, 0),
	}
}
