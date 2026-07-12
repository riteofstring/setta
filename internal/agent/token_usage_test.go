package agent

import (
	"encoding/json"
	"testing"

	"setta/internal/codexapp"
)

func TestTurnTokenUsageFallsBackForMissingProviderDimensions(t *testing.T) {
	usage, err := newTurnTokenUsage("materialized input")
	if err != nil {
		t.Fatalf("newTurnTokenUsage: %v", err)
	}
	if err := usage.addOutput("materialized output"); err != nil {
		t.Fatalf("addOutput: %v", err)
	}
	estimated := usage.snapshot()
	if err := usage.observeProvider(codexapp.ThreadTokenUsageUpdatedNotification{
		TokenUsage: codexapp.ThreadTokenUsage{
			Last: codexapp.TokenUsageBreakdown{
				InputTokens:       101,
				CachedInputTokens: 11,
			},
		},
	}); err != nil {
		t.Fatalf("observeProvider: %v", err)
	}

	got := usage.snapshot()
	want := TokenUsage{
		InputTokens:       101,
		CachedInputTokens: 11,
		OutputTokens:      estimated.OutputTokens,
	}
	if got != want {
		t.Fatalf("partial provider usage = %+v, want %+v", got, want)
	}
}

func TestTerminalUsageSnapshotMatchesReturnedResult(t *testing.T) {
	usage, err := newTurnTokenUsage("original input")
	if err != nil {
		t.Fatalf("newTurnTokenUsage: %v", err)
	}
	sink := &terminalMutatingUsageSink{usage: usage}
	base := Event{
		ConversationID:   "conversation-terminal-usage",
		TurnID:           "turn-terminal-usage",
		ProviderThreadID: "provider-thread-terminal-usage",
		ProviderTurnID:   "provider-turn-terminal-usage",
	}
	result, done, err := (&Runtime{}).handleProviderNotification(
		codexapp.Message{
			Method: codexapp.CodexNotificationTurnCompleted,
			Params: json.RawMessage(`{
				"threadId":"provider-thread-terminal-usage",
				"turn":{
					"id":"provider-turn-terminal-usage",
					"items":[],
					"status":"completed"
				}
			}`),
		},
		base,
		sink,
		usage,
	)
	if err != nil {
		t.Fatalf("handleProviderNotification: %v", err)
	}
	if !done || sink.observed == nil || result.Usage == nil {
		t.Fatalf("terminal result = %+v, done=%t, observed=%+v", result, done, sink.observed)
	}
	if *result.Usage != *sink.observed {
		t.Fatalf("returned usage = %+v, emitted usage = %+v", *result.Usage, *sink.observed)
	}
}

type terminalMutatingUsageSink struct {
	usage    *turnTokenUsage
	observed *TokenUsage
}

func (sink *terminalMutatingUsageSink) HandleAgentEvent(event Event) error {
	if event.Kind != EventKindTurnTerminal || event.Terminal == nil || event.Terminal.Usage == nil {
		return nil
	}
	sink.observed = tokenUsagePointer(*event.Terminal.Usage)
	return sink.usage.addInput("steering accepted at the terminal boundary")
}
