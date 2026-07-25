package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"setta/internal/conversation"
	"setta/internal/master"
)

func TestMasterInputEndpointAcceptsTypedGlobalVoiceSubmission(t *testing.T) {
	service := &fakeHTTPMasterInputService{}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		MasterInputService: service,
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
	})
	workspaceID := "workspace_alpha"
	conversationID := "conversation_alpha"
	input := master.MasterInput{
		ID:                    "input_alpha",
		Text:                  "  Keep the finalized transcript exact.  ",
		Modality:              master.MasterInputModalityVoice,
		Source:                master.MasterInputSourceShell,
		SubmittedAt:           "2026-07-12T18:00:00Z",
		FocusedWorkspaceID:    &workspaceID,
		FocusedConversationID: &conversationID,
	}

	accepted := postJSON[master.AcceptedMasterInput](
		t,
		handler,
		"/master/inputs/submit",
		SubmitMasterInputRequest{Input: input},
		http.StatusAccepted,
	)
	if !master.EqualInputs(service.input, input) || !master.EqualInputs(accepted.Input, input) {
		t.Fatalf("service=%+v accepted=%+v want input=%+v", service.input, accepted, input)
	}
	if accepted.Sequence != 1 || accepted.AcceptedAt != "2026-07-12T18:00:01Z" {
		t.Fatalf("accepted = %+v", accepted)
	}
}

func TestActiveMasterShellInteractionEndpointReadsOnlyRestorableState(t *testing.T) {
	input := validSubmitMasterInputRequest().Input
	state := master.ShellInteractionState{
		Input:  input,
		Status: master.InputRoutingStatusAccepted,
	}
	service := &fakeHTTPMasterInputService{
		interaction: master.ActiveShellInteraction{State: &state},
	}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		MasterInputService: service,
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
	})

	interaction := getJSON[master.ActiveShellInteraction](
		t,
		handler,
		"/master/interaction/active",
		http.StatusOK,
	)
	if service.interactionCalls != 1 || interaction.State == nil ||
		!master.EqualInputs(interaction.State.Input, input) {
		t.Fatalf("interaction=%+v calls=%d", interaction, service.interactionCalls)
	}
}

func TestMasterInputRoutingStateEndpointReadsValidatedState(t *testing.T) {
	input := validSubmitMasterInputRequest().Input
	service := &fakeHTTPMasterInputService{state: master.InputRoutingState{
		Input: master.AcceptedMasterInput{
			Sequence:      1,
			Input:         input,
			ReplyDelivery: master.ReplyDeliveryForInput(input),
			AcceptedAt:    "2026-07-12T18:00:01Z",
		},
		Status: master.InputRoutingStatusAccepted,
	}}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		MasterInputService: service,
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
	})
	state := postJSON[master.InputRoutingState](
		t,
		handler,
		"/master/inputs/state/read",
		ReadMasterInputRoutingStateRequest{InputID: input.ID},
		http.StatusOK,
	)
	if service.stateInputID != input.ID || state.Status != master.InputRoutingStatusAccepted ||
		state.Input.Input.ID != input.ID {
		t.Fatalf("routing state=%+v inputID=%q", state, service.stateInputID)
	}
	waited := postJSON[master.ShellInteractionState](
		t,
		handler,
		"/master/interaction/wait",
		ReadMasterInputRoutingStateRequest{InputID: input.ID},
		http.StatusOK,
	)
	if service.waitInputID != input.ID || waited.Status != master.InputRoutingStatusAccepted {
		t.Fatalf("waited routing state=%+v inputID=%q", waited, service.waitInputID)
	}
}

func TestMasterTranscriptEndpointReadsValidatedDurableTranscript(t *testing.T) {
	input := validSubmitMasterInputRequest().Input
	transcript := master.Transcript{
		Entries: []master.TranscriptEntry{{
			Sequence: 1,
			Payload: master.TranscriptEntryPayload{
				ID:        "master-transcript:user:" + input.ID,
				InputID:   input.ID,
				Kind:      master.TranscriptEntryKindUserInput,
				CreatedAt: "2026-07-12T18:00:01Z",
				UserInput: &master.TranscriptUserInput{
					Text:     input.Text,
					Modality: input.Modality,
				},
			},
		}},
		LastSequence: 1,
	}
	service := &fakeHTTPMasterInputService{transcript: transcript}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		MasterInputService: service,
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
	})

	read := postJSON[master.Transcript](
		t,
		handler,
		"/master/transcript/read",
		ReadMasterTranscriptRequest{Limit: 20},
		http.StatusOK,
	)
	if service.transcriptLimit != 20 || len(read.Entries) != 1 ||
		read.Entries[0].Payload.UserInput == nil ||
		read.Entries[0].Payload.UserInput.Text != input.Text {
		t.Fatalf("transcript=%+v limit=%d", read, service.transcriptLimit)
	}
}

