package director

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestDirectorReadinessInputKeepsCurrentRequestWhenHistoryIsTrimmed(t *testing.T) {
	request := DirectorReadinessRequest{
		Intent: directorTurnIntent("Use the answer I just supplied and continue."),
		History: []DirectorHistoryItem{
			{TurnID: "turn-old", Text: strings.Repeat("old context ", 20)},
			{TurnID: "turn-old", Assistant: true, Text: strings.Repeat("old reply ", 20)},
			{TurnID: "turn-recent", Text: "Which result should be produced?"},
			{TurnID: "turn-recent", Assistant: true, Text: "Please use the second result."},
		},
	}
	encoded, err := EncodeDirectorReadinessInput(request, 220)
	if err != nil {
		t.Fatalf("EncodeDirectorReadinessInput: %v", err)
	}
	var input directorReadinessInput
	if err := json.Unmarshal(encoded, &input); err != nil {
		t.Fatalf("decode readiness input: %v", err)
	}
	if input.CurrentRequest != request.Intent.Text {
		t.Fatalf("current request = %q", input.CurrentRequest)
	}
	for _, item := range input.RecentConversation {
		if item.TurnID == "turn-old" {
			t.Fatalf("readiness input retained partial old turn: %+v", input.RecentConversation)
		}
	}
}

func TestDirectorReadinessRestrictionRefusesWorkButLeavesOtherToolsAvailable(t *testing.T) {
	workCalled := false
	listCalled := false
	tools := []SettaTool{
		{
			Name: "create_workstream",
			Handler: func(context.Context, json.RawMessage) (SettaToolReceipt, error) {
				workCalled = true
				return SettaToolReceipt{}, nil
			},
		},
		{
			Name: "list_workspaces",
			Handler: func(context.Context, json.RawMessage) (SettaToolReceipt, error) {
				listCalled = true
				return SettaToolReceipt{Summary: "Listed workspaces."}, nil
			},
		},
	}
	review := DirectorReadinessReview{
		Disposition: DirectorReadinessUserChoiceNeeded,
		Question:    "Which result should be produced?",
		Invocation: scriptedDirectorInvocation(
			"director-readiness-invocation",
			"provider-readiness-turn",
			"gpt-test",
		),
	}
	restricted, err := toolsForDirectorReadiness(tools, review)
	if err != nil {
		t.Fatalf("toolsForDirectorReadiness: %v", err)
	}
	if _, err := restricted[0].Handler(context.Background(), json.RawMessage(`{}`)); !errors.Is(err, ErrDirectorIntentRejected) {
		t.Fatalf("work refusal = %v", err)
	}
	if workCalled {
		t.Fatal("readiness-restricted work reached its original handler")
	}
	if _, err := restricted[1].Handler(context.Background(), json.RawMessage(`{}`)); err != nil {
		t.Fatalf("read-only tool: %v", err)
	}
	if !listCalled {
		t.Fatal("readiness restriction blocked a non-work tool")
	}
}

func TestDecodeDirectorReadinessOutputEnforcesQuestionContract(t *testing.T) {
	if _, _, err := DecodeDirectorReadinessOutput(json.RawMessage(
		`{"disposition":"work_permitted","question":"What should happen?"}`,
	)); err == nil {
		t.Fatal("work-permitted readiness accepted a question")
	}
	disposition, question, err := DecodeDirectorReadinessOutput(json.RawMessage(
		`{"disposition":"user_choice_needed","question":"What should happen?"}`,
	))
	if err != nil {
		t.Fatalf("DecodeDirectorReadinessOutput: %v", err)
	}
	if disposition != DirectorReadinessUserChoiceNeeded || question != "What should happen?" {
		t.Fatalf("readiness output = %q/%q", disposition, question)
	}
}
