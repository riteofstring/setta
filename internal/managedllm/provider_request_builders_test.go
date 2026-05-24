package managedllm

import (
	"testing"

	"google.golang.org/genai"
	"setta/internal/agentruns"
)

func TestBuildOpenAIProviderMessageIncludesAssistantToolCalls(t *testing.T) {
	t.Parallel()

	payload, include, err := buildOpenAIProviderMessage(map[string]any{
		"role": "assistant",
		"content": []any{
			map[string]any{"type": "text", "text": "Done"},
			map[string]any{"type": "thinking", "text": "Hidden plan"},
		},
		"tool_calls": []any{
			map[string]any{
				"id": "call-1",
				"function": map[string]any{
					"name":      "lookup_status",
					"arguments": map[string]any{"query": "status"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("build openai provider assistant message: %v", err)
	}
	if !include {
		t.Fatal("expected assistant message with tool calls to be included")
	}
	content, ok := payload["content"].(string)
	if !ok || content != "Done" {
		t.Fatalf("expected assistant text content, got %#v", payload["content"])
	}
	toolCalls, ok := payload["tool_calls"].([]any)
	if !ok || len(toolCalls) != 1 {
		t.Fatalf("expected one normalized tool call, got %#v", payload["tool_calls"])
	}
	toolCall, ok := toolCalls[0].(map[string]any)
	if !ok {
		t.Fatalf("expected tool call object, got %#v", toolCalls[0])
	}
	if toolCall["id"] != "call-1" || toolCall["type"] != "function" {
		t.Fatalf("expected normalized tool call identity, got %#v", toolCall)
	}
	function, ok := toolCall["function"].(map[string]any)
	if !ok {
		t.Fatalf("expected function payload, got %#v", toolCall["function"])
	}
	if function["name"] != "lookup_status" {
		t.Fatalf("expected function name lookup_status, got %#v", function["name"])
	}
	if function["arguments"] != "{\"query\":\"status\"}" {
		t.Fatalf("expected encoded function arguments, got %#v", function["arguments"])
	}
}

func TestBuildGeminiGenerateContentConfigAppliesAliasesToolsAndThinking(t *testing.T) {
	t.Parallel()

	config, err := buildGeminiGenerateContentConfig(agentruns.ExecutionRequest{
		Thinking: true,
		RequestParams: map[string]any{
			"max_tokens":       128,
			"presence_penalty": 0.25,
			"stream":           true,
			"api_base":         "https://example.invalid",
			"thinking_config": map[string]any{
				"thinking_budget": 64,
				"thinking_level":  "medium",
			},
		},
	}, "System prompt", []map[string]any{
		{
			"function": map[string]any{
				"name":        "lookup_status",
				"description": "Look up current status",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"query": map[string]any{"type": "string"},
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("build gemini generate content config: %v", err)
	}
	if config.MaxOutputTokens != 128 {
		t.Fatalf("expected max output tokens 128, got %d", config.MaxOutputTokens)
	}
	if config.PresencePenalty == nil || *config.PresencePenalty != float32(0.25) {
		t.Fatalf("expected presence penalty 0.25, got %#v", config.PresencePenalty)
	}
	if config.SystemInstruction == nil || config.SystemInstruction.Role != string(genai.RoleUser) {
		t.Fatalf("expected user system instruction, got %#v", config.SystemInstruction)
	}
	if len(config.SystemInstruction.Parts) != 1 || config.SystemInstruction.Parts[0].Text != "System prompt" {
		t.Fatalf("expected system prompt text, got %#v", config.SystemInstruction)
	}
	if len(config.Tools) != 1 || len(config.Tools[0].FunctionDeclarations) != 1 {
		t.Fatalf("expected one tool declaration, got %#v", config.Tools)
	}
	declaration := config.Tools[0].FunctionDeclarations[0]
	if declaration.Name != "lookup_status" || declaration.Description != "Look up current status" {
		t.Fatalf("expected normalized declaration metadata, got %#v", declaration)
	}
	if config.ToolConfig == nil || config.ToolConfig.FunctionCallingConfig == nil {
		t.Fatalf("expected default tool config, got %#v", config.ToolConfig)
	}
	if config.ToolConfig.FunctionCallingConfig.Mode != genai.FunctionCallingConfigModeAuto {
		t.Fatalf("expected auto function calling mode, got %#v", config.ToolConfig.FunctionCallingConfig.Mode)
	}
	if config.ThinkingConfig == nil {
		t.Fatal("expected thinking config")
	}
	if !config.ThinkingConfig.IncludeThoughts {
		t.Fatalf("expected includeThoughts=true, got %#v", config.ThinkingConfig)
	}
	if config.ThinkingConfig.ThinkingBudget == nil || *config.ThinkingConfig.ThinkingBudget != 64 {
		t.Fatalf("expected thinking budget 64, got %#v", config.ThinkingConfig.ThinkingBudget)
	}
	if config.ThinkingConfig.ThinkingLevel != genai.ThinkingLevelMedium {
		t.Fatalf("expected thinking level medium, got %#v", config.ThinkingConfig.ThinkingLevel)
	}
}
