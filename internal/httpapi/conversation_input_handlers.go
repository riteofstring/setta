package httpapi

import (
	"net/http"

	"setta/internal/conversation"
)

const conversationInputRequestBodyLimitBytes int64 = conversation.MaxConversationInputTextBytes*6 + 64*1024

type SubmitConversationInputRequest struct {
	Input conversation.ConversationInput `json:"input"`
}

type ReadConversationInputRoutingStateRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	InputID        string `json:"inputId"`
}

type RetryConversationInputRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	InputID        string `json:"inputId"`
}

type DiscardConversationInputRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	InputID        string `json:"inputId"`
}

func (handler handler) submitConversationInput(response http.ResponseWriter, request *http.Request) {
	service := requireConversationInputService(response, handler.conversationInputService)
	if service == nil {
		return
	}
	var payload SubmitConversationInputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	accepted, err := service.SubmitInput(request.Context(), payload.Input)
	if err != nil {
		writeConversationInputError(response, err)
		return
	}
	if err := accepted.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_conversation_input_receipt", err.Error())
		return
	}
	writeJSON(response, http.StatusAccepted, accepted)
}

func (handler handler) readConversationInputRoutingState(response http.ResponseWriter, request *http.Request) {
	service := requireConversationInputService(response, handler.conversationInputService)
	if service == nil {
		return
	}
	var payload ReadConversationInputRoutingStateRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.ReadInputState(
		request.Context(),
		payload.WorkspaceID,
		payload.ConversationID,
		payload.InputID,
	)
	if err != nil {
		writeConversationInputError(response, err)
		return
	}
	if err := state.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_conversation_input_receipt", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) retryConversationInput(response http.ResponseWriter, request *http.Request) {
	service := requireConversationInputService(response, handler.conversationInputService)
	if service == nil {
		return
	}
	var payload RetryConversationInputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.RetryInput(
		request.Context(),
		payload.WorkspaceID,
		payload.ConversationID,
		payload.InputID,
	)
	if err != nil {
		writeConversationInputError(response, err)
		return
	}
	if err := state.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_conversation_input_receipt", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) discardConversationInput(response http.ResponseWriter, request *http.Request) {
	service := requireConversationInputService(response, handler.conversationInputService)
	if service == nil {
		return
	}
	var payload DiscardConversationInputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.DiscardInput(
		request.Context(),
		payload.WorkspaceID,
		payload.ConversationID,
		payload.InputID,
	)
	if err != nil {
		writeConversationInputError(response, err)
		return
	}
	if err := state.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, "invalid_conversation_input_receipt", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, state)
}
