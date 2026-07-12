package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"setta/internal/conversation"
)

func TestConversationInputEndpointAcceptsTypedPaneSubmission(t *testing.T) {
	service := &fakeHTTPConversationInputService{}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationInputService: service,
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
	})
	paneID := "pane_alpha"
	input := conversation.ConversationInput{
		ID:             "input_alpha",
		ConversationID: "conversation_alpha",
		SourcePaneID:   &paneID,
		Text:           "  Keep the finalized transcript exact.  ",
		Modality:       conversation.ConversationInputModalityVoice,
		RequestedMode:  conversation.ConversationInputModeRoute,
		SubmittedAt:    "2026-07-12T18:00:00Z",
	}

	accepted := postJSON[conversation.AcceptedConversationInput](
		t,
		handler,
		"/conversations/inputs/submit",
		SubmitConversationInputRequest{Input: input},
		http.StatusAccepted,
	)
	if !conversation.EqualConversationInputs(service.input, input) ||
		!conversation.EqualConversationInputs(accepted.Input, input) {
		t.Fatalf("service=%+v accepted=%+v want input=%+v", service.input, accepted, input)
	}
	if accepted.Sequence != 1 ||
		accepted.Status != conversation.ConversationInputStatusAccepted ||
		accepted.AcceptedAt != "2026-07-12T18:00:01Z" {
		t.Fatalf("accepted = %+v", accepted)
	}
}

func TestConversationInputEndpointRequiresServiceAndMapsTypedFailures(t *testing.T) {
	missing := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata: BackendMetadata{Name: BackendName, Version: "test"},
	})
	response := postJSON[ErrorResponse](
		t,
		missing,
		"/conversations/inputs/submit",
		validSubmitConversationInputRequest(),
		http.StatusServiceUnavailable,
	)
	if response.Error.Code != "conversation_input_service_unavailable" {
		t.Fatalf("missing service error = %+v", response.Error)
	}

	tests := []struct {
		err        error
		wantCode   string
		wantStatus int
	}{
		{
			err:        &conversation.ConversationInputConflictError{InputID: "input_alpha"},
			wantCode:   "conversation_input_conflict",
			wantStatus: http.StatusConflict,
		},
		{
			err:        conversation.ErrConversationNotFound,
			wantCode:   "conversation_not_found",
			wantStatus: http.StatusNotFound,
		},
		{
			err:        &conversation.StateConflictError{Entity: "conversation input reply", ID: "input_parent", Reason: "reply target was not found"},
			wantCode:   "conversation_input_state_conflict",
			wantStatus: http.StatusConflict,
		},
		{
			err:        &conversation.CorruptStateError{Path: "state", Err: errors.New("corrupt")},
			wantCode:   "corrupt_conversation_input_state",
			wantStatus: http.StatusInternalServerError,
		},
		{
			err:        &conversation.PersistenceError{Operation: "write", Path: "state", Err: errors.New("full")},
			wantCode:   "persist_conversation_input_failed",
			wantStatus: http.StatusInternalServerError,
		},
		{
			err: &conversation.WriteOutcomeError{
				Operation: "accept conversation input",
				Outcome:   conversation.WriteOutcomeCancelled,
				Err: errors.Join(
					context.Canceled,
					&conversation.PersistenceError{Operation: "rollback", Path: "state", Err: errors.New("closed")},
				),
			},
			wantCode:   "conversation_input_write_cancelled",
			wantStatus: http.StatusRequestTimeout,
		},
		{
			err: &conversation.WriteOutcomeError{
				Operation: "accept conversation input",
				Outcome:   conversation.WriteOutcomeSaturated,
			},
			wantCode:   "conversation_input_write_saturated",
			wantStatus: http.StatusTooManyRequests,
		},
		{
			err: &conversation.WriteOutcomeError{
				Operation: "accept conversation input",
				Outcome:   conversation.WriteOutcomeStoreClosed,
				Err:       conversation.ErrStoreClosed,
			},
			wantCode:   "conversation_input_store_unavailable",
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			err:        errors.New("invalid input"),
			wantCode:   "invalid_conversation_input",
			wantStatus: http.StatusBadRequest,
		},
	}
	for _, test := range tests {
		t.Run(test.wantCode, func(t *testing.T) {
			handler := newAuthenticatedTestHandler(t, HandlerConfig{
				ConversationInputService: &fakeHTTPConversationInputService{err: test.err},
				Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
			})
			response := postJSON[ErrorResponse](
				t,
				handler,
				"/conversations/inputs/submit",
				validSubmitConversationInputRequest(),
				test.wantStatus,
			)
			if response.Error.Code != test.wantCode || response.Error.OperationApplied {
				t.Fatalf("error = %+v", response.Error)
			}
		})
	}
}

