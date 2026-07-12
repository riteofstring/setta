package conversation

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestInputServiceNormalizesAndSubmitsToDurableBoundary(t *testing.T) {
	store := &recordingConversationInputStore{}
	service, err := newInputService(store, func() time.Time {
		return time.Date(2026, 7, 12, 18, 0, 1, 0, time.UTC)
	})
	if err != nil {
		t.Fatalf("newInputService: %v", err)
	}
	paneID := "pane_alpha"
	input := ConversationInput{
		ID:             "input_alpha",
		ConversationID: "conversation_alpha",
		SourcePaneID:   &paneID,
		Text:           "  Keep exact text.  ",
		Modality:       ConversationInputModalityVoice,
		RequestedMode:  ConversationInputModeRoute,
		SubmittedAt:    "2026-07-12T18:00:00.000Z",
	}

	accepted, err := service.SubmitInput(context.Background(), input)
	if err != nil {
		t.Fatalf("SubmitInput: %v", err)
	}
	if store.acceptedAt != "2026-07-12T18:00:01Z" {
		t.Fatalf("acceptedAt = %q", store.acceptedAt)
	}
	if store.input.SubmittedAt != "2026-07-12T18:00:00Z" || store.input.Text != input.Text {
		t.Fatalf("stored input = %+v", store.input)
	}
	paneID = "mutated"
	if *accepted.Input.SourcePaneID != "pane_alpha" {
		t.Fatalf("accepted input aliases caller: %+v", accepted)
	}
}

func TestInputServiceRejectsInvalidDependenciesAndStoreResults(t *testing.T) {
	if _, err := NewInputService(nil); err == nil {
		t.Fatal("NewInputService(nil) succeeded")
	}
	for _, test := range []struct {
		name  string
		store *recordingConversationInputStore
	}{
		{name: "invalid receipt", store: &recordingConversationInputStore{invalid: true}},
		{name: "different input", store: &recordingConversationInputStore{differentInput: true}},
	} {
		t.Run(test.name, func(t *testing.T) {
			service, err := newInputService(test.store, time.Now)
			if err != nil {
				t.Fatalf("newInputService: %v", err)
			}
			_, err = service.SubmitInput(context.Background(), validConversationInputServiceInput())
			if !IsInvalidConversationInputReceipt(err) {
				t.Fatalf("SubmitInput error = %v, want invalid receipt", err)
			}
		})
	}
}

func TestInputServicePreservesTypedStoreConflict(t *testing.T) {
	conflict := &ConversationInputConflictError{InputID: "input_conflict"}
	service, err := newInputService(
		&recordingConversationInputStore{err: conflict},
		time.Now,
	)
	if err != nil {
		t.Fatalf("newInputService: %v", err)
	}
	input := validConversationInputServiceInput()
	input.ID = "input_conflict"
	_, err = service.SubmitInput(context.Background(), input)
	if !errors.Is(err, conflict) {
		t.Fatalf("SubmitInput error = %v, want conflict", err)
	}
}

type recordingConversationInputStore struct {
	acceptedAt     string
	differentInput bool
	err            error
	input          ConversationInput
	invalid        bool
}

func (store *recordingConversationInputStore) AcceptConversationInput(
	_ context.Context,
	input ConversationInput,
	acceptedAt string,
) (AcceptedConversationInput, error) {
	if store.err != nil {
		return AcceptedConversationInput{}, store.err
	}
	store.input = cloneConversationInput(input)
	store.acceptedAt = acceptedAt
	accepted := AcceptedConversationInput{
		Sequence:   1,
		Input:      cloneConversationInput(input),
		Status:     ConversationInputStatusAccepted,
		AcceptedAt: acceptedAt,
	}
	if store.invalid {
		accepted.Sequence = 0
	}
	if store.differentInput {
		accepted.Input.Text = "different input"
	}
	return accepted, nil
}

func validConversationInputServiceInput() ConversationInput {
	return ConversationInput{
		ID:             "input_service",
		ConversationID: "conversation_alpha",
		Text:           "Route this",
		Modality:       ConversationInputModalityText,
		RequestedMode:  ConversationInputModeRoute,
		SubmittedAt:    "2026-07-12T18:00:00Z",
	}
}
