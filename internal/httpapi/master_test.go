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
	paneID := "pane_alpha"
	input := master.MasterInput{
		ID:                    "input_alpha",
		Text:                  "  Keep the finalized transcript exact.  ",
		Modality:              master.MasterInputModalityVoice,
		SubmittedAt:           "2026-07-12T18:00:00Z",
		FocusedWorkspaceID:    &workspaceID,
		FocusedConversationID: &conversationID,
		FocusedPaneID:         &paneID,
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
			if response.Error.Code != test.wantCode || response.Error.OperationApplied {
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
		`{"input":{"id":"input","text":"request","modality":"voice","submittedAt":"2026-07-12T18:00:00Z","focusedWorkspaceId":null,"focusedConversationId":null,"focusedPaneId":null,"workspaceId":"removed"}}`,
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
	calls int
	err   error
	input master.MasterInput
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
		Sequence:   1,
		Input:      input,
		AcceptedAt: "2026-07-12T18:00:01Z",
	}, nil
}

func validSubmitMasterInputRequest() SubmitMasterInputRequest {
	return SubmitMasterInputRequest{Input: master.MasterInput{
		ID:          "input_alpha",
		Text:        "Route this request",
		Modality:    master.MasterInputModalityVoice,
		SubmittedAt: "2026-07-12T18:00:00Z",
	}}
}
