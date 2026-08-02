package managedllm

import (
	"errors"
	"strings"
	"testing"

	"github.com/openai/openai-go/v3/responses"
)

func TestBuildOpenAIResponseInputItemsBuildsMixedTranscript(t *testing.T) {
	t.Parallel()

	items, err := buildOpenAIResponseInputItems([]map[string]any{
		{
			"role": "system",
			"content": []any{
				map[string]any{"type": "text", "text": "System prompt"},
			},
		},
		{
			"role":                "assistant",
			"id":                  "assistant-1",
			"provider_message_id": "provider-message-1",
			"content": []any{
				map[string]any{
					"type":             "thinking",
					"summary":          "Plan summary",
					"thinking":         "Planning deeply",
					"signature":        "enc-thinking",
					"provider_item_id": "reasoning-provider-1",
				},
				map[string]any{"type": "text", "text": "Assistant answer"},
			},
			"tool_calls": []any{
				map[string]any{
					"id":               "tool-call-1",
					"provider_item_id": "function-item-1",
					"function": map[string]any{
						"name":      "setta__lookup",
						"arguments": map[string]any{"query": "status"},
					},
				},
			},
		},
		{
			"role":         "tool",
			"tool_call_id": "tool-call-1",
			"result":       map[string]any{"text": "lookup-result"},
		},
	})
	if err != nil {
		t.Fatalf("build response input items: %v", err)
	}
	if len(items) != 5 {
		t.Fatalf("expected 5 input items, got %d", len(items))
	}

	assertOpenAISystemInputMessage(t, items[0])
	assertOpenAIReasoningItem(t, items[1])
	assertOpenAIOutputMessage(t, items[2])
	assertOpenAIFunctionCall(t, items[3])
	assertOpenAIFunctionCallOutput(t, items[4])
}

func assertOpenAISystemInputMessage(t *testing.T, item responses.ResponseInputItemUnionParam) {
	t.Helper()

	message := item.OfInputMessage
	if message == nil || message.Role != "system" || len(message.Content) != 1 || message.Content[0].OfInputText == nil || message.Content[0].OfInputText.Text != "System prompt" {
		t.Fatalf("expected system input message, got %#v", item)
	}
}

func assertOpenAIReasoningItem(t *testing.T, item responses.ResponseInputItemUnionParam) {
	t.Helper()

	reasoning := item.OfReasoning
	if reasoning == nil {
		t.Fatalf("expected assistant reasoning item, got %#v", item)
	}
	if reasoning.ID != "reasoning-provider-1" {
		t.Fatalf("expected provider reasoning id, got %q", reasoning.ID)
	}
	if len(reasoning.Summary) != 1 || reasoning.Summary[0].Text != "Plan summary" {
		t.Fatalf("expected reasoning summary, got %#v", reasoning.Summary)
	}
	if len(reasoning.Content) != 1 || reasoning.Content[0].Text != "Planning deeply" {
		t.Fatalf("expected reasoning content, got %#v", reasoning.Content)
	}
	if !reasoning.EncryptedContent.Valid() || reasoning.EncryptedContent.Value != "enc-thinking" {
		t.Fatalf("expected encrypted reasoning content, got %#v", reasoning.EncryptedContent)
	}
}

func assertOpenAIOutputMessage(t *testing.T, item responses.ResponseInputItemUnionParam) {
	t.Helper()

	outputMessage := item.OfOutputMessage
	if outputMessage == nil {
		t.Fatalf("expected assistant output message, got %#v", item)
	}
	if outputMessage.ID != "provider-message-1" {
		t.Fatalf("expected provider message id, got %q", outputMessage.ID)
	}
	if len(outputMessage.Content) != 1 || outputMessage.Content[0].OfOutputText == nil || outputMessage.Content[0].OfOutputText.Text != "Assistant answer" {
		t.Fatalf("expected assistant output text, got %#v", outputMessage.Content)
	}
}

func assertOpenAIFunctionCall(t *testing.T, item responses.ResponseInputItemUnionParam) {
	t.Helper()

	functionCall := item.OfFunctionCall
	if functionCall == nil {
		t.Fatalf("expected assistant function call item, got %#v", item)
	}
	if functionCall.CallID != "tool-call-1" || functionCall.Name != "setta__lookup" {
		t.Fatalf("unexpected function call payload %#v", functionCall)
	}
	if !functionCall.ID.Valid() || functionCall.ID.Value != "function-item-1" {
		t.Fatalf("expected provider function call id, got %#v", functionCall.ID)
	}
	if functionCall.Arguments != "{\"query\":\"status\"}" {
		t.Fatalf("expected encoded function call arguments, got %q", functionCall.Arguments)
	}
}

func assertOpenAIFunctionCallOutput(t *testing.T, item responses.ResponseInputItemUnionParam) {
	t.Helper()

	functionOutput := item.OfFunctionCallOutput
	if functionOutput == nil || functionOutput.CallID != "tool-call-1" || !functionOutput.Output.OfString.Valid() || functionOutput.Output.OfString.Value != "lookup-result" {
		t.Fatalf("expected function call output item, got %#v", item)
	}
}

func TestBuildOpenAIResponseReasoningItemsSkipsEmptyBlocksAndUsesFallbackIDs(t *testing.T) {
	t.Parallel()

	items, include, err := buildOpenAIResponseReasoningItems("assistant-1", []any{
		map[string]any{"type": "thinking"},
		map[string]any{"type": "text", "text": "ignored"},
		map[string]any{"type": "thinking", "summary": "Plan summary"},
		map[string]any{"type": "thinking", "thinking": "Planning deeply"},
	})
	if err != nil {
		t.Fatalf("build reasoning items: %v", err)
	}
	if !include {
		t.Fatal("expected reasoning items to be included")
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 reasoning items, got %d", len(items))
	}
	if items[0].OfReasoning == nil || items[0].OfReasoning.ID != "assistant-1_reasoning" {
		t.Fatalf("expected first fallback reasoning id, got %#v", items[0])
	}
	if items[1].OfReasoning == nil || items[1].OfReasoning.ID != "assistant-1_reasoning_1" {
		t.Fatalf("expected second fallback reasoning id, got %#v", items[1])
	}
}

func TestBuildOpenAIResponseInputItemsWrapsToolErrorsWithTranscriptIndex(t *testing.T) {
	t.Parallel()

	_, err := buildOpenAIResponseInputItems([]map[string]any{
		{"role": "tool"},
	})
	if !errors.Is(err, ErrToolsUnsupported) {
		t.Fatalf("expected ErrToolsUnsupported, got %v", err)
	}
	if err == nil || !strings.Contains(err.Error(), "transcript message 0") {
		t.Fatalf("expected transcript index in error, got %v", err)
	}
}