func TestConversationInputEndpointReportsInvalidStoreReceiptAsServerFailure(t *testing.T) {
	service, err := conversation.NewInputService(invalidHTTPConversationInputStore{})
	if err != nil {
		t.Fatalf("NewInputService: %v", err)
	}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationInputService: service,
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
	})
	response := postJSON[ErrorResponse](
		t,
		handler,
		"/conversations/inputs/submit",
		validSubmitConversationInputRequest(),
		http.StatusInternalServerError,
	)
	if response.Error.Code != "invalid_conversation_input_receipt" || response.Error.OperationApplied {
		t.Fatalf("error = %+v", response.Error)
	}
}

func TestConversationInputEndpointRejectsUnknownAndOversizedPayloads(t *testing.T) {
	service := &fakeHTTPConversationInputService{}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		ConversationInputService: service,
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
	})
	unknown := postRaw[ErrorResponse](
		t,
		handler,
		"/conversations/inputs/submit",
		`{"input":{"id":"input","conversationId":"conversation","sourcePaneId":null,"replyToInputId":null,"text":"request","modality":"voice","requestedMode":"route","submittedAt":"2026-07-12T18:00:00Z","workspaceId":"removed"}}`,
		http.StatusBadRequest,
	)
	if unknown.Error.Code != "invalid_json" || service.calls != 0 {
		t.Fatalf("unknown response=%+v calls=%d", unknown, service.calls)
	}

	unauthenticated := NewHandler(HandlerConfig{
		ConversationInputService: service,
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
	})
	body := `{"input":{"text":"` + strings.Repeat("x", int(conversationInputRequestBodyLimitBytes)+1) + `"}}`
	oversized := postRaw[ErrorResponse](
		t,
		unauthenticated,
		"/conversations/inputs/submit",
		body,
		http.StatusRequestEntityTooLarge,
	)
	if oversized.Error.Code != "request_body_too_large" || service.calls != 0 {
		t.Fatalf("oversized response=%+v calls=%d", oversized, service.calls)
	}
}

type fakeHTTPConversationInputService struct {
	calls int
	err   error
	input conversation.ConversationInput
}

type invalidHTTPConversationInputStore struct{}

func (invalidHTTPConversationInputStore) AcceptConversationInput(
	_ context.Context,
	input conversation.ConversationInput,
	acceptedAt string,
) (conversation.AcceptedConversationInput, error) {
	return conversation.AcceptedConversationInput{
		Input:      input,
		Status:     conversation.ConversationInputStatusAccepted,
		AcceptedAt: acceptedAt,
	}, nil
}

func (service *fakeHTTPConversationInputService) SubmitInput(
	_ context.Context,
	input conversation.ConversationInput,
) (conversation.AcceptedConversationInput, error) {
	service.calls++
	service.input = input
	if service.err != nil {
		return conversation.AcceptedConversationInput{}, service.err
	}
	return conversation.AcceptedConversationInput{
		Sequence:   1,
		Input:      input,
		Status:     conversation.ConversationInputStatusAccepted,
		AcceptedAt: "2026-07-12T18:00:01Z",
	}, nil
}

func validSubmitConversationInputRequest() SubmitConversationInputRequest {
	return SubmitConversationInputRequest{Input: conversation.ConversationInput{
		ID:             "input_alpha",
		ConversationID: "conversation_alpha",
		Text:           "Route this request",
		Modality:       conversation.ConversationInputModalityVoice,
		RequestedMode:  conversation.ConversationInputModeRoute,
		SubmittedAt:    "2026-07-12T18:00:00Z",
	}}
}
