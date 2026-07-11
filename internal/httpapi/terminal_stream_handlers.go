package httpapi

import (
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/coder/websocket"
	"setta/internal/runtimeauth"
	"setta/internal/terminal"
)

func (handler handler) createTerminalStreamTicket(response http.ResponseWriter, request *http.Request) {
	session, ok := authenticatedDeviceSession(request)
	if !ok {
		writeError(response, http.StatusInternalServerError, "authenticated_session_unavailable", "authenticated device session is unavailable")
		return
	}
	var payload CreateTerminalStreamTicketRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if !validTerminalStreamID(payload.ClientStreamID) {
		writeError(response, http.StatusBadRequest, "invalid_terminal_stream_id", "clientStreamId must contain 1-128 visible characters without whitespace")
		return
	}
	if handler.runtimeMetadata.ID == "" {
		writeError(response, http.StatusServiceUnavailable, "runtime_identity_unavailable", "runtime identity is not available")
		return
	}
	value, ticket, err := handler.terminalStreamTickets.issue(session.ID, handler.runtimeMetadata.ID, payload.ClientStreamID)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "create_terminal_stream_ticket_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, CreateTerminalStreamTicketResponse{
		Ticket:              value,
		ClientStreamID:      ticket.clientStreamID,
		ExpiresAt:           ticket.expiresAt.Format(time.RFC3339Nano),
		ExpiresInSeconds:    terminal.TerminalStreamTicketTTLSeconds,
		MaxInputBytes:       terminal.TerminalStreamMaxInputBytes,
		MaxQueuedInputBytes: terminal.TerminalStreamQueuedInputBytes,
	})
}

func (handler handler) terminalStream(response http.ResponseWriter, request *http.Request) {
	ticket, err := handler.terminalStreamTickets.consume(request.URL.Query().Get("ticket"), handler.runtimeMetadata.ID)
	if err != nil {
		writeError(response, http.StatusUnauthorized, "invalid_terminal_stream_ticket", err.Error())
		return
	}
	if handler.runtimeAuthService == nil {
		writeError(response, http.StatusServiceUnavailable, "runtime_auth_service_unavailable", "runtime auth service is not available")
		return
	}
	revoked, err := handler.runtimeAuthService.IsDeviceSessionRevoked(request.Context(), ticket.deviceID)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "read_terminal_stream_device_failed", err.Error())
		return
	}
	if revoked {
		writeUnauthorized(response)
		return
	}
	connection, err := websocket.Accept(response, request, &websocket.AcceptOptions{
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		return
	}
	defer connection.CloseNow()
	request = handler.withRevocationSweep(request, runtimeDeviceSession(ticket.deviceID))
	handler.serveTerminalStream(request.Context(), connection, ticket)
}

func validTerminalStreamID(value string) bool {
	if value == "" || len(value) > 128 || !utf8.ValidString(value) {
		return false
	}
	return strings.IndexFunc(value, func(character rune) bool {
		return !unicode.IsPrint(character) || unicode.IsSpace(character)
	}) == -1
}

func runtimeDeviceSession(deviceID string) runtimeauth.DeviceSession {
	return runtimeauth.DeviceSession{ID: deviceID}
}
