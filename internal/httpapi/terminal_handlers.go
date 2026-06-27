package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/terminal"
)

func (handler handler) createTerminal(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload CreateTerminalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Create(
		request.Context(),
		payload.WorkspaceID,
		payload.PaneID,
		payload.ProfileID,
		payload.CWD,
		payload.Cols,
		payload.Rows,
	)
	if err != nil {
		writeTerminalError(response, "create_terminal_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, TerminalSessionResponse{Session: terminalSessionSummary(session)})
}

func (handler handler) attachTerminal(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload AttachTerminalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Attach(request.Context(), payload.WorkspaceID, payload.PaneID)
	if err != nil {
		writeTerminalError(response, "attach_terminal_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, TerminalSessionResponse{Session: terminalSessionSummary(session)})
}

func (handler handler) terminalInput(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload TerminalInputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	data, ok := decodeTerminalInput(response, payload.DataBase64)
	if !ok {
		return
	}
	acceptedBytes, err := service.WriteInput(request.Context(), payload.SessionID, data)
	if err != nil {
		writeTerminalError(response, "terminal_input_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, TerminalInputResponse{AcceptedBytes: acceptedBytes})
}

func (handler handler) resizeTerminal(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload ResizeTerminalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Resize(request.Context(), payload.SessionID, payload.Cols, payload.Rows)
	if err != nil {
		writeTerminalError(response, "resize_terminal_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, TerminalSessionResponse{Session: terminalSessionSummary(session)})
}

func (handler handler) closeTerminal(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload CloseTerminalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Close(request.Context(), payload.SessionID, payload.Mode)
	if err != nil {
		writeTerminalError(response, "close_terminal_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, TerminalSessionResponse{Session: terminalSessionSummary(session)})
}

func (handler handler) listTerminalProfiles(response http.ResponseWriter, _ *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	profiles, err := service.ListProfiles()
	if err != nil {
		writeTerminalError(response, "list_terminal_profiles_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func (handler handler) createTerminalProfile(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload CreateTerminalProfileRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	profiles, err := service.CreateProfile(payload.Profile)
	if err != nil {
		writeTerminalError(response, "create_terminal_profile_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func (handler handler) updateTerminalProfile(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload UpdateTerminalProfileRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	profiles, err := service.UpdateProfile(payload.ID, payload.Profile)
	if err != nil {
		writeTerminalError(response, "update_terminal_profile_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func (handler handler) deleteTerminalProfile(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload DeleteTerminalProfileRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	profiles, err := service.DeleteProfile(payload.ID)
	if err != nil {
		writeTerminalError(response, "delete_terminal_profile_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func (handler handler) selectDefaultTerminalProfile(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	var payload SelectDefaultTerminalProfileRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	profiles, err := service.SetDefaultProfile(payload.ID)
	if err != nil {
		writeTerminalError(response, "select_default_terminal_profile_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, profiles)
}

func (handler handler) terminalEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireTerminalService(response, handler.terminalService)
	if service == nil {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "terminal_event_stream_unavailable", "response writer does not support streaming")
		return
	}
	cursor, err := terminalEventStreamCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_terminal_event_cursor", err.Error())
		return
	}
	subscription, err := service.SubscribeEvents(cursor)
	if err != nil {
		writeTerminalError(response, "subscribe_terminal_events_failed", err)
		return
	}
	defer subscription.Unsubscribe()

	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	flusher.Flush()

	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			if err := writeTerminalServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func decodeTerminalInput(response http.ResponseWriter, dataBase64 string) ([]byte, bool) {
	if dataBase64 == "" {
		return []byte{}, true
	}
	if base64.StdEncoding.DecodedLen(len(dataBase64)) > terminal.MaxInputBytes {
		writeError(response, http.StatusBadRequest, "terminal_input_too_large", fmt.Sprintf("terminal input exceeds %d bytes", terminal.MaxInputBytes))
		return nil, false
	}
	data, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_terminal_input", "dataBase64 must be valid base64")
		return nil, false
	}
	if len(data) > terminal.MaxInputBytes {
		writeError(response, http.StatusBadRequest, "terminal_input_too_large", fmt.Sprintf("terminal input exceeds %d bytes", terminal.MaxInputBytes))
		return nil, false
	}
	return data, true
}

func terminalEventStreamCursor(request *http.Request) (terminal.EventCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return terminal.EventCursor{}, nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return terminal.EventCursor{}, fmt.Errorf("terminal event cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return terminal.EventCursor{}, fmt.Errorf("terminal event cursor sequence must be a non-negative integer: %s", value)
	}
	return terminal.EventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func writeTerminalServerSentEvent(response http.ResponseWriter, event terminal.TerminalEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal terminal event %s: %w", event.EventID, err)
	}
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", event.EventID, event.Type, payload); err != nil {
		return fmt.Errorf("write terminal event %s: %w", event.EventID, err)
	}
	return nil
}

func terminalSessionSummary(summary terminal.SessionSummary) TerminalSessionSummary {
	return TerminalSessionSummary{
		ID:          summary.ID,
		WorkspaceID: summary.WorkspaceID,
		PaneID:      summary.PaneID,
		ProfileID:   summary.ProfileID,
		CWD:         summary.CWD,
		Cols:        summary.Cols,
		Rows:        summary.Rows,
		Status:      summary.Status,
		CreatedAt:   summary.CreatedAt,
		UpdatedAt:   summary.UpdatedAt,
		ExitCode:    summary.ExitCode,
		Message:     summary.Message,
	}
}
