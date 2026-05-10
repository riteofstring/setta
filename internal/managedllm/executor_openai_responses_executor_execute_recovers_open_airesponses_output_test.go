package managedllm

import "testing"

func TestExecutorExecuteRecoversOpenAIResponsesOutputItemDoneBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	result, fixture, err := executeOpenAIResponsesRecoveryEvents(t, []string{
		openAIResponseOutputTextDeltaEvent("message-1", 0, 0, "Recovered"),
		openAIResponseOutputMessageDoneEvent("message-1", 0, "Recovered final item"),
		openAIResponseIncompleteEvent("max_output_tokens"),
	})
	assertOpenAIResponsesProviderError(
		t,
		err,
		"managed llm provider request failed: response incomplete (max_output_tokens)",
	)
	assertOpenAIResponsesTextRecovery(t, result, fixture, "Recovered final item", " final item", 5)
}

func TestExecutorExecuteRecoversOpenAIResponsesReasoningItemDoneBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	result, fixture, err := executeOpenAIResponsesRecoveryEvents(t, []string{
		openAIResponseReasoningItemAddedEvent(0, "reasoning-1"),
		openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"),
		openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"),
		openAIResponseReasoningItemDoneEvent(
			0,
			"reasoning-1",
			"Plan summary",
			"Planning deeply",
		),
		openAIResponseIncompleteEvent("max_output_tokens"),
	})
	assertOpenAIResponsesProviderError(
		t,
		err,
		"managed llm provider request failed: response incomplete (max_output_tokens)",
	)
	assertOpenAIResponsesReasoningRecovery(t, result, fixture, " deeply", 7)
}

func TestExecutorExecuteRecoversOpenAIResponsesIncompletePayloadContentBeforeFailure(t *testing.T) {
	t.Parallel()

	result, fixture, err := executeOpenAIResponsesRecoveryEvents(t, []string{
		openAIResponseIncompleteEventWithOutput(
			"max_output_tokens",
			openAIResponsesRecoveredOutput("Recovered final answer", "incomplete"),
			2,
		),
	})
	assertOpenAIResponsesProviderError(
		t,
		err,
		"managed llm provider request failed: response incomplete (max_output_tokens)",
	)
	assertOpenAIResponsesPayloadContentRecovery(t, result, fixture, "Recovered final answer", 6)
}

func TestExecutorExecuteRecoversOpenAIResponsesFailedPayloadContentBeforeFailure(t *testing.T) {
	t.Parallel()

	result, fixture, err := executeOpenAIResponsesRecoveryEvents(t, []string{
		openAIResponseFailedEventWithOutput(
			"upstream execution failed",
			openAIResponsesRecoveredOutput("Recovered failed answer", "failed"),
			2,
		),
	})
	assertOpenAIResponsesProviderError(
		t,
		err,
		"managed llm provider request failed: upstream execution failed",
	)
	assertOpenAIResponsesPayloadContentRecovery(t, result, fixture, "Recovered failed answer", 6)
}

func openAIResponsesRecoveredOutput(text string, status string) []map[string]any {
	return []map[string]any{
		{
			"type":    "reasoning",
			"id":      "reasoning-1",
			"summary": []map[string]any{{"text": "Plan summary"}},
			"content": []map[string]any{{"type": "reasoning_text", "text": "Planning deeply"}},
			"status":  status,
		},
		{
			"type":    "message",
			"id":      "message-1",
			"role":    "assistant",
			"status":  status,
			"content": []map[string]any{{"type": "output_text", "text": text, "annotations": []any{}}},
		},
	}
}
