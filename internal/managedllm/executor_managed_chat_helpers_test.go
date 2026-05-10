package managedllm

import (
	"testing"

	"setta/internal/agentruns"
	"setta/internal/managedchat"
)

func assertManagedChatTextStreamResult(
	t *testing.T,
	live *managedchat.LiveRuntime,
	run agentruns.Run,
	broadcaster *captureBroadcaster,
	result agentruns.ExecutionResult,
	expectedText string,
	expectedBroadcastCount int,
	expectedPromptTokens int,
) {
	t.Helper()

	state, err := live.GetLiveChatState(run.ID)
	if err != nil {
		t.Fatalf("get live state: %v", err)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	if len(state.Messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %#v", state.Messages)
	}
	if assistantText(state.Messages[1]) != expectedText {
		t.Fatalf("unexpected assistant text %#v", state.Messages[1])
	}
	if broadcaster.Count() != expectedBroadcastCount {
		t.Fatalf("expected %d streaming broadcasts, got %d", expectedBroadcastCount, broadcaster.Count())
	}

	outputMessages, ok := result.Outputs["messages"].([]any)
	if !ok || len(outputMessages) != 2 {
		t.Fatalf("expected two output messages, got %#v", result.Outputs["messages"])
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok || int(usage["prompt_tokens"].(float64)) != expectedPromptTokens {
		t.Fatalf("unexpected usage payload %#v", result.Outputs["usage"])
	}
}
