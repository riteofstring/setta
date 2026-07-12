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
		Source:             MasterInputSourceShell,
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
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-12T18:00:00Z",
	})
	if err == nil {
		t.Fatal("SubmitInput accepted invalid store result")
	}
}

func TestServiceReadsAndClonesValidatedActiveShellInteraction(t *testing.T) {
	input := MasterInput{
		ID:          "input_active",
		Text:        "Restore this request",
		Modality:    MasterInputModalityText,
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-12T18:00:00Z",
	}
	state := ShellInteractionState{
		Input:  input,
		Status: InputRoutingStatusAccepted,
	}
	store := &recordingInputStore{interaction: ActiveShellInteraction{State: &state}}
	service, err := newService(store, time.Now)
	if err != nil {
		t.Fatalf("newService: %v", err)
	}
	interaction, err := service.ReadActiveShellInteraction(context.Background())
	if err != nil {
		t.Fatalf("ReadActiveShellInteraction: %v", err)
	}
	interaction.State.Input.Text = "mutated"
	if store.interaction.State.Input.Text != "Restore this request" {
		t.Fatalf("interaction aliases store: %+v", store.interaction)
	}

	store.interaction.State.Status = InputRoutingStatusFailed
	store.interaction.State.Failure = &ShellInteractionFailure{
		Code: "failed", Message: "failed",
	}
	if _, err := service.ReadActiveShellInteraction(context.Background()); err == nil {
		t.Fatal("ReadActiveShellInteraction accepted a terminal store projection")
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
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-12T18:00:00Z",
	})
	if !errors.Is(err, conflict) {
		t.Fatalf("SubmitInput error = %v, want conflict", err)
	}
}

func TestServiceReadsAndClonesMasterInputRoutingState(t *testing.T) {
	input := MasterInput{
		ID:          "input_state",
		Text:        "Read this route state.",
		Modality:    MasterInputModalityText,
		Source:      MasterInputSourceShell,
		SubmittedAt: "2026-07-12T18:00:00Z",
	}
	store := &recordingInputStore{state: InputRoutingState{
		Input: AcceptedMasterInput{
			Sequence:      1,
			Input:         input,
			ReplyDelivery: ReplyDeliveryForInput(input),
			AcceptedAt:    "2026-07-12T18:00:01Z",
		},
		Status: InputRoutingStatusAccepted,
	}}
	service, err := newService(store, time.Now)
	if err != nil {
		t.Fatalf("newService: %v", err)
	}
	state, err := service.ReadInputState(context.Background(), input.ID)
	if err != nil {
		t.Fatalf("ReadInputState: %v", err)
	}
	state.Input.Input.Text = "mutated"
	if store.state.Input.Input.Text != input.Text {
		t.Fatal("routing state aliases store")
	}
	waited, err := service.WaitShellInteraction(context.Background(), input.ID)
	if err != nil {
		t.Fatalf("WaitShellInteraction: %v", err)
	}
	waited.Input.Text = "mutated wait"
	if store.state.Input.Input.Text != input.Text {
		t.Fatal("waited routing state aliases store")
	}
	store.state.Status = "unsupported"
	if _, err := service.ReadInputState(context.Background(), input.ID); err == nil {
		t.Fatal("ReadInputState accepted invalid store state")
	}
}

type recordingInputStore struct {
	acceptedAt  string
	err         error
	interaction ActiveShellInteraction
	input       MasterInput
	invalid     bool
	state       InputRoutingState
}

func (store *recordingInputStore) ReadMasterInputRoutingState(
	_ context.Context,
	_ string,
) (InputRoutingState, error) {
	return CloneInputRoutingState(store.state), store.err
}

func (store *recordingInputStore) WaitForMasterInputRoutingState(
	_ context.Context,
	_ string,
) (InputRoutingState, error) {
	return CloneInputRoutingState(store.state), store.err
}

func (store *recordingInputStore) ReadActiveMasterShellInteraction(
	_ context.Context,
) (ActiveShellInteraction, error) {
	return CloneActiveShellInteraction(store.interaction), store.err
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
	accepted := AcceptedMasterInput{
		Sequence:      1,
		Input:         cloneInput(input),
		ReplyDelivery: ReplyDeliveryForInput(input),
		AcceptedAt:    acceptedAt,
	}
	if store.invalid {
		accepted.Sequence = 0
	}
	return accepted, nil
}

func TestServiceRejectsRendererAuthoredConversationEscalation(t *testing.T) {
	store := &recordingInputStore{}
	service, err := newService(store, time.Now)
	if err != nil {
		t.Fatalf("newService: %v", err)
	}
	workspaceID := "workspace_alpha"
	conversationID := "conversation_alpha"
	conversationInputID := "input_alpha"
	_, err = service.SubmitInput(context.Background(), MasterInput{
		ID:                             "master_input_escalation",
		Text:                           "Route this elsewhere.",
		Modality:                       MasterInputModalityText,
		Source:                         MasterInputSourceConversationEscalation,
		SubmittedAt:                    "2026-07-12T18:00:00Z",
		OriginatingWorkspaceID:         &workspaceID,
		OriginatingConversationID:      &conversationID,
		OriginatingConversationInputID: &conversationInputID,
	})
	if err == nil || store.input.ID != "" {
		t.Fatalf("SubmitInput escalation error=%v stored=%+v", err, store.input)
	}
}
