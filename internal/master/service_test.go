package master

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestServiceNormalizesAndSubmitsInputToDurableBoundary(t *testing.T) {
	store := &recordingInputStore{}
	service, err := newService(store, func() time.Time {
		return time.Date(2026, 7, 12, 18, 0, 1, 0, time.UTC)
	})
	if err != nil {
		t.Fatalf("newService: %v", err)
	}
	workspaceID := "workspace_alpha"
	input := MasterInput{
		ID:                 "input_alpha",
		Text:               "  Keep exact text.  ",
		Modality:           MasterInputModalityVoice,
		SubmittedAt:        "2026-07-12T18:00:00.000Z",
		FocusedWorkspaceID: &workspaceID,
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
	workspaceID = "mutated"
	if *accepted.Input.FocusedWorkspaceID != "workspace_alpha" {
		t.Fatalf("accepted input aliases caller: %+v", accepted)
	}
}

func TestServiceRejectsInvalidDependenciesAndStoreResults(t *testing.T) {
	if _, err := NewService(nil); err == nil {
		t.Fatal("NewService(nil) succeeded")
	}
	service, err := newService(&recordingInputStore{invalid: true}, time.Now)
	if err != nil {
		t.Fatalf("newService: %v", err)
	}
	_, err = service.SubmitInput(context.Background(), MasterInput{
		ID:          "input_invalid_store",
		Text:        "Route this",
		Modality:    MasterInputModalityText,
		SubmittedAt: "2026-07-12T18:00:00Z",
	})
	if err == nil {
		t.Fatal("SubmitInput accepted invalid store result")
	}
}

func TestServicePreservesTypedStoreConflict(t *testing.T) {
	conflict := &InputConflictError{InputID: "input_conflict"}
	service, err := newService(&recordingInputStore{err: conflict}, time.Now)
	if err != nil {
		t.Fatalf("newService: %v", err)
	}
	_, err = service.SubmitInput(context.Background(), MasterInput{
		ID:          "input_conflict",
		Text:        "Route this",
		Modality:    MasterInputModalityVoice,
		SubmittedAt: "2026-07-12T18:00:00Z",
	})
	if !errors.Is(err, conflict) {
		t.Fatalf("SubmitInput error = %v, want conflict", err)
	}
}

type recordingInputStore struct {
	acceptedAt string
	err        error
	input      MasterInput
	invalid    bool
}

func (store *recordingInputStore) AcceptMasterInput(
	_ context.Context,
	input MasterInput,
	acceptedAt string,
) (AcceptedMasterInput, error) {
	if store.err != nil {
		return AcceptedMasterInput{}, store.err
	}
	store.input = cloneInput(input)
	store.acceptedAt = acceptedAt
	accepted := AcceptedMasterInput{Sequence: 1, Input: cloneInput(input), AcceptedAt: acceptedAt}
	if store.invalid {
		accepted.Sequence = 0
	}
	return accepted, nil
}
