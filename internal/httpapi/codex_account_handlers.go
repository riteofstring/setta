package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"

	"setta/internal/codexaccount"
)

const codexAccountChangeEventType = "codex.account.changed"

func (handler handler) readCodexAccount(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	state, err := service.Read(request.Context())
	if err != nil {
		writeCodexAccountError(response, "read_codex_account_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) refreshCodexAccount(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	var payload codexaccount.RefreshCodexAccountRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.Refresh(request.Context(), payload)
	if err != nil {
		writeCodexAccountError(response, "refresh_codex_account_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) startCodexLogin(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	var payload codexaccount.StartCodexLoginRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.StartLogin(request.Context(), payload)
	if err != nil {
		writeCodexAccountError(response, "start_codex_login_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) cancelCodexLogin(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	var payload codexaccount.CancelCodexLoginRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.CancelLogin(request.Context(), payload)
	if err != nil {
		writeCodexAccountError(response, "cancel_codex_login_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) logoutCodexAccount(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	var payload codexaccount.LogoutCodexAccountRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.Logout(request.Context(), payload)
	if err != nil {
		writeCodexAccountError(response, "logout_codex_account_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) codexAccountEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireCodexAccountService(response, handler.codexAccountService)
	if service == nil {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "codex_account_event_stream_unavailable", "response writer does not support streaming")
		return
	}
	subscription := service.SubscribeChanges()
	defer subscription.Unsubscribe()
	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	flusher.Flush()
	for {
		select {
		case event, open := <-subscription.Events():
			if !open || event.Validate() != nil {
				return
			}
			if writeCodexAccountServerSentEvent(response, event) != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func writeCodexAccountServerSentEvent(
	response http.ResponseWriter,
	event codexaccount.CodexAccountChangeEvent,
) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal Codex account change event: %w", err)
	}
	if _, err := fmt.Fprintf(
		response,
		"id: %s:%d\nevent: %s\ndata: %s\n\n",
		event.StreamID,
		event.Sequence,
		codexAccountChangeEventType,
		payload,
	); err != nil {
		return fmt.Errorf("write Codex account change event: %w", err)
	}
	return nil
}
