package externalagents

import "testing"

func TestAppendAssistantThinkingUpdateCreatesAssistantMessage(t *testing.T) {
	t.Parallel()

	state := &ChatState{}
	appendAssistantThinkingUpdate(state, "assistant-1", "Plan carefully.", nil, nil)

	if len(state.Messages) != 1 {
		t.Fatalf("expected one assistant message, got %#v", state.Messages)
	}
	message := state.Messages[0]
	if got := stringValue(message["id"]); got != "assistant-1" {
		t.Fatalf("expected assistant message id, got %#v", message)
	}
	if got := stringValue(message["role"]); got != "assistant" {
		t.Fatalf("expected assistant role, got %#v", message)
	}
	content, ok := message["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected one thinking block, got %#v", message["content"])
	}
	block, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected thinking block map, got %#v", content[0])
	}
	if got := stringValue(block["type"]); got != "thinking" {
		t.Fatalf("expected thinking block type, got %#v", block)
	}
	if got := stringValue(block["thinking"]); got != "Plan carefully." {
		t.Fatalf("expected thinking content, got %#v", block)
	}
}

func TestAppendAssistantThinkingUpdateMergesExistingThinkingBlock(t *testing.T) {
	t.Parallel()

	summary := "Final summary"
	signature := "sig-2"
	state := &ChatState{
		Messages: []map[string]any{
			{
				"id":   "assistant-1",
				"role": "assistant",
				"content": []any{
					map[string]any{
						"type":      "thinking",
						"thinking":  "Plan",
						"summary":   "Draft summary",
						"signature": "sig-1",
					},
				},
			},
		},
	}

	appendAssistantThinkingUpdate(state, "assistant-1", " next", &summary, &signature)

	content, ok := state.Messages[0]["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected merged thinking block, got %#v", state.Messages[0]["content"])
	}
	block, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected thinking block map, got %#v", content[0])
	}
	if got := stringValue(block["thinking"]); got != "Plan next" {
		t.Fatalf("expected merged thinking content, got %#v", block)
	}
	if got := stringValue(block["summary"]); got != "Final summary" {
		t.Fatalf("expected updated summary, got %#v", block)
	}
	if got := stringValue(block["signature"]); got != "sig-2" {
		t.Fatalf("expected updated signature, got %#v", block)
	}
}

func TestLookupToolCallContextPrefersMessageArguments(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages: []map[string]any{
			{
				"id":   "assistant-1",
				"role": "assistant",
				"tool_calls": []any{
					map[string]any{
						"id": "call-1",
						"function": map[string]any{
							"name":      "ReadFile",
							"arguments": map[string]any{"path": "README.md"},
						},
					},
				},
			},
		},
		ToolCallArguments: map[string]string{
			"call-1": "{\"path\":\"SHOULD_NOT_WIN.md\"}",
		},
	}

	name, arguments := lookupToolCallContext(state, "call-1")
	if name != "ReadFile" {
		t.Fatalf("expected tool name from message, got %q", name)
	}
	if got := stringValue(arguments["path"]); got != "README.md" {
		t.Fatalf("expected message arguments to win, got %#v", arguments)
	}

	arguments["path"] = "changed"
	rawToolCalls, _ := state.Messages[0]["tool_calls"].([]any)
	toolCall, _ := rawToolCalls[0].(map[string]any)
	function, _ := mapValue(toolCall["function"])
	originalArguments, _ := mapValue(function["arguments"])
	if got := stringValue(originalArguments["path"]); got != "README.md" {
		t.Fatalf("expected returned arguments to be cloned, got %#v", originalArguments)
	}
}

func TestLookupToolCallContextFallsBackToEncodedArguments(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		ToolCallArguments: map[string]string{
			"call-2": "{\"path\":\"backend/main.py\",\"recursive\":true}",
		},
	}

	name, arguments := lookupToolCallContext(state, "call-2")
	if name != "" {
		t.Fatalf("expected empty tool name for encoded fallback, got %q", name)
	}
	if got := stringValue(arguments["path"]); got != "backend/main.py" {
		t.Fatalf("expected decoded path, got %#v", arguments)
	}
	recursive, ok := arguments["recursive"].(bool)
	if !ok || !recursive {
		t.Fatalf("expected decoded recursive flag, got %#v", arguments)
	}
}
