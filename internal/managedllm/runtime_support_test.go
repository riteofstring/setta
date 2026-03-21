package managedllm

import (
	"testing"

	"setta/internal/llmconfig"
)

func TestSupportsThinkingOutputRequiresExplicitReasoningConfigForOpenAI(t *testing.T) {
	t.Parallel()

	// The UI should only enable thinking when the backend has explicit OpenAI
	// reasoning config, not from model-name heuristics alone.
	if !SupportsThinkingOutput(llmconfig.Config{
		ID:       "openai-explicit",
		Model:    "gpt-5-codex",
		Provider: "openai",
		OtherParams: map[string]any{
			"reasoning_effort": "high",
		},
	}) {
		t.Fatal("expected explicit OpenAI reasoning config to advertise thinking support")
	}

	if SupportsThinkingOutput(llmconfig.Config{
		ID:       "openai-heuristic-only",
		Model:    "gpt-5-codex",
		Provider: "openai",
	}) {
		t.Fatal("expected OpenAI heuristic-only config to stay disabled for caller runtime support")
	}
}

func TestSupportsThinkingOutputKeepsAzureFailClosed(t *testing.T) {
	t.Parallel()

	// Azure standard turns are supported, but thinking remains an explicit
	// fail-closed boundary until that provider edge is intentionally widened.
	if SupportsThinkingOutput(llmconfig.Config{
		ID:       "azure-explicit",
		Model:    "gpt-5-codex",
		Provider: "azure",
		OtherParams: map[string]any{
			"reasoning_effort": "high",
		},
	}) {
		t.Fatal("expected Azure config to stay fail-closed for thinking runtime support")
	}
}
