package evalharness

import (
	"strings"
	"testing"
	"unicode/utf8"

	"setta/internal/conversation"
	"setta/internal/director"
)

func TestPhase1ReceiptRequiresExactlyOneWorkstream(t *testing.T) {
	first := "workstream-first"
	second := "workstream-second"
	tests := []struct {
		name       string
		calls      []director.DirectorToolCall
		workstream string
		diagnostic string
	}{
		{
			name: "one workstream across create and submit",
			calls: []director.DirectorToolCall{
				{Tool: "create_workstream", Succeeded: true, WorkstreamID: &first},
				{Tool: "submit_work", Succeeded: true, WorkstreamID: &first},
			},
			workstream: first,
		},
		{
			name:       "no successful work",
			calls:      []director.DirectorToolCall{{Tool: "create_workstream", Succeeded: false}},
			diagnostic: "director_did_not_start_work",
		},
		{
			name: "multiple workstreams",
			calls: []director.DirectorToolCall{
				{Tool: "create_workstream", Succeeded: true, WorkstreamID: &first},
				{Tool: "create_workstream", Succeeded: true, WorkstreamID: &second},
			},
			diagnostic: "director_started_multiple_workstreams",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			workstream, diagnostic, _ := phase1ReceiptWorkstream(director.DirectorReceipt{
				Submit: &director.DirectorTurnReceipt{ToolCalls: test.calls},
			})
			if workstream != test.workstream || diagnostic != test.diagnostic {
				t.Fatalf(
					"receipt result = %q/%q, want %q/%q",
					workstream,
					diagnostic,
					test.workstream,
					test.diagnostic,
				)
			}
		})
	}
}

func TestPhase1ObservedTurnRequiresOneDisposableTurn(t *testing.T) {
	turn := conversation.ConversationTurn{ID: "turn-eval"}
	observed, diagnostic, _ := phase1ObservedTurn(conversation.ConversationSnapshot{
		Turns: conversation.ConversationTurnWindow{Turns: []conversation.ConversationTurn{turn}},
	})
	if observed.ID != turn.ID || diagnostic != "" {
		t.Fatalf("observed turn = %q/%q", observed.ID, diagnostic)
	}

	_, diagnostic, _ = phase1ObservedTurn(conversation.ConversationSnapshot{
		Turns: conversation.ConversationTurnWindow{Turns: []conversation.ConversationTurn{}},
	})
	if diagnostic != "director_did_not_start_agent_turn" {
		t.Fatalf("empty turn diagnostic = %q", diagnostic)
	}

	_, diagnostic, _ = phase1ObservedTurn(conversation.ConversationSnapshot{
		Turns: conversation.ConversationTurnWindow{
			Turns:      []conversation.ConversationTurn{turn},
			HasEarlier: true,
		},
	})
	if diagnostic != "director_started_multiple_agent_turns" {
		t.Fatalf("non-disposable turn diagnostic = %q", diagnostic)
	}
}

func TestBoundedResultDiagnosticPreservesUTF8(t *testing.T) {
	value := string([]byte{0xff}) + strings.Repeat("a", ResultMaximumDiagnosticBytes-2) + "🙂"
	bounded := boundedResultDiagnostic(value)
	if len(bounded) > ResultMaximumDiagnosticBytes {
		t.Fatalf("bounded diagnostic is %d bytes", len(bounded))
	}
	if !utf8.ValidString(bounded) || !strings.HasSuffix(bounded, "...") {
		t.Fatalf("bounded diagnostic is not valid truncated UTF-8: %q", bounded[len(bounded)-8:])
	}
}
