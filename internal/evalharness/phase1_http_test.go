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

func TestEvaluationObservedTurnRequiresOneExactDisposableTurn(t *testing.T) {
	turn := conversation.ConversationTurn{
		ID:            "turn-eval",
		AuthoredInput: conversation.AuthoredInput{Text: "Complete the fixture task."},
		Delivery:      conversation.TurnDeliveryNormal,
	}
	observed, failure := evaluationObservedTurn(conversation.ConversationSnapshot{
		Turns: conversation.ConversationTurnWindow{Turns: []conversation.ConversationTurn{turn}},
	}, turn.AuthoredInput.Text)
	if observed.ID != turn.ID || failure != nil {
		t.Fatalf("observed turn = %q/%#v", observed.ID, failure)
	}

	_, failure = evaluationObservedTurn(conversation.ConversationSnapshot{
		Turns: conversation.ConversationTurnWindow{Turns: []conversation.ConversationTurn{}},
	}, turn.AuthoredInput.Text)
	if failure == nil || failure.code != "director_started_unexpected_agent_turns" {
		t.Fatalf("empty turn failure = %#v", failure)
	}

	_, failure = evaluationObservedTurn(conversation.ConversationSnapshot{
		Turns: conversation.ConversationTurnWindow{
			Turns:      []conversation.ConversationTurn{turn},
			HasEarlier: true,
		},
	}, turn.AuthoredInput.Text)
	if failure == nil || failure.code != "director_started_unexpected_agent_turns" {
		t.Fatalf("non-disposable turn failure = %#v", failure)
	}
}

func TestClarificationWorkstreamMustRemainStable(t *testing.T) {
	clarificationWorkstream := "workstream-clarification"
	triggers := []evaluationTriggerCandidate{{observation: EvaluationTriggerObservation{
		Trigger:      ScenarioTriggerDirectorTurnCompleted,
		WorkstreamID: &clarificationWorkstream,
	}}}
	if failure := validateClarificationWorkstream(triggers, clarificationWorkstream); failure != nil {
		t.Fatalf("stable clarification workstream failed: %#v", failure)
	}
	failure := validateClarificationWorkstream(triggers, "workstream-other")
	if failure == nil || failure.outcome != ScenarioExecutionControlFailed ||
		failure.code != "clarification_changed_workstream" {
		t.Fatalf("changed clarification workstream failure = %#v", failure)
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
