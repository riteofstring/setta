package httpapi

import (
	"net/http"
	"strings"
)

func (handler handler) pushSubscribe(response http.ResponseWriter, request *http.Request) {
	service := requireNotifyService(response, handler.notifyService)
	if service == nil {
		return
	}
	session, ok := authenticatedDeviceSession(request)
	if !ok {
		writeError(response, http.StatusInternalServerError, "authenticated_session_unavailable", "authenticated device session is unavailable")
		return
	}
	var payload PushSubscribeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if _, err := service.Subscribe(request.Context(), session.ID, payload.Subscription); err != nil {
		writeError(response, http.StatusBadRequest, "push_subscribe_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, PushSubscribeResponse{VAPIDPublicKey: service.PublicKey()})
}

func (handler handler) pushUnsubscribe(response http.ResponseWriter, request *http.Request) {
	service := requireNotifyService(response, handler.notifyService)
	if service == nil {
		return
	}
	session, ok := authenticatedDeviceSession(request)
	if !ok {
		writeError(response, http.StatusInternalServerError, "authenticated_session_unavailable", "authenticated device session is unavailable")
		return
	}
	var payload PushUnsubscribeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if strings.TrimSpace(payload.Endpoint) == "" {
		writeError(response, http.StatusBadRequest, "invalid_push_unsubscribe_request", "subscription endpoint is required")
		return
	}
	removed, err := service.Unsubscribe(request.Context(), session.ID, payload.Endpoint)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "push_unsubscribe_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, PushUnsubscribeResponse{Removed: removed})
}

func (handler handler) pushTest(response http.ResponseWriter, request *http.Request) {
	service := requireNotifyService(response, handler.notifyService)
	if service == nil {
		return
	}
	session, ok := authenticatedDeviceSession(request)
	if !ok {
		writeError(response, http.StatusInternalServerError, "authenticated_session_unavailable", "authenticated device session is unavailable")
		return
	}
	var payload PushTestRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.Test(request.Context(), session.ID)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "push_test_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, PushTestResponse{SentCount: result.SentCount})
}
