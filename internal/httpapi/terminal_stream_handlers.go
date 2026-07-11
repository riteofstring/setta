package httpapi

import "net/http"

// Phase 2 registers the authenticated routes and their generated contracts.
// Ticket lifecycle and the WebSocket upgrade are implemented in Phase 3.
func (handler handler) createTerminalStreamTicket(response http.ResponseWriter, _ *http.Request) {
	writeError(response, http.StatusNotImplemented, "terminal_stream_not_implemented", "terminal stream tickets are not implemented")
}

func (handler handler) terminalStream(response http.ResponseWriter, _ *http.Request) {
	writeError(response, http.StatusNotImplemented, "terminal_stream_not_implemented", "terminal stream transport is not implemented")
}
