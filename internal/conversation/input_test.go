package conversation

import (
	"strings"
	"testing"
)

func TestNormalizeConversationInputPreservesTextAndNormalizesUTCMetadata(t *testing.T) {
	sourcePaneID := "pane_alpha"
	replyToInputID := "input_parent"
	input := ConversationInput{
		ID:             "input_alpha",
		ConversationID: "conversation_alpha",
		SourcePaneID:   &sourcePaneID,
		ReplyToInputID: &replyToInputID,
		Text:           "  Keep the pane transcript exact.  ",
		Modality:       ConversationInputModalityVoice,
		RequestedMode:  ConversationInputModeRoute,
		SubmittedAt:    "2026-07-12T18:00:00.000Z",
	}

	normalized, err := NormalizeConversationInput(input)
	if err != nil {
		t.Fatalf("NormalizeConversationInput: %v", err)
	}
	if normalized.Text != input.Text {
		t.Fatalf("text = %q, want exact %q", normalized.Text, input.Text)
	}
	if normalized.SubmittedAt != "2026-07-12T18:00:00Z" {
		t.Fatalf("submittedAt = %q, want canonical UTC", normalized.SubmittedAt)
	}
	sourcePaneID = "mutated"
	replyToInputID = "mutated"
	if *normalized.SourcePaneID != "pane_alpha" || *normalized.ReplyToInputID != "input_parent" {
		t.Fatalf("normalized input aliases caller pointers: %+v", normalized)
	}
}

func TestNormalizeConversationInputAcceptsEveryOwnedModeAndModality(t *testing.T) {
	modes := []ConversationInputMode{
		ConversationInputModeRoute,
		ConversationInputModeSend,
		ConversationInputModeQueue,
		ConversationInputModeSteer,
		ConversationInputModeAskNarrator,
		ConversationInputModeSide,
		ConversationInputModeFork,
	}
	modalities := []ConversationInputModality{
		ConversationInputModalityText,
		ConversationInputModalityVoice,
	}
	for _, mode := range modes {
		for _, modality := range modalities {
			t.Run(string(mode)+"/"+string(modality), func(t *testing.T) {
				input := validConversationInput("input_" + string(mode))
				input.RequestedMode = mode
				input.Modality = modality
				if _, err := NormalizeConversationInput(input); err != nil {
					t.Fatalf("NormalizeConversationInput: %v", err)
				}
			})
		}
	}
}

func TestNormalizeConversationInputRejectsInvalidContracts(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*ConversationInput)
	}{
		{name: "missing id", mutate: func(input *ConversationInput) { input.ID = "" }},
		{name: "oversized id", mutate: func(input *ConversationInput) { input.ID = strings.Repeat("i", MaxConversationInputIDBytes+1) }},
		{name: "unsafe id", mutate: func(input *ConversationInput) { input.ID = "input/unsafe" }},
		{name: "missing conversation", mutate: func(input *ConversationInput) { input.ConversationID = "" }},
		{name: "oversized conversation", mutate: func(input *ConversationInput) {
			input.ConversationID = strings.Repeat("c", MaxConversationInputReferenceBytes+1)
		}},
		{name: "empty source pane", mutate: func(input *ConversationInput) { empty := ""; input.SourcePaneID = &empty }},
		{name: "spaced source pane", mutate: func(input *ConversationInput) { spaced := " pane "; input.SourcePaneID = &spaced }},
		{name: "unsafe reply id", mutate: func(input *ConversationInput) { replyID := "input/unsafe"; input.ReplyToInputID = &replyID }},
		{name: "self reply", mutate: func(input *ConversationInput) { input.ReplyToInputID = &input.ID }},
		{name: "blank text", mutate: func(input *ConversationInput) { input.Text = " \n " }},
		{name: "oversized text", mutate: func(input *ConversationInput) { input.Text = strings.Repeat("x", MaxConversationInputTextBytes+1) }},
		{name: "unknown modality", mutate: func(input *ConversationInput) { input.Modality = "audio" }},
		{name: "unknown mode", mutate: func(input *ConversationInput) { input.RequestedMode = "guess" }},
		{name: "non UTC timestamp", mutate: func(input *ConversationInput) { input.SubmittedAt = "2026-07-12T11:00:00-07:00" }},
		{name: "invalid timestamp", mutate: func(input *ConversationInput) { input.SubmittedAt = "today" }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := validConversationInput("input_valid")
			test.mutate(&input)
			if _, err := NormalizeConversationInput(input); err == nil {
				t.Fatal("NormalizeConversationInput succeeded, want validation error")
			}
		})
	}
}

func TestAcceptedConversationInputRequiresNormalizedDurableRecord(t *testing.T) {
	accepted := AcceptedConversationInput{
		Sequence:   1,
		Input:      validConversationInput("input_valid"),
		Status:     ConversationInputStatusAccepted,
		AcceptedAt: "2026-07-12T18:00:01Z",
	}
	statuses := []ConversationInputStatus{
		ConversationInputStatusAccepted,
		ConversationInputStatusRouting,
		ConversationInputStatusAwaitingClarification,
		ConversationInputStatusDispatched,
		ConversationInputStatusFailed,
	}
	for _, status := range statuses {
		accepted.Status = status
		if err := accepted.Validate(); err != nil {
			t.Fatalf("Validate status %s: %v", status, err)
		}
	}
	accepted.Status = "unknown"
	if err := accepted.Validate(); err == nil {
		t.Fatal("Validate accepted unknown status")
	}
	accepted.Status = ConversationInputStatusAccepted
	accepted.Input.SubmittedAt = "2026-07-12T18:00:00.000Z"
	if err := accepted.Validate(); err == nil {
		t.Fatal("Validate accepted non-normalized submittedAt")
	}
	accepted.Input.SubmittedAt = "2026-07-12T18:00:00Z"
	accepted.AcceptedAt = "2026-07-12T18:00:01.000Z"
	if err := accepted.Validate(); err == nil {
		t.Fatal("Validate accepted non-normalized acceptedAt")
	}
}

func TestConversationInputEventIdentityIsScopedAndValidated(t *testing.T) {
	streamID, err := ConversationInputStreamID("conversation_alpha")
	if err != nil {
		t.Fatalf("ConversationInputStreamID: %v", err)
	}
	if streamID != "conversation-inputs:conversation_alpha" {
		t.Fatalf("stream id = %q", streamID)
	}
	conversationStreamID, err := ConversationStreamID("conversation_alpha:inputs")
	if err != nil {
		t.Fatalf("ConversationStreamID: %v", err)
	}
	if streamID == conversationStreamID {
		t.Fatalf("input stream %q collides with conversation stream", streamID)
	}
	eventID, err := ConversationInputAcceptedEventID("input_alpha")
	if err != nil {
		t.Fatalf("ConversationInputAcceptedEventID: %v", err)
	}
	if eventID != "conversation-input-accepted:input_alpha" {
		t.Fatalf("event id = %q", eventID)
	}
	if _, err := ConversationInputAcceptedEventID("unsafe/input"); err == nil {
		t.Fatal("unsafe event input id was accepted")
	}
}

func validConversationInput(inputID string) ConversationInput {
	return ConversationInput{
		ID:             inputID,
		ConversationID: "conversation_alpha",
		Text:           "Route this request",
		Modality:       ConversationInputModalityText,
		RequestedMode:  ConversationInputModeRoute,
		SubmittedAt:    "2026-07-12T18:00:00Z",
	}
}