func TestMasterInputCancellationEndpointCancelsOneDurableShellInteraction(t *testing.T) {
	input := validSubmitMasterInputRequest().Input
	service := &fakeHTTPMasterInputService{state: master.InputRoutingState{
		Input: master.AcceptedMasterInput{
			Sequence:      1,
			Input:         input,
			ReplyDelivery: master.ReplyDeliveryForInput(input),
			AcceptedAt:    "2026-07-12T18:00:01Z",
		},
		Status:         master.InputRoutingStatusCancelled,
		RoutingAttempt: 1,
		Cancellation: &master.InputRoutingCancellation{
			InputID:        input.ID,
			RoutingAttempt: 1,
			CancelledAt:    "2026-07-12T18:00:02Z",
		},
	}}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		MasterInputService: service,
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
	})

	state := postJSON[master.ShellInteractionState](
		t,
		handler,
		"/master/inputs/cancel",
		CancelMasterInputRequest{InputID: input.ID},
		http.StatusOK,
	)
	if service.cancelInputID != input.ID || state.Status != master.InputRoutingStatusCancelled ||
		state.Input.ID != input.ID {
		t.Fatalf("cancelled state=%+v inputID=%q", state, service.cancelInputID)
	}
}

func TestActiveMasterShellInteractionEndpointMapsReadAndValidationFailures(t *testing.T) {
	tests := []struct {
		err         error
		interaction master.ActiveShellInteraction
		wantCode    string
		wantStatus  int
	}{
		{
			err:        &conversation.CorruptStateError{Path: "state", Err: errors.New("corrupt")},
			wantCode:   "corrupt_master_input_state",
			wantStatus: http.StatusInternalServerError,
		},
		{
			err:        errors.New("read failed"),
			wantCode:   "read_master_shell_interaction_failed",
			wantStatus: http.StatusInternalServerError,
		},
		{
			interaction: invalidActiveMasterShellInteraction(),
			wantCode:    "invalid_master_shell_interaction",
			wantStatus:  http.StatusInternalServerError,
		},
	}
	for _, test := range tests {
		t.Run(test.wantCode, func(t *testing.T) {
			handler := newAuthenticatedTestHandler(t, HandlerConfig{
				MasterInputService: &fakeHTTPMasterInputService{
					err:         test.err,
					interaction: test.interaction,
				},
				Metadata: BackendMetadata{Name: BackendName, Version: "test"},
			})
			response := getJSON[ErrorResponse](
				t,
				handler,
				"/master/interaction/active",
				test.wantStatus,
			)
			if response.Error.Code != test.wantCode {
				t.Fatalf("error = %+v", response.Error)
			}
		})
	}
}

func TestMasterInputEndpointRequiresServiceAndMapsTypedFailures(t *testing.T) {
	missing := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata: BackendMetadata{Name: BackendName, Version: "test"},
	})
	response := postJSON[ErrorResponse](
		t,
		missing,
		"/master/inputs/submit",
		validSubmitMasterInputRequest(),
		http.StatusServiceUnavailable,
	)
	if response.Error.Code != "master_input_service_unavailable" {
		t.Fatalf("missing service error = %+v", response.Error)
	}

	tests := []struct {
		err        error
		wantCode   string
		wantStatus int
	}{
		{
			err:        &master.InputConflictError{InputID: "input_alpha"},
			wantCode:   "master_input_conflict",
			wantStatus: http.StatusConflict,
		},
		{
			err:        &conversation.CorruptStateError{Path: "state", Err: errors.New("corrupt")},
			wantCode:   "corrupt_master_input_state",
			wantStatus: http.StatusInternalServerError,
		},
		{
			err:        &conversation.PersistenceError{Operation: "write", Path: "state", Err: errors.New("full")},
			wantCode:   "persist_master_input_failed",
			wantStatus: http.StatusInternalServerError,
		},
		{
			err:        errors.New("invalid input"),
			wantCode:   "invalid_master_input",
			wantStatus: http.StatusBadRequest,
		},
	}
	for _, test := range tests {
		t.Run(test.wantCode, func(t *testing.T) {
			handler := newAuthenticatedTestHandler(t, HandlerConfig{
				MasterInputService: &fakeHTTPMasterInputService{err: test.err},
				Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
			})
			response := postJSON[ErrorResponse](
				t,
				handler,
				"/master/inputs/submit",
				validSubmitMasterInputRequest(),
				test.wantStatus,
			)
			if response.Error.Code != test.wantCode {
				t.Fatalf("error = %+v", response.Error)
			}
		})
	}
}

