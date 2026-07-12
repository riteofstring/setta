package httpapi

import (
	"net/http"

	"setta/internal/conversation"
)

const conversationInputRequestBodyLimitBytes int64 = conversation.MaxConversationInputTextBytes*6 + 64*1024

type SubmitConversationInputRequest struct {
	Input conversation.ConversationInput `json:"input"`
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
