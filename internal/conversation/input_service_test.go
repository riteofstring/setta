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

func TestInputServiceReadsRetriesAndDiscardsDurableRoutingState(t *testing.T) {
	input := validConversationInputServiceInput()
	store := &recordingConversationInputStore{
		acceptedAt: "2026-07-12T18:00:01Z",
		input:      input,
	}
	service, err := newInputService(store, func() time.Time {
		return time.Date(2026, 7, 12, 18, 0, 2, 0, time.UTC)
	})
	if err != nil {
		t.Fatalf("newInputService: %v", err)
	}
	state, err := service.ReadInputState(context.Background(), "workspace", input.ConversationID, input.ID)
	if err != nil {
		t.Fatalf("ReadInputState: %v", err)
	}
	if state.Input.Input.ID != input.ID {
		t.Fatalf("routing state = %+v", state)
	}
	if _, err := service.RetryInput(context.Background(), "workspace", input.ConversationID, input.ID); err != nil {
		t.Fatalf("RetryInput: %v", err)
	}
	if store.retriedAt != "2026-07-12T18:00:02Z" || store.inputID != input.ID {
		t.Fatalf("retry capture = %+v", store)
	}
	if _, err := service.DiscardInput(context.Background(), "workspace", input.ConversationID, input.ID); err != nil {
		t.Fatalf("DiscardInput: %v", err)
	}
	if store.discardedAt != "2026-07-12T18:00:02Z" ||
		store.workspaceID != "workspace" || store.conversationID != input.ConversationID {
		t.Fatalf("discard capture = %+v", store)
	}
}

type recordingConversationInputStore struct {
	acceptedAt     string
	conversationID string
	discardedAt    string
	differentInput bool
	err            error
	input          ConversationInput
	inputID        string
	invalid        bool
	retriedAt      string
	workspaceID    string
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

func (store *recordingConversationInputStore) DiscardConversationInputRouting(
	_ context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
	discardedAt string,
) error {
	store.workspaceID = workspaceID
	store.conversationID = conversationID
	store.inputID = inputID
	store.discardedAt = discardedAt
	return store.err
}

func (store *recordingConversationInputStore) ReadConversationInputRoutingState(
	_ context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
) (ConversationInputRoutingState, error) {
	store.workspaceID = workspaceID
	store.conversationID = conversationID
	store.inputID = inputID
	if store.err != nil {
		return ConversationInputRoutingState{}, store.err
	}
	accepted := AcceptedConversationInput{
		Sequence:   1,
		Input:      cloneConversationInput(store.input),
		Status:     ConversationInputStatusAccepted,
		AcceptedAt: store.acceptedAt,
	}
	return ConversationInputRoutingState{
		Input: ConversationInputState{
			Sequence:   accepted.Sequence,
			Input:      accepted.Input,
			Status:     accepted.Status,
			AcceptedAt: accepted.AcceptedAt,
		},
		Decisions: []ConversationRouteDecisionRecord{},
	}, nil
}

func (store *recordingConversationInputStore) RetryConversationInputRouting(
	_ context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
	retriedAt string,
) (AcceptedConversationInput, error) {
	store.workspaceID = workspaceID
	store.conversationID = conversationID
	store.inputID = inputID
	store.retriedAt = retriedAt
	if store.err != nil {
		return AcceptedConversationInput{}, store.err
	}
	return AcceptedConversationInput{
		Sequence:   1,
		Input:      cloneConversationInput(store.input),
		Status:     ConversationInputStatusAccepted,
		AcceptedAt: store.acceptedAt,
	}, nil
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
