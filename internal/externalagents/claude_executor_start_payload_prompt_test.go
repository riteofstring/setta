package externalagents

import (
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
)

func TestBuildClaudeStartPayloadUsesLatestUserPrompt(t *testing.T) {
	t.Parallel()

	payload := buildClaudeStartPayload(StartRequest{
		Run: agentruns.NewRun(nil, map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "system-1",
					"role": "system",
					"content": []any{
						map[string]any{"type": "text", "text": "System prompt"},
					},
				},
				map[string]any{
					"id":   "assistant-1",
					"role": "assistant",
					"content": []any{
						map[string]any{"type": "text", "text": "Earlier reply"},
					},
				},
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Latest request"},
					},
				},
			},
			"systemPrompt": "System prompt",
		}, time.Date(2026, 3, 9, 13, 35, 0, 0, time.UTC)),
		ExternalConfig: externalagentconfigs.Config{
			ToolType: externalagentconfigs.ToolTypeClaudeCode,
			RunMode:  externalagentconfigs.RunModeSDK,
		},
		Inputs: map[string]any{
			"messages": []any{
				map[string]any{
					"id":   "system-1",
					"role": "system",
					"content": []any{
						map[string]any{"type": "text", "text": "System prompt"},
					},
				},
				map[string]any{
					"id":   "assistant-1",
					"role": "assistant",
					"content": []any{
						map[string]any{"type": "text", "text": "Earlier reply"},
					},
				},
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Latest request"},
					},
				},
			},
			"systemPrompt": "System prompt",
		},
	}, "/tmp/workspace", map[string]string{})

	prompt := stringValue(payload["prompt"])
	if prompt != "Latest request\n" {
		t.Fatalf("expected latest user prompt with trailing newline, got %q", prompt)
	}
	if strings.Contains(prompt, "System prompt") || strings.Contains(prompt, "Earlier reply") {
		t.Fatalf("expected prompt to exclude system and assistant text, got %q", prompt)
	}
}