func TestMasterInputEndpointRejectsUnknownAndOversizedPayloads(t *testing.T) {
	service := &fakeHTTPMasterInputService{}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		MasterInputService: service,
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
	})
	unknown := postRaw[ErrorResponse](
		t,
		handler,
		"/master/inputs/submit",
		`{"input":{"id":"input","text":"request","modality":"voice","source":"shell","submittedAt":"2026-07-12T18:00:00Z","focusedWorkspaceId":null,"focusedConversationId":null,"originatingWorkspaceId":null,"originatingConversationId":null,"originatingConversationInputId":null,"workspaceId":"removed"}}`,
		http.StatusBadRequest,
	)
	if unknown.Error.Code != "invalid_json" || service.calls != 0 {
		t.Fatalf("unknown response=%+v calls=%d", unknown, service.calls)
	}

	unauthenticated := NewHandler(HandlerConfig{
		MasterInputService: service,
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
	})
	body := `{"input":{"text":"` + strings.Repeat("x", int(masterInputRequestBodyLimitBytes)+1) + `"}}`
	oversized := postRaw[ErrorResponse](
		t,
		unauthenticated,
		"/master/inputs/submit",
		body,
		http.StatusRequestEntityTooLarge,
	)
	if oversized.Error.Code != "request_body_too_large" || service.calls != 0 {
		t.Fatalf("oversized response=%+v calls=%d", oversized, service.calls)
	}
}

type fakeHTTPMasterInputService struct {
	calls            int
	err              error
	input            master.MasterInput
	interaction      master.ActiveShellInteraction
	interactionCalls int
	state            master.InputRoutingState
	stateInputID     string
	transcript       master.Transcript
	transcriptLimit  int
	waitInputID      string
	cancelInputID    string
}

func (service *fakeHTTPMasterInputService) CancelInput(
	_ context.Context,
	inputID string,
) (master.ShellInteractionState, error) {
	service.cancelInputID = inputID
	if service.err != nil {
		return master.ShellInteractionState{}, service.err
	}
	return master.ProjectShellInteractionState(service.state)
}

func (service *fakeHTTPMasterInputService) ReadInputState(
	_ context.Context,
	inputID string,
) (master.InputRoutingState, error) {
	service.stateInputID = inputID
	return master.CloneInputRoutingState(service.state), service.err
}

func (service *fakeHTTPMasterInputService) ReadTranscript(
	_ context.Context,
	limit int,
) (master.Transcript, error) {
	service.transcriptLimit = limit
	return master.CloneTranscript(service.transcript), service.err
}

func (service *fakeHTTPMasterInputService) WaitShellInteraction(
	_ context.Context,
	inputID string,
) (master.ShellInteractionState, error) {
	service.waitInputID = inputID
	if service.err != nil {
		return master.ShellInteractionState{}, service.err
	}
	return master.ProjectShellInteractionState(service.state)
}

func (service *fakeHTTPMasterInputService) ReadActiveShellInteraction(
	_ context.Context,
) (master.ActiveShellInteraction, error) {
	service.interactionCalls++
	return master.CloneActiveShellInteraction(service.interaction), service.err
}

func (service *fakeHTTPMasterInputService) SubmitInput(
	_ context.Context,
	input master.MasterInput,
) (master.AcceptedMasterInput, error) {
	service.calls++
	service.input = input
	if service.err != nil {
		return master.AcceptedMasterInput{}, service.err
	}
	return master.AcceptedMasterInput{
		Sequence:      1,
		Input:         input,
		ReplyDelivery: master.ReplyDeliveryForInput(input),
		AcceptedAt:    "2026-07-12T18:00:01Z",
	}, nil
}

func validSubmitMasterInputRequest() SubmitMasterInputRequest {
	return SubmitMasterInputRequest{Input: master.MasterInput{
		ID:          "input_alpha",
		Text:        "Route this request",
		Modality:    master.MasterInputModalityVoice,
		Source:      master.MasterInputSourceShell,
		SubmittedAt: "2026-07-12T18:00:00Z",
	}}
}

func invalidActiveMasterShellInteraction() master.ActiveShellInteraction {
	input := validSubmitMasterInputRequest().Input
	state := master.ShellInteractionState{
		Input:  input,
		Status: master.InputRoutingStatusFailed,
	}
	return master.ActiveShellInteraction{State: &state}
}
