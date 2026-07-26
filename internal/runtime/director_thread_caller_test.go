package runtime

import (
	"testing"

	"setta/internal/agent"
	"setta/internal/director"
)

func TestDirectorHistoryBudgetDropsWholeOldestTurns(t *testing.T) {
	history := []director.DirectorThreadHistoryItem{
		{TurnID: "turn-1", Text: "first user"},
		{TurnID: "turn-1", Assistant: true, Text: "first assistant"},
		{TurnID: "turn-2", Text: "second user"},
		{TurnID: "turn-2", Assistant: true, Text: "second assistant"},
	}
	secondTurnBytes := len(history[2].Text) + len(history[3].Text)

	bounded := directorHistoryWithinBudget(history, secondTurnBytes)

	if len(bounded) != 2 ||
		bounded[0].TurnID != "turn-2" ||
		bounded[0].Assistant ||
		!bounded[1].Assistant {
		t.Fatalf("bounded Director history = %+v", bounded)
	}
}

func TestDirectorTurnSinkPrefersCompletedAssistantText(t *testing.T) {
	sink := &directorTurnSink{}
	events := []agent.Event{
		{
			Kind: agent.EventKindAgentTextDelta,
			Text: &agent.TextEvent{ProviderItemID: "message-1", Text: "partial"},
		},
		{
			Kind: agent.EventKindAgentTextCompleted,
			Text: &agent.TextEvent{ProviderItemID: "message-1", Text: "complete"},
		},
	}
	for _, event := range events {
		if err := sink.HandleAgentEvent(event); err != nil {
			t.Fatalf("HandleAgentEvent: %v", err)
		}
	}
	if reply := sink.replyText(); reply != "complete" {
		t.Fatalf("Director reply = %q, want complete", reply)
	}
}
